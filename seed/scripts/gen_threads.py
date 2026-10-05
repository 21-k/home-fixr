# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml>=6"]
# ///
"""
Thread/reply generator keyed to persona voices (plan §5).

    uv run seed/scripts/gen_threads.py sample            # validate + build threads.sample.json
    uv run seed/scripts/gen_threads.py briefs --n 190    # cast briefs for the full set (next pass)

`sample`  reads content/threads.sample.authored.yaml (20 threads written by
          hand for the tone review), validates it against the personas and
          the §5 style rules, adds helpful counts (log-normal; Senior answers
          higher) and writes content/threads.sample.json plus
          content/persona_memory.json (claims each persona has made).
`briefs`  plans the remaining threads: category by the §4 shares, a topic
          from themes.yaml, a starter (85% Juniors, weighted by activity) and
          3–8 repliers chosen by trade/region/activity, each with its voice
          block and claims. A writer (human or LLM) fills the briefs in; this
          pass deliberately stops at 20 threads.

Nothing here calls an LLM or fetches anything from the network.
"""
from __future__ import annotations

import argparse
import math
import random
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from common import BATCH_ID, RNG_SEED, SEED_DIR, load_json, write_json  # noqa: E402

BULLET_ALLOWED = {"MiddlesexHeatPumps"}  # "nobody writes in bullet points except one Senior"
POST_TYPES = {"question", "tip", "discussion"}
APP_TRADES = {"plumbing", "hvac", "electrical", "other"}


def personas() -> dict[str, dict]:
    return {p["handle"]: p for p in load_json("personas/seniors.json") + load_json("personas/juniors.json")}


def words(text: str) -> int:
    return len(re.findall(r"\b[\w'$/.-]+\b", text))


def has_bullets(text: str) -> bool:
    return bool(re.search(r"^\s*[-*•]\s+\S", text, flags=re.M))


def lognormal_int(rng: random.Random, mu: float, sigma: float, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(round(math.exp(rng.gauss(mu, sigma))))))


def validate(threads: list[dict], people: dict[str, dict]) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    seen_titles: set[str] = set()
    for t in threads:
        tid = t["id"]
        for k in ("id", "category", "type", "trade", "author", "title", "body"):
            if k not in t:
                errors.append(f"{tid}: missing {k}")
        if t["author"] not in people:
            errors.append(f"{tid}: unknown author {t['author']}")
        if t["type"] not in POST_TYPES:
            errors.append(f"{tid}: bad type {t['type']}")
        if t["trade"] not in APP_TRADES:
            errors.append(f"{tid}: bad trade {t['trade']}")
        stem = " ".join(re.sub(r"[^a-z ]", "", t["title"].lower()).split()[:4])
        if stem in seen_titles:
            errors.append(f"{tid}: title stem repeats '{stem}'")
        seen_titles.add(stem)
        n = words(t["body"])
        if not 40 <= n <= 250:
            warnings.append(f"{tid}: body {n} words (target 40-250)")
        texts = [(t["author"], t["body"], tid)] + [(r["author"], r["body"], f"{tid}/r{i}") for i, r in enumerate(t.get("replies", []))]
        for author, body, where in texts:
            if author not in people:
                errors.append(f"{where}: unknown author {author}")
                continue
            if has_bullets(body) and author not in BULLET_ALLOWED:
                errors.append(f"{where}: bullet points from {author} (only {BULLET_ALLOWED} may)")
            if re.search(r"home ?fixr", body, flags=re.I):
                errors.append(f"{where}: mentions Home Fixr (no one praises the site)")
        for i, r in enumerate(t.get("replies", [])):
            n = words(r["body"])
            if not 10 <= n <= 160:
                warnings.append(f"{tid}/r{i} ({r['author']}): reply {n} words (target 10-160)")
            if r.get("accepted"):
                p = people.get(r["author"], {})
                if not (p.get("role") == "senior" or (p.get("years_in") or 0) >= 2):
                    errors.append(f"{tid}/r{i}: accepted answer must be a Senior or experienced Junior")
        if sum(bool(r.get("accepted")) for r in t.get("replies", [])) > 1:
            errors.append(f"{tid}: more than one accepted reply")
    return errors, warnings


def build_sample(src: str, out: str) -> None:
    people = personas()
    data = yaml.safe_load((SEED_DIR / src).read_text())
    threads = data["threads"]
    errors, warnings = validate(threads, people)
    for w in warnings:
        print("warn:", w)
    if errors:
        print("\n".join("ERROR: " + e for e in errors))
        raise SystemExit(1)

    rng = random.Random(RNG_SEED + 11)
    memory: dict[str, dict] = {}
    for t in threads:
        starter = people[t["author"]]
        t["region"] = starter["public_region"]
        t["starter_role"] = starter["role"]
        n_rep = len(t.get("replies", []))
        # Thread "votes" -> helpful_count: log-normal 2-40, a little higher when Seniors start.
        t["helpful_count"] = lognormal_int(rng, 2.0 + (0.4 if starter["role"] == "senior" else 0) + 0.05 * n_rep, 0.6, 2, 40)
        for r in t.get("replies", []):
            role = people[r["author"]]["role"]
            mu = 1.5 if role == "senior" else 0.5
            if r.get("accepted"):
                mu += 1.0
            r["helpful_count"] = lognormal_int(rng, mu, 0.55, 0, 45)
            r["accepted"] = bool(r.get("accepted"))
        for author, where in [(t["author"], t["id"])] + [(r["author"], t["id"]) for r in t.get("replies", [])]:
            m = memory.setdefault(author, {"claims": people[author]["claims"], "appears_in": []})
            if where not in m["appears_in"]:
                m["appears_in"].append(where)

    write_json(out, {"batch_id": BATCH_ID, "source": src, "threads": threads})
    write_json("content/persona_memory.json", memory)
    reps = [len(t.get("replies", [])) for t in threads]
    print(f"threads: {len(threads)}  replies: {sum(reps)}  zero-reply: {sum(r == 0 for r in reps)}")
    print("categories:", dict(Counter(t["category"] for t in threads)))
    print("nyc:", sum(bool(t.get("nyc")) for t in threads), " senior starters:", sum(t["starter_role"] == "senior" for t in threads))
    print(f"wrote {SEED_DIR / out}")


def build_briefs(n: int, out: str) -> None:
    people = list(personas().values())
    themes = yaml.safe_load((SEED_DIR / "themes.yaml").read_text())
    rng = random.Random(RNG_SEED + 13)
    cats = themes["categories"]
    topics_by_cat: dict[str, list[dict]] = {}
    for tp in themes["topics"]:
        topics_by_cat.setdefault(tp["category"], []).append(tp)
    act_w = {"lurker": 0.15, "occasional": 1, "regular": 3, "heavy": 7}
    juniors = [p for p in people if p["role"] == "junior"]
    seniors = [p for p in people if p["role"] == "senior"]
    briefs = []
    for i in range(n):
        cat = rng.choices(list(cats), weights=[c["share"] for c in cats.values()])[0]
        nyc = rng.random() < themes["nyc_share"]
        pool = [tp for tp in topics_by_cat[cat] if bool(tp.get("nyc")) == nyc] or topics_by_cat[cat]
        topic = rng.choice(pool)
        starter_pool = seniors if rng.random() < themes["starter_mix"]["senior"] else juniors
        if nyc:
            starter_pool = [p for p in starter_pool if p["region"] == "NYC"] or starter_pool
        starter = rng.choices(starter_pool, weights=[act_w[p["activity_level"]] for p in starter_pool])[0]
        r = rng.random()
        depth = 0 if r < themes["reply_depth"]["zero"] else rng.choice(
            [rng.randint(2, 5)] * 6 + [rng.randint(6, 12)] * 3 + [rng.randint(13, 25)])
        answerers = [p for p in seniors if p["slot_id"] in topic.get("answered_by", [])]
        same = [p for p in people if p is not starter and (p["trade"] == starter["trade"] or p["region"] == starter["region"])]
        cast = []
        for _ in range(min(depth, 8)):
            src = answerers if answerers and rng.random() < 0.45 else same
            cand = rng.choices(src, weights=[act_w[p["activity_level"]] for p in src])[0]
            if cand not in cast:
                cast.append(cand)
        briefs.append({
            "brief_id": f"B{i + 1:03d}",
            "category": cat,
            "topic": topic["id"],
            "framing": topic["framing"],
            "pushback": topic.get("pushback", []),
            "fact_risk": topic.get("fact_risk", []),
            "nyc": nyc,
            "reply_count": depth,
            "starter": {k: starter[k] for k in ("handle", "role", "trade", "region", "town_hint", "years_in", "path", "voice", "situation", "claims")},
            "cast": [{k: p[k] for k in ("handle", "role", "trade", "region", "voice", "claims")} for p in cast],
        })
    write_json(out, {"batch_id": BATCH_ID, "n": n, "briefs": briefs})
    print(f"wrote {len(briefs)} briefs -> {SEED_DIR / out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample")
    s.add_argument("--src", default="content/threads.sample.authored.yaml")
    s.add_argument("--out", default="content/threads.sample.json")
    b = sub.add_parser("briefs")
    b.add_argument("--n", type=int, default=190)
    b.add_argument("--out", default="content/thread_briefs.json")
    args = ap.parse_args()
    if args.cmd == "sample":
        build_sample(args.src, args.out)
    else:
        build_briefs(args.n, args.out)


if __name__ == "__main__":
    main()
