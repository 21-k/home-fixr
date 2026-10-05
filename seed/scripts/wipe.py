# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.1"]
# ///
"""
Remove one seed batch, in FK-safe order, in one transaction (plan §7.6).

    uv run seed/scripts/wipe.py --batch fm-2026-10 --dry-run    # report only
    uv run seed/scripts/wipe.py --batch fm-2026-10

Before deleting it reports, and by default REFUSES, if real (non-seeded)
members have built anything on top of the batch: replies on seeded posts,
follows/mentorships/messages involving seeded accounts, applications to
seeded collabs. Deleting the batch would delete those too (FK cascades), so
that needs --include-dependent-real-rows and a human decision.

Order: collab_interests -> follows -> mentorships -> replies -> posts ->
job_collabs -> notifications touching seeded profiles -> auth.users (which
cascades the profile rows). Then verifies nothing tagged with the batch is
left. Local stack only.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).parent))
from common import BATCH_ID, LOCAL_DB_URL, assert_local_db, write_json  # noqa: E402

DEPENDENT_REAL = {
    "real replies on seeded posts": "select count(*) from replies r join posts p on p.id = r.post_id where p.seed_batch_id = %(b)s and r.seed_batch_id is distinct from %(b)s",
    "real follows involving seeded accounts": "select count(*) from follows f join profiles a on a.id in (f.follower_id, f.following_id) where a.seed_batch_id = %(b)s and f.seed_batch_id is distinct from %(b)s",
    "real mentorships involving seeded accounts": "select count(*) from mentorships m join profiles a on a.id in (m.junior_id, m.senior_id) where a.seed_batch_id = %(b)s and m.seed_batch_id is distinct from %(b)s",
    "messages involving seeded accounts": "select count(*) from messages m join profiles a on a.id in (m.sender_id, m.recipient_id) where a.seed_batch_id = %(b)s",
    "real applications to seeded collabs": "select count(*) from collab_interests ci join job_collabs j on j.id = ci.collab_id where j.seed_batch_id = %(b)s and ci.seed_batch_id is distinct from %(b)s",
    "real posts by seeded accounts (should be 0)": "select count(*) from posts p join profiles a on a.id = p.author_id where a.seed_batch_id = %(b)s and p.seed_batch_id is distinct from %(b)s",
}

STEPS = [
    ("collab_interests", "delete from collab_interests where seed_batch_id = %(b)s"),
    ("follows", "delete from follows where seed_batch_id = %(b)s"),
    ("mentorships", "delete from mentorships where seed_batch_id = %(b)s"),
    ("replies", "delete from replies where seed_batch_id = %(b)s"),
    ("posts", "delete from posts where seed_batch_id = %(b)s"),
    ("job_collabs", "delete from job_collabs where seed_batch_id = %(b)s"),
    ("notifications", "delete from notifications n using profiles a where a.id in (n.user_id, n.actor_id) and a.seed_batch_id = %(b)s"),
    ("auth.users (+profiles)", "delete from auth.users u using profiles a where a.id = u.id and a.seed_batch_id = %(b)s"),
    ("auth.users (orphans)", "delete from auth.users where raw_app_meta_data->>'seed_batch_id' = %(b)s"),
]
LEFTOVER = ["profiles", "posts", "replies", "job_collabs", "collab_interests", "mentorships", "follows"]


def dependents(cur, batch: str) -> dict[str, int]:
    out = {}
    for name, sql in DEPENDENT_REAL.items():
        cur.execute(sql, {"b": batch})
        out[name] = cur.fetchone()[0]
    return out


def wipe(conn, batch: str, include_dependent: bool, dry_run: bool) -> dict:
    cur = conn.cursor()
    deps = dependents(cur, batch)
    blocking = {k: v for k, v in deps.items() if v}
    if blocking and not include_dependent:
        raise SystemExit(
            "refusing: real members have content tied to this batch; deleting it would delete theirs too:\n  "
            + "\n  ".join(f"{k}: {v}" for k, v in blocking.items())
            + "\nRe-run with --include-dependent-real-rows only after a human decides."
        )
    deleted = {}
    for name, sql in STEPS:
        cur.execute(sql, {"b": batch})
        deleted[name] = cur.rowcount
    left = {}
    for t in LEFTOVER:
        cur.execute(f"select count(*) from {t} where seed_batch_id = %s", (batch,))
        left[t] = cur.fetchone()[0]
    cur.execute("select count(*) from auth.users where raw_app_meta_data->>'seed_batch_id' = %s", (batch,))
    left["auth.users"] = cur.fetchone()[0]
    if any(left.values()):
        raise RuntimeError(f"rows still tagged {batch} after wipe: {left}")
    if dry_run:
        conn.rollback()
    return {"dependents": deps, "deleted": deleted, "left": left}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-url", default=LOCAL_DB_URL)
    ap.add_argument("--batch", default=BATCH_ID)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--include-dependent-real-rows", action="store_true")
    args = ap.parse_args()
    assert_local_db(args.db_url)
    with psycopg.connect(args.db_url) as conn:
        try:
            res = wipe(conn, args.batch, args.include_dependent_real_rows, args.dry_run)
        except BaseException:
            conn.rollback()
            raise
        if not args.dry_run:
            conn.commit()
    res.update(batch=args.batch, dry_run=args.dry_run, ran_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    write_json("reports/wipe_run.json", res)
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
