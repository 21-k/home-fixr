# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.1"]
# ///
"""
Write the Founding Community batch to the database (plan §7).

    uv run seed/scripts/seed.py                       # LOCAL stack, sample threads
    uv run seed/scripts/seed.py --dry-run             # do everything, then roll back
    uv run seed/scripts/seed.py --replace             # wipe this batch first, then seed
    uv run seed/scripts/seed.py --emit-sql PATH       # the whole batch as one SQL transaction
    uv run seed/scripts/seed.py --emit-additions-sql PATH
        # ONLY the social rows (+ helpful-count corrections) for a batch that is
        # already live: one self-checking transaction that refuses to run twice

Mechanism: SQL in ONE transaction as the database owner, with FK integrity
checks before commit (the app has no ORM, and the API path would need a
login per persona). Steps:
  1. `set local homefixr.seeding = 'on'` so the notification triggers stay
     quiet (migration 0010). Counter and slug triggers still run.
  2. auth.users rows (no usable password, banned, non-deliverable
     @founding.home-fixr.invalid email) -> the signup trigger creates the
     profile with the chosen handle -> profile UPDATE sets every field,
     is_founding_member = true, seed_batch_id.
  3. posts -> replies (timestamps from schedule.py, helpful counts and
     accepted answers from gen_threads.py).
  4. mentorships -> follows (content/mentorships.json, content/follows.json
     from gen_social.py), seeded-to-seeded only, tagged with the batch.
  5. Checks: row counts, every FK resolves, seeded replies only touch seeded
     posts, zero notifications created, no seeded Senior "accepting", social
     rows only between seeded accounts, junior -> senior, one active mentor
     per Junior, every mentee follows their mentor, nothing dated before both
     people joined or after the window.
Ids are uuid5(batch, key), so the same input always produces the same rows.

Refuses to connect anywhere but the local stack (see common.assert_local_db).
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).parent))
from common import BATCH_ID, LOCAL_DB_URL, SEED_DIR, assert_local_db, load_json, write_json  # noqa: E402

NS = uuid.UUID("6f1d3c3e-6a4b-4f0e-9d51-6f6d2b1e0a10")
TABLES = ["profiles", "posts", "replies", "job_collabs", "collab_interests", "mentorships", "follows"]
WINDOW_END_SQL = "2026-10-04 23:59:59-04"   # schedule.DEFAULT_END, America/New_York
WINDOW_START_SQL = "2026-07-24 00:00:00-04"  # schedule.DEFAULT_START
EXPECTED_MEMBERS = 136

# Checks on the social rows that must all return 0. `{b}` is the batch.
SOCIAL_ZERO = {
    "social rows touching a non-seeded profile":
        "select count(*) from (select junior_id a, senior_id b from mentorships where seed_batch_id = {b} "
        "union all select follower_id, following_id from follows where seed_batch_id = {b}) x "
        "join profiles pa on pa.id = x.a join profiles pb on pb.id = x.b "
        "where pa.seed_batch_id is distinct from {b} or pb.seed_batch_id is distinct from {b}",
    "mentorships that aren't junior -> senior":
        "select count(*) from mentorships m join profiles j on j.id = m.junior_id join profiles s on s.id = m.senior_id "
        "where m.seed_batch_id = {b} and (j.role <> 'junior' or s.role <> 'senior')",
    "juniors with two active mentors":
        "select count(*) from (select junior_id from mentorships where seed_batch_id = {b} and status = 'active' "
        "group by 1 having count(*) > 1) x",
    "active mentees not following their mentor":
        "select count(*) from mentorships m where m.seed_batch_id = {b} and m.status = 'active' and not exists "
        "(select 1 from follows f where f.follower_id = m.junior_id and f.following_id = m.senior_id)",
    "social rows outside the window or before both joined":
        "select count(*) from (select junior_id a, senior_id b, created_at from mentorships where seed_batch_id = {b} "
        "union all select follower_id, following_id, created_at from follows where seed_batch_id = {b}) x "
        "join profiles pa on pa.id = x.a join profiles pb on pb.id = x.b "
        f"where x.created_at > '{WINDOW_END_SQL}' or x.created_at < '{WINDOW_START_SQL}' "
        "or x.created_at < pa.created_at or x.created_at < pb.created_at",
}
# (No "notifications involving seeded profiles = 0" here: in production real
# members may already have followed or replied to Founding accounts, which
# legitimately notifies them. The emitted files check that the notifications
# COUNT is unchanged by the transaction instead; seed() keeps its local check.)


def uid(batch: str, *key: str) -> str:
    return str(uuid.uuid5(NS, "|".join((batch,) + key)))


def app_trade(t: str) -> str:
    return "other" if t == "general" else t


def batch_counts(cur, batch: str) -> dict[str, int]:
    out = {}
    for t in TABLES:
        cur.execute(f"select count(*) from {t} where seed_batch_id = %s", (batch,))
        out[t] = cur.fetchone()[0]
    cur.execute("select count(*) from auth.users where raw_app_meta_data->>'seed_batch_id' = %s", (batch,))
    out["auth.users"] = cur.fetchone()[0]
    return out


def total_counts(cur) -> dict[str, int]:
    out = {}
    for t in TABLES + ["notifications", "messages", "auth.users"]:
        cur.execute(f"select count(*) from {t}")
        out[t] = cur.fetchone()[0]
    return out


def mentorship_id(batch: str, m: dict) -> str:
    return uid(batch, "mentorship", m["junior"].lower(), m["senior"].lower())


def check_social_inputs(people: list[dict], ments: list[dict], follows: list[dict]) -> None:
    handles = {p["handle"] for p in people}
    bad = [m for m in ments if m["junior"] not in handles or m["senior"] not in handles]
    bad += [f for f in follows if f["follower"] not in handles or f["following"] not in handles]
    if bad:
        raise SystemExit(f"social rows reference unknown handles: {bad[:3]}")


def seed(conn, batch: str, people: list[dict], threads: list[dict],
         ments: list[dict] | None = None, follows: list[dict] | None = None) -> dict:
    ments, follows = ments or [], follows or []
    check_social_inputs(people, ments, follows)
    cur = conn.cursor()
    cur.execute("set local homefixr.seeding = 'on'")
    before = total_counts(cur)
    pid = {p["handle"]: uid(batch, "profile", p["handle"].lower()) for p in people}

    # Handles must not collide with real members (case-insensitive).
    cur.execute(
        "select username from profiles where lower(username) = any(%s) and seed_batch_id is distinct from %s",
        ([h.lower() for h in pid], batch),
    )
    clash = [r[0] for r in cur.fetchall()]
    if clash:
        raise SystemExit(f"handles already used by non-seeded members: {clash}")

    for p in people:
        joined = p["joined_at"]
        cur.execute(
            """
            insert into auth.users (
              id, instance_id, aud, role, email, encrypted_password,
              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
              confirmation_token, recovery_token, email_change_token_new, email_change,
              email_change_token_current, phone_change, phone_change_token, reauthentication_token,
              banned_until, is_sso_user, is_anonymous
            ) values (
              %s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s, '',
              %s, %s, %s, %s,
              '', '', '', '', '', '', '', '',
              '9999-12-31T00:00:00Z', false, false
            )
            """,
            (
                pid[p["handle"]],
                f"{p['handle'].lower()}@founding.home-fixr.invalid",
                json.dumps({"provider": "email", "providers": ["email"], "founding_member": True, "seed_batch_id": batch}),
                json.dumps({"username": p["handle"], "full_name": p["full_name"], "role": p["role"]}),
                joined,
                joined,
            ),
        )
        cur.execute(
            """
            update profiles set
              username = %s, full_name = %s, display_preference = %s, avatar_initials = %s,
              title = %s, role = %s, trade = %s, region = %s, bio = %s, years_experience = %s,
              is_open_to_messages = false, is_open_to_ride_alongs = false,
              mentor_availability = %s, is_founding_member = true, seed_batch_id = %s,
              avatar_style = %s, avatar_icon = %s,
              username_changed_at = %s, onboarded_at = %s, created_at = %s, updated_at = %s
            where id = %s
            """,
            (
                p["handle"], p["full_name"], p["display_preference"], p["avatar_initials"],
                p["title"], p["role"], app_trade(p["trade"]), p["public_region"], p["bio"] or None,
                p["years_in"] or None,
                p["mentor_availability"] or "not_accepting", batch,
                p["avatar_style"], p["avatar_icon"],
                p["joined_at"], p["joined_at"], p["joined_at"], p["joined_at"],
                pid[p["handle"]],
            ),
        )
        if cur.rowcount != 1:
            raise SystemExit(f"profile for {p['handle']} was not created by the signup trigger")

    n_posts = n_replies = 0
    for t in threads:
        post_id = uid(batch, "post", t["id"])
        cur.execute(
            """insert into posts (id, author_id, type, title, body, trade, region, helpful_count, created_at, seed_batch_id)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (post_id, pid[t["author"]], t["type"], t["title"], t["body"].strip(), t["trade"], t["region"],
             t["helpful_count"], t["created_at"], batch),
        )
        n_posts += 1
        for i, r in enumerate(t.get("replies", [])):
            cur.execute(
                """insert into replies (id, post_id, author_id, body, is_accepted, helpful_count, created_at, seed_batch_id)
                   values (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (uid(batch, "reply", t["id"], str(i)), post_id, pid[r["author"]], r["body"].strip(),
                 r["accepted"], r["helpful_count"], r["created_at"], batch),
            )
            n_replies += 1

    for m in ments:
        cur.execute(
            """insert into mentorships (id, junior_id, senior_id, status, created_at, seed_batch_id)
               values (%s, %s, %s, %s, %s, %s)""",
            (mentorship_id(batch, m), pid[m["junior"]], pid[m["senior"]], m["status"], m["requested_at"], batch),
        )
    for f in follows:
        cur.execute(
            "insert into follows (follower_id, following_id, created_at, seed_batch_id) values (%s, %s, %s, %s)",
            (pid[f["follower"]], pid[f["following"]], f["created_at"], batch),
        )

    # ---------------------------------------------------------- integrity checks
    problems = []
    got = batch_counts(cur, batch)
    exp = {"profiles": len(people), "posts": n_posts, "replies": n_replies, "auth.users": len(people),
           "mentorships": len(ments), "follows": len(follows)}
    for k, v in exp.items():
        if got[k] != v:
            problems.append(f"{k}: expected {v}, got {got[k]}")
    checks = {
        "posts with missing author": "select count(*) from posts p left join profiles a on a.id = p.author_id where p.seed_batch_id = %(b)s and a.id is null",
        "replies with missing post/author": "select count(*) from replies r left join posts p on p.id = r.post_id left join profiles a on a.id = r.author_id where r.seed_batch_id = %(b)s and (p.id is null or a.id is null)",
        "seeded replies on non-seeded posts": "select count(*) from replies r join posts p on p.id = r.post_id where r.seed_batch_id = %(b)s and p.seed_batch_id is distinct from %(b)s",
        "seeded posts by non-seeded authors": "select count(*) from posts p join profiles a on a.id = p.author_id where p.seed_batch_id = %(b)s and a.seed_batch_id is distinct from %(b)s",
        "reply_count mismatches": "select count(*) from posts p where p.seed_batch_id = %(b)s and p.reply_count <> (select count(*) from replies r where r.post_id = p.id)",
        "posts without slug": "select count(*) from posts where seed_batch_id = %(b)s and (slug is null or slug = '')",
        "replies before their post": "select count(*) from replies r join posts p on p.id = r.post_id where r.seed_batch_id = %(b)s and r.created_at <= p.created_at",
        "content before author joined": "select count(*) from (select author_id, created_at from posts where seed_batch_id = %(b)s union all select author_id, created_at from replies where seed_batch_id = %(b)s) c join profiles a on a.id = c.author_id where c.created_at < a.created_at",
        "seeded seniors accepting mentees": "select count(*) from profiles where seed_batch_id = %(b)s and role = 'senior' and mentor_availability = 'accepting'",
        "seeded profiles open to messages": "select count(*) from profiles where seed_batch_id = %(b)s and is_open_to_messages",
        "seeded profiles not founding": "select count(*) from profiles where seed_batch_id = %(b)s and not is_founding_member",
        "notifications involving seeded profiles": "select count(*) from notifications n join profiles a on a.id in (n.user_id, n.actor_id) where a.seed_batch_id = %(b)s",
        "seeded auth users with a password": "select count(*) from auth.users where raw_app_meta_data->>'seed_batch_id' = %(b)s and coalesce(encrypted_password, '') <> ''",
    }
    for name, sql in SOCIAL_ZERO.items():
        checks.setdefault(name, sql.replace("{b}", "%(b)s"))
    check_results = {}
    for name, sql in checks.items():
        cur.execute(sql, {"b": batch})
        n = cur.fetchone()[0]
        check_results[name] = n
        if n:
            problems.append(f"{name}: {n}")
    after = total_counts(cur)
    if after["notifications"] != before["notifications"]:
        problems.append(f"notifications changed: {before['notifications']} -> {after['notifications']}")
    if problems:
        raise RuntimeError("integrity checks failed:\n  " + "\n  ".join(problems))
    return {"before": before, "after": after, "batch_counts": got, "checks": check_results}


def _lit(v) -> str:
    """SQL literal for the emitted file (standard_conforming_strings is on in Supabase)."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def social_sql(batch: str, pid: dict[str, str], ments: list[dict], follows: list[dict]) -> list[str]:
    L = _lit
    out = []
    for i in range(0, len(ments), 50):
        out.append("insert into mentorships (id, junior_id, senior_id, status, created_at, seed_batch_id) values\n  " + ",\n  ".join(
            f"({L(mentorship_id(batch, m))}, {L(pid[m['junior']])}, {L(pid[m['senior']])}, {L(m['status'])}, {L(m['requested_at'])}, {L(batch)})"
            for m in ments[i:i + 50]) + ";")
    for i in range(0, len(follows), 100):
        out.append("insert into follows (follower_id, following_id, created_at, seed_batch_id) values\n  " + ",\n  ".join(
            f"({L(pid[f['follower']])}, {L(pid[f['following']])}, {L(f['created_at'])}, {L(batch)})"
            for f in follows[i:i + 100]) + ";")
    return out


def _check_block(expect: dict[str, object], zero: list[str]) -> list[str]:
    out = ["do $c$ declare n bigint; e bigint; begin"]
    for q, want in expect.items():
        out.append(f"  execute $q${q}$q$ into n; e := {want};")
        out.append(f"  if n <> e then raise exception 'check failed: % (expected %, got %)', $q${q}$q$, e, n; end if;")
    for q in zero:
        out.append(f"  execute $q${q}$q$ into n;")
        out.append(f"  if n <> 0 then raise exception 'check failed (expected 0, got %): %', n, $q${q}$q$; end if;")
    out.append("end $c$;")
    return out


def emit_sql(batch: str, people: list[dict], threads: list[dict],
             ments: list[dict] | None = None, follows: list[dict] | None = None) -> str:
    """The same seed as seed(), as one self-checking SQL transaction.

    For a database we can't open a direct connection to (production via
    `supabase db query --linked -f`). Every check from seed() runs inside the
    transaction and raises, which rolls the whole batch back."""
    L = _lit
    pid = {p["handle"]: uid(batch, "profile", p["handle"].lower()) for p in people}
    out = [
        f"-- Founding Community seed, batch {batch}: {len(people)} members, {len(threads)} threads.",
        "-- Generated by seed/scripts/seed.py --emit-sql. One transaction; any failed check rolls it all back.",
        "begin;",
        "set local homefixr.seeding = 'on';",
        "create temp table _seed_before on commit drop as select (select count(*) from notifications) notifications;",
        "do $g$ begin",
        f"  if exists (select 1 from profiles where seed_batch_id = {L(batch)}) then",
        f"    raise exception 'batch {batch} is already present; wipe it first';",
        "  end if;",
        "  if exists (select 1 from profiles where lower(username) in ("
        + ", ".join(L(h.lower()) for h in pid)
        + ")) then raise exception 'a seeded handle is already used by a member'; end if;",
        "end $g$;",
    ]
    for p in people:
        app_meta = json.dumps({"provider": "email", "providers": ["email"], "founding_member": True, "seed_batch_id": batch})
        user_meta = json.dumps({"username": p["handle"], "full_name": p["full_name"], "role": p["role"]})
        out.append(
            "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, "
            "raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, "
            "email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token, "
            "banned_until, is_sso_user, is_anonymous) values ("
            f"{L(pid[p['handle']])}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', "
            f"{L(p['handle'].lower() + '@founding.home-fixr.invalid')}, '', {L(app_meta)}::jsonb, {L(user_meta)}::jsonb, "
            f"{L(p['joined_at'])}, {L(p['joined_at'])}, '', '', '', '', '', '', '', '', '9999-12-31T00:00:00Z', false, false);"
        )
        out.append(
            f"update profiles set username = {L(p['handle'])}, full_name = {L(p['full_name'])}, "
            f"display_preference = {L(p['display_preference'])}, avatar_initials = {L(p['avatar_initials'])}, "
            f"title = {L(p['title'])}, role = {L(p['role'])}, trade = {L(app_trade(p['trade']))}, "
            f"region = {L(p['public_region'])}, bio = {L(p['bio'] or None)}, years_experience = {L(p['years_in'] or None)}, "
            "is_open_to_messages = false, is_open_to_ride_alongs = false, "
            f"mentor_availability = {L(p['mentor_availability'] or 'not_accepting')}, is_founding_member = true, "
            f"seed_batch_id = {L(batch)}, avatar_style = {L(p['avatar_style'])}, avatar_icon = {L(p['avatar_icon'])}, "
            f"username_changed_at = {L(p['joined_at'])}, onboarded_at = {L(p['joined_at'])}, "
            f"created_at = {L(p['joined_at'])}, updated_at = {L(p['joined_at'])} where id = {L(pid[p['handle']])};"
        )
    n_posts = n_replies = 0
    for t in threads:
        post_id = uid(batch, "post", t["id"])
        out.append(
            "insert into posts (id, author_id, type, title, body, trade, region, helpful_count, created_at, seed_batch_id) values ("
            f"{L(post_id)}, {L(pid[t['author']])}, {L(t['type'])}, {L(t['title'])}, {L(t['body'].strip())}, "
            f"{L(t['trade'])}, {L(t['region'])}, {L(t['helpful_count'])}, {L(t['created_at'])}, {L(batch)});"
        )
        n_posts += 1
        for i, r in enumerate(t.get("replies", [])):
            out.append(
                "insert into replies (id, post_id, author_id, body, is_accepted, helpful_count, created_at, seed_batch_id) values ("
                f"{L(uid(batch, 'reply', t['id'], str(i)))}, {L(post_id)}, {L(pid[r['author']])}, {L(r['body'].strip())}, "
                f"{L(r['accepted'])}, {L(r['helpful_count'])}, {L(r['created_at'])}, {L(batch)});"
            )
            n_replies += 1

    ments, follows = ments or [], follows or []
    check_social_inputs(people, ments, follows)
    out += social_sql(batch, pid, ments, follows)

    b = L(batch)
    expect = {
        f"select count(*) from mentorships where seed_batch_id = {b}": len(ments),
        f"select count(*) from follows where seed_batch_id = {b}": len(follows),
        f"select count(*) from profiles where seed_batch_id = {b}": len(people),
        f"select count(*) from profiles where seed_batch_id = {b} and is_founding_member": len(people),
        f"select count(*) from auth.users where raw_app_meta_data->>'seed_batch_id' = {b}": len(people),
        f"select count(*) from posts where seed_batch_id = {b}": n_posts,
        f"select count(*) from replies where seed_batch_id = {b}": n_replies,
        "select count(*) from notifications": "(select notifications from _seed_before)",
    }
    zero = [
        f"select count(*) from posts p left join profiles a on a.id = p.author_id where p.seed_batch_id = {b} and a.id is null",
        f"select count(*) from replies r left join posts p on p.id = r.post_id left join profiles a on a.id = r.author_id where r.seed_batch_id = {b} and (p.id is null or a.id is null)",
        f"select count(*) from posts p where p.seed_batch_id = {b} and p.reply_count <> (select count(*) from replies r where r.post_id = p.id)",
        f"select count(*) from posts where seed_batch_id = {b} and (slug is null or slug = '')",
        f"select count(*) from replies r join posts p on p.id = r.post_id where r.seed_batch_id = {b} and r.created_at <= p.created_at",
        f"select count(*) from profiles where seed_batch_id = {b} and role = 'senior' and mentor_availability = 'accepting'",
        f"select count(*) from profiles where seed_batch_id = {b} and is_open_to_messages",
        f"select count(*) from auth.users where raw_app_meta_data->>'seed_batch_id' = {b} and coalesce(encrypted_password, '') <> ''",
        f"select count(*) from profiles where seed_batch_id = {b} and username <> (raw_handle.h) " if False else
        f"select count(*) from profiles p join auth.users u on u.id = p.id where p.seed_batch_id = {b} and p.username <> u.raw_user_meta_data->>'username'",
    ] + [q.replace("{b}", b) for q in SOCIAL_ZERO.values()]
    out += _check_block(expect, zero)
    out.append(
        f"select 'founding members' t, count(*) n from profiles where seed_batch_id = {b} "
        f"union all select 'posts', count(*) from posts where seed_batch_id = {b} "
        f"union all select 'replies', count(*) from replies where seed_batch_id = {b} "
        f"union all select 'mentorships', count(*) from mentorships where seed_batch_id = {b} "
        f"union all select 'follows', count(*) from follows where seed_batch_id = {b} "
        "union all select 'notifications (unchanged)', count(*) from notifications;"
    )
    out.append("commit;")
    return "\n".join(out) + "\n"


def helpful_updates(batch: str, threads: list[dict], live: dict) -> list[dict]:
    """Rows whose helpful_count differs from what production was seeded with."""
    out = []
    for t in threads:
        old = live["posts"].get(t["id"])
        if old is not None and old != t["helpful_count"]:
            out.append({"table": "posts", "id": uid(batch, "post", t["id"]), "key": t["id"], "old": old, "new": t["helpful_count"]})
        for i, r in enumerate(t.get("replies", [])):
            key = f"{t['id']}/r{i}"
            old = live["replies"].get(key)
            if old is None:
                raise SystemExit(f"{key} has no live baseline; the thread set changed since the live seed")
            if old != r["helpful_count"]:
                out.append({"table": "replies", "id": uid(batch, "reply", t["id"], str(i)), "key": key, "old": old, "new": r["helpful_count"]})
    return out


def emit_additions_sql(batch: str, people: list[dict], threads: list[dict], ments: list[dict], follows: list[dict], live: dict) -> str:
    """Only what's new since the live seed, for a batch that is already in production.

    Adds the batch's mentorships and follows and moves helpful counts by the
    difference from the live baseline (so any real member's votes since are
    kept). One transaction: refuses unless all 136 batch profiles are present
    with the expected ids and handles, refuses if any social row for the batch
    (or any follow/mentorship between two batch accounts) already exists, so a
    second run aborts; then verifies counts, the social invariants and that
    notifications didn't change."""
    L = _lit
    b = L(batch)
    check_social_inputs(people, ments, follows)
    pid = {p["handle"]: uid(batch, "profile", p["handle"].lower()) for p in people}
    upd = helpful_updates(batch, threads, live)
    st = {k: sum(m["status"] == k for m in ments) for k in ("active", "pending", "declined")}
    out = [
        f"-- Founding Community batch {batch}: social layer ADDITIONS for a batch that is already live.",
        f"-- {len(ments)} mentorships ({st['active']} active, {st['pending']} pending, {st['declined']} declined), "
        f"{len(follows)} follows, {len(upd)} helpful-count corrections on already-live rows.",
        "-- Generated by seed/scripts/seed.py --emit-additions-sql. One transaction; any failed check rolls it all back.",
        "-- Running it a second time aborts (the batch's social rows already exist).",
        "begin;",
        "set local homefixr.seeding = 'on';",
        "create temp table _add_before on commit drop as select "
        "(select count(*) from notifications) notifications, (select count(*) from mentorships) mentorships, "
        "(select count(*) from follows) follows;",
        "do $g$ declare n bigint; begin",
        f"  select count(*) into n from profiles where seed_batch_id = {b};",
        f"  if n <> {len(people)} then raise exception 'batch {batch}: expected {len(people)} profiles, found %%', n; end if;",
        "  select count(*) into n from profiles p join (values\n    "
        + ",\n    ".join(f"({L(pid[p['handle']])}::uuid, {L(p['handle'])})" for p in people)
        + f"\n  ) v(id, username) on v.id = p.id and v.username = p.username where p.seed_batch_id = {b};",
        f"  if n <> {len(people)} then raise exception 'batch {batch}: only %% of {len(people)} profiles have the expected id and handle', n; end if;",
        f"  if exists (select 1 from mentorships where seed_batch_id = {b}) or exists (select 1 from follows where seed_batch_id = {b}) then",
        f"    raise exception 'batch {batch} already has mentorships or follows: these additions were already applied';",
        "  end if;",
        "  if exists (select 1 from follows f join profiles a on a.id = f.follower_id join profiles c on c.id = f.following_id "
        f"where a.seed_batch_id = {b} and c.seed_batch_id = {b}) then raise exception 'untagged follows between batch accounts exist'; end if;",
        "  if exists (select 1 from mentorships m join profiles a on a.id = m.junior_id join profiles c on c.id = m.senior_id "
        f"where a.seed_batch_id = {b} and c.seed_batch_id = {b}) then raise exception 'untagged mentorships between batch accounts exist'; end if;",
    ]
    for tbl in ("posts", "replies"):
        ids = [u["id"] for u in upd if u["table"] == tbl]
        if ids:
            out.append(f"  select count(*) into n from {tbl} where seed_batch_id = {b} and id in ({', '.join(L(i) for i in ids)});")
            out.append(f"  if n <> {len(ids)} then raise exception '{tbl}: expected {len(ids)} batch rows to correct, found %%', n; end if;")
    out.append("end $g$;")
    out = [line.replace("%%", "%") for line in out]
    out += social_sql(batch, pid, ments, follows)
    if upd:
        out.append("-- Helpful-count corrections on rows that are ALREADY LIVE (accepted / substantive Senior answers lead).")
        out.append("-- Applied as a delta from the seeded value, so votes real members cast since then are kept.")
    for u in upd:
        out.append(f"update {u['table']} set helpful_count = greatest(0, helpful_count + ({u['new'] - u['old']})) "
                   f"where id = {L(u['id'])} and seed_batch_id = {b};  -- {u['key']}: seeded {u['old']} -> {u['new']}")
    expect = {
        f"select count(*) from mentorships where seed_batch_id = {b}": len(ments),
        f"select count(*) from mentorships where seed_batch_id = {b} and status = 'active'": st["active"],
        f"select count(*) from mentorships where seed_batch_id = {b} and status = 'pending'": st["pending"],
        f"select count(*) from mentorships where seed_batch_id = {b} and status = 'declined'": st["declined"],
        f"select count(*) from follows where seed_batch_id = {b}": len(follows),
        "select count(*) from mentorships": f"(select mentorships from _add_before) + {len(ments)}",
        "select count(*) from follows": f"(select follows from _add_before) + {len(follows)}",
        "select count(*) from notifications": "(select notifications from _add_before)",
        f"select count(*) from profiles where seed_batch_id = {b}": len(people),
    }
    zero = [q.replace("{b}", b) for q in SOCIAL_ZERO.values()]
    zero.append(f"select count(*) from replies where seed_batch_id = {b} and helpful_count < 0")
    out += _check_block(expect, zero)
    out.append(
        f"select 'mentorships (batch)' t, count(*) n from mentorships where seed_batch_id = {b} "
        f"union all select 'follows (batch)', count(*) from follows where seed_batch_id = {b} "
        f"union all select 'helpful corrections', {len(upd)} "
        "union all select 'notifications (unchanged)', count(*) from notifications;"
    )
    out.append("commit;")
    return "\n".join(out) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-url", default=LOCAL_DB_URL)
    ap.add_argument("--batch", default=BATCH_ID)
    ap.add_argument("--threads", default="content/threads.sample.scheduled.json")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--replace", action="store_true", help="wipe this batch first (local only)")
    ap.add_argument("--emit-sql", metavar="PATH", help="write the seed as one self-checking SQL transaction instead of connecting")
    ap.add_argument("--emit-additions-sql", metavar="PATH",
                    help="write ONLY the social rows + helpful corrections for a batch that is already live")
    ap.add_argument("--mentorships", default="content/mentorships.json")
    ap.add_argument("--follows", default="content/follows.json")
    ap.add_argument("--live-helpful", default="content/live_helpful_fm-2026-10.json",
                    help="helpful counts as seeded to production (baseline for --emit-additions-sql)")
    ap.add_argument("--no-social", action="store_true", help="seed/emit without mentorships and follows")
    args = ap.parse_args()

    people = load_json("personas/seniors.json") + load_json("personas/juniors.json")
    threads = load_json(args.threads)["threads"]
    missing = [t["id"] for t in threads if "created_at" not in t]
    if missing:
        raise SystemExit(f"threads without timestamps (run schedule.py): {missing}")

    ments = [] if args.no_social else load_json(args.mentorships)["mentorships"]
    follows = [] if args.no_social else load_json(args.follows)["follows"]

    if args.emit_additions_sql:
        live = load_json(args.live_helpful)
        if live["batch_id"] != args.batch:
            raise SystemExit(f"live baseline is for {live['batch_id']}, not {args.batch}")
        sql = emit_additions_sql(args.batch, people, threads, ments, follows, live)
        Path(args.emit_additions_sql).parent.mkdir(parents=True, exist_ok=True)
        Path(args.emit_additions_sql).write_text(sql)
        upd = helpful_updates(args.batch, threads, live)
        print(f"wrote {args.emit_additions_sql}: {len(ments)} mentorships, {len(follows)} follows, "
              f"{len(upd)} helpful corrections ({', '.join(u['key'] for u in upd)})")
        return

    if args.emit_sql:
        Path(args.emit_sql).write_text(emit_sql(args.batch, people, threads, ments, follows))
        print(f"wrote {args.emit_sql}: {len(people)} members, {len(threads)} threads, "
              f"{sum(len(t.get('replies', [])) for t in threads)} replies, {len(ments)} mentorships, {len(follows)} follows")
        return

    assert_local_db(args.db_url)

    with psycopg.connect(args.db_url) as conn:
        with conn.cursor() as cur:
            existing = batch_counts(cur, args.batch)
        if any(existing.values()):
            if not args.replace:
                raise SystemExit(f"batch {args.batch} already present: {existing}. Use --replace or wipe.py.")
            import wipe  # same directory

            wipe.wipe(conn, args.batch, include_dependent=False, dry_run=False)
            conn.commit()
        try:
            result = seed(conn, args.batch, people, threads, ments, follows)
        except Exception:
            conn.rollback()
            raise
        if args.dry_run:
            conn.rollback()
            print("dry run: rolled back")
        else:
            conn.commit()

    result["batch"] = args.batch
    result["dry_run"] = args.dry_run
    result["ran_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    write_json("reports/seed_run.json", result)
    print(json.dumps({k: result[k] for k in ("batch_counts", "checks")}, indent=2))
    print("before:", result["before"])
    print("after: ", result["after"])


if __name__ == "__main__":
    main()
