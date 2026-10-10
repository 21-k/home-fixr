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
    uv run seed/scripts/seed.py --emit-threads-sql PATH --threads content/threads.scheduled.json
        # ONLY the threads that aren't live yet (+ the profile text fixes they
        # need), for a batch that is already live; refuses to run twice
    uv run seed/scripts/seed.py --emit-collabs-sql PATH
        # ONLY the job collabs + pitches (content/collabs.json) for a batch that
        # is already live; needs migration 0013 first; refuses to run twice

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
  4b. job collabs -> collab_interests (content/collabs.json from
     gen_collabs.py): every collab already filled (filled_at, migration 0013),
     pitches with their application detail, no CV files.
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
# Checks on the batch's job collabs that must all return 0. `{b}` is the batch.
COLLAB_ZERO = {
    "collabs or pitches touching a non-seeded profile":
        "select count(*) from (select poster_id a from job_collabs where seed_batch_id = {b} "
        "union all select user_id from collab_interests where seed_batch_id = {b}) x "
        "join profiles p on p.id = x.a where p.seed_batch_id is distinct from {b}",
    "pitches on non-batch collabs, or untagged pitches on batch collabs":
        "select count(*) from collab_interests ci join job_collabs j on j.id = ci.collab_id "
        "where (ci.seed_batch_id = {b} or j.seed_batch_id = {b}) and ci.seed_batch_id is distinct from j.seed_batch_id",
    "batch collabs without exactly one accepted pitch":
        "select count(*) from job_collabs j where j.seed_batch_id = {b} and "
        "(select count(*) from collab_interests ci where ci.collab_id = j.id and ci.status = 'accepted') <> 1",
    "batch collabs not filled, or filled before a pitch":
        "select count(*) from job_collabs j where j.seed_batch_id = {b} and (j.filled_at is null or j.filled_at <= "
        "(select max(ci.created_at) from collab_interests ci where ci.collab_id = j.id))",
    "batch collabs with interested_count out of sync":
        "select count(*) from job_collabs j where j.seed_batch_id = {b} and "
        "j.interested_count <> (select count(*) from collab_interests ci where ci.collab_id = j.id)",
    "pitches before the collab was posted, or Juniors applying to Seniors' jobs the wrong way round":
        "select count(*) from collab_interests ci join job_collabs j on j.id = ci.collab_id "
        "join profiles a on a.id = ci.user_id join profiles p on p.id = j.poster_id "
        "where ci.seed_batch_id = {b} and (ci.created_at <= j.created_at or a.role <> 'junior' or p.role <> 'senior')",
    "collab rows outside the window or before the person joined":
        "select count(*) from (select j.poster_id a, j.created_at t from job_collabs j where j.seed_batch_id = {b} "
        "union all select j.poster_id, j.filled_at from job_collabs j where j.seed_batch_id = {b} "
        "union all select ci.user_id, ci.created_at from collab_interests ci where ci.seed_batch_id = {b}) x "
        "join profiles p on p.id = x.a "
        f"where x.t > '{WINDOW_END_SQL}' or x.t < '{WINDOW_START_SQL}' or x.t < p.created_at",
    "batch collabs with a job date outside Aug 1 - Oct 3, or filled after the job day":
        "select count(*) from job_collabs where seed_batch_id = {b} and (scheduled_date not between '2026-08-01' and '2026-10-03' "
        "or filled_at >= (scheduled_date::timestamp at time zone 'America/New_York'))",
    "pitches with a CV file attached":
        "select count(*) from collab_interests where seed_batch_id = {b} and (cv_path is not null or cv_name is not null)",
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


def collab_id(batch: str, c: dict) -> str:
    return uid(batch, "collab", c["id"])


def check_collab_inputs(people: list[dict], collabs: list[dict]) -> None:
    handles = {p["handle"] for p in people}
    bad = [c["id"] for c in collabs if c["poster"] not in handles]
    bad += [f"{c['id']}/{b['applicant']}" for c in collabs for b in c["pitches"] if b["applicant"] not in handles]
    if bad:
        raise SystemExit(f"collabs reference unknown handles: {bad[:3]}")


def _arr(v) -> str:
    if not v:
        return "null"
    return "array[" + ", ".join(_lit(x) for x in v) + "]::text[]"


def collab_sql(batch: str, pid: dict[str, str], collabs: list[dict]) -> list[str]:
    """INSERTs for the batch's job collabs (already filled) and their pitches."""
    L = _lit
    out = []
    if not collabs:
        return out
    out.append("insert into job_collabs (id, poster_id, type, title, body, trade, location, scheduled_date, pay_type, "
               "filled_at, created_at, seed_batch_id) values\n  " + ",\n  ".join(
                   f"({L(collab_id(batch, c))}, {L(pid[c['poster']])}, {L(c['type'])}, {L(c['title'])}, {L(c['body'])}, "
                   f"{L(app_trade(c['trade']))}, {L(c['location'])}, {L(c['scheduled_date'])}, {L(c['pay_type'])}, "
                   f"{L(c['filled_at'])}, {L(c['posted_at'])}, {L(batch)})" for c in collabs) + ";")
    rows = []
    for c in collabs:
        for b in c["pitches"]:
            rows.append(
                f"({L(uid(batch, 'collab_interest', c['id'], b['applicant'].lower()))}, {L(collab_id(batch, c))}, "
                f"{L(pid[b['applicant']])}, {L(b['status'])}, {L(b['note'])}, {L(b['years_experience'])}, "
                f"{L(b['graduation_year'])}, {L(b['age_range'])}, {_arr(b['skills'])}, {L(b['is_licensed'])}, "
                f"{L(b['license_note'])}, {L(b['has_own_tools'])}, {L(b['has_transport'])}, {L(b['applied_at'])}, {L(batch)})")
    for i in range(0, len(rows), 100):
        out.append("insert into collab_interests (id, collab_id, user_id, status, note, years_experience, graduation_year, "
                   "age_range, skills, is_licensed, license_note, has_own_tools, has_transport, created_at, seed_batch_id) values\n  "
                   + ",\n  ".join(rows[i:i + 100]) + ";")
    return out


def collab_expect(batch_lit: str, collabs: list[dict]) -> dict[str, object]:
    from collections import Counter
    st = Counter(b["status"] for c in collabs for b in c["pitches"])
    n = sum(len(c["pitches"]) for c in collabs)
    return {
        f"select count(*) from job_collabs where seed_batch_id = {batch_lit}": len(collabs),
        f"select count(*) from job_collabs where seed_batch_id = {batch_lit} and filled_at is not null": len(collabs),
        f"select count(*) from collab_interests where seed_batch_id = {batch_lit}": n,
        f"select count(*) from collab_interests where seed_batch_id = {batch_lit} and status = 'accepted'": st["accepted"],
        f"select count(*) from collab_interests where seed_batch_id = {batch_lit} and status = 'declined'": st["declined"],
        f"select count(*) from collab_interests where seed_batch_id = {batch_lit} and status = 'interested'": st["interested"],
    }


def check_social_inputs(people: list[dict], ments: list[dict], follows: list[dict]) -> None:
    handles = {p["handle"] for p in people}
    bad = [m for m in ments if m["junior"] not in handles or m["senior"] not in handles]
    bad += [f for f in follows if f["follower"] not in handles or f["following"] not in handles]
    if bad:
        raise SystemExit(f"social rows reference unknown handles: {bad[:3]}")


def seed(conn, batch: str, people: list[dict], threads: list[dict],
         ments: list[dict] | None = None, follows: list[dict] | None = None,
         collabs: list[dict] | None = None) -> dict:
    ments, follows, collabs = ments or [], follows or [], collabs or []
    check_social_inputs(people, ments, follows)
    check_collab_inputs(people, collabs)
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
    for stmt in collab_sql(batch, pid, collabs):
        cur.execute(stmt)

    # ---------------------------------------------------------- integrity checks
    problems = []
    got = batch_counts(cur, batch)
    exp = {"profiles": len(people), "posts": n_posts, "replies": n_replies, "auth.users": len(people),
           "mentorships": len(ments), "follows": len(follows), "job_collabs": len(collabs),
           "collab_interests": sum(len(c["pitches"]) for c in collabs)}
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
    # The collab checks need migration 0013; only run them when collabs are seeded.
    for name, sql in {**SOCIAL_ZERO, **(COLLAB_ZERO if collabs else {})}.items():
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
             ments: list[dict] | None = None, follows: list[dict] | None = None,
             collabs: list[dict] | None = None) -> str:
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

    ments, follows, collabs = ments or [], follows or [], collabs or []
    check_social_inputs(people, ments, follows)
    check_collab_inputs(people, collabs)
    out += social_sql(batch, pid, ments, follows)
    out += collab_sql(batch, pid, collabs)

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
        **(collab_expect(b, collabs) if collabs else {}),
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
    ] + [q.replace("{b}", b) for q in SOCIAL_ZERO.values()] + [q.replace("{b}", b) for q in (COLLAB_ZERO.values() if collabs else [])]
    out += _check_block(expect, zero)
    out.append(
        f"select 'founding members' t, count(*) n from profiles where seed_batch_id = {b} "
        f"union all select 'posts', count(*) from posts where seed_batch_id = {b} "
        f"union all select 'replies', count(*) from replies where seed_batch_id = {b} "
        f"union all select 'mentorships', count(*) from mentorships where seed_batch_id = {b} "
        f"union all select 'follows', count(*) from follows where seed_batch_id = {b} "
        f"union all select 'job collabs', count(*) from job_collabs where seed_batch_id = {b} "
        f"union all select 'collab pitches', count(*) from collab_interests where seed_batch_id = {b} "
        "union all select 'notifications (unchanged)', count(*) from notifications;"
    )
    out.append("commit;")
    return "\n".join(out) + "\n"


def emit_collabs_sql(batch: str, people: list[dict], collabs: list[dict], ments: list[dict]) -> str:
    """Only the job collabs + pitches, for a batch that is already live.

    Needs migration 0013 (job_collabs.filled_at) on the target first. One
    transaction: refuses unless 0013 is in, all batch profiles are present with
    the expected ids and handles, and the batch's mentorships are there (the
    pitches from mentees are dated after their mentorship); refuses if the
    batch already has any job collab or pitch, so a second run aborts. Then
    verifies the counts, the collab invariants and that notifications didn't
    change."""
    from collections import Counter
    L = _lit
    b = L(batch)
    check_collab_inputs(people, collabs)
    pid = {p["handle"]: uid(batch, "profile", p["handle"].lower()) for p in people}
    n = sum(len(c["pitches"]) for c in collabs)
    st = Counter(x["status"] for c in collabs for x in c["pitches"])
    mentee_pairs = sorted({(x["applicant"], c["poster"]) for c in collabs for x in c["pitches"] if x.get("mentee_of_poster")})
    out = [
        f"-- Founding Community batch {batch}: job collab ADDITIONS for a batch that is already live.",
        f"-- {len(collabs)} collabs, all already filled, with {n} pitches ({st['accepted']} accepted, "
        f"{st['declined']} declined, {st['interested']} pending). No CV files.",
        "-- Requires migration 0013_collab_filled.sql on the target first (job_collabs.filled_at).",
        "-- Generated by seed/scripts/seed.py --emit-collabs-sql. One transaction; any failed check rolls it all back.",
        "-- Running it a second time aborts (the batch's collabs already exist).",
        "begin;",
        "set local homefixr.seeding = 'on';",
        "do $m$ begin",
        "  if not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'job_collabs' and column_name = 'filled_at') then",
        "    raise exception 'job_collabs.filled_at is missing: apply migration 0013_collab_filled.sql first';",
        "  end if;",
        "end $m$;",
        "create temp table _col_before on commit drop as select "
        "(select count(*) from notifications) notifications, (select count(*) from job_collabs) job_collabs, "
        "(select count(*) from collab_interests) collab_interests;",
        "do $g$ declare n bigint; begin",
        f"  select count(*) into n from profiles where seed_batch_id = {b};",
        f"  if n <> {len(people)} then raise exception 'batch {batch}: expected {len(people)} profiles, found %', n; end if;",
        "  select count(*) into n from profiles p join (values\n    "
        + ",\n    ".join(f"({L(pid[p['handle']])}::uuid, {L(p['handle'])})" for p in people)
        + f"\n  ) v(id, username) on v.id = p.id and v.username = p.username where p.seed_batch_id = {b};",
        f"  if n <> {len(people)} then raise exception 'batch {batch}: only % of {len(people)} profiles have the expected id and handle', n; end if;",
        f"  if exists (select 1 from job_collabs where seed_batch_id = {b}) or exists (select 1 from collab_interests where seed_batch_id = {b}) then",
        f"    raise exception 'batch {batch} already has job collabs or pitches: these additions were already applied';",
        "  end if;",
        "  if exists (select 1 from job_collabs j join profiles a on a.id = j.poster_id "
        f"where a.seed_batch_id = {b}) then raise exception 'untagged job collabs posted by batch accounts exist'; end if;",
    ]
    if mentee_pairs:
        out.append("  select count(*) into n from mentorships m join (values\n    "
                   + ",\n    ".join(f"({L(pid[j])}::uuid, {L(pid[s_])}::uuid)" for j, s_ in mentee_pairs)
                   + f"\n  ) v(j, s) on v.j = m.junior_id and v.s = m.senior_id where m.seed_batch_id = {b} and m.status = 'active';")
        out.append(f"  if n <> {len(mentee_pairs)} then raise exception 'batch {batch}: % of {len(mentee_pairs)} mentee pitches have their "
                   "active mentorship; apply the social additions first', n; end if;")
    out.append("end $g$;")
    out += collab_sql(batch, pid, collabs)
    expect = {
        **collab_expect(b, collabs),
        "select count(*) from job_collabs": f"(select job_collabs from _col_before) + {len(collabs)}",
        "select count(*) from collab_interests": f"(select collab_interests from _col_before) + {n}",
        "select count(*) from notifications": "(select notifications from _col_before)",
        f"select count(*) from profiles where seed_batch_id = {b}": len(people),
    }
    zero = [q.replace("{b}", b) for q in COLLAB_ZERO.values()]
    out += _check_block(expect, zero)
    out.append(
        f"select 'job collabs (batch, filled)' t, count(*) n from job_collabs where seed_batch_id = {b} and filled_at is not null "
        f"union all select 'collab pitches (batch)', count(*) from collab_interests where seed_batch_id = {b} "
        f"union all select 'accepted pitches', count(*) from collab_interests where seed_batch_id = {b} and status = 'accepted' "
        "union all select 'notifications (unchanged)', count(*) from notifications;"
    )
    out.append("commit;")
    return "\n".join(out) + "\n"


# Live profile text that the full thread set needs changed (reports/integration_edits.md):
# vo-tech students written as current seniors in fall 2026 are class of '27, not '26.
PROFILE_TEXT_FIXES = [
    ("Exit117Plumber", "bio",
     "Senior in the plumbing program at the county vo-tech. Graduating 2026. Trying to figure out union vs going straight to a shop.",
     "Senior in the plumbing program at the county vo-tech. Graduating 2027. Trying to figure out union vs going straight to a shop."),
    ("GSP_Exit82", "bio",
     "senior in the the trades program at the county vo-tech, graduating 2026. trying to figure out union vs going straight to a shop",
     "senior in the the trades program at the county vo-tech, graduating 2027. trying to figure out union vs going straight to a shop"),
]


def thread_rows_sql(batch: str, pid: dict[str, str], threads: list[dict]) -> tuple[list[str], int]:
    L = _lit
    out, n_rep = [], 0
    for t in threads:
        post_id = uid(batch, "post", t["id"])
        out.append(
            "insert into posts (id, author_id, type, title, body, trade, region, helpful_count, created_at, seed_batch_id) values ("
            f"{L(post_id)}, {L(pid[t['author']])}, {L(t['type'])}, {L(t['title'])}, {L(t['body'].strip())}, "
            f"{L(t['trade'])}, {L(t['region'])}, {L(t['helpful_count'])}, {L(t['created_at'])}, {L(batch)});")
        rows = [f"({L(uid(batch, 'reply', t['id'], str(i)))}, {L(post_id)}, {L(pid[r['author']])}, {L(r['body'].strip())}, "
                f"{L(r['accepted'])}, {L(r['helpful_count'])}, {L(r['created_at'])}, {L(batch)})"
                for i, r in enumerate(t.get("replies", []))]
        if rows:
            out.append("insert into replies (id, post_id, author_id, body, is_accepted, helpful_count, created_at, seed_batch_id) values\n  "
                       + ",\n  ".join(rows) + ";")
        n_rep += len(rows)
    return out, n_rep


def emit_threads_sql(batch: str, people: list[dict], threads: list[dict], live_ids: set[str]) -> str:
    """Only the threads that aren't live yet, for a batch that is already in production.

    One transaction. Refuses unless all batch profiles are present with the
    expected ids and handles and the live threads are there; refuses if ANY
    of the new post or reply ids already exists (so a second run aborts);
    applies PROFILE_TEXT_FIXES only where the profile still has the old text;
    then verifies counts, reply counts, slugs, ordering, join dates and that
    notifications didn't change."""
    L = _lit
    b = L(batch)
    pid = {p["handle"]: uid(batch, "profile", p["handle"].lower()) for p in people}
    new = [t for t in threads if t["id"] not in live_ids]
    live = [t for t in threads if t["id"] in live_ids]
    missing = [t["id"] for t in new if "created_at" not in t]
    if missing:
        raise SystemExit(f"unscheduled threads: {missing[:5]}")
    unknown = [a for t in new for a in [t["author"]] + [r["author"] for r in t.get("replies", [])] if a not in pid]
    if unknown:
        raise SystemExit(f"unknown authors: {unknown[:5]}")
    new_post_ids = [uid(batch, "post", t["id"]) for t in new]
    new_reply_ids = [uid(batch, "reply", t["id"], str(i)) for t in new for i in range(len(t.get("replies", [])))]
    live_post_ids = [uid(batch, "post", t["id"]) for t in live]
    n_new_rep = len(new_reply_ids)
    by = {p["handle"]: p for p in people}
    out = [
        f"-- Founding Community batch {batch}: thread ADDITIONS for a batch that is already live.",
        f"-- {len(new)} new threads ({', '.join(t['id'] for t in new[:1])} .. {new[-1]['id']}) with {n_new_rep} replies; "
        f"the {len(live)} live threads are untouched. {len(PROFILE_TEXT_FIXES)} live profile text fixes.",
        "-- Generated by seed/scripts/seed.py --emit-threads-sql. One transaction; any failed check rolls it all back.",
        "-- Running it a second time aborts (the new post ids already exist).",
        "begin;",
        "set local homefixr.seeding = 'on';",
        "create temp table _thr_before on commit drop as select "
        "(select count(*) from notifications) notifications, (select count(*) from posts) posts, (select count(*) from replies) replies;",
        "do $g$ declare n bigint; begin",
        f"  select count(*) into n from profiles where seed_batch_id = {b};",
        f"  if n <> {len(people)} then raise exception 'batch {batch}: expected {len(people)} profiles, found %', n; end if;",
        "  select count(*) into n from profiles p join (values\n    "
        + ",\n    ".join(f"({L(pid[p['handle']])}::uuid, {L(p['handle'])})" for p in people)
        + f"\n  ) v(id, username) on v.id = p.id and v.username = p.username where p.seed_batch_id = {b};",
        f"  if n <> {len(people)} then raise exception 'batch {batch}: only % of {len(people)} profiles have the expected id and handle', n; end if;",
        f"  select count(*) into n from posts where seed_batch_id = {b} and id in ({', '.join(L(i) for i in live_post_ids)});",
        f"  if n <> {len(live)} then raise exception 'batch {batch}: % of the {len(live)} live threads found', n; end if;",
        f"  if exists (select 1 from posts where id in ({', '.join(L(i) for i in new_post_ids)})) then",
        f"    raise exception 'batch {batch}: some of the new threads already exist: these additions were already applied';",
        "  end if;",
        f"  if exists (select 1 from replies where id in ({', '.join(L(i) for i in new_reply_ids)})) then",
        f"    raise exception 'batch {batch}: some of the new replies already exist';",
        "  end if;",
    ]
    for handle, col, old, newv in PROFILE_TEXT_FIXES:
        out.append(f"  select count(*) into n from profiles where id = {L(pid[handle])} and seed_batch_id = {b} and {col} in ({L(old)}, {L(newv)});")
        out.append(f"  if n <> 1 then raise exception '{handle}: {col} is neither the seeded text nor the fix; not touching it'; end if;")
    out.append("end $g$;")
    out.append("-- Live profile text fixes (class of '26 vo-tech students written as seniors in fall 2026 -> graduating 2027).")
    for handle, col, old, newv in PROFILE_TEXT_FIXES:
        if by[handle][col] != newv:
            raise SystemExit(f"{handle}.{col} in personas doesn't match the fix")
        out.append(f"update profiles set {col} = {L(newv)} where id = {L(pid[handle])} and seed_batch_id = {b} and {col} = {L(old)};")
    rows, _ = thread_rows_sql(batch, pid, new)
    out += rows
    total_rep = sum(len(t.get("replies", [])) for t in threads)
    expect = {
        f"select count(*) from posts where seed_batch_id = {b}": len(threads),
        f"select count(*) from replies where seed_batch_id = {b}": total_rep,
        "select count(*) from posts": f"(select posts from _thr_before) + {len(new)}",
        "select count(*) from replies": f"(select replies from _thr_before) + {n_new_rep}",
        "select count(*) from notifications": "(select notifications from _thr_before)",
    }
    for handle, col, old, newv in PROFILE_TEXT_FIXES:
        expect[f"select count(*) from profiles where id = {L(pid[handle])} and {col} = {L(newv)}"] = 1
    zero = [
        f"select count(*) from posts p left join profiles a on a.id = p.author_id where p.seed_batch_id = {b} and a.id is null",
        f"select count(*) from replies r left join posts p on p.id = r.post_id left join profiles a on a.id = r.author_id where r.seed_batch_id = {b} and (p.id is null or a.id is null)",
        f"select count(*) from posts p where p.seed_batch_id = {b} and p.reply_count < (select count(*) from replies r where r.post_id = p.id and r.seed_batch_id = {b})",
        f"select count(*) from posts p where p.id in ({', '.join(L(i) for i in new_post_ids)}) and p.reply_count <> (select count(*) from replies r where r.post_id = p.id)",
        f"select count(*) from posts where seed_batch_id = {b} and (slug is null or slug = '')",
        f"select count(*) from replies r join posts p on p.id = r.post_id where r.seed_batch_id = {b} and r.created_at <= p.created_at",
        f"select count(*) from (select author_id, created_at from posts where seed_batch_id = {b} union all "
        f"select author_id, created_at from replies where seed_batch_id = {b}) c join profiles a on a.id = c.author_id where c.created_at < a.created_at",
        f"select count(*) from replies r join posts p on p.id = r.post_id where r.seed_batch_id = {b} and p.seed_batch_id is distinct from {b}",
        f"select count(*) from (select post_id from replies where seed_batch_id = {b} and is_accepted group by 1 having count(*) > 1) x",
        f"select count(*) from (select created_at from posts where seed_batch_id = {b} union all select created_at from replies where seed_batch_id = {b}) x "
        f"where x.created_at < '{WINDOW_START_SQL}' or x.created_at > '{WINDOW_END_SQL}'",
    ]
    out += _check_block(expect, zero)
    out.append(
        f"select 'threads (batch)' t, count(*) n from posts where seed_batch_id = {b} "
        f"union all select 'replies (batch)', count(*) from replies where seed_batch_id = {b} "
        f"union all select 'new threads', {len(new)} union all select 'new replies', {n_new_rep} "
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
    ap.add_argument("--collabs", default="content/collabs.json")
    ap.add_argument("--no-collabs", action="store_true", help="seed/emit without job collabs")
    ap.add_argument("--emit-threads-sql", metavar="PATH",
                    help="write ONLY the not-yet-live threads (+ profile text fixes) for a batch that is already live")
    ap.add_argument("--emit-collabs-sql", metavar="PATH",
                    help="write ONLY the job collabs + pitches for a batch that is already live (needs migration 0013)")
    args = ap.parse_args()

    people = load_json("personas/seniors.json") + load_json("personas/juniors.json")
    threads = load_json(args.threads)["threads"]
    missing = [t["id"] for t in threads if "created_at" not in t]
    if missing:
        raise SystemExit(f"threads without timestamps (run schedule.py): {missing}")

    ments = [] if args.no_social else load_json(args.mentorships)["mentorships"]
    follows = [] if args.no_social else load_json(args.follows)["follows"]
    collabs = [] if args.no_collabs else load_json(args.collabs)["collabs"]

    if args.emit_threads_sql:
        live_ids = {t["id"] for t in load_json("content/threads.sample.scheduled.json")["threads"]}
        sql = emit_threads_sql(args.batch, people, threads, live_ids)
        Path(args.emit_threads_sql).parent.mkdir(parents=True, exist_ok=True)
        Path(args.emit_threads_sql).write_text(sql)
        new = [t for t in threads if t["id"] not in live_ids]
        print(f"wrote {args.emit_threads_sql}: {len(new)} new threads, {sum(len(t.get('replies', [])) for t in new)} replies, "
              f"{len(PROFILE_TEXT_FIXES)} profile text fixes")
        return

    if args.emit_collabs_sql:
        all_ments = load_json(args.mentorships)["mentorships"]
        sql = emit_collabs_sql(args.batch, people, load_json(args.collabs)["collabs"], all_ments)
        Path(args.emit_collabs_sql).parent.mkdir(parents=True, exist_ok=True)
        Path(args.emit_collabs_sql).write_text(sql)
        cs = load_json(args.collabs)["collabs"]
        print(f"wrote {args.emit_collabs_sql}: {len(cs)} collabs (all filled), {sum(len(c['pitches']) for c in cs)} pitches")
        return

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
        Path(args.emit_sql).write_text(emit_sql(args.batch, people, threads, ments, follows, collabs))
        print(f"wrote {args.emit_sql}: {len(people)} members, {len(threads)} threads, "
              f"{sum(len(t.get('replies', [])) for t in threads)} replies, {len(ments)} mentorships, {len(follows)} follows, "
              f"{len(collabs)} collabs")
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
            result = seed(conn, args.batch, people, threads, ments, follows, collabs)
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
