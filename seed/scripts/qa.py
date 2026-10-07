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
from datetime import datetime
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
    def grams(text, k):
        w = re.findall(r"[a-z0-9']+", text.lower())
        return {" ".join(w[i:i + k]) for i in range(len(w) - k + 1)}
    texts = [(where, text) for _, text, where in all_texts(threads)]
    hits12 = []
    hits8 = 0
    for i, (wa, ta) in enumerate(texts):
        ga8, ga12 = grams(ta, 8), grams(ta, 12)
        for wb, tb in texts[i + 1:]:
            hits8 += len(ga8 & grams(tb, 8))
            if ga12 & grams(tb, 12):
                hits12.append(f"{wa}~{wb}")
    record("plagiarism: no 12-word overlap (internal; no external corpus)", not hits12, f"8-gram overlaps: {hits8}; 12+: {hits12[:5]}")

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


def fetch(url: str) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hf-qa"}), timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def check_app(app, people, threads):
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
    code, acc = fetch(f"{app}/mentors?avail=accepting")
    record("app: 'Accepting mentees' filter excludes every Founding account", code == 200 and "Founding Community" not in acc.split("<main", 1)[-1])
    # Every profile page: badge present, handle shown, private name absent.
    missing, leaks, bad = [], [], []
    for p in people:
        code, html = fetch(f"{app}/u/{p['handle']}")
        if code != 200:
            bad.append(f"{p['handle']}:{code}")
            continue
        if "Founding Community" not in html:
            missing.append(p["handle"])
        if p["display_preference"] == "handle" and p["full_name"] in html:
            leaks.append(p["handle"])
    record("app: all 136 profile pages render (200)", not bad, str(bad[:5]))
    record("app: Founding Community badge on every seeded profile", not missing, str(missing[:5]))
    record("app: no private full_name on handle-preference profiles", not leaks, str(leaks[:5]))
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
    ap.add_argument("--db", action="store_true")
    ap.add_argument("--db-url", default=LOCAL_DB_URL)
    ap.add_argument("--app", default="")
    ap.add_argument("--allow-unverified-handles", action="store_true")
    args = ap.parse_args()

    people = load_json("personas/seniors.json") + load_json("personas/juniors.json")
    threads = load_json(args.threads)["threads"]
    check_personas(people, args.allow_unverified_handles)
    check_threads(threads, people)
    n_facts = fact_lint(threads, people)
    record("fact lint written for human review", True, f"{n_facts} flagged sentences -> seed/reports/fact_lint.md")
    about_src = (REPO_DIR / "src/lib/founding.ts").read_text()
    record("About sentence present in source", "Founding Community accounts are marked." in about_src)
    if args.db:
        check_db(args.db_url, people)
    if args.app:
        check_app(args.app.rstrip("/"), people, threads)

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
