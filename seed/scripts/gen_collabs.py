# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml>=6"]
# ///
"""
Job collabs ("Collabs / ride-alongs", plan §4) for the Founding Community seed.

    uv run seed/scripts/gen_collabs.py          # validate + build content/collabs.json
    uv run seed/scripts/gen_collabs.py --table  # also print the summary table

Reads content/collabs.authored.yaml (written by hand in the persona voices),
validates it, fills each pitch's application-detail fields from the
applicant's persona, adds timestamps, and writes content/collabs.json.

Rules enforced (any failure exits non-zero, nothing is written):
  * Posters are seeded Seniors; applicants are seeded Juniors.
  * Trade: the applicant's trade is the collab's trade, and the poster works
    in it (ms_almonte and haddad_mech cover HVAC and plumbing).
  * Region: the job's county is in the poster's region, and every applicant
    lives in that region. Location is town level ("Clifton, NJ"), and no text
    carries a street address, phone number or email.
  * Types extra_hand / ride_along / specialist; pay_type day_rate / unpaid /
    trade / flexible (schema.sql). scheduled_date between Aug 1 and Oct 3.
  * 2-4 pitches each, one per applicant, exactly one `accepted`; the rest
    `declined` or `interested` (= still pending, the schema's third status).
  * Application detail comes from the persona, never from the authored file:
    years_experience = years_in, graduation_year from a vo-tech grad's
    affiliation, age_range from a stated age, the licence from `licenses`.
    Skills must be on the app's list (src/lib/skills.ts). No CV files.
  * Voice: lowercase-voice personas stay lowercase, bullet points only from
    Kash_sing, years stated in a pitch match the persona, nobody mentions
    Home Fixr.
  * Time: the poster joined before posting; every applicant joined (and, when
    they're the poster's mentee, the mentorship was accepted) before applying;
    applications fall between posting and the day before the job; the poster
    accepts and declines after the pitch; filled_at comes after every
    application and the accept, before the job day. All inside the window
    (Jul 24 - Oct 4 2026 ET), none at 0-4 am.
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from datetime import date, datetime, time, timedelta
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from common import BATCH_ID, COUNTIES, REPO_DIR, RNG_SEED, SEED_DIR, load_json, write_json  # noqa: E402
from schedule import NY, _SENIOR_REPLY_HOURS, _hours_for, _pick, _rng, to_utc_iso  # noqa: E402

AUTHORED = "content/collabs.authored.yaml"
OUT = "content/collabs.json"
TYPES = {"extra_hand", "ride_along", "specialist"}
PAY_TYPES = {"day_rate", "unpaid", "trade", "flexible"}
STATUSES = {"accepted", "declined", "interested"}
DUAL_TRADE = {"ms_almonte": {"hvac", "plumbing"}, "haddad_mech": {"hvac", "plumbing"}}
BULLET_ALLOWED = {"Kash_sing"}
SCHEDULED_FROM, SCHEDULED_TO = date(2026, 8, 1), date(2026, 10, 3)
WINDOW_START = datetime(2026, 7, 24, 0, 0, tzinfo=NY)
WINDOW_END = datetime(2026, 10, 4, 23, 59, 0, tzinfo=NY)
# When Seniors post a job or answer applicants: mostly evenings, some at 6 am / lunch.
_POSTER_HOURS = {6: 1.0, 12: 0.8, 18: 1.2, 19: 2.5, 20: 3.0, 21: 2.5, 22: 1.0}
COUNTY_REGION = {c: r for r, cs in COUNTIES.items() for c in cs}

ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Pl|Place|Ct|Court|Terrace|Way)\b"
    r"|\b\d{3}[-. )]\s?\d{3}[-.]\d{4}\b|[\w.]+@[\w-]+\.\w+")
YEARS_RE = re.compile(r"\b(\d{1,2})\s*(?:years|yrs|year)\b", re.I)
AGE_RE = re.compile(r"(?:^|\bi'?m |\bat )(\d{2})\b(?!\s*(?:min|mins|minutes|miles|hours|hrs|yrs|years))", re.I)


def words(text: str) -> int:
    return len(re.findall(r"\b[\w'$/.-]+\b", text))


def has_bullets(text: str) -> bool:
    return bool(re.search(r"^\s*[-*•]\s+\S", text, flags=re.M))


def capitalised_sentence(text: str) -> bool:
    """A capital letter starting a sentence (lowercase voices never do that)."""
    return bool(re.search(r"(^|[.!?]\s+|\n\s*)[A-Z][a-z]", text.strip()))


def app_skills() -> dict[str, set[str]]:
    """The skill checklist from src/lib/skills.ts, so the seed can't drift from the form."""
    src = (REPO_DIR / "src/lib/skills.ts").read_text()
    out: dict[str, set[str]] = {}
    for trade in ("plumbing", "hvac", "electrical", "other"):
        m = re.search(rf"\n  {trade}: \[(.*?)\]", src, re.S)
        out[trade] = set(re.findall(r'"([^"]+)"', m.group(1)))
    m = re.search(r"GENERAL_SKILLS = \[(.*?)\]", src, re.S)
    out["general"] = set(re.findall(r'"([^"]+)"', m.group(1)))
    return out


def age_range(age: int | None) -> str | None:
    if age is None:
        return None
    for lo, hi, band in ((0, 17, "under_18"), (18, 24, "18_24"), (25, 34, "25_34"), (35, 44, "35_44"),
                         (45, 54, "45_54")):
        if lo <= age <= hi:
            return band
    return "55_plus"


def graduation_year(p: dict) -> int | None:
    if p["path"] != "votech_grad":
        return None
    m = re.search(r"'(\d{2})\b", p.get("affiliation_hint") or "")
    return 2000 + int(m.group(1)) if m else None


def at(d: date, hour: int, rng) -> datetime:
    minute = rng.randint(0, 30) if hour == 6 else rng.randint(0, 59)
    return datetime.combine(d, time(hour, minute, rng.randint(0, 59)), NY)


def time_in(rng, lo: datetime, hi: datetime, weights_for, skew: float = 1.0) -> datetime:
    """A time in [lo, hi] on a plausible hour (weights by day), skewed toward lo."""
    if hi <= lo:
        raise ValueError(f"empty window {lo} .. {hi}")
    days = (hi.date() - lo.date()).days
    for _ in range(400):
        d = lo.date() + timedelta(days=int((rng.random() ** skew) * (days + 1)))
        t = at(d, _pick(rng, weights_for(d)), rng)
        if lo <= t <= hi:
            return t
    # Fallback: shortly after lo, nudged out of the night.
    t = lo + timedelta(minutes=rng.randint(10, 50))
    if t.hour < 5:
        t = datetime.combine(t.date(), time(5, rng.randint(5, 50)), NY)
    if not lo <= t <= hi:
        raise ValueError(f"no plausible time in {lo} .. {hi}")
    return t


def build(authored: list[dict], people: dict[str, dict], ments: list[dict]) -> tuple[list[dict], list[str]]:
    errs: list[str] = []
    skills = app_skills()
    active = {(m["junior"], m["senior"]): datetime.fromisoformat(m["decided_at"])
              for m in ments if m["status"] == "active"}
    ids = Counter(c["id"] for c in authored)
    errs += [f"duplicate id {i}" for i, n in ids.items() if n > 1]
    titles = Counter(c["title"].lower() for c in authored)
    errs += [f"duplicate title {t!r}" for t, n in titles.items() if n > 1]
    out = []
    for c in authored:
        cid = c["id"]
        e = lambda msg: errs.append(f"{cid}: {msg}")  # noqa: E731
        poster = people.get(c["poster"])
        if not poster or poster["role"] != "senior":
            e(f"poster {c['poster']} is not a seeded Senior")
            continue
        if c["type"] not in TYPES:
            e(f"type {c['type']}")
        if c["pay_type"] not in PAY_TYPES:
            e(f"pay_type {c['pay_type']}")
        if c["trade"] not in (poster["trade"], *DUAL_TRADE.get(poster["handle"], ())):
            e(f"{poster['handle']} ({poster['trade']}) posting a {c['trade']} job")
        region = COUNTY_REGION.get(c["county"])
        if region != poster["region"]:
            e(f"county {c['county']} ({region}) is outside the poster's region {poster['region']}")
        town = c["location"].split(",")[0].strip()
        if not re.fullmatch(r"[A-Z][A-Za-z .'-]+, (NJ|Brooklyn|Queens|Bronx|Staten Island|NY)", c["location"]):
            e(f"location {c['location']!r} is not 'Town, NJ' / 'Neighborhood, Borough'")
        for field in ("title", "body", "location"):
            if ADDRESS_RE.search(c[field]):
                e(f"{field} looks like it carries an address/phone/email")
        sched = c["scheduled_date"] if isinstance(c["scheduled_date"], date) else date.fromisoformat(c["scheduled_date"])
        posted = c["posted"] if isinstance(c["posted"], date) else date.fromisoformat(c["posted"])
        if not SCHEDULED_FROM <= sched <= SCHEDULED_TO:
            e(f"scheduled_date {sched} outside {SCHEDULED_FROM}..{SCHEDULED_TO}")
        if not posted < sched:
            e(f"posted {posted} not before the job {sched}")
        bw = words(c["body"])
        if not 40 <= bw <= 160:
            e(f"body is {bw} words (40-160)")
        if not 6 <= words(c["title"]) <= 18:
            e(f"title is {words(c['title'])} words")
        if has_bullets(c["body"]) and poster["handle"] not in BULLET_ALLOWED:
            e("bullet points from someone other than Kash_sing")
        if poster["voice"]["punctuation"] == "lowercase_minimal" and (capitalised_sentence(c["body"]) or capitalised_sentence(c["title"])):
            e(f"{poster['handle']} writes lowercase")
        if re.search(r"home ?fixr", c["title"] + c["body"], re.I):
            e("mentions Home Fixr")

        pitches = c["pitches"]
        if not 2 <= len(pitches) <= 4:
            e(f"{len(pitches)} pitches (2-4)")
        st = Counter(p["status"] for p in pitches)
        if st["accepted"] != 1 or set(st) - STATUSES:
            e(f"statuses {dict(st)}: need exactly one accepted, the rest declined/interested")
        if len({p["applicant"] for p in pitches}) != len(pitches):
            e("the same Junior pitches twice")

        rng = _rng("collab", cid)
        poster_joined = datetime.fromisoformat(poster["joined_at"])
        post_lo = max(datetime.combine(posted, time(5, 0), NY), poster_joined + timedelta(hours=12))
        post_hi = datetime.combine(posted, time(22, 30), NY)
        try:
            posted_at = time_in(rng, post_lo, post_hi, lambda d: _POSTER_HOURS)
        except ValueError as ex:
            e(f"can't post: {ex}")
            continue
        last_ok = datetime.combine(sched - timedelta(days=1), time(22, 0), NY)  # filled by the night before
        apps_hi = last_ok - timedelta(hours=8)

        built = []
        for p in pitches:
            j = people.get(p["applicant"])
            if not j or j["role"] != "junior":
                e(f"applicant {p['applicant']} is not a seeded Junior")
                continue
            h = j["handle"]
            if j["trade"] != c["trade"]:
                e(f"{h} is {j['trade']}, the job is {c['trade']}")
            if j["region"] != region:
                e(f"{h} lives in {j['region']}, the job is in {region}")
            note = p["note"].strip()
            nw = words(note)
            if not 8 <= nw <= 80:
                e(f"{h}: note is {nw} words (8-80)")
            if j["voice"]["punctuation"] == "lowercase_minimal" and capitalised_sentence(note):
                e(f"{h} writes lowercase")
            if j["voice"]["punctuation"] != "lowercase_minimal" and not re.match(r"[A-Z0-9\"']", note):
                e(f"{h}: a normal-voice note starts lowercase")
            if has_bullets(note):
                e(f"{h}: bullet points")
            if ADDRESS_RE.search(note) or re.search(r"home ?fixr", note, re.I):
                e(f"{h}: address/phone/email or a Home Fixr mention")
            for m in YEARS_RE.finditer(note):
                if int(m.group(1)) != j["years_in"]:
                    e(f"{h}: says {m.group(0)!r}, persona years_in {j['years_in']}")
            for m in AGE_RE.finditer(note):
                if j.get("age") is None or int(m.group(1)) != j["age"]:
                    e(f"{h}: states age {m.group(1)}, persona age {j.get('age')}")
            allowed = skills[c["trade"]] | skills["general"]
            bad = [s for s in p.get("skills", []) if s not in allowed]
            if bad:
                e(f"{h}: skills not on the app's list for {c['trade']}: {bad}")
            if len(p.get("skills", [])) > 20:
                e(f"{h}: too many skills")
            mentee_since = active.get((h, poster["handle"]))
            lo = max(posted_at + timedelta(minutes=35), datetime.fromisoformat(j["joined_at"]) + timedelta(hours=2))
            if mentee_since:
                lo = max(lo, mentee_since + timedelta(hours=2))
            try:
                applied = time_in(_rng("collab", cid, "apply", h), lo, apps_hi, _hours_for, skew=1.8)
            except ValueError as ex:
                e(f"{h} can't apply in time: {ex}")
                continue
            # Licences held when they applied (license_since dates one earned in the window).
            since = j.get("license_since") or {}
            held = [x for x in j["licenses"] if x not in since or date.fromisoformat(since[x]) <= applied.astimezone(NY).date()]
            built.append({
                "applicant": h,
                "status": p["status"],
                "note": note,
                "years_experience": j["years_in"],
                "graduation_year": graduation_year(j),
                "age_range": age_range(j.get("age")),
                "skills": list(p.get("skills", [])) or None,
                "is_licensed": bool(held),
                "license_note": ", ".join(held) or None,
                "has_own_tools": bool(p.get("tools")),
                "has_transport": bool(p.get("transport")),
                "applied_at": applied,
                "decided_at": None,
                "mentee_of_poster": bool(mentee_since),
            })
        if len(built) != len(pitches):
            continue
        acc = next((b for b in built if b["status"] == "accepted"), None)
        if acc is None:
            continue
        drng = _rng("collab", cid, "decide")
        try:
            acc["decided_at"] = time_in(drng, acc["applied_at"] + timedelta(hours=1, minutes=30), last_ok - timedelta(hours=2),
                                        lambda d: _SENIOR_REPLY_HOURS)
            for b in built:
                if b["status"] == "declined":
                    # Usually when the poster picks someone; always before the job day.
                    lo = max(b["applied_at"] + timedelta(hours=1), acc["decided_at"] - timedelta(hours=3))
                    hi = min(lo + timedelta(hours=30), last_ok)
                    if hi <= lo:
                        lo = b["applied_at"] + timedelta(minutes=40)
                    b["decided_at"] = time_in(drng, lo, hi, lambda d: _SENIOR_REPLY_HOURS)
            filled_lo = max(max(b["applied_at"] for b in built) + timedelta(minutes=20), acc["decided_at"] + timedelta(minutes=10))
            filled_at = time_in(drng, filled_lo, max(filled_lo + timedelta(hours=1), last_ok), lambda d: _POSTER_HOURS, skew=2.5)
        except ValueError as ex:
            e(f"decisions don't fit: {ex}")
            continue
        built.sort(key=lambda b: b["applied_at"])
        out.append({
            "id": cid,
            "poster": poster["handle"],
            "type": c["type"],
            "trade": c["trade"],
            "title": c["title"].strip(),
            "body": c["body"].strip(),
            "location": c["location"],
            "town": town,
            "county": c["county"],
            "region": region,
            "scheduled_date": sched.isoformat(),
            "pay_type": c["pay_type"],
            "posted_at": posted_at,
            "filled_at": filled_at,
            "pitches": built,
        })
    # Timestamps: inside the window, never at 0-4 am.
    for c in out:
        stamps = [("posted", c["posted_at"]), ("filled", c["filled_at"])]
        stamps += [(f"{b['applicant']} applied", b["applied_at"]) for b in c["pitches"]]
        stamps += [(f"{b['applicant']} decided", b["decided_at"]) for b in c["pitches"] if b["decided_at"]]
        for what, t in stamps:
            if not WINDOW_START <= t <= WINDOW_END:
                errs.append(f"{c['id']}: {what} {t} outside the window")
            if t.astimezone(NY).hour < 5:
                errs.append(f"{c['id']}: {what} at {t.astimezone(NY):%H:%M}")
    return out, errs


def serialise(collabs: list[dict]) -> list[dict]:
    def conv(v):
        return to_utc_iso(v) if isinstance(v, datetime) else v
    return [{k: ([{kk: conv(vv) for kk, vv in b.items()} for b in v] if k == "pitches" else conv(v)) for k, v in c.items()}
            for c in collabs]


def table(collabs: list[dict]) -> str:
    lines = ["| id | poster | title | type | date | applicants | accepted |", "|---|---|---|---|---|---|---|"]
    for c in collabs:
        acc = next(b for b in c["pitches"] if b["status"] == "accepted")
        others = ", ".join(f"{b['applicant']} ({'pending' if b['status'] == 'interested' else b['status']})"
                           for b in c["pitches"] if b is not acc)
        lines.append(f"| {c['id']} | {c['poster']} | {c['title']} | {c['type']} | {c['scheduled_date']} | "
                     f"{len(c['pitches'])}: {others} | {acc['applicant']}{' (mentee)' if acc['mentee_of_poster'] else ''} |")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", action="store_true", help="print the summary table (markdown)")
    args = ap.parse_args()
    people = {p["handle"]: p for p in load_json("personas/seniors.json") + load_json("personas/juniors.json")}
    ments = load_json("content/mentorships.json")["mentorships"]
    authored = yaml.safe_load((SEED_DIR / AUTHORED).read_text())["collabs"]
    collabs, errs = build(authored, people, ments)
    if errs:
        print("collabs.authored.yaml has problems:\n  " + "\n  ".join(errs))
        sys.exit(1)
    n_p = sum(len(c["pitches"]) for c in collabs)
    st = Counter(b["status"] for c in collabs for b in c["pitches"])
    write_json(OUT, {
        "batch_id": BATCH_ID,
        "generated_by": "seed/scripts/gen_collabs.py",
        "rng_seed": RNG_SEED,
        "source": AUTHORED,
        "window": ["2026-07-24", "2026-10-04"],
        "note": "Every collab is filled (filled_at after its applications). status 'interested' = still pending. "
                "decided_at is the accept/decline time, kept for QA (collab_interests has no such column). "
                "Application detail fields come from the applicant's persona; no CV files.",
        "collabs": serialise(collabs),
    })
    print(f"wrote {SEED_DIR / OUT}: {len(collabs)} collabs, {n_p} pitches ({dict(st)}), "
          f"types {dict(Counter(c['type'] for c in collabs))}, "
          f"{sum(any(b['mentee_of_poster'] and b['status'] == 'accepted' for b in c['pitches']) for c in collabs)} accepted pitches are the poster's mentee")
    if args.table:
        print(table(collabs))


if __name__ == "__main__":
    main()
