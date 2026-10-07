# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Re-rank the Juniors' activity_level by what they actually post in the full thread set.

    uv run seed/scripts/relabel_activity.py [--threads content/threads.json] [--dry-run]

Why: activity_level was assigned before any content existed (plan §2:
40% lurker / 35% occasional / 20% regular / 5% heavy) and only drove who the
thread briefs cast. With all 213 threads written, some "occasional" Juniors
post more than some "regular" ones. This keeps the plan's distribution
exactly (49 / 42 / 24 / 6) and hands the labels out by post count (threads +
replies), so the levels describe the content: the 49 Juniors who post least
are the lurkers, the 6 who post most are the heavy ones. Ties keep the old
level order, then the handle, so it's deterministic.

activity_level is seed metadata only: it isn't a database column and nothing
renders it. Every change is printed (and appended to
reports/integration_edits.md by the caller).
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import JUNIOR_ACTIVITY_COUNTS, load_json, write_json  # noqa: E402

ORDER = ["lurker", "occasional", "regular", "heavy"]


def relabel(juniors: list[dict], threads: list[dict]) -> list[tuple[str, str, str, int]]:
    posts = Counter()
    for t in threads:
        posts[t["author"]] += 1
        for r in t.get("replies", []):
            posts[r["author"]] += 1
    ranked = sorted(juniors, key=lambda p: (posts[p["handle"]], ORDER.index(p["activity_level"]), p["handle"].lower()))
    levels = [lvl for lvl in ORDER for _ in range(JUNIOR_ACTIVITY_COUNTS[lvl])]
    assert len(levels) == len(ranked)
    changes = []
    for p, lvl in zip(ranked, levels):
        if p["activity_level"] != lvl:
            changes.append((p["handle"], p["activity_level"], lvl, posts[p["handle"]]))
            p["activity_level"] = lvl
    return changes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threads", default="content/threads.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    juniors = load_json("personas/juniors.json")
    changes = relabel(juniors, load_json(args.threads)["threads"])
    for h, a, b, n in changes:
        print(f"{h}: {a} -> {b} ({n} posts)")
    print(f"{len(changes)} Juniors relabeled; levels now {dict(Counter(p['activity_level'] for p in juniors))}")
    if not args.dry_run:
        write_json("personas/juniors.json", juniors)


if __name__ == "__main__":
    main()
