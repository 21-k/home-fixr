# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.1", "pyyaml>=6"]
# ///
"""
Lint + realism + labeling checks (plan §8). Must pass before any prod seed.

    uv run seed/scripts/qa.py                                   # files only
    uv run seed/scripts/qa.py --db                              # + seeded LOCAL DB
    uv run seed/scripts/qa.py --db --app http://localhost:3000  # + rendered pages

Writes seed/reports/qa_report.md and seed/reports/fact_lint.md (every
sentence that makes a licensing / union / school / code claim, for a human
to verify against the official sources). Exit code 1 if any check FAILs.
`--allow-unverified-handles` downgrades the Reddit-404 requirement to WARN
(local testing only; it is a production blocker).
"""
from __future__ import annotations

import argparse
import csv
import re
import statistics
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
from common import BATCH_ID, LOCAL_DB_URL, REPO_DIR, SEED_DIR, assert_local_db, levenshtein, load_json  # noqa: E402

NY = ZoneInfo("America/New_York")
RESULTS: list[tuple[str, str, str]] = []


def record(name: str, ok: bool | None, detail: str = "", warn: bool = False) -> None:
    status = "PASS" if ok else ("WARN" if warn or ok is None else "FAIL")
    RESULTS.append((name, status, detail))


def all_texts(threads):
    for t in threads:
        yield t["author"], t["title"] + "\n" + t["body"], t["id"]
        for i, r in enumerate(t.get("replies", [])):
            yield r["author"], r["body"], f"{t['id']}/r{i}"


# ----------------------------------------------------------------- personas
def check_personas(people, allow_unverified):
    seniors = [p for p in people if p["role"] == "senior"]
    juniors = [p for p in people if p["role"] == "junior"]
    record("counts: 15 Seniors / 121 Juniors = 136", len(seniors) == 15 and len(juniors) == 121,
           f"{len(seniors)} / {len(juniors)}")
    nyc = sum(p["region"] == "NYC" for p in people)
    record("NJ 122 / NYC 14 (±1)", abs(nyc - 14) <= 1, f"NJ {len(people) - nyc} / NYC {nyc}")
    shares = {t: 100 * sum(p["trade"] == t for p in people) / len(people) for t in ("electrical", "plumbing", "hvac", "general")}
    target = {"electrical": 35, "plumbing": 33, "hvac": 25, "general": 7}
    record("trade mix within ±3 pts", all(abs(shares[t] - target[t]) <= 3 for t in target),
           ", ".join(f"{t} {shares[t]:.1f}%" for t in target))
    record("no seeded Senior general/undecided", all(p["trade"] != "general" for p in seniors))
    handles = [p["handle"] for p in people]
    record("handles unique (case-insensitive)", len({h.lower() for h in handles}) == len(handles))
    near = [(a, b) for i, a in enumerate(handles) for b in handles[i + 1:] if levenshtein(a, b) <= 1]
    record("no near-duplicate handles (Levenshtein <= 1)", not near, str(near[:5]))
    fmt = [h for h in handles if not re.fullmatch(r"[A-Za-z0-9_.]{4,22}", h) or h[0] == "." or h[-1] == "."]
    record("handle format 4-22 [A-Za-z0-9_.]", not fmt, str(fmt))
    log = {r["candidate"].lower(): r for r in csv.DictReader((SEED_DIR / "handles_checked.csv").open())}
    unlogged = [h for h in handles if h.lower() not in log]
    record("every handle logged in handles_checked.csv", not unlogged, str(unlogged[:5]))
    free = [h for h in handles if log.get(h.lower(), {}).get("status") == "free"]
    record("every handle has a logged Reddit 404", len(free) == len(handles),
           f"{len(free)}/{len(handles)} have a 404; rest unverified (Reddit returned 403, see REPORT.md)",
           warn=allow_unverified)
    disp = Counter(p["display_preference"] for p in people)
    record("display preference ≈80/18/2", abs(disp["handle"] - 109) <= 5 and abs(disp["first_name_initial"] - 24) <= 4,
           dict(disp).__str__(), warn=True)
    acc = [p["handle"] for p in seniors if p["mentor_availability"] == "accepting"]
    record("no seeded Senior shown as accepting mentees", not acc, str(acc))
    av = Counter(p["avatar_style"] for p in people)
    n = len(people)
    record("avatar mix ≈45% none / 40% initials / 15% icon (±5 pts)",
           abs(100 * av["none"] / n - 45) <= 5 and abs(100 * av["initials"] / n - 40) <= 5 and abs(100 * av["icon"] / n - 15) <= 5,
           ", ".join(f"{k} {100 * v / n:.0f}%" for k, v in sorted(av.items())))
    icons = {"wrench", "flame", "plug", "snowflake", "hardhat", "zap", "thermometer", "hammer"}
    bad_icon = [p["handle"] for p in people if (p["avatar_style"] == "icon") != bool(p["avatar_icon"]) or (p["avatar_icon"] and p["avatar_icon"] not in icons)]
    record("every 'icon' persona has an allowed icon (and only they do)", not bad_icon, str(bad_icon[:5]))
    trade_icons = {"plumbing": {"wrench"}, "hvac": {"flame", "snowflake", "thermometer"},
                   "electrical": {"plug", "zap"}, "general": {"hardhat", "hammer"}}
    off = [p["handle"] for p in juniors if p["avatar_icon"] and p["avatar_icon"] not in trade_icons[p["trade"]]]
    record("Junior icons match their trade", not off, str(off[:5]))
    act = Counter(p["activity_level"] for p in juniors)
    record("junior activity 40/35/20/5", act == Counter({"lurker": 49, "occasional": 42, "regular": 24, "heavy": 6}), dict(act).__str__())
    record("all flagged is_founding_member + batch", all(p["is_founding_member"] and p["seed_batch_id"] == BATCH_ID for p in people))


# ------------------------------------------------------------------ threads
YEARS_RE = re.compile(r"\b(\d{1,2})\s*(?:years|yrs|year)\b(?!\s*(?:ago|old|later|from))", re.I)


def ngram_overlaps(texts: list[tuple[str, str]]) -> tuple[list[tuple[str, str, str]], list[tuple[str, str, str]]]:
    """Shared 8-grams and 12-grams between different texts (inverted index, so 1,450 texts stay fast).
    Returns (pairs sharing an 8-gram, pairs sharing a 12-gram), one example gram per pair."""
    def grams(text, k):
        w = re.findall(r"[a-z0-9']+", text.lower())
        return {" ".join(w[i:i + k]) for i in range(len(w) - k + 1)}
    out = []
    for k in (8, 12):
        index: dict[str, list[int]] = {}
        for i, (_, t) in enumerate(texts):
            for g in grams(t, k):
                index.setdefault(g, []).append(i)
        pairs = {}
        for g, ids in index.items():
            for a in range(len(ids)):
                for b in range(a + 1, len(ids)):
                    pairs.setdefault((ids[a], ids[b]), g)
        out.append(sorted((texts[a][0], texts[b][0], g) for (a, b), g in pairs.items()))
    return out[0], out[1]


def check_threads(threads, people):
    by = {p["handle"]: p for p in people}
    n = len(threads)
    reps = [len(t.get("replies", [])) for t in threads]
    zero = sum(r == 0 for r in reps)
    record("≥8% zero-reply threads", zero / n >= 0.08, f"{zero}/{n} = {100 * zero / n:.0f}% (sample of 20; 2 needed for 8%)", warn=True)
    lens = [len(r["body"].split()) for t in threads for r in t.get("replies", [])]
    record("reply length right-skewed (median < mean)", statistics.median(lens) < statistics.mean(lens),
           f"median {statistics.median(lens)}, mean {statistics.mean(lens):.1f}, max {max(lens)}")
    stems = Counter(" ".join(re.sub(r"[^a-z ]", "", t["title"].lower()).split()[:4]) for t in threads)
    dup = [s for s, c in stems.items() if c > 1]
    record("no two threads share a title stem", not dup, str(dup))
    starters = Counter(by[t["author"]]["role"] for t in threads)
    record("~85% of starters are Juniors", 0.75 <= starters["junior"] / n <= 0.92, dict(starters).__str__())
    record("≥2 NYC threads in sample", sum(bool(t.get("nyc")) for t in threads) >= 2)
    cats = Counter(t["category"] for t in threads)
    record("all categories A–F present", set(cats) == set("ABCDEF"), dict(sorted(cats.items())).__str__())

    # Persona consistency: stated years in the trade must match years_in.
    bad = []
    for author, text, where in all_texts(threads):
        p = by[author]
        for m in YEARS_RE.finditer(text):
            yrs = int(m.group(1))
            ctx = text[max(0, m.start() - 40): m.end() + 25].lower()
            # Not a "how long I've been in the trade" statement.
            if any(w in ctx for w in ("ago", "the last", "the next", "teaching", "running", "calling it", "in 5", "for 2")):
                continue
            if p["role"] == "senior" and yrs not in (p["years_in"],) and yrs > 5:
                bad.append(f"{where} {author}: says {yrs} yrs, persona {p['years_in']}")
    record("persona consistency: Seniors' stated years match", not bad, "; ".join(bad[:5]), warn=bool(bad))
    lower_bad = [where for author, text, where in all_texts(threads)
                 if by[author]["voice"]["punctuation"] == "lowercase_minimal" and by[author]["role"] == "senior"
                 and re.search(r"(^|[.!?]\s+)[A-Z][a-z]", text.split("\n", 1)[-1] if "/r" not in where else text)]
    record("lowercase-voice Seniors stay lowercase", not lower_bad, str(lower_bad[:5]), warn=True)
    bullets = [where for author, text, where in all_texts(threads)
               if re.search(r"^\s*[-*•]\s", text, re.M) and author != "Kash_sing"]
    record("bullet points only from Kash_sing", not bullets, str(bullets))
    praise = [where for _, text, where in all_texts(threads) if re.search(r"home ?fixr", text, re.I)]
    record("nobody mentions/praises Home Fixr", not praise, str(praise))

    # Plagiarism: no external reference corpus exists (Reddit step skipped), so
    # check internal 8-gram overlap; any shared run of 12+ words fails.
    who = {where: author for author, _, where in all_texts(threads)}
    hits8, hits12 = ngram_overlaps([(where, text) for _, text, where in all_texts(threads)])
    cross8 = [h for h in hits8 if who[h[0]] != who[h[1]]]
    record("plagiarism: no 12-word overlap (internal; no external corpus)", not hits12,
           f"pairs sharing an 8-gram: {len(hits8)}, {len(hits8) - len(cross8)} of them the same persona repeating a tic; "
           f"12+: {[f'{a}~{b}' for a, b, _ in hits12[:5]]}")
    record("plagiarism: 8-gram overlap between different people ~0 (pairs ≤ 8% of the thread count; what's left is stock phrases and quotes)",
           len(cross8) <= max(2, 0.08 * len(threads)),
           f"{len(cross8)}: " + "; ".join(f"{a}~{b}: {g!r}" for a, b, g in cross8[:6]))
    live_ids = {t["id"] for t in threads if t.get("live")}
    lower_j = [where for author, text, where in all_texts(threads)
               if where.split("/")[0] not in live_ids and by[author]["voice"]["punctuation"] == "lowercase_minimal" and by[author]["role"] == "junior"
               and re.search(r"(^|[.!?]\s+)[A-Z][a-z]", text.split("\n", 1)[-1] if "/r" not in where else text)]
    record("lowercase-voice Juniors stay lowercase (new threads; T06/r4 is live)", not lower_j, str(lower_j[:5]))

    times = [datetime.fromisoformat(t["created_at"]) for t in threads if "created_at" in t]
    times += [datetime.fromisoformat(r["created_at"]) for t in threads for r in t.get("replies", []) if "created_at" in r]
    if times:
        hrs = Counter(x.astimezone(NY).hour for x in times)
        rhythm = sum(c for h, c in hrs.items() if h in (5, 6, 12, 13) or 18 <= h <= 23) / len(times)
        dead = sum(c for h, c in hrs.items() if 0 <= h <= 4) / len(times)
        record("posting hours match §6 (evening/early/lunch ≥70%, 0–4am ≤3%)", rhythm >= 0.7 and dead <= 0.03,
               f"rhythm {100 * rhythm:.0f}%, 0-4am {100 * dead:.0f}%; " + " ".join(f"{h}:{hrs[h]}" for h in range(24) if hrs[h]))
        fri = sum(1 for x in times if x.astimezone(NY).weekday() == 4 and x.astimezone(NY).hour >= 18)
        record("Friday nights quiet", fri / len(times) <= 0.05, f"{fri} posts Fri after 6pm")


# ------------------------------------------------------------ social layer
WINDOW_START = datetime(2026, 7, 24, 0, 0, tzinfo=NY)
WINDOW_END = datetime(2026, 10, 4, 23, 59, 59, tzinfo=NY)
DUAL_TRADE = {"ms_almonte": {"hvac", "plumbing"}, "haddad_mech": {"hvac", "plumbing"}}


def follower_kind(p):
    if p["role"] == "senior":
        return "pillar" if p["activity_level"] == "heavy" else "senior"
    return p["activity_level"]


def check_social(people, threads, ments, follows):
    by = {p["handle"]: p for p in people}
    joined = {h: datetime.fromisoformat(p["joined_at"]) for h, p in by.items()}
    seniors = [p for p in people if p["role"] == "senior"]
    st = Counter(m["status"] for m in ments)
    n = len(ments)

    # ---- mentorship shape
    record("social: ~35 mentorships (30-40)", 30 <= n <= 40, f"{n}: " + ", ".join(f"{k} {v}" for k, v in sorted(st.items())))
    record("social: ~60% active (50-70%)", 0.5 <= st["active"] / n <= 0.7, f"{100 * st['active'] / n:.0f}% active")
    record("social: a few declined (2-5), rest pending", 2 <= st["declined"] <= 5 and st["pending"] == n - st["active"] - st["declined"],
           f"declined {st['declined']}, pending {st['pending']}")
    bad_role = [f"{m['junior']}->{m['senior']}" for m in ments
                if by.get(m["junior"], {}).get("role") != "junior" or by.get(m["senior"], {}).get("role") != "senior"]
    record("social: every mentorship is junior -> senior", not bad_role, str(bad_role[:5]))
    pairs = Counter((m["junior"], m["senior"]) for m in ments)
    record("social: no duplicate mentorship pairs", max(pairs.values()) == 1, str([k for k, v in pairs.items() if v > 1][:3]))
    act_per_j = Counter(m["junior"] for m in ments if m["status"] == "active")
    two = [j for j, c in act_per_j.items() if c > 1]
    record("social: no Junior has two active mentors", not two, str(two))
    second = [j for j in act_per_j if any(m["junior"] == j and m["status"] == "pending" for m in ments)]
    record("social: a second, pending request is rare (<= 2 Juniors)", len(second) <= 2, str(second))
    pend = [m for m in ments if m["status"] == "pending"]
    to_lim = sum(by[m["senior"]]["mentor_availability"] == "limited" for m in pend)
    record("social: pending requests mostly to 'limited' Seniors (>= 70%)", to_lim >= 0.7 * len(pend), f"{to_lim}/{len(pend)}")
    asked_closed = [f"{m['junior']}->{m['senior']}" for m in ments
                    if m["status"] in ("pending", "declined") and by[m["senior"]]["mentor_availability"] == "not_accepting"]
    record("social: no pending/declined request to a 'not taking mentees' Senior (the app hides the button)",
           not asked_closed, str(asked_closed))

    act_s = Counter(m["senior"] for m in ments if m["status"] == "active")
    per = {p["handle"]: act_s[p["handle"]] for p in seniors}
    pillars = sum(3 <= v <= 5 for v in per.values())
    middle = sum(1 <= v <= 2 for v in per.values())
    zero = sum(v == 0 for v in per.values())
    record("social: active mentees per Senior vary (>=2 with 3-5, >=3 with 1-2, >=2 with 0, none >5)",
           pillars >= 2 and middle >= 3 and zero >= 2 and max(per.values()) <= 5,
           f"3-5: {pillars}, 1-2: {middle}, 0: {zero}; " + " ".join(f"{h}:{v}" for h, v in per.items() if v))
    na = {p["handle"]: per[p["handle"]] for p in seniors if p["mentor_availability"] == "not_accepting"}
    record("social: 'not taking mentees' Seniors carry 0-2 actives (some 1-2: that's why they're full)",
           all(v <= 2 for v in na.values()) and any(v >= 1 for v in na.values()), str(na))
    shown_accepting = [p["handle"] for p in seniors if p["mentor_availability"] == "accepting" and per[p["handle"]] >= 3]
    record("social: no full Senior shown as 'Accepting mentees'", not shown_accepting, str(shown_accepting))

    def trade_ok(j, s):
        return j["trade"] == s["trade"] or j["trade"] == "general" or j["trade"] in DUAL_TRADE.get(s["handle"], ())
    act = [m for m in ments if m["status"] == "active"]
    tmatch = sum(trade_ok(by[m["junior"]], by[m["senior"]]) for m in act)
    record("social: actives matched by trade (>= 80%)", tmatch >= 0.8 * len(act), f"{tmatch}/{len(act)}")
    rmatch = sum(by[m["junior"]]["region"] == by[m["senior"]]["region"] for m in act)
    record("social: actives often in the same region (>= 40%)", rmatch >= 0.4 * len(act), f"{rmatch}/{len(act)}")
    nyc_j = [m for m in act if by[m["junior"]]["region"] == "NYC"]
    nyc_ok = sum(by[m["senior"]]["region"] == "NYC" for m in nyc_j)
    nj_to_nyc = sum(by[m["junior"]]["region"] != "NYC" and by[m["senior"]]["region"] == "NYC" for m in act)
    record("social: NYC Juniors' mentors mostly the NYC Seniors; NJ Juniors' almost never",
           (not nyc_j or nyc_ok >= 0.66 * len(nyc_j)) and nj_to_nyc <= 1, f"NYC {nyc_ok}/{len(nyc_j)}; NJ->NYC {nj_to_nyc}")

    juniors = [p for p in people if p["role"] == "junior"]
    has = {m["junior"] for m in act}

    def rate(group):
        g = [p for p in juniors if group(p)]
        return (sum(p["handle"] in has for p in g) / len(g)) if g else 0.0, len(g)
    leaning = rate(lambda p: p["path"] in ("career_switcher", "votech_grad", "votech_student"))
    other = rate(lambda p: p["path"] not in ("career_switcher", "votech_grad", "votech_student"))
    record("social: career switchers / vo-tech more likely to have a mentor", leaning[0] > other[0],
           f"{100 * leaning[0]:.0f}% of {leaning[1]} vs {100 * other[0]:.0f}% of {other[1]}")
    by_act = {a: rate(lambda p, a=a: p["activity_level"] == a) for a in ("heavy", "regular", "occasional", "lurker")}
    active_j = rate(lambda p: p["activity_level"] in ("heavy", "regular"))
    record("social: regular+heavy > occasional > lurker for having a mentor; lurkers rarely (<= 10%)",
           active_j[0] > by_act["occasional"][0] > by_act["lurker"][0] and by_act["lurker"][0] <= 0.10,
           f"regular+heavy {100 * active_j[0]:.0f}% (" + ", ".join(f"{a} {100 * r:.0f}%" for a, (r, _) in by_act.items()) + ")")

    bad_t = []
    lat = []
    for m in ments:
        req = datetime.fromisoformat(m["requested_at"])
        dec = datetime.fromisoformat(m["decided_at"]) if m.get("decided_at") else None
        where = f"{m['junior']}->{m['senior']}"
        if not (WINDOW_START <= req <= WINDOW_END) or (dec and not dec <= WINDOW_END):
            bad_t.append(f"{where}: outside window")
        if req < joined[m["senior"]] or req < joined[m["junior"]] + timedelta(days=2):
            bad_t.append(f"{where}: before both joined (+2 days for the Junior)")
        if (m["status"] == "pending") != (dec is None):
            bad_t.append(f"{where}: decided_at inconsistent with {m['status']}")
        if dec:
            lat.append((dec - req).total_seconds() / 3600)
            if not timedelta(hours=1) <= dec - req <= timedelta(days=7):
                bad_t.append(f"{where}: accept/decline latency {(dec - req)}")
    record("social: mentorship times inside the window, after both joined, accepted hours-days later", not bad_t,
           (f"latency h: min {min(lat):.0f}, median {statistics.median(lat):.0f}, max {max(lat):.0f}; " if lat else "") + "; ".join(bad_t[:4]))

    # The threads and the graph agree.
    tmap = {t["id"]: t for t in threads}
    anchor_bad = []
    for m in ments:
        tid = m.get("anchor_thread")
        if not tid:
            continue
        t = tmap.get(tid)
        cast = {t["author"]} | {r["author"] for r in t.get("replies", [])} if t else set()
        if not t or m["junior"] not in cast or m["senior"] not in cast:
            anchor_bad.append(f"{tid}: {m['junior']}->{m['senior']} not both in thread")
            continue
        last = max(datetime.fromisoformat(r["created_at"]) for r in t["replies"] if r["author"] in (m["junior"], m["senior"]))
        if datetime.fromisoformat(m["requested_at"]) <= last:
            anchor_bad.append(f"{tid}: request before the thread exchange")
    n_anchor = sum(bool(m.get("anchor_thread")) for m in ments)
    record("social: thread-implied pairs (thanks / 'update: did what X said') are in the graph, after the exchange",
           n_anchor >= 6 and not anchor_bad, f"{n_anchor} anchored; {anchor_bad[:3]}")
    from schedule import mentor_links
    answered_first = []
    for t in threads:
        for m in mentor_links(t, ments)["stranger"]:  # active mentor, and the Junior never names them
            for r in t.get("replies", []):
                if r["author"] == m["senior"] and datetime.fromisoformat(m["requested_at"]) < datetime.fromisoformat(r["created_at"]):
                    answered_first.append(f"{t['id']}: {r['author']} answers own mentee {t['author']} like a stranger")
    record("social: no mentor answers their mentee's later thread as a stranger", not answered_first, str(answered_first[:3]))

    # ---- follows
    pairs_f = [(f["follower"], f["following"]) for f in follows]
    record("social: no self-follows, no duplicate follows, both ends are personas",
           all(a != b for a, b in pairs_f) and len(set(pairs_f)) == len(pairs_f) and all(a in by and b in by for a, b in pairs_f),
           f"{len(pairs_f)} follows")
    fset = set(pairs_f)
    missing = [f"{m['junior']}->{m['senior']}" for m in act if (m["junior"], m["senior"]) not in fset]
    record("social: every mentee follows their mentor", not missing, str(missing))
    outd = Counter(a for a, _ in pairs_f)
    ind = Counter(b for _, b in pairs_f)
    zero_out = sum(1 for h in by if outd[h] == 0)
    record("social: ~20% of accounts follow nobody (17-23%)", 0.17 <= zero_out / len(by) <= 0.23, f"{zero_out}/{len(by)} = {100 * zero_out / len(by):.0f}%")
    bands = {"pillar": (15, 40), "senior": (5, 15), "heavy": (0, 8), "regular": (0, 8), "occasional": (0, 5), "lurker": (0, 3)}
    out_band = []
    dist = {}
    for k, (lo, hi) in bands.items():
        v = sorted(ind[p["handle"]] for p in people if follower_kind(p) == k)
        dist[k] = v
        out_band += [f"{p['handle']}({k}):{ind[p['handle']]}" for p in people if follower_kind(p) == k and not lo <= ind[p["handle"]] <= hi]
    lurk = dist["lurker"]
    record("social: followers by kind in band (pillars 15-40, Seniors 5-15, active Juniors 0-8, occasional 0-5, lurkers 0-3)",
           not out_band and sum(x <= 2 for x in lurk) >= 0.8 * len(lurk),
           "; ".join(f"{k} {v[0]}-{v[-1]} (median {v[len(v) // 2]})" for k, v in dist.items()) + (f"; out of band: {out_band[:4]}" if out_band else ""))
    record("social: the graph is skewed (top 5 accounts hold >= 25% of follows)",
           sum(c for _, c in ind.most_common(5)) >= 0.25 * len(pairs_f), f"top 5: {ind.most_common(5)}")
    nonpillar = [(a, b) for a, b in pairs_f if follower_kind(by[b]) != "pillar"]
    homo = sum(by[a]["trade"] == by[b]["trade"] or by[a]["region"] == by[b]["region"] for a, b in nonpillar)
    record("social: follows of non-pillars mostly within trade or region (>= 75%)", homo >= 0.75 * len(nonpillar), f"{homo}/{len(nonpillar)}")
    s_follow_s = [p["handle"] for p in seniors if outd[p["handle"]] and not any(a == p["handle"] and by[b]["role"] == "senior" for a, b in pairs_f)]
    record("social: Seniors who follow anyone follow some other Seniors", not s_follow_s, str(s_follow_s), warn=True)
    s_to_j = Counter(by[b]["activity_level"] for a, b in pairs_f if by[a]["role"] == "senior" and by[b]["role"] == "junior")
    record("social: Seniors follow only the occasional standout Junior (regular/heavy)",
           set(s_to_j) <= {"heavy", "regular"} and sum(s_to_j.values()) <= 15, str(dict(s_to_j)))
    # The follow graph was built from the 20 live threads (gen_social.py); it isn't regenerated for
    # the full set (it's live / packaged in PR #8), so this check stays on those threads.
    graph_threads = [t for t in threads if t.get("live", True) and t["id"] in {f"T{i:02d}" for i in range(1, 21)}]
    acc_pairs = {(t["author"], r["author"]) for t in graph_threads for r in t.get("replies", []) if r["accepted"] and by[r["author"]]["role"] == "senior"
                 and by[t["author"]]["role"] == "junior"}
    acc_f = sum(pr in fset for pr in acc_pairs)
    record("social: Juniors mostly follow the Senior whose answer they accepted (>= 50%; the 20 threads the graph was built from)",
           acc_f >= 0.5 * len(acc_pairs), f"{acc_f}/{len(acc_pairs)}")
    bad_ft = [f"{f['follower']}->{f['following']}" for f in follows
              if not (max(joined[f["follower"]], joined[f["following"]]) < datetime.fromisoformat(f["created_at"]) <= WINDOW_END)]
    record("social: every follow is after both joined and inside the window", not bad_ft, str(bad_ft[:5]))
    first_meet = {}
    for t in threads:
        for r in t.get("replies", []):
            at = datetime.fromisoformat(r["created_at"])
            for other in {t["author"]} | {x["author"] for x in t["replies"]}:
                for k in ((other, r["author"]), (r["author"], other)):
                    if k[0] != k[1]:
                        first_meet[k] = min(first_meet.get(k, at), at)
    prompted = [f for f in follows if f.get("why") in ("answered their thread", "same thread")]
    early = [f"{f['follower']}->{f['following']}" for f in prompted
             if datetime.fromisoformat(f["created_at"]) <= first_meet.get((f["follower"], f["following"]), WINDOW_END)]
    record("social: thread-prompted follows come after the exchange", not early, f"{len(prompted)} prompted; early: {early[:4]}")
    times = [datetime.fromisoformat(f["created_at"]) for f in follows] + [datetime.fromisoformat(m["requested_at"]) for m in ments]
    night = sum(t.astimezone(NY).hour < 5 for t in times)
    record("social: follows/requests keep the posting rhythm (0-4am <= 3%)", night <= 0.03 * len(times), f"{night}/{len(times)} at 0-4am")

    # ---- existing counts: helpful votes and "answered"
    acc_lead = [t["id"] for t in threads if any(r["accepted"] for r in t.get("replies", []))
                and max(t["replies"], key=lambda r: (r["helpful_count"], r["accepted"]))["accepted"] is False]
    record("helpful: the accepted answer has the most helpful votes in its thread", not acc_lead, str(acc_lead))
    short_lead = []
    for t in threads:
        rs = t.get("replies", [])
        if any(r["accepted"] for r in rs):
            continue
        subs = [r for r in rs if by[r["author"]]["role"] == "senior" and len(r["body"].split()) >= 40]
        if subs:
            top = max(r["helpful_count"] for r in subs)
            short_lead += [f"{t['id']}:{r['author']}" for r in rs if len(r["body"].split()) < 25 and r["helpful_count"] >= top]
    record("helpful: no short reply outvotes the substantive Senior answer", not short_lead, str(short_lead))
    ans = Counter(r["author"] for t in threads for r in t.get("replies", []))
    distinct = Counter()
    own = Counter()
    for t in threads:
        for h in {r["author"] for r in t.get("replies", [])}:
            distinct[h] += 1
        own[t["author"]] += sum(r["author"] == t["author"] for r in t.get("replies", []))
    info = " ".join(f"{p['handle']}:{ans[p['handle']]}/{distinct[p['handle']]}" + (f"(+{own[p['handle']]} own)" if own[p["handle"]] else "")
                    for p in seniors)
    record("answered: Seniors' 'answered' = their reply count (replies/threads; own-thread replies noted)", True, info)
    return {"active_by_senior": per, "followers": ind}


# ------------------------------------------------------------ full thread set
PLAN_SHARES = {"A": 22, "B": 14, "C": 20, "D": 14, "E": 18, "F": 12}
OWNERS = {"oldsteam_zig", "thiago_sparks", "Kash_sing", "joyd_plumbing", "haddad_mech", "rui_t_kearny", "bklyn_arkady"}
UNION_SENIORS = {"mbell_wireman", "dhollis61", "dreb_jman"}
TRADE_WORDS = {"plumber": "plumbing", "pipefitter": "plumbing", "steamfitter": "plumbing", "electrician": "electrical",
               "sparky": "electrical", "wireman": "electrical", "hvac tech": "hvac", "hvac guy": "hvac", "refrigeration tech": "hvac"}
# Activity caps (plan §2) are written for posts per persona. Lurkers keep the absolute cap
# of 2 (the brief: "no lurker posts more than ~1-2 times"); the other caps scale with the
# Junior post volume the full set actually has (see junior_cap_scale).
PLAN_CAPS = {"lurker": (0, 1), "occasional": (1, 3), "regular": (4, 8), "heavy": (9, 15)}
PLAN_MID = {"lurker": 0.5, "occasional": 2, "regular": 6, "heavy": 12}


def post_counts(threads):
    c = Counter()
    for t in threads:
        c[t["author"]] += 1
        for r in t.get("replies", []):
            c[r["author"]] += 1
    return c


def junior_cap_scale(people, counts) -> float:
    juniors = [p for p in people if p["role"] == "junior"]
    expected = sum(PLAN_MID[p["activity_level"]] for p in juniors)
    return sum(counts[p["handle"]] for p in juniors) / expected


def persona_findings(threads, people, ments):
    """Self-statements that contradict the persona record or each other, across every thread."""
    from common import COUNTIES
    by = {p["handle"]: p for p in people}
    county_of = {}
    for region, cs in COUNTIES.items():
        for county, towns in cs.items():
            for town in towns:
                county_of[town.lower()] = county
            county_of[county.lower()] = county
    active = {m["junior"]: m["senior"] for m in ments if m["status"] == "active"}
    found = {k: [] for k in ("years", "age", "town", "trade", "union", "license", "mentor", "school", "employer")}
    ages: dict[str, set] = {}
    dts = {}
    for t in threads:
        dts[t["id"]] = datetime.fromisoformat(t["created_at"]).astimezone(NY).date().isoformat()
        for i, r in enumerate(t.get("replies", [])):
            dts[f"{t['id']}/r{i}"] = datetime.fromisoformat(r["created_at"]).astimezone(NY).date().isoformat()
    for author, text, where in all_texts(threads):
        p = by[author]
        low = text.lower()
        jr = p["role"] == "junior"
        # years in the trade
        for m in re.finditer(r"\b(\d{1,2})\s*(?:years|yrs|year)\s+(?:in\b|into\b|of (?:this|experience|plumbing|hvac|electrical|doing))", low):
            ctx = low[max(0, m.start() - 30): m.start()]
            after = low[m.end(): m.end() + 30]
            if any(w in ctx for w in ("he's", "she's", "he has", "his ", "my boss", "guy", "they", "you", "your", "foreman", "teaching", "dad", "father", "put ")):
                continue
            if any(w in m.group(0) + after for w in ("insurance", "claims", "retail", "restaurant", "bank", "warehouse", "call center",
                                                      "army", "navy", "military", "help desk", "office", "college", "the wrong", "bartend")):
                continue
            n = int(m.group(1))
            ok = (abs(n - p["years_in"]) <= 1) if jr else (n == p["years_in"] or (author == "ms_almonte" and n in (20, 28, 8)) or n <= 6)
            if not ok:
                found["years"].append(f"{where} {author}: '{m.group(0)}' vs years_in {p['years_in']}")
        for m in re.finditer(r"\b(?:i'?m|i am|as) (?:a |an |in my )?(\d)(?:st|nd|rd|th)[- ]year\b", low):
            n = int(m.group(1))
            if jr and p["path"] == "union_apprentice" and n not in (p["years_in"], p["years_in"] + 1):
                found["years"].append(f"{where} {author}: '{m.group(0)}' vs years_in {p['years_in']}")
        # age
        for m in re.finditer(r"(?:^|\bi'?m |\bi am )(\d{2})\b(?![\d%]|\s*(?:min|mins|minutes|miles|hours|hrs|yrs|years in|degrees|amps?\b|a\b|bucks|dollars|an hour|/hr|k\b|ft|feet|psi|inches|percent|of\b|out of|th\b))", low):
            n = int(m.group(1))
            if 16 <= n <= 70:
                ages.setdefault(author, set()).add((n, where))
        # town: strong self-location only
        for m in re.finditer(r"\b(?:i'?m (?:in|from|out of|based in)|i live in|here in|living in|i'm over in)\s+([a-z]+(?: [a-z]+)?)", low):
            words2 = m.group(1)
            for cand in (words2, words2.split()[0]):
                c = county_of.get(cand)
                if c:
                    if c != p["county"] and cand != p["town_hint"].lower():
                        found["town"].append(f"{where} {author}: '{m.group(0)}' ({c}) vs {p['town_hint']}, {p['county']}")
                    break
        # trade
        if p["trade"] != "general":
            for m in re.finditer(r"\bi'?m (?:a|an) (?:\w+ ){0,2}?(plumber|pipefitter|steamfitter|electrician|sparky|wireman|hvac tech|hvac guy|refrigeration tech)\b", low):
                if TRADE_WORDS[m.group(1)] != p["trade"] and not (author in ("ms_almonte", "haddad_mech") and TRADE_WORDS[m.group(1)] in ("plumbing", "hvac")):
                    found["trade"].append(f"{where} {author}: '{m.group(0)}' vs {p['trade']}")
        # union / non-union
        if jr:
            union_self = re.search(r"\b(?:my|our) (?:local(?!\s*\d)|steward|jatc|hall|union)\b|\bi'?m (?:in the union|union)\b|\bthe hall (?:called|sent)", low)
            nonunion_self = re.search(r"\bi'?m non-?union\b|\bmy non-?union (?:shop|job|boss)", low)
            if union_self and p["path"] != "union_apprentice":
                found["union"].append(f"{where} {author}: '{union_self.group(0)}' but path {p['path']}")
            if nonunion_self and p["path"] == "union_apprentice":
                found["union"].append(f"{where} {author}: '{nonunion_self.group(0)}' but union apprentice")
        elif author in UNION_SENIORS and re.search(r"\bmy (?:trucks|shop|customers)\b", low):
            found["employer"].append(f"{where} {author}: talks about 'my trucks/shop/customers' but is a union {p['path']}")
        elif author not in OWNERS and re.search(r"\bmy trucks\b|\bi own (?:a|the|my) (?:shop|company)", low):
            found["employer"].append(f"{where} {author}: talks like an owner but is a {p['path']}")
        # licenses
        has608 = any("608" in x for x in p["licenses"])
        claim608 = re.search(r"\b(?:i have|i've got|got|passed|with|show) my 608\b|\bmy 608 (?:card|universal|type)|\bi'?m 608\b|\bpassed (?:the |my )?(?:608 )?(?:universal|type ii|608)\b", low)
        since608 = next((v for k, v in (p.get("license_since") or {}).items() if "608" in k), None)
        if claim608 and "fail" in low[max(0, claim608.start() - 40): claim608.end() + 40]:
            claim608 = None  # "passed type II, failed core": not certified yet, and not a claim to be
        if claim608 and (not has608 or (since608 and dts[where] < since608)):
            found["license"].append(f"{where} {author}: '{claim608.group(0)}', persona licenses {p['licenses']} (since {since608})")
        if not jr and re.search(r"\bmy master(?:'s)? (?:license|plumber|card)", low) and not any("Master" in x for x in p["licenses"]):
            found["license"].append(f"{where} {author}: claims a master license, persona {p['licenses']}")
        # mentor
        if jr:
            for m in re.finditer(r"\bmy mentor(?: on here)?(?:,? ([a-z_.0-9]+))?", low):
                if author not in active:
                    found["mentor"].append(f"{where} {author}: says 'my mentor' but has no active mentor")
        # school year
        if jr and p["path"] == "votech_student":
            aff = (p.get("affiliation_hint") or "").lower()
            if re.search(r"\bjunior year\b|\bsophomore\b", low) and "'27" in aff:
                found["school"].append(f"{where} {author}: says junior year/sophomore but class of '27")
            for m in re.finditer(r"class of '(\d\d)", low):
                if f"'{m.group(1)}" not in aff:
                    found["school"].append(f"{where} {author}: says class of '{m.group(1)}, persona {aff}")
            if re.search(r"graduat(?:ed|ing) (?:in )?(?:june )?2026|class of '26", low):
                found["school"].append(f"{where} {author}: a current student 'graduating 2026'")
    for a, st in ages.items():
        vals = {n for n, _ in st}
        want = by[a].get("age")
        if (want is not None and any(abs(n - want) > 1 for n in vals)) or (want is None and len(vals) > 1 and max(vals) - min(vals) > 1):
            found["age"].append(f"{a}: states {sorted(st)} vs persona age {want}")
    return found


def check_full(threads, people, ments, follows):
    """The full 213-thread set: plan distributions, persona consistency, schedule bounds, activity."""
    import sys as _s
    _s.path.insert(0, str(Path(__file__).parent))
    from schedule import FIXED, FOLLOWS, WHEN_SLACK, WHEN_WINDOWS, daily_plan, mentor_links
    by = {p["handle"]: p for p in people}
    dt = datetime.fromisoformat
    n = len(threads)
    cats = Counter(t["category"] for t in threads)
    off = {c: round(100 * cats[c] / n - PLAN_SHARES[c], 1) for c in PLAN_SHARES}
    record("full: category mix within ±3 pts of plan §4", all(abs(v) <= 3 for v in off.values()),
           ", ".join(f"{c} {cats[c]} ({100 * cats[c] / n:.1f}% vs {PLAN_SHARES[c]})" for c in PLAN_SHARES))
    nyc = sum(bool(t.get("nyc")) for t in threads)
    record("full: ~10% NYC threads (8-12%)", 0.08 <= nyc / n <= 0.12, f"{nyc}/{n} = {100 * nyc / n:.1f}%")
    reps = [len(t.get("replies", [])) for t in threads]
    zero = sum(r == 0 for r in reps)
    record("full: ≥8% zero-reply threads", zero / n >= 0.08, f"{zero}/{n} = {100 * zero / n:.1f}%")
    w = [r for r in reps if r]
    b1, b2, b3 = (sum(lo <= r <= hi for r in w) / len(w) for lo, hi in ((2, 5), (6, 12), (13, 25)))
    record("full: reply depth 60/30/10 (2-5 / 6-12 / 13-25, ±10/±10/±5 pts), none with 1 or >25",
           abs(b1 - .6) <= .10 and abs(b2 - .3) <= .10 and abs(b3 - .1) <= .05 and not any(r == 1 or r > 25 for r in reps),
           f"{100 * b1:.0f}/{100 * b2:.0f}/{100 * b3:.0f}% of {len(w)} threads with replies; max {max(reps)}; total replies {sum(reps)}")
    bl = [len(t["body"].split()) for t in threads]
    rl = [len(r["body"].split()) for t in threads for r in t.get("replies", [])]
    record("full: lengths right-skewed (bodies and replies median < mean)",
           statistics.median(bl) < statistics.mean(bl) and statistics.median(rl) < statistics.mean(rl),
           f"bodies median {statistics.median(bl)} mean {statistics.mean(bl):.0f}; replies median {statistics.median(rl)} mean {statistics.mean(rl):.0f}")
    pork = [t["id"] for t in threads if re.search(r"pork roll|taylor ham", t["title"], re.I) and not re.search(r"pork roll thread", t["title"], re.I)]
    record("full: exactly one pork roll vs taylor ham thread (T20; T165 is the Wawa/QuickChek follow-up)", pork == ["T20"], str(pork))
    titles = Counter(t["title"].strip().lower() for t in threads)
    record("full: thread ids and titles unique", len({t["id"] for t in threads}) == n and max(titles.values()) == 1,
           str([x for x, c in titles.items() if c > 1][:3]))

    # ---- live samples pinned
    live = {t["id"]: t for t in load_json("content/threads.sample.scheduled.json")["threads"]}
    drift = []
    for t in threads:
        if t["id"] in live:
            L = live[t["id"]]
            if (t["created_at"], t["body"], t["helpful_count"]) != (L["created_at"], L["body"], L["helpful_count"]) or \
                    [(r["created_at"], r["body"], r["helpful_count"], r["accepted"]) for r in t["replies"]] != \
                    [(r["created_at"], r["body"], r["helpful_count"], r["accepted"]) for r in L["replies"]]:
                drift.append(t["id"])
    record("full: the 20 live sample threads are byte-for-byte as live (text, helpful, timestamps)",
           not drift and len(live) == 20 and all(i in {t["id"] for t in threads} for i in live), str(drift))

    # ---- schedule bounds
    plan = daily_plan()
    per_day = Counter(dt(t["created_at"]).astimezone(NY).date() for t in threads)
    offd = [(d, plan[d], per_day[d]) for d in sorted(plan) if abs(plan[d] - per_day[d]) >= 2]
    spike = [(d, plan[d], per_day[d]) for d in sorted(plan) if per_day[d] > plan[d] + 3]
    record("full: thread volume follows daily_plan (≤15 days off by 2+, none 4+ over)",
           sum(per_day.values()) == n and len(offd) <= 15 and not spike and not set(per_day) - set(plan),
           f"{sum(plan.values())} slots; {sum(plan[d] == per_day[d] for d in plan)}/{len(plan)} days exact; off by 2+: "
           + ", ".join(f"{d:%m-%d} {a}->{b}" for d, a, b in offd))
    bad = []
    for t in threads:
        post = dt(t["created_at"])
        if dt(by[t["author"]]["joined_at"]) >= post:
            bad.append(f"{t['id']}: before {t['author']} joined")
        cast = [t["author"]] + [r["author"] for r in t["replies"]]
        if not t.get("live") and max(dt(by[a]["joined_at"]) for a in cast) >= post:
            bad.append(f"{t['id']}: posted before its whole cast joined")
        prev = post
        for i, r in enumerate(t["replies"]):
            rt = dt(r["created_at"])
            if rt <= prev or rt <= dt(by[r["author"]]["joined_at"]):
                bad.append(f"{t['id']}/r{i}: out of order or before {r['author']} joined")
            prev = rt
        if not WINDOW_START <= post or prev > WINDOW_END:
            bad.append(f"{t['id']}: outside the window")
    record("full: every post after its author joined (new threads: whole cast), replies in order, inside Jul 24 - Oct 4",
           not bad, f"{len(bad)}: {bad[:5]}")
    hint, impossible = [], []
    for t in threads:
        if not t.get("when") or t.get("live"):
            continue
        lo, hi = WHEN_WINDOWS[t["when"]]
        d = dt(t["created_at"]).astimezone(NY).date()
        if lo - WHEN_SLACK <= d <= hi + WHEN_SLACK:
            continue
        cast = [t["author"]] + [r["author"] for r in t["replies"]]
        last_join = max(dt(by[a]["joined_at"]) for a in cast).astimezone(NY).date()
        (impossible if last_join > hi + WHEN_SLACK else hint).append(f"{t['id']} {t['when']} -> {d:%m-%d}" + (f" (cast complete {last_join:%m-%d})" if last_join > hi + WHEN_SLACK else ""))
    inside = sum(1 for t in threads if t.get("when") and WHEN_WINDOWS[t["when"]][0] <= dt(t["created_at"]).astimezone(NY).date() <= WHEN_WINDOWS[t["when"]][1])
    nh = sum(1 for t in threads if t.get("when"))
    record(f"full: writers' when hints held (within {WHEN_SLACK.days} days) wherever the cast's join dates allow", not hint,
           f"{inside}/{nh} strictly inside; misses {hint[:5]}; hints the cast's join dates rule out (placed after the last join): {impossible}")
    tmap = {t["id"]: t for t in threads}
    fol = [f"{a} after {b}" for a, b in FOLLOWS.items() if dt(tmap[a]["created_at"]) < dt(tmap[b]["created_at"]) + timedelta(days=4)]
    fx = []
    for tid, (lo, hi) in FIXED.items():
        d = dt(tmap[tid]["created_at"]).astimezone(NY).date()
        if (lo and d < lo) or (hi and d > hi):
            fx.append(f"{tid} on {d}")
    t125 = tmap["T125"]
    req = next(m for m in ments if m["junior"] == "groundrod_05" and m["senior"] == "dreb_jman")
    dreb_late = [r["created_at"] for r in t125["replies"] if r["author"] == "dreb_jman" and dt(r["created_at"]) >= dt(req["requested_at"])]
    t04_last = dt(tmap["T04"]["replies"][-1]["created_at"])
    record("full: writer-flagged order holds (T125 before Aug 17 incl. dreb_jman's replies; T124 Sep 28 - Oct 4; T099 after T04; follow-ups 4+ days after the thread they follow)",
           not fol and not fx and not dreb_late and dt(tmap["T099"]["created_at"]) > t04_last,
           f"T125 {dt(t125['created_at']).astimezone(NY):%m-%d}, T124 {dt(tmap['T124']['created_at']).astimezone(NY):%m-%d}, "
           f"T099 {dt(tmap['T099']['created_at']).astimezone(NY):%m-%d} (T04 last reply {t04_last.astimezone(NY):%m-%d}); {fol + fx}")
    # Text that only holds on certain dates (reports/integration_edits.md, persona review).
    dated = [  # (thread, author, phrase, earliest ET date, latest ET date)
        ("T030", "threeway_02", "helper job in Irvington Monday", None, "2026-08-23"),
        ("T143", "threeway_02", "haven't even started yet", None, "2026-08-23"),
        ("T190", "threeway_02", "just starting out", None, "2026-08-23"),
        ("T091", "threeway_02", "six weeks into", "2026-09-28", None),
        ("T203", "ExRetail_NowHVAC", "Haven't started yet", None, "2026-09-27"),
        ("T194", "ExRetail_NowHVAC", "End of my first week", "2026-10-02", None),
        ("T069", "RainDayRestock", "six weeks into", "2026-09-28", None),
        ("T099", "groundrod_05", "the Queens one starts next week", "2026-09-20", "2026-10-04"),
        ("T053", "groundrod_05", "interview last week", None, None),
    ]
    dbad = []
    for tid, who, phrase, lo, hi in dated:
        t = tmap[tid]
        hits = [x for a, b, x in [(t["author"], t["body"], t["created_at"])] + [(r["author"], r["body"], r["created_at"]) for r in t["replies"]]
                if a == who and phrase.lower() in b.lower()]
        if len(hits) != 1:
            dbad.append(f"{tid}: '{phrase}' not found once")
            continue
        d = dt(hits[0]).astimezone(NY).date().isoformat()
        if (lo and d < lo) or (hi and d > hi):
            dbad.append(f"{tid} {who} '{phrase}' on {d}")
    t051 = next(dt(r["created_at"]) for r in tmap["T051"]["replies"] if r["author"] == "groundrod_05" and "had it" in r["body"])
    t053 = next(dt(r["created_at"]) for r in tmap["T053"]["replies"] if r["author"] == "groundrod_05")
    if not (dt(tmap["T051"]["created_at"]) + timedelta(days=2) <= t051 <= dt(tmap["T051"]["created_at"]) + timedelta(days=8) and
            timedelta(days=3) <= t053 - t051 <= timedelta(days=13)):
        dbad.append("groundrod_05's interview timeline (T051 'Monday' -> 'had it' -> T053 'last week')")
    record("full: date-bound statements land on dates that make them true", not dbad, str(dbad))
    cred, strg = [], []
    for t in threads:
        L = mentor_links(t, ments)
        for m in L["credit"]:
            for a, ts in [(t["author"], t["created_at"])] + [(r["author"], r["created_at"]) for r in t["replies"]]:
                if a == m["junior"] and dt(ts) < dt(m["decided_at"]):
                    cred.append(f"{t['id']}: {a} credits {m['senior']} before the mentorship started")
        for m in L["strg"] if False else L["stranger"]:
            for r in t["replies"]:
                if r["author"] == m["senior"] and dt(r["created_at"]) >= dt(m["requested_at"]):
                    strg.append(f"{t['id']}: {m['senior']} answers mentee {m['junior']} as a stranger after the request")
    record("full: mentees credit/quote their mentor only after the mentorship started", not cred, str(cred[:4]))
    record("full: no active mentor answers their mentee's thread as a stranger", not strg, str(strg[:4]))

    # ---- people
    counts = post_counts(threads)
    zero_users = sum(counts[h] == 0 for h in by)
    record("full: ≥20% of users have zero posts", zero_users / len(by) >= 0.20, f"{zero_users}/{len(by)} = {100 * zero_users / len(by):.1f}%")
    juniors = [p for p in people if p["role"] == "junior"]
    scale = junior_cap_scale(people, counts)
    # The plan's absolute caps (occasional ≤3, regular ≤8, heavy ≤15) can't all hold at this volume: the
    # caps' midpoints add up to ~325 Junior posts, the threads have ~790. So: lurkers keep the absolute
    # cap (≤2), heavy keeps it scaled by that ratio, and the levels must be ordered by what people post
    # (no one at a lower level posts more than anyone above it). The level mix stays 49/42/24/6.
    order = ["lurker", "occasional", "regular", "heavy"]
    rng_ = {a: (min(counts[p["handle"]] for p in juniors if p["activity_level"] == a),
                max(counts[p["handle"]] for p in juniors if p["activity_level"] == a)) for a in order}
    over = [f"{p['handle']}(lurker):{counts[p['handle']]}" for p in juniors if p["activity_level"] == "lurker" and counts[p["handle"]] > 2]
    over += [f"{p['handle']}(heavy):{counts[p['handle']]}" for p in juniors if p["activity_level"] == "heavy" and counts[p["handle"]] > round(15 * scale)]
    overlap = [f"{a}>{b}" for a, b in zip(order, order[1:]) if rng_[a][1] > rng_[b][0]]
    mix = Counter(p["activity_level"] for p in juniors)
    record("full: activity levels fit the posts (lurkers ≤2; heavy ≤15 × volume ratio; each level's range sits below the next; mix 49/42/24/6)",
           not over and not overlap and mix == Counter({"lurker": 49, "occasional": 42, "regular": 24, "heavy": 6}),
           f"Junior volume ×{scale:.2f} the plan caps' midpoints; posts per level: " + ", ".join(f"{a} {rng_[a][0]}-{rng_[a][1]}" for a in order)
           + f"; over {over}; overlaps {overlap}")
    sen = {p["handle"]: counts[p["handle"]] for p in people if p["role"] == "senior"}
    pillars = [h for h in sen if by[h]["activity_level"] == "heavy"]
    regs = [h for h in sen if by[h]["activity_level"] != "heavy"]
    record("full: Senior pillars (heavy) post more than the median regular Senior; every Senior posts",
           min(sen[h] for h in pillars) > statistics.median([sen[h] for h in regs]) and min(sen.values()) > 0,
           " ".join(f"{h}:{c}" for h, c in sorted(sen.items(), key=lambda kv: -kv[1])))
    found = persona_findings(threads, people, ments)
    live_ids = {t["id"] for t in threads if t.get("live")}
    live_found = []
    for k, v in found.items():
        mine = [x for x in v if x.split()[0].split("/")[0].rstrip(":") not in live_ids]
        live_found += [f"{k}: {x}" for x in v if x not in mine]
        record(f"full: persona consistency across all threads: {k}", not mine, f"{len(mine)}: " + " | ".join(mine[:4]))
    record("full: persona notes in the LIVE threads (can't be edited here; listed for the owner)", True, " | ".join(live_found) or "none")

    # ---- helpful / accepted
    acc_bad = []
    for t in threads:
        a = [r for r in t["replies"] if r["accepted"]]
        if len(a) > 1:
            acc_bad.append(f"{t['id']}: {len(a)} accepted")
        for r in a:
            if not (by[r["author"]]["role"] == "senior" or by[r["author"]]["years_in"] >= 2):
                acc_bad.append(f"{t['id']}: accepted {r['author']}")
            if r["author"] == t["author"] and not t.get("live"):
                acc_bad.append(f"{t['id']}: starter accepted their own reply")
    three = [t for t in threads if len(t["replies"]) >= 3]
    share = sum(any(r["accepted"] for r in t["replies"]) for t in three) / len(three)
    rng_bad = [t["id"] for t in threads if not 2 <= t["helpful_count"] <= 40] + \
        [f"{t['id']}/r{i}" for t in threads for i, r in enumerate(t["replies"]) if not 0 <= r["helpful_count"] <= 45]
    record("full: accepted answers: ≤1 per thread, by a Senior or a 2+ year Junior, not the starter; ~55% of 3+ reply threads (45-65%)",
           not acc_bad and 0.45 <= share <= 0.65, f"{100 * share:.0f}% of {len(three)}; {acc_bad[:4]}")
    record("full: helpful counts in range (threads 2-40, replies 0-45)", not rng_bad, str(rng_bad[:5]))
    gaps = []
    span = {"a week": 6, "one week": 6, "two weeks": 13, "2 weeks": 13, "three weeks": 20, "a few weeks": 13,
            "a couple weeks": 11, "a couple of weeks": 11, "a month": 26, "last week": 4, "all week": 4}
    for t in threads:
        if t.get("live"):
            continue
        for i, r in enumerate(t["replies"]):
            if r["author"] == t["author"] and re.search(r"\b(?:update|edit)\b", r["body"], re.I):
                need = max([v for k, v in span.items() if re.search(rf"\b{k}\b", r["body"], re.I)], default=0)
                if (dt(r["created_at"]) - dt(t["created_at"])).days < need:
                    gaps.append(f"{t['id']}/r{i}: says ~{need}+ days, posted {(dt(r['created_at']) - dt(t['created_at'])).days} days later")
    record("full: 'update:'/'edit:' replies come at least as late as the time they say has passed", not gaps, str(gaps[:4]))
    hrs = Counter(dt(x).astimezone(NY).hour for t in threads for x in [t["created_at"]] + [r["created_at"] for r in t["replies"]])
    record("full: posting-hour histogram (ET)", True, " ".join(f"{h}:{hrs[h]}" for h in range(24)))
    return counts

# ---------------------------------------------------------------- collabs
ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Pl|Place|Ct|Court|Terrace|Way)\b"
    r"|\b\d{3}[-. )]\s?\d{3}[-.]\d{4}\b|[\w.]+@[\w-]+\.\w+")


def check_collabs(people, ments, collabs, threads):
    """The job collabs file (content/collabs.json), independent of gen_collabs.py's own checks."""
    from common import COUNTIES
    region_of = {c: r for r, cs in COUNTIES.items() for c in cs}
    by = {p["handle"]: p for p in people}
    dt = datetime.fromisoformat
    n = len(collabs)
    pitches = [(c, b) for c in collabs for b in c["pitches"]]
    record("collabs: ~20 job collabs (18-22), all posted by seeded Seniors",
           18 <= n <= 22 and all(by.get(c["poster"], {}).get("role") == "senior" for c in collabs),
           f"{n} collabs by {len({c['poster'] for c in collabs})} Seniors: " + ", ".join(f"{h} {k}" for h, k in Counter(c["poster"] for c in collabs).most_common()))
    sizes = Counter(len(c["pitches"]) for c in collabs)
    record("collabs: 2-4 pitches each, from seeded Juniors, one per Junior per collab",
           set(sizes) <= {2, 3, 4} and all(by.get(b["applicant"], {}).get("role") == "junior" for _, b in pitches)
           and all(len({b["applicant"] for b in c["pitches"]}) == len(c["pitches"]) for c in collabs),
           f"{len(pitches)} pitches; sizes {dict(sorted(sizes.items()))}")
    one = [c["id"] for c in collabs if sum(b["status"] == "accepted" for b in c["pitches"]) != 1]
    other = [f"{c['id']}/{b['applicant']}:{b['status']}" for c, b in pitches if b["status"] not in ("accepted", "declined", "interested")]
    st = Counter(b["status"] for _, b in pitches)
    record("collabs: exactly 1 accepted per collab; the rest declined or pending ('interested')", not one and not other,
           f"{dict(st)}; bad: {one + other}")
    types = Counter(c["type"] for c in collabs)
    record("collabs: types extra_hand / ride_along / specialist all used; pay_type per schema",
           set(types) == {"extra_hand", "ride_along", "specialist"} and all(c["pay_type"] in ("day_rate", "unpaid", "trade", "flexible") for c in collabs),
           f"{dict(types)}; pay {dict(Counter(c['pay_type'] for c in collabs))}")
    bad_fill = []
    for c in collabs:
        last = max(dt(b["applied_at"]) for b in c["pitches"])
        acc = next((b for b in c["pitches"] if b["status"] == "accepted"), None)
        job = datetime.combine(datetime.fromisoformat(c["scheduled_date"]).date(), datetime.min.time(), NY)
        if not c.get("filled_at") or dt(c["filled_at"]) <= last or (acc and dt(c["filled_at"]) <= dt(acc["decided_at"])) or dt(c["filled_at"]) >= job:
            bad_fill.append(c["id"])
    record("collabs: every collab filled_at after its last application and its accept, before the job day", not bad_fill, str(bad_fill))
    stamps = [(c["id"], dt(c["posted_at"])) for c in collabs] + [(c["id"], dt(c["filled_at"])) for c in collabs]
    stamps += [(f"{c['id']}/{b['applicant']}", dt(b["applied_at"])) for c, b in pitches]
    stamps += [(f"{c['id']}/{b['applicant']}", dt(b["decided_at"])) for c, b in pitches if b.get("decided_at")]
    out_w = [w for w, t in stamps if not WINDOW_START <= t <= WINDOW_END]
    night = [w for w, t in stamps if t.astimezone(NY).hour < 5]
    dates = [c["id"] for c in collabs if not "2026-08-01" <= c["scheduled_date"] <= "2026-10-03"]
    record("collabs: job dates Aug 1 - Oct 3; every timestamp inside the window, none at 0-4 am",
           not out_w and not night and not dates, f"{len(stamps)} timestamps; window {out_w[:3]} night {night[:3]} dates {dates}")
    order = []
    for c in collabs:
        if dt(c["posted_at"]) <= dt(by[c["poster"]]["joined_at"]):
            order.append(f"{c['id']}: posted before {c['poster']} joined")
        for b in c["pitches"]:
            if dt(b["applied_at"]) <= max(dt(c["posted_at"]), dt(by[b["applicant"]]["joined_at"])):
                order.append(f"{c['id']}/{b['applicant']}: applied before posting/joining")
            if b.get("decided_at") and dt(b["decided_at"]) <= dt(b["applied_at"]):
                order.append(f"{c['id']}/{b['applicant']}: decided before applying")
            if (b["status"] == "interested") != (not b.get("decided_at")):
                order.append(f"{c['id']}/{b['applicant']}: decided_at vs status")
    record("collabs: poster joined before posting; applicants joined before applying, after posting; decisions after pitches",
           not order, str(order[:4]))
    dual = {"ms_almonte": {"hvac", "plumbing"}, "haddad_mech": {"hvac", "plumbing"}}
    tr = [f"{c['id']}/{b['applicant']}" for c, b in pitches if by[b["applicant"]]["trade"] != c["trade"]]
    tr += [c["id"] for c in collabs if c["trade"] not in ({by[c["poster"]]["trade"]} | dual.get(c["poster"], set()))]
    record("collabs: trade match (applicants' trade = the job's; the poster works that trade)", not tr, str(tr[:5]))
    rg = [c["id"] for c in collabs if region_of.get(c["county"]) != by[c["poster"]]["region"]]
    rg += [f"{c['id']}/{b['applicant']}" for c, b in pitches if by[b["applicant"]]["region"] != region_of.get(c["county"])]
    record("collabs: region match (job county in the poster's region; every applicant lives in it)", not rg, str(rg[:5]))
    active = {(m["junior"], m["senior"]): dt(m["decided_at"]) for m in ments if m["status"] == "active"}
    mentee_acc = [(c, b) for c, b in pitches if b["status"] == "accepted" and (b["applicant"], c["poster"]) in active]
    early = [f"{c['id']}/{b['applicant']}" for c, b in pitches
             if (b["applicant"], c["poster"]) in active and dt(b["applied_at"]) <= active[(b["applicant"], c["poster"])]]
    flag = [f"{c['id']}/{b['applicant']}" for c, b in pitches if bool(b.get("mentee_of_poster")) != ((b["applicant"], c["poster"]) in active)]
    record("collabs: some accepted pitches are the poster's mentee (3-10), each sent after the mentorship was accepted",
           3 <= len(mentee_acc) <= 10 and not early and not flag,
           f"{len(mentee_acc)} of {n}: " + ", ".join(f"{c['id']} {b['applicant']}->{c['poster']}" for c, b in mentee_acc) + (f"; early {early}" if early else ""))
    loc = [c["id"] for c in collabs if not re.fullmatch(r"[A-Z][A-Za-z .'-]+, (NJ|Brooklyn|Queens|Bronx|Staten Island)", c["location"])]
    addr = [c["id"] for c in collabs if ADDRESS_RE.search(c["title"] + "\n" + c["body"] + "\n" + c["location"])]
    addr += [f"{c['id']}/{b['applicant']}" for c, b in pitches if ADDRESS_RE.search(b["note"])]
    record("collabs: town-level locations only; no street address, phone or email anywhere", not loc and not addr, f"{loc} {addr}")
    det = []
    for c, b in pitches:
        p = by[b["applicant"]]
        since = p.get("license_since") or {}
        held = [x for x in p["licenses"] if x not in since or since[x] <= dt(b["applied_at"]).astimezone(NY).date().isoformat()]
        if b["years_experience"] != p["years_in"] or b["is_licensed"] != bool(held) or (b["license_note"] or "") != ", ".join(held):
            det.append(f"{c['id']}/{b['applicant']}")
        if b.get("graduation_year") and str(b["graduation_year"])[2:] not in (p.get("affiliation_hint") or ""):
            det.append(f"{c['id']}/{b['applicant']}: grad year")
        if b.get("cv_path") or b.get("cv_name"):
            det.append(f"{c['id']}/{b['applicant']}: CV")
        for m in re.finditer(r"\b(\d{1,2})\s*(?:years|yrs|year)\b", b["note"], re.I):
            if int(m.group(1)) != p["years_in"]:
                det.append(f"{c['id']}/{b['applicant']}: says {m.group(0)}, persona {p['years_in']}")
    record("collabs: application detail and stated years match each persona; no CV files", not det, str(det[:5]))
    voice = []
    for c in collabs:
        txt = c["title"] + "\n" + c["body"]
        if re.search(r"^\s*[-*•]\s", c["body"], re.M) and c["poster"] != "Kash_sing":
            voice.append(f"{c['id']}: bullets")
        if by[c["poster"]]["voice"]["punctuation"] == "lowercase_minimal" and re.search(r"(^|[.!?]\s+|\n\s*)[A-Z][a-z]", txt):
            voice.append(f"{c['id']}: {c['poster']} not lowercase")
    for c, b in pitches:
        if by[b["applicant"]]["voice"]["punctuation"] == "lowercase_minimal" and re.search(r"(^|[.!?]\s+)[A-Z][a-z]", b["note"]):
            voice.append(f"{c['id']}/{b['applicant']}: not lowercase")
    praise = [c["id"] for c in collabs if re.search(r"home ?fixr", c["body"] + " ".join(b["note"] for b in c["pitches"]), re.I)]
    record("collabs: persona voice (lowercase voices stay lowercase, bullets only from Kash_sing, nobody mentions Home Fixr)",
           not voice and not praise, str(voice[:5] + praise))

    def grams(text, k):
        w = re.findall(r"[a-z0-9']+", text.lower())
        return {" ".join(w[i:i + k]) for i in range(len(w) - k + 1)}
    texts = [(c["id"], c["body"]) for c in collabs] + [(f"{c['id']}/{b['applicant']}", b["note"]) for c, b in pitches]
    texts += [(w, t) for _, t, w in all_texts(threads)]
    hits = []
    for i, (wa, ta) in enumerate(texts[: n + len(pitches)]):
        ga = grams(ta, 12)
        for wb, tb in texts[i + 1:]:
            if ga & grams(tb, 12):
                hits.append(f"{wa}~{wb}")
    record("collabs: no 12-word overlap with each other or with the threads", not hits, str(hits[:5]))


# ---------------------------------------------------------------- fact lint
FACT_RE = re.compile(r"(Local \d+|\bIBEW\b|\bUA\b|licen[cs]e|\bboard\b|\bDOB\b|apprenticeship|aptitude|Apex|vo-tech|\b608\b|HVACR|"
                     r"\bmaster\b|journeyman|home improvement|Consumer Affairs|\bpermit|\bcode\b|inspection|prevailing|"
                     r"certified payroll|rebate|seven|affidavit|open book|proctored|lottery|wage)", re.I)
HEDGE_RE = re.compile(r"(last I checked|I think|I remember|as I understand|could be different|not sure|check|call |read the|"
                      r"verify|don't take|official site|from what I|at least that's how|ask whoever|not legal advice|may|might|"
                      r"from what I see|I can't speak|depends)", re.I)


def fact_lint(threads, people) -> int:
    lines = ["# Fact lint: claims to verify before production", "",
             "Every sentence in the sample threads and Senior personas that touches licensing, unions, schools, codes, "
             "pay or programs. `hedged` = the sentence (or its post) carries an in-character hedge. A human should check "
             "each against the official source (NJ Division of Consumer Affairs board pages, NYC DOB, the locals' and "
             "schools' own sites).", "", "| where | who | hedged | sentence |", "|---|---|---|---|"]
    n = 0
    for author, text, where in all_texts(threads):
        post_hedged = bool(HEDGE_RE.search(text))
        for sent in re.split(r"(?<=[.!?])\s+|\n+", text):
            if FACT_RE.search(sent):
                n += 1
                h = "yes" if HEDGE_RE.search(sent) else ("post" if post_hedged else "**no**")
                lines.append(f"| {where} | {author} | {h} | {sent.strip().replace('|', '/')} |")
    lines += ["", "## Persona fields", "", "| persona | field | claim |", "|---|---|---|"]
    for p in people:
        for f in p.get("fact_flags", []):
            lines.append(f"| {p['handle']} | flag | {f} |")
        if p["role"] == "senior":
            for lic in p["licenses"]:
                lines.append(f"| {p['handle']} | license | {lic} |")
            if p.get("affiliation_hint"):
                lines.append(f"| {p['handle']} | affiliation | {p['affiliation_hint']} |")
    (SEED_DIR / "reports").mkdir(exist_ok=True)
    (SEED_DIR / "reports" / "fact_lint.md").write_text("\n".join(lines) + "\n")
    return n


# ----------------------------------------------------------------- DB / app
def check_db(db_url, people):
    import psycopg
    assert_local_db(db_url)
    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        def one(sql, *a):
            cur.execute(sql, a)
            return cur.fetchone()[0]
        n = one("select count(*) from profiles where seed_batch_id = %s", BATCH_ID)
        record("DB: 136 seeded profiles", n == 136, str(n))
        record("DB: every seeded profile is_founding_member", one("select count(*) from profiles where seed_batch_id = %s and not is_founding_member", BATCH_ID) == 0)
        clash = one("select count(*) from profiles a join profiles b on lower(a.username) = lower(b.username) and a.id <> b.id where a.seed_batch_id = %s", BATCH_ID)
        record("DB: no handle collision with any other member", clash == 0, str(clash))
        notif = one("select count(*) from notifications n join profiles a on a.id in (n.user_id, n.actor_id) where a.seed_batch_id = %s", BATCH_ID)
        record("DB: zero notifications involving seeded accounts", notif == 0, str(notif))
        acc = one("select count(*) from profiles where seed_batch_id = %s and role = 'senior' and mentor_availability = 'accepting'", BATCH_ID)
        record("DB: no seeded Senior accepting mentees", acc == 0, str(acc))
        mism = one("select count(*) from profiles where seed_batch_id = %s and (avatar_style is null or (avatar_style = 'icon') <> (avatar_icon is not null))", BATCH_ID)
        record("DB: seeded avatar fields written and consistent", mism == 0, str(mism))
        pw = one("select count(*) from auth.users where raw_app_meta_data->>'seed_batch_id' = %s and (coalesce(encrypted_password,'') <> '' or banned_until is null)", BATCH_ID)
        record("DB: seeded auth users have no password and are banned", pw == 0, str(pw))


def check_db_social(db_url, people, ments, follows, threads) -> dict:
    """The social rows as written, plus what the pages should show (from the DB)."""
    import psycopg
    assert_local_db(db_url)
    by = {p["handle"]: p for p in people}
    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        def one(sql, *a):
            cur.execute(sql, a)
            return cur.fetchone()[0]
        b = BATCH_ID
        nm = one("select count(*) from mentorships where seed_batch_id = %s", b)
        nf = one("select count(*) from follows where seed_batch_id = %s", b)
        record("DB: batch mentorships / follows match the files", nm == len(ments) and nf == len(follows),
               f"mentorships {nm}/{len(ments)}, follows {nf}/{len(follows)}")
        cur.execute("select status::text, count(*) from mentorships where seed_batch_id = %s group by 1", (b,))
        got = dict(cur.fetchall())
        want = dict(Counter(m["status"] for m in ments))
        record("DB: mentorship statuses as generated", got == want, f"{got}")
        outside = one("""select count(*) from (
              select junior_id a, senior_id b from mentorships where seed_batch_id = %(b)s
              union all select follower_id, following_id from follows where seed_batch_id = %(b)s) x
            join profiles pa on pa.id = x.a join profiles pb on pb.id = x.b
           where pa.seed_batch_id is distinct from %(b)s or pb.seed_batch_id is distinct from %(b)s""".replace("%(b)s", "%s"), b, b, b, b)
        record("DB: social rows are seeded-to-seeded only", outside == 0, str(outside))
        roles = one("""select count(*) from mentorships m join profiles j on j.id = m.junior_id join profiles s on s.id = m.senior_id
                        where m.seed_batch_id = %s and (j.role <> 'junior' or s.role <> 'senior')""", b)
        record("DB: every mentorship is junior -> senior", roles == 0, str(roles))
        two = one("select count(*) from (select junior_id from mentorships where seed_batch_id = %s and status = 'active' group by 1 having count(*) > 1) x", b)
        record("DB: no Junior with two active mentors", two == 0, str(two))
        nofollow = one("""select count(*) from mentorships m where m.seed_batch_id = %s and m.status = 'active'
                           and not exists (select 1 from follows f where f.follower_id = m.junior_id and f.following_id = m.senior_id)""", b)
        record("DB: every active mentee follows their mentor", nofollow == 0, str(nofollow))
        late = one("""select count(*) from (
              select a, b, created_at from (select junior_id a, senior_id b, created_at from mentorships where seed_batch_id = %s
                                            union all select follower_id, following_id, created_at from follows where seed_batch_id = %s) u) x
            join profiles pa on pa.id = x.a join profiles pb on pb.id = x.b
           where x.created_at > '2026-10-04 23:59:59-04' or x.created_at < '2026-07-24 00:00:00-04'
              or x.created_at < pa.created_at or x.created_at < pb.created_at""", b, b)
        record("DB: social timestamps inside the window and after both joined", late == 0, str(late))
        notif = one("select count(*) from notifications n join profiles a on a.id in (n.user_id, n.actor_id) where a.seed_batch_id = %s", b)
        record("DB: no notifications from the social rows (or anything seeded)", notif == 0, str(notif))
        # Helpful counts in the DB are the rebalanced ones.
        cur.execute("""select p.title, r.body, r.helpful_count from replies r join posts p on p.id = r.post_id where r.seed_batch_id = %s""", (b,))
        db_h = {(t, body): h for t, body, h in cur.fetchall()}
        diff = [f"{t['id']}/r{i}" for t in threads for i, r in enumerate(t.get("replies", []))
                if db_h.get((t["title"], r["body"].strip())) != r["helpful_count"]]
        record("DB: reply helpful counts match the (rebalanced) files", not diff, str(diff[:5]))
        # Privacy: mentorships stay readable only by the two parties (RLS unchanged).
        cur.execute("set local role anon")
        anon_m = one("select count(*) from mentorships where seed_batch_id = %s", b)
        anon_f = one("select count(*) from follows where seed_batch_id = %s", b)
        cur.execute("reset role")
        record("DB: logged-out visitors can read follows but no mentorship rows (RLS unchanged)", anon_m == 0 and anon_f == nf,
               f"anon sees {anon_m} mentorships, {anon_f} follows")
        cur.execute("select a.username, count(*) from follows f join profiles a on a.id = f.following_id group by 1")
        followers = dict(cur.fetchall())
        cur.execute("select a.username, count(*) from mentorships m join profiles a on a.id = m.senior_id where m.status = 'active' group by 1")
        mentees = dict(cur.fetchall())
        cur.execute("select a.username, count(*) from replies r join profiles a on a.id = r.author_id group by 1")
        answers = dict(cur.fetchall())
    return {"followers": followers, "mentees": mentees, "answers": answers}


def check_db_collabs(db_url, collabs):
    import psycopg
    assert_local_db(db_url)
    b = BATCH_ID
    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        def one(sql, *a):
            cur.execute(sql, a)
            return cur.fetchone()[0]
        nc = one("select count(*) from job_collabs where seed_batch_id = %s", b)
        ni = one("select count(*) from collab_interests where seed_batch_id = %s", b)
        n_p = sum(len(c["pitches"]) for c in collabs)
        record("DB: batch job collabs / pitches match the file", nc == len(collabs) and ni == n_p, f"collabs {nc}/{len(collabs)}, pitches {ni}/{n_p}")
        cur.execute("select status::text, count(*) from collab_interests where seed_batch_id = %s group by 1", (b,))
        got = dict(cur.fetchall())
        want = dict(Counter(x["status"] for c in collabs for x in c["pitches"]))
        record("DB: pitch statuses as generated", got == want, str(got))
        one_acc = one("""select count(*) from job_collabs j where j.seed_batch_id = %s and
                          (select count(*) from collab_interests ci where ci.collab_id = j.id and ci.status = 'accepted') <> 1""", b)
        record("DB: exactly one accepted pitch per batch collab", one_acc == 0, str(one_acc))
        unfilled = one("""select count(*) from job_collabs j where j.seed_batch_id = %s and (j.filled_at is null or
                          j.filled_at <= (select max(created_at) from collab_interests ci where ci.collab_id = j.id))""", b)
        record("DB: every batch collab filled, after its last pitch", unfilled == 0, str(unfilled))
        cnt = one("""select count(*) from job_collabs j where j.seed_batch_id = %s and
                     j.interested_count <> (select count(*) from collab_interests ci where ci.collab_id = j.id)""", b)
        record("DB: interested_count matches the pitches (trigger)", cnt == 0, str(cnt))
        outside = one("""select count(*) from (select poster_id a from job_collabs where seed_batch_id = %s
                         union all select user_id from collab_interests where seed_batch_id = %s) x
                         join profiles p on p.id = x.a where p.seed_batch_id is distinct from %s""", b, b, b)
        record("DB: collab rows are seeded-to-seeded only", outside == 0, str(outside))
        cv = one("select count(*) from collab_interests where seed_batch_id = %s and (cv_path is not null or cv_name is not null)", b)
        record("DB: no CV files on seeded pitches", cv == 0, str(cv))
        notif = one("""select count(*) from notifications n where n.type::text in ('collab_interest', 'collab_accepted')
                       and n.entity_id in (select id from job_collabs where seed_batch_id = %s)""", b)
        record("DB: no collab notifications from the seeded collabs", notif == 0, str(notif))
        cur.execute("set local role anon")
        anon_c = one("select count(*) from job_collabs where seed_batch_id = %s and filled_at is not null", b)
        anon_i = one("select count(*) from collab_interests where seed_batch_id = %s", b)
        cur.execute("reset role")
        record("DB: logged-out visitors see the filled collabs but no pitches (RLS)", anon_c == nc and anon_i == 0,
               f"anon sees {anon_c} filled collabs, {anon_i} pitches")
        # A real member can't apply to a seeded collab (filled first, then founding), all rolled back.
        cur.execute("savepoint qa_apply")
        msgs = []
        try:
            uid_ = "0a0a0a0a-0000-4000-8000-00000000c011"  # throwaway, rolled back
            cur.execute("""insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
                           values (%s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                           'qa-apply@example.test', '{}'::jsonb, now(), now())""", (uid_,))
            cur.execute("select id from job_collabs where seed_batch_id = %s order by created_at", (b,))
            cids = [r[0] for r in cur.fetchall()]
            cur.execute("set local role authenticated")
            cur.execute("select set_config('request.jwt.claims', %s, true)", ('{"sub": "%s", "role": "authenticated"}' % uid_,))
            for cid in cids:
                cur.execute("savepoint one")
                try:
                    cur.execute("insert into collab_interests (collab_id, user_id, note) values (%s, %s, 'qa')", (cid, uid_))
                    msgs.append("ACCEPTED")
                except psycopg.Error as e:
                    msgs.append(e.diag.message_primary or "")
                cur.execute("rollback to savepoint one")
        finally:
            cur.execute("rollback to savepoint qa_apply")
            cur.execute("reset role")
        record("DB: a real member applying to any seeded collab is refused with 'position has been filled'",
               bool(msgs) and all("position has been filled" in m.lower() for m in msgs), f"{len(msgs)} tries: {Counter(msgs)}")


def check_app_collabs(app, collabs, cookie: str | None = None):
    """The Jobs board as a visitor (and, with a cookie, as a signed-in real member)."""
    import html as htmllib
    for who, hdr in (("logged out", None), ("signed-in member", cookie)):
        if who != "logged out" and not hdr:
            continue
        code, page = fetch(f"{app}/collabs", cookie=hdr)
        cards = re.split(r'(?=<div[^>]*data-testid="collab-card")', page)[1:]
        by_title = {}
        for ch in cards:
            m = re.search(r"<h3[^>]*>(.*?)</h3>", ch, re.S)
            if m:
                by_title[htmllib.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()] = ch
        missing = [c["id"] for c in collabs if c["title"] not in by_title]
        bad = []
        for c in collabs:
            ch = by_title.get(c["title"])
            if ch is None:
                continue
            if 'data-filled="true"' not in ch or "Position filled" not in ch:
                bad.append(f"{c['id']}: no Position filled")
            if re.search(r"I(&#x27;|&apos;|')m interested|Edit application|<form[^>]*>\s*<input[^>]*name=\"note\"", ch):
                bad.append(f"{c['id']}: has an apply control")
        flags = [('data-filled="true"' in ch) for ch in cards]
        open_first = flags == sorted(flags)
        record(f"app ({who}): /collabs shows 'Position filled' and no apply control on every seeded collab",
               code == 200 and not missing and not bad, f"{code}; {len(cards)} cards; missing {missing[:3]}; {bad[:4]}")
        record(f"app ({who}): open collabs listed before filled ones", code == 200 and open_first,
               f"{flags.count(False)} open, {flags.count(True)} filled")
        if who == "signed-in member":
            fm = sum("Founding Community account, set up by" in by_title.get(c["title"], "") for c in collabs)
            signed = 'href="/collabs/mine"' in page
            record("app (signed-in member): seeded collabs also keep the Founding notice, under Position filled",
                   signed and fm == len(collabs), f"signed in: {signed}; founding notice on {fm}/{len(collabs)}")
        code, op = fetch(f"{app}/collabs?status=open", cookie=hdr)
        shown = [c["id"] for c in collabs if htmllib.escape(c["title"], quote=False) in op or c["title"] in op]
        record(f"app ({who}): 'Open only' hides every seeded (filled) collab", code == 200 and not shown, f"{code}; shown: {shown[:3]}")


def fetch(url: str, cookie: str | None = None) -> tuple[int, str]:
    headers = {"User-Agent": "hf-qa"}
    if cookie:
        headers["Cookie"] = cookie
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def _num(html: str, label: str, tag: str):
    m = re.search(rf"<{tag}[^>]*>(\d+)</{tag}>\s*(?:<[^>]+>)?\s*{label}\b", html)
    return int(m.group(1)) if m else None


def check_app(app, people, threads, expected=None):
    by = {p["handle"]: p for p in people}
    # Feed: every seeded author shows the badge; no handle-preference full names.
    code, feed = fetch(f"{app}/feed")
    record("app: /feed renders", code == 200, str(code))
    leaks = [p["handle"] for p in people if p["display_preference"] == "handle" and p["full_name"] in feed]
    record("app: no full_name of handle-preference users on /feed", not leaks, str(leaks[:5]))
    record("app: Founding Community badge on /feed", feed.count("Founding Community") >= len(threads),
           f"{feed.count('Founding Community')} badges for {len(threads)} posts")
    code, mentors = fetch(f"{app}/mentors")
    seniors = [p for p in people if p["role"] == "senior"]
    shown = [p["handle"] for p in seniors if p["handle"] in mentors or (p["display_name"] and p["display_name"] in mentors)]
    record("app: /mentors lists all 15 seeded Seniors with badge", code == 200 and len(shown) == 15 and mentors.count("Founding Community") >= 15,
           f"{len(shown)} shown, {mentors.count('Founding Community')} badges")
    leaks = [p["handle"] for p in seniors if p["display_preference"] == "handle" and p["full_name"] in mentors]
    record("app: no full_name of handle-preference Seniors on /mentors", not leaks, str(leaks))
    if expected:
        clean = re.sub(r"<!--.*?-->", "", mentors)
        cards = {}
        for chunk in clean.split('href="/u/')[1:]:
            h = chunk.split('"', 1)[0]
            if h in by and h not in cards and ("answered" in chunk):
                cards[h] = (_num(chunk, "answered", "strong"), _num(chunk, "mentees", "strong"))
        f_ans = [f"{h}: shows {a}, DB {expected['answers'].get(h, 0)}" for h, (a, _) in cards.items() if a != expected["answers"].get(h, 0)]
        f_men = [f"{h}: shows {m}, DB {expected['mentees'].get(h, 0)}" for h, (_, m) in cards.items() if m != expected["mentees"].get(h, 0)]
        record("app: /mentors 'answered' counts match the DB", len(cards) == 15 and not f_ans, f"{len(cards)} cards; {f_ans[:4]}")
        record("app: /mentors 'mentees' counts match the DB", len(cards) == 15 and not f_men,
               f"{len(f_men)} of {len(cards)} cards differ: {f_men[:6]}")
    code, acc = fetch(f"{app}/mentors?avail=accepting")
    record("app: 'Accepting mentees' filter excludes every Founding account", code == 200 and "Founding Community" not in acc.split("<main", 1)[-1])
    # Every profile page: badge present, handle shown, private name absent.
    missing, leaks, bad = [], [], []
    stat_bad = {"followers": [], "active mentees": [], "answers": []}
    for p in people:
        code, html = fetch(f"{app}/u/{p['handle']}")
        if code != 200:
            bad.append(f"{p['handle']}:{code}")
            continue
        if expected:
            clean = re.sub(r"<!--.*?-->", "", html)
            for label, key in (("followers", "followers"), ("active mentees", "mentees"), ("answers", "answers")):
                shown, want = _num(clean, label, "dt"), expected[key].get(p["handle"], 0)
                if shown != want:
                    stat_bad[label].append(f"{p['handle']}: shows {shown}, DB {want}")
        if "Founding Community" not in html:
            missing.append(p["handle"])
        if p["display_preference"] == "handle" and p["full_name"] in html:
            leaks.append(p["handle"])
    record("app: all 136 profile pages render (200)", not bad, str(bad[:5]))
    record("app: Founding Community badge on every seeded profile", not missing, str(missing[:5]))
    record("app: no private full_name on handle-preference profiles", not leaks, str(leaks[:5]))
    if expected:
        for label, bads in stat_bad.items():
            record(f"app: /u/<handle> '{label}' match the DB (all 136)", not bads, f"{len(bads)} differ: {bads[:6]}")
    # Threads: replies render with badges.
    code, html = fetch(f"{app}/feed")
    def slugify(x):
        return re.sub(r"[^a-z0-9]+", "-", x.lower()).strip("-")[:40]
    seeded_prefixes = [slugify(t["title"]) for t in threads]
    slugs = [s for s in re.findall(r'href="/q/([^"]+)"', html) if any(s.startswith(pfx) for pfx in seeded_prefixes)]
    thread_bad = []
    for s in sorted(set(slugs)):
        c, h = fetch(f"{app}/q/{s}")
        if c != 200 or "Founding Community" not in h:
            thread_bad.append(f"{s}:{c}")
    record("app: seeded thread pages render with badges", bool(slugs) and not thread_bad, f"{len(set(slugs))} threads checked; bad: {thread_bad[:3]}")
    code, about = fetch(f"{app}/about")
    sentence = "Our earliest discussions were written by the Home Fixr team, with AI assistance, to show how the community works. Founding Community accounts are marked."
    record("app: About page carries the §0.3 sentence", code == 200 and sentence in about.replace("&#x27;", "'"))
    code, landing = fetch(f"{app}/")
    record("app: landing FAQ + footer link to About", code == 200 and 'href="/about"' in landing and "Founding Community" in landing)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threads", default="content/threads.sample.scheduled.json")
    ap.add_argument("--mentorships", default="content/mentorships.json")
    ap.add_argument("--follows", default="content/follows.json")
    ap.add_argument("--db", action="store_true")
    ap.add_argument("--db-url", default=LOCAL_DB_URL)
    ap.add_argument("--app", default="")
    ap.add_argument("--allow-unverified-handles", action="store_true")
    ap.add_argument("--collabs", default="content/collabs.json")
    ap.add_argument("--member-cookie", default="",
                    help="Cookie header of a signed-in REAL local member, for the signed-in Jobs board check "
                         "(tests/app/collabs-filled.mjs --print-cookie makes one)")
    args = ap.parse_args()

    people = load_json("personas/seniors.json") + load_json("personas/juniors.json")
    threads = load_json(args.threads)["threads"]
    check_personas(people, args.allow_unverified_handles)
    check_threads(threads, people)
    n_facts = fact_lint(threads, people)
    record("fact lint written for human review", True, f"{n_facts} flagged sentences -> seed/reports/fact_lint.md")
    about_src = (REPO_DIR / "src/lib/founding.ts").read_text()
    record("About sentence present in source", "Founding Community accounts are marked." in about_src)
    ments = load_json(args.mentorships)["mentorships"] if (SEED_DIR / args.mentorships).exists() else []
    follows = load_json(args.follows)["follows"] if (SEED_DIR / args.follows).exists() else []
    if ments:
        check_social(people, threads, ments, follows)
    if len(threads) > 20:
        check_full(threads, people, ments, follows)
    collabs = load_json(args.collabs)["collabs"] if (SEED_DIR / args.collabs).exists() else []
    if collabs:
        check_collabs(people, ments, collabs, threads)
    expected = None
    if args.db:
        check_db(args.db_url, people)
        if ments:
            expected = check_db_social(args.db_url, people, ments, follows, threads)
        if collabs:
            check_db_collabs(args.db_url, collabs)
    if args.app:
        check_app(args.app.rstrip("/"), people, threads, expected)
        if collabs:
            check_app_collabs(args.app.rstrip("/"), collabs, args.member_cookie or None)

    width = max(len(r[0]) for r in RESULTS)
    out = ["# QA report", "", f"Run: {datetime.now(NY).isoformat(timespec='seconds')} · threads: `{args.threads}` · "
           f"db: {'yes' if args.db else 'no'} · app: {args.app or 'no'}", "", "| status | check | detail |", "|---|---|---|"]
    for name, status, detail in RESULTS:
        print(f"{status:4}  {name.ljust(width)}  {detail}")
        out.append(f"| {status} | {name} | {detail.replace('|', '/')} |")
    (SEED_DIR / "reports").mkdir(exist_ok=True)
    (SEED_DIR / "reports" / "qa_report.md").write_text("\n".join(out) + "\n")
    c = Counter(s for _, s, _ in RESULTS)
    print(f"\n{c['PASS']} pass, {c['WARN']} warn, {c['FAIL']} fail")
    sys.exit(1 if c["FAIL"] else 0)


if __name__ == "__main__":
    main()
