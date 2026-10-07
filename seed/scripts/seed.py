# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.1"]
# ///
"""
Write the Founding Community batch to the database (plan §7).

    uv run seed/scripts/seed.py                       # LOCAL stack, sample threads
    uv run seed/scripts/seed.py --dry-run             # do everything, then roll back
    uv run seed/scripts/seed.py --replace             # wipe this batch first, then seed

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
  4. Checks: row counts, every FK resolves, seeded replies only touch seeded
     posts, zero notifications created, no seeded Senior "accepting".
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


def seed(conn, batch: str, people: list[dict], threads: list[dict]) -> dict:
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

    # ---------------------------------------------------------- integrity checks
    problems = []
    got = batch_counts(cur, batch)
    exp = {"profiles": len(people), "posts": n_posts, "replies": n_replies, "auth.users": len(people)}
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


def emit_sql(batch: str, people: list[dict], threads: list[dict]) -> str:
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

    b = L(batch)
    expect = {
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
    ]
    out.append("do $c$ declare n bigint; e bigint; begin")
    for q, want in expect.items():
        out.append(f"  execute $q${q}$q$ into n; e := {want};")
        out.append(f"  if n <> e then raise exception 'check failed: % (expected %, got %)', $q${q}$q$, e, n; end if;")
    for q in zero:
        out.append(f"  execute $q${q}$q$ into n;")
        out.append(f"  if n <> 0 then raise exception 'check failed (expected 0, got %): %', n, $q${q}$q$; end if;")
    out.append("end $c$;")
    out.append(
        f"select 'founding members' t, count(*) n from profiles where seed_batch_id = {b} "
        f"union all select 'posts', count(*) from posts where seed_batch_id = {b} "
        f"union all select 'replies', count(*) from replies where seed_batch_id = {b} "
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
    args = ap.parse_args()

    people = load_json("personas/seniors.json") + load_json("personas/juniors.json")
    threads = load_json(args.threads)["threads"]
    missing = [t["id"] for t in threads if "created_at" not in t]
    if missing:
        raise SystemExit(f"threads without timestamps (run schedule.py): {missing}")

    if args.emit_sql:
        Path(args.emit_sql).write_text(emit_sql(args.batch, people, threads))
        print(f"wrote {args.emit_sql}: {len(people)} members, {len(threads)} threads, "
              f"{sum(len(t.get('replies', [])) for t in threads)} replies")
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
            result = seed(conn, args.batch, people, threads)
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
