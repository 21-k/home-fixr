"""
Shared roster spec for the Founding Community seed (plan §2).

Everything here is deterministic: the 136 persona SLOTS (role / trade /
region / county / town) are derived from fixed counts and a fixed RNG seed,
so gen_handles.py and gen_personas.py always agree on who is who.

Counts (plan §2):
                NJ    NYC   Total
    Seniors     13     2     15
    Juniors    109    12    121
Trade mix: Electrical 35%, Plumbing 33%, HVAC 25%, General 7% (Juniors only).
NJ geography: North 38%, Central 37%, South/Shore 25%.
"""
from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from urllib.parse import urlparse

SEED_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = SEED_DIR.parent
BATCH_ID = "fm-2026-10"
RNG_SEED = 20261005
LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Project refs that must never be written to by these scripts without a human
# decision (see seed/REPORT.md). The second one must never be touched at all.
PROD_REF = "nvdslzzatfuojgbojuuz"
FORBIDDEN_REF = "mcchiylrzxnoomznfapm"

COUNTIES: dict[str, dict[str, list[str]]] = {
    "NJ-North": {
        "Bergen": ["Hackensack", "Paramus", "Lodi", "Garfield", "Teaneck", "Mahwah", "Fair Lawn", "Lyndhurst"],
        "Essex": ["Newark", "Bloomfield", "Belleville", "Irvington", "Montclair", "West Orange", "Nutley"],
        "Hudson": ["Jersey City", "Bayonne", "Kearny", "Union City", "Hoboken", "North Bergen", "Secaucus"],
        "Passaic": ["Clifton", "Paterson", "Wayne", "Passaic", "Little Falls"],
        "Morris": ["Parsippany", "Dover", "Morristown", "Rockaway", "Denville", "Randolph"],
    },
    "NJ-Central": {
        "Middlesex": ["Edison", "Woodbridge", "Old Bridge", "Sayreville", "Piscataway", "New Brunswick", "Perth Amboy", "South Brunswick"],
        "Monmouth": ["Freehold", "Howell", "Middletown", "Long Branch", "Neptune", "Manalapan", "Asbury Park"],
        "Union": ["Elizabeth", "Linden", "Rahway", "Union", "Plainfield", "Cranford"],
        "Mercer": ["Trenton", "Hamilton", "Ewing", "Lawrence"],
        "Somerset": ["Bridgewater", "Somerville", "Franklin", "Bound Brook", "Manville"],
    },
    "NJ-South": {
        "Ocean": ["Toms River", "Brick", "Lakewood", "Manahawkin", "Barnegat", "Jackson"],
        "Camden": ["Cherry Hill", "Pennsauken", "Camden", "Voorhees", "Gloucester Township"],
        "Burlington": ["Mount Laurel", "Burlington", "Willingboro", "Medford", "Pemberton"],
        "Gloucester": ["Deptford", "Glassboro", "Washington Township", "Williamstown"],
        "Atlantic": ["Egg Harbor Township", "Galloway", "Pleasantville", "Hammonton"],
    },
    "NYC": {
        "Queens": ["Astoria", "Flushing", "Jamaica", "Ridgewood", "Woodside", "Ozone Park"],
        "Brooklyn": ["Bay Ridge", "Bushwick", "Canarsie", "Sunset Park", "Flatbush"],
        "Bronx": ["Fordham", "Throggs Neck", "Parkchester"],
        "Staten Island": ["Tottenville", "New Dorp", "Great Kills"],
    },
}

# Junior county weights per region (counts, not %), summing to the region total.
JUNIOR_COUNTY_COUNTS = {
    "NJ-North": {"Bergen": 11, "Essex": 9, "Hudson": 9, "Passaic": 6, "Morris": 6},  # 41
    "NJ-Central": {"Middlesex": 13, "Monmouth": 9, "Union": 7, "Mercer": 6, "Somerset": 5},  # 40
    "NJ-South": {"Ocean": 9, "Camden": 7, "Burlington": 5, "Gloucester": 4, "Atlantic": 3},  # 28
    "NYC": {"Queens": 4, "Brooklyn": 4, "Bronx": 2, "Staten Island": 2},  # 12
}
JUNIOR_TRADE_COUNTS = {"electrical": 42, "plumbing": 40, "hvac": 30, "general": 9}  # 121
JUNIOR_ACTIVITY_COUNTS = {"lurker": 49, "occasional": 42, "regular": 24, "heavy": 6}  # 121

AREA_CODES = {
    "NJ-North": ["201", "973", "551", "862"],
    "NJ-Central": ["732", "908", "848", "609"],
    "NJ-South": ["609", "856", "640"],
    "NYC": ["718", "347", "929", "917"],
}


@dataclass
class Slot:
    slot_id: str
    role: str  # junior | senior
    trade: str  # electrical | plumbing | hvac | general
    region: str  # NJ-North | NJ-Central | NJ-South | NYC
    county: str
    town: str
    activity_level: str = ""
    roster_no: int | None = None  # Senior roster number (plan §2), 1..15
    extra: dict = field(default_factory=dict)


# Senior roster (plan §2) — trade / place fixed by the plan.
SENIOR_SLOTS = [
    Slot("S01", "senior", "plumbing", "NJ-North", "Bergen", "Hackensack", "heavy", 1),
    Slot("S02", "senior", "electrical", "NJ-North", "Morris", "Parsippany", "heavy", 2),
    Slot("S03", "senior", "electrical", "NJ-Central", "Monmouth", "Middletown", "regular", 3),
    Slot("S04", "senior", "hvac", "NJ-Central", "Middlesex", "Edison", "heavy", 4),
    Slot("S05", "senior", "plumbing", "NJ-Central", "Middlesex", "South Brunswick", "regular", 5),
    Slot("S06", "senior", "hvac", "NJ-South", "Camden", "Cherry Hill", "regular", 6),
    Slot("S07", "senior", "electrical", "NJ-South", "Ocean", "Toms River", "heavy", 7),
    Slot("S08", "senior", "plumbing", "NJ-North", "Hudson", "Jersey City", "regular", 8),
    Slot("S09", "senior", "hvac", "NJ-North", "Passaic", "Wayne", "heavy", 9),
    Slot("S10", "senior", "electrical", "NJ-Central", "Somerset", "Bridgewater", "regular", 10),
    Slot("S11", "senior", "hvac", "NJ-South", "Burlington", "Mount Laurel", "regular", 11),
    Slot("S12", "senior", "plumbing", "NJ-North", "Hudson", "North Bergen", "regular", 12),
    Slot("S13", "senior", "hvac", "NJ-South", "Atlantic", "Egg Harbor Township", "regular", 13),
    Slot("S14", "senior", "electrical", "NYC", "Queens", "Astoria", "regular", 14),
    Slot("S15", "senior", "plumbing", "NYC", "Brooklyn", "Bay Ridge", "regular", 15),
]


def junior_slots() -> list[Slot]:
    rng = random.Random(RNG_SEED)
    places: list[tuple[str, str]] = []
    for region, counties in JUNIOR_COUNTY_COUNTS.items():
        for county, n in counties.items():
            places += [(region, county)] * n
    trades: list[str] = []
    for t, n in JUNIOR_TRADE_COUNTS.items():
        trades += [t] * n
    activity: list[str] = []
    for a, n in JUNIOR_ACTIVITY_COUNTS.items():
        activity += [a] * n
    assert len(places) == len(trades) == len(activity) == 121
    rng.shuffle(trades)
    rng.shuffle(activity)
    out = []
    for i, ((region, county), trade, act) in enumerate(zip(places, trades, activity), start=1):
        town = rng.choice(COUNTIES[region][county])
        out.append(Slot(f"J{i:03d}", "junior", trade, region, county, town, act))
    return out


def all_slots() -> list[Slot]:
    return SENIOR_SLOTS + junior_slots()


def slot_dict(s: Slot) -> dict:
    return asdict(s)


def load_json(rel: str):
    return json.loads((SEED_DIR / rel).read_text())


def write_json(rel: str, data) -> Path:
    p = SEED_DIR / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return p


def assert_local_db(url: str, allow_remote: bool = False) -> None:
    """Refuse anything but the local Supabase stack unless explicitly allowed."""
    if FORBIDDEN_REF in url:
        raise SystemExit(f"refusing: {FORBIDDEN_REF} must never be touched by these scripts")
    host = urlparse(url).hostname or ""
    if host in ("127.0.0.1", "localhost", "::1"):
        return
    if not allow_remote:
        raise SystemExit(
            f"refusing to connect to non-local database host {host!r}. "
            "These scripts only run against the local Supabase stack in this pass."
        )
    if PROD_REF in url:
        print(f"WARNING: {PROD_REF} is LIVE PRODUCTION.")


def levenshtein(a: str, b: str) -> int:
    a, b = a.lower(), b.lower()
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]
