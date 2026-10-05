# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.1"]
# ///
"""
Handle generator + collision check (plan §3).

    uv run seed/scripts/gen_handles.py                  # generate, check, assign
    uv run seed/scripts/gen_handles.py --no-reddit      # skip the Reddit step (all 'unverified')

Steps
  1. Generate ~240 candidates across the §3 style shapes (trade+place,
     trade+number, job-site humor, first name+initial, role/status, NJ flavor
     10–15%, lazy/old ~15%), tagged with the trade/region/role they fit.
  2. Offline rules: format (4–22 chars here, inside the app's 3–22), the app's
     own reserved/blocked list (public.is_reserved_handle in the LOCAL DB),
     existing Home Fixr users (case-insensitive), and Levenshtein <= 1 against
     handles already kept.
  3. Reddit: GET https://www.reddit.com/user/<h>/about.json with a descriptive
     User-Agent, >= 1.5 s between requests plus jitter, exponential backoff on
     429. 404 = free, 200 = reject, anything else = 'unverified' (never free).
     If Reddit answers 403 to the first 5 requests in a row it is treated as a
     persistent block: checking stops, nothing is retried or worked around,
     and every remaining handle is marked 'unverified'.
  4. Assign 136 handles to the roster slots in common.py and write
     seed/personas/handles.json. Every check is logged to
     seed/handles_checked.csv.
"""
from __future__ import annotations

import argparse
import csv
import random
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from common import (  # noqa: E402
    AREA_CODES,
    BATCH_ID,
    LOCAL_DB_URL,
    RNG_SEED,
    SEED_DIR,
    all_slots,
    assert_local_db,
    levenshtein,
    write_json,
)

USER_AGENT = "HomeFixrHandleCheck/0.1 (contact: admin@home-fixr.com)"
MIN_INTERVAL = 1.5
BLOCK_THRESHOLD = 5  # consecutive 403s at the start = persistent block


@dataclass
class Cand:
    handle: str
    style: str
    trade: str | None = None  # None = fits any trade
    regions: set[str] | None = None  # None = anywhere
    counties: set[str] | None = None
    role: str | None = None  # None = junior or senior
    slot: str | None = None  # curated for one Senior slot
    status: str = "pending"
    http: str = ""
    note: str = ""
    checked_at: str = ""
    extra: dict = field(default_factory=dict)


NJ = {"NJ-North", "NJ-Central", "NJ-South"}
TRADES = ["electrical", "plumbing", "hvac"]

TRADE_WORDS = {
    "electrical": ["Sparky", "Sparks", "Wireman", "Wires", "Volts", "Conduit", "Breaker", "Amps"],
    "plumbing": ["Pipes", "Plumber", "Plumb", "Drains", "Copper", "Traps", "Pipefitter"],
    "hvac": ["HVAC", "Heat", "Ducts", "Coils", "Cooling", "Refrig", "Airside"],
}
TRADE_SHORT = {"electrical": "elec", "plumbing": "plumb", "hvac": "hvac", "general": "tools"}

# Place token -> (region, counties)
PLACES: dict[str, tuple[str, set[str]]] = {
    "Bergen": ("NJ-North", {"Bergen"}), "Passaic": ("NJ-North", {"Passaic"}),
    "Hudson": ("NJ-North", {"Hudson"}), "Essex": ("NJ-North", {"Essex"}),
    "Morris": ("NJ-North", {"Morris"}), "Hoboken": ("NJ-North", {"Hudson"}),
    "JC": ("NJ-North", {"Hudson"}), "Newark": ("NJ-North", {"Essex"}),
    "Paterson": ("NJ-North", {"Passaic"}), "Clifton": ("NJ-North", {"Passaic"}),
    "Hackensack": ("NJ-North", {"Bergen"}), "Bayonne": ("NJ-North", {"Hudson"}),
    "Kearny": ("NJ-North", {"Hudson"}), "Parsippany": ("NJ-North", {"Morris"}),
    "Union": ("NJ-Central", {"Union"}), "Middlesex": ("NJ-Central", {"Middlesex"}),
    "Monmouth": ("NJ-Central", {"Monmouth"}), "Mercer": ("NJ-Central", {"Mercer"}),
    "Somerset": ("NJ-Central", {"Somerset"}), "Edison": ("NJ-Central", {"Middlesex"}),
    "Woodbridge": ("NJ-Central", {"Middlesex"}), "OldBridge": ("NJ-Central", {"Middlesex"}),
    "Sayreville": ("NJ-Central", {"Middlesex"}), "Piscataway": ("NJ-Central", {"Middlesex"}),
    "Trenton": ("NJ-Central", {"Mercer"}), "Hamilton": ("NJ-Central", {"Mercer"}),
    "Elizabeth": ("NJ-Central", {"Union"}), "Linden": ("NJ-Central", {"Union"}),
    "Rahway": ("NJ-Central", {"Union"}), "Freehold": ("NJ-Central", {"Monmouth"}),
    "Howell": ("NJ-Central", {"Monmouth"}), "Raritan": ("NJ-Central", {"Somerset", "Middlesex"}),
    "Ocean": ("NJ-South", {"Ocean"}), "Camden": ("NJ-South", {"Camden"}),
    "Burlington": ("NJ-South", {"Burlington"}), "Glouco": ("NJ-South", {"Gloucester"}),
    "Atlantic": ("NJ-South", {"Atlantic"}), "TomsRiver": ("NJ-South", {"Ocean"}),
    "Brick": ("NJ-South", {"Ocean"}), "Lakewood": ("NJ-South", {"Ocean"}),
    "CherryHill": ("NJ-South", {"Camden"}), "Manahawkin": ("NJ-South", {"Ocean"}),
    "Deptford": ("NJ-South", {"Gloucester"}), "Pennsauken": ("NJ-South", {"Camden"}),
    "MtLaurel": ("NJ-South", {"Burlington"}), "Glassboro": ("NJ-South", {"Gloucester"}),
    "Queens": ("NYC", {"Queens"}), "Astoria": ("NYC", {"Queens"}), "Flushing": ("NYC", {"Queens"}),
    "Bklyn": ("NYC", {"Brooklyn"}), "BayRidge": ("NYC", {"Brooklyn"}), "Bronx": ("NYC", {"Bronx"}),
    "StatenIsland": ("NYC", {"Staten Island"}), "SI": ("NYC", {"Staten Island"}),
}
REGION_WORDS = {"NorthJersey": "NJ-North", "CentralJersey": "NJ-Central", "SouthJersey": "NJ-South"}

TRADE_NUM_WORDS = {
    "electrical": ["wiremonkey", "conduitbender", "breakerbox", "twelvegauge", "threeway",
                   "emt_bender", "wirenut", "panelchanger", "groundrod", "neutral_bar"],
    "plumbing": ["pex_and_flux", "sweatjoint", "copperhead", "ptrap", "cleanout",
                 "drainsnake", "leadfree", "solderking", "shutoff", "closetflange"],
    "hvac": ["superheat", "subcool", "micron", "brazer", "nitrogenpurge",
             "lineset", "condensate", "flarenut", "epa608", "blowerwheel"],
}

HUMOR = {
    None: ["BasementInMarch", "LadderLegs", "ColdCoffeeCrew", "SixAMSupplyRun", "TwoBucketsTuesday",
           "DrywallDustLungs", "AnotherDayAnotherVan", "KneepadsAndPrayers", "LunchInTheVan",
           "MudOnMyBoots", "RainDayRestock", "ThermosOfCoffee", "CrawlspaceRegular", "AtticNapper",
           "RunningLateAgain", "HardHatHairDay"],
    "electrical": ["OpenNeutralBlues", "ThreeWayConfusion", "PullingWireAgain", "DripLoopDays",
                   "BentConduitClub", "LiveFrontLessons", "JunctionBoxJunkie", "TwistAndTape"],
    "plumbing": ["SnakeTheMain", "AnotherDayAnotherDrain", "FluxOnMyBoots", "WaxRingWarrior",
                 "SumpPumpSeason", "TorchAndFlux", "LeakAtTheTee", "BackflowBlues"],
    "hvac": ["NoHeatSaturday", "ShortCycleSeason", "FilterChangeFriday", "CondensateOverflow",
             "FrozenCoilClub", "HeatwaveOnCall", "PilotLightPete", "BlowerMotorBlues"],
}

FIRSTS = ["Dom", "Tony", "Mike", "Sal", "Vinny", "Chris", "Jay", "Luis", "Carlos", "Jose", "Andre",
          "Darnell", "Malik", "Kevin", "Ryan", "Matt", "Steve", "Joe", "Pete", "Raj", "Dev", "Sam",
          "Kayla", "Jess", "Bri", "Nicole", "Ana", "Maria", "Tasha", "Kim", "Danny", "Frankie", "Ray",
          "Eddie", "Hector", "Omar", "Tariq", "Wes", "Cody", "Tyler", "Kyle", "Hank", "Gio", "Paulie",
          "Rocco", "Marco", "Nate", "Ozzie", "Kofi", "Emeka", "Lena", "Rosa", "Gabe", "Manny", "Kenny",
          "Shawn", "Terrell", "Quan", "Nico", "Leo", "Zach", "Ben", "Walt", "Priya", "Yusuf", "Bogdan",
          "Tomasz", "Hugo", "Junior", "Deshawn", "Javi", "Arjun", "Mateo", "Iris", "Gina"]

ROLE_STATUS = [
    ("FirstYearSparky", "electrical"), ("SecondYrPipes", "plumbing"), ("ThirdYearTinknocker", "hvac"),
    ("Apprentice_Yr2", None), ("PreApp_Jersey", None), ("NewGuyOnTheVan", None), ("HelperForNow", None),
    ("OfficeToTools", None), ("LateStartPlumber", "plumbing"), ("WasABarista", None),
    ("ExRetail_NowHVAC", "hvac"), ("JourneymanSomeday", None), ("StillTheHelper", None),
    ("GreenhornHVAC", "hvac"), ("RookieWireman", "electrical"), ("DeskJobEscapee", None),
    ("ForkliftToFittings", "plumbing"), ("NightClassSparky", "electrical"), ("ApprenticeInJersey", None),
    ("TopOutSoon", None), ("FifthYearAlmost", "electrical"), ("UndecidedTradesKid", "general"),
    ("WhichTradeTho", "general"), ("TryingAllThree", "general"),
]

NJ_FLAVOR = [
    ("ParkwayPipes", "plumbing", None), ("Exit117Plumber", "plumbing", {"NJ-Central"}),
    ("JughandleJourneyman", "electrical", NJ), ("WawaRunWired", "electrical", NJ),
    ("QuickChekCrew", None, NJ), ("DinerCoffeeHVAC", "hvac", NJ), ("DownTheShoreHVAC", "hvac", {"NJ-South", "NJ-Central"}),
    ("Route1Wireman", "electrical", {"NJ-Central"}), ("Rt18Plumber", "plumbing", {"NJ-Central"}),
    ("Exit13Sparks", "electrical", {"NJ-Central"}), ("NorthJerseyCopper", "plumbing", {"NJ-North"}),
    ("SouthJerseySweats", "plumbing", {"NJ-South"}), ("PineBarrensPipes", "plumbing", {"NJ-South"}),
    ("JerseyDuctwork", "hvac", NJ), ("PorkRollPlumber", "plumbing", {"NJ-South", "NJ-Central"}),
    ("TaylorHamHVAC", "hvac", {"NJ-North"}), ("GSP_Exit82", None, {"NJ-South"}),
    ("Exit9Sparky", "electrical", {"NJ-Central"}), ("Turnpike_Tech", None, NJ),
    ("JerseyTomatoWires", "electrical", NJ), ("BennySeasonHVAC", "hvac", {"NJ-South"}),
    ("LodiDMVSurvivor", None, {"NJ-North"}), ("WawaHoagieFuel", None, NJ),
    ("Exit145Electric", "electrical", {"NJ-North"}),
]

# Two curated candidates per Senior (plan §2 roster), still subject to checks.
SENIOR_CURATED = {
    "S01": ["BergenBoilerMan", "CopperAndCastIron"],
    "S02": ["ForemanFromMorris", "DataHallSparky"],
    "S03": ["SaltAirSparky", "DownTheShoreSparks"],
    "S04": ["MiddlesexHeatPumps", "OilToGasGuy"],
    "S05": ["Rt1Steamfitter", "PharmaPipefitter"],
    "S06": ["CasinoChillerTech", "SoJersey_HVAC_Lead"],
    "S07": ["GreenTagOrBust", "PassedRoughIn"],
    "S08": ["RiserRoomRegular", "MultifamilyMaster"],
    "S09": ["DayOneMistakes", "ShopTeacherTech"],
    "S10": ["LowVoltLifer", "BMS_and_FireAlarm"],
    "S11": ["PrevailingWageMech", "KeepableApprentice"],
    "S12": ["SecondGenPlumber", "PopsOldTruck"],
    "S13": ["WalkInCoolerWes", "WinterIsForLearning"],
    "S14": ["FortyFloorsUp", "QueensHighRiseSparky"],
    "S15": ["BrownstoneGasPlumber", "BklynGasTest"],
}


def generate(rng: random.Random) -> list[Cand]:
    out: list[Cand] = []
    seen: set[str] = set()

    def add(c: Cand):
        key = c.handle.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(c)

    for slot, hs in SENIOR_CURATED.items():
        for h in hs:
            add(Cand(h, "curated_senior", role="senior", slot=slot))

    place_keys = list(PLACES)
    # trade + place
    while sum(c.style == "trade_place" for c in out) < 46:
        trade = rng.choice(TRADES)
        word = rng.choice(TRADE_WORDS[trade])
        p = rng.choice(place_keys + list(REGION_WORDS))
        if p in REGION_WORDS:
            regions, counties = {REGION_WORDS[p]}, None
        else:
            regions, counties = {PLACES[p][0]}, PLACES[p][1]
        fmt = rng.choice(["{P}{W}", "{p}_{w}", "{P}_{W}", "{W}From{P}", "{P}.{w}", "{P}{W}"])
        h = fmt.format(P=p, W=word, p=p.lower(), w=word.lower())
        add(Cand(h, "trade_place", trade=trade, regions=regions, counties=counties))
    # trade + number/year
    while sum(c.style == "trade_number" for c in out) < 30:
        trade = rng.choice(TRADES)
        w = rng.choice(TRADE_NUM_WORDS[trade])
        n = rng.choice([str(rng.randint(86, 99)), f"0{rng.randint(0, 6)}", str(rng.randint(100, 999)), "200amp", "12_2", "3way"])
        h = rng.choice(["{w}_{n}", "{w}{n}"]).format(w=w, n=n)
        add(Cand(h, "trade_number", trade=trade))
    # job-site humor
    humor = [(h, t) for t, hs in HUMOR.items() for h in hs]
    rng.shuffle(humor)
    for h, t in humor[:30]:
        add(Cand(h, "humor", trade=t))
    # first name + initial / nickname
    while sum(c.style == "name" for c in out) < 34:
        f = rng.choice(FIRSTS)
        trade = rng.choice(TRADES + [None])
        short = TRADE_SHORT[trade] if trade else rng.choice(["tools", "trades", "nj"])
        fmt = rng.choice(["{F}_{I}", "{f}.{s}", "big_{f}_{s}", "{F}{I}{yy}", "{f}_the_{s}", "{F}.{I}", "{f}{s}{yy}"])
        h = fmt.format(F=f, f=f.lower(), I=chr(rng.randint(65, 90)), s=short, yy=rng.randint(70, 99))
        add(Cand(h, "name", trade=trade if "{s}" in fmt and trade else None))
    # role / status (juniors only)
    for h, t in ROLE_STATUS:
        add(Cand(h, "role_status", trade=t, role="junior"))
    for age in rng.sample(range(26, 44), 4):
        add(Cand(rng.choice(["Switched_at{a}", "CareerSwitch{a}", "StartedAt{a}"]).format(a=age), "role_status", role="junior"))
    for yr in (25, 26, 27):
        add(Cand(rng.choice(["VoTech_Class{y}", "VoTechClassOf{y}", "TechSchool{y}"]).format(y=yr), "role_status", role="junior"))
    # NJ flavor
    for h, t, regs in NJ_FLAVOR:
        add(Cand(h, "nj_flavor", trade=t, regions=set(regs) if regs else NJ))
    # lazy / old
    while sum(c.style == "lazy_old" for c in out) < 28:
        region = rng.choice(list(AREA_CODES))
        code = rng.choice(AREA_CODES[region])
        f = rng.choice(FIRSTS).lower()
        trade = rng.choice(TRADES)
        t3 = {"electrical": "elec", "plumbing": "plumb", "hvac": "hvac"}[trade]
        st = "ny" if region == "NYC" else "nj"
        fmt = rng.choice(["{f}{d4}", "{i}{t}{st}", "{t}guy{c}", "sparky{c}", "{f}_{c}", "{f}{i1}{yy}", "{t}{st}{yy}"])
        if fmt == "sparky{c}":
            trade = "electrical"
        h = fmt.format(f=f, d4=rng.randint(1000, 9999), i="".join(chr(rng.randint(97, 122)) for _ in range(2)),
                       t=t3, st=st, c=code, i1=chr(rng.randint(97, 122)), yy=rng.randint(75, 99))
        uses_trade = "{t}" in fmt or fmt == "sparky{c}"
        uses_place = "{c}" in fmt or "{st}" in fmt
        add(Cand(h, "lazy_old", trade=trade if uses_trade else None, regions={region} if uses_place else None))
    return out


def offline_checks(cands: list[Cand], db_url: str | None) -> None:
    conn = None
    taken: set[str] = set()
    if db_url:
        import psycopg

        assert_local_db(db_url)
        conn = psycopg.connect(db_url, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                "select lower(username) from profiles where seed_batch_id is distinct from %s", (BATCH_ID,)
            )
            taken = {r[0] for r in cur.fetchall()}
    kept: list[str] = []
    for c in cands:
        h = c.handle
        if not (4 <= len(h) <= 22) or not all(ch.isalnum() or ch in "_." for ch in h) or h[0] == "." or h[-1] == ".":
            c.status, c.note = "rejected_rule", "format (4-22, [A-Za-z0-9_.], no edge dot)"
            continue
        if conn:
            with conn.cursor() as cur:
                cur.execute("select public.handle_format_error(%s), public.is_reserved_handle(%s)", (h, h))
                fmt_err, reserved = cur.fetchone()
            if fmt_err:
                c.status, c.note = "rejected_rule", f"app format: {fmt_err}"
                continue
            if reserved:
                c.status, c.note = "rejected_rule", "app reserved/blocked list"
                continue
        if h.lower() in taken:
            c.status, c.note = "rejected_rule", "existing Home Fixr user"
            continue
        near = next((k for k in kept if levenshtein(k, h) <= 1), None)
        if near:
            c.status, c.note = "rejected_neardup", f"Levenshtein<=1 to {near}"
            continue
        kept.append(h)
        c.status = "passed_offline"
    if conn:
        conn.close()


def reddit_check(cands: list[Cand], rng: random.Random, enabled: bool) -> str:
    """Returns 'ok' | 'blocked' | 'disabled'."""
    todo = [c for c in cands if c.status == "passed_offline"]
    if not enabled:
        for c in todo:
            c.status, c.note = "unverified", "reddit check disabled (--no-reddit)"
        return "disabled"
    consecutive_403 = 0
    any_definitive = False
    last = 0.0
    for idx, c in enumerate(todo):
        attempt, backoff = 0, 5.0
        while True:
            wait = MIN_INTERVAL + rng.uniform(0.2, 0.8) - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
            last = time.monotonic()
            c.checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            req = urllib.request.Request(
                f"https://www.reddit.com/user/{c.handle}/about.json",
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    code = r.status
            except urllib.error.HTTPError as e:
                code = e.code
                retry_after = e.headers.get("Retry-After")
            except Exception as e:  # network error
                code, retry_after = None, None
                c.note = f"network error: {type(e).__name__}"
            else:
                retry_after = None
            if code == 429 and attempt < 3:
                attempt += 1
                delay = max(backoff, float(retry_after) if retry_after and retry_after.isdigit() else 0)
                time.sleep(delay)
                backoff *= 2
                continue
            break
        c.http = str(code) if code is not None else "error"
        if code == 404:
            c.status, c.note = "free", "reddit 404"
            any_definitive = True
            consecutive_403 = 0
        elif code == 200:
            c.status, c.note = "taken", "reddit 200 (account exists) - rejected"
            any_definitive = True
            consecutive_403 = 0
        else:
            c.status = "unverified"
            c.note = c.note or (f"reddit {code}" + (" after retries" if code == 429 else ""))
            consecutive_403 = consecutive_403 + 1 if code == 403 else 0
        if consecutive_403 >= BLOCK_THRESHOLD and not any_definitive:
            for rest in todo[idx + 1:]:
                rest.status = "unverified"
                rest.note = "not checked: reddit returned 403 to every request (persistent block); not worked around"
            return "blocked"
    return "ok"


def reuse_previous_log(cands: list[Cand]) -> str:
    """Copy Reddit outcomes from the last run so re-runs don't re-hit Reddit."""
    log = SEED_DIR / "handles_checked.csv"
    prior = {r["candidate"].lower(): r for r in csv.DictReader(log.open())}
    blocked = any("persistent block" in r["note"] for r in prior.values())
    for c in cands:
        if c.status != "passed_offline":
            continue
        r = prior.get(c.handle.lower())
        if r and r["status"] in ("free", "taken", "unverified"):
            c.status, c.http, c.checked_at, c.note = r["status"], r["http"], r["checked_at"], r["note"]
        else:
            c.status, c.note = "unverified", "not in previous log"
    return "blocked" if blocked else "ok"


def assign(cands: list[Cand], rng: random.Random, accept: set[str]) -> list[dict]:
    pool = [c for c in cands if c.status in accept]
    slots = all_slots()
    used: set[str] = set()
    result = []
    # Style quotas for the 121 non-curated handles (plan §3: spread across all
    # shapes, NJ flavor 10-15%, ~15% lazy/old).
    quota = {"trade_place": 24, "trade_number": 16, "humor": 16, "name": 20,
             "role_status": 12, "nj_flavor": 15, "lazy_old": 20, "curated_senior": 15}
    style_used: dict[str, int] = {}

    def score(c: Cand, s) -> float | None:
        if c.slot and c.slot != s.slot_id:
            return None
        if c.role and c.role != s.role:
            return None
        if c.trade and c.trade != s.trade:
            return None
        if c.regions and s.region not in c.regions:
            return None
        if c.counties and s.county not in c.counties:
            return None
        sc = 0.0
        sc += 10 if c.slot == s.slot_id else 0
        sc += 2 if c.trade == s.trade else 0
        sc += 2 if c.counties and s.county in c.counties else 0
        sc += 1 if c.regions and s.region in c.regions else 0
        sc += 4 if style_used.get(c.style, 0) < quota.get(c.style, 0) else -4
        return sc + rng.random()

    # Seniors first, then the most constrained juniors (NYC, general).
    order = sorted(slots, key=lambda s: (s.role != "senior", s.region != "NYC", s.trade != "general", s.slot_id))
    for s in order:
        best, best_sc = None, -1.0
        for c in pool:
            if c.handle in used:
                continue
            sc = score(c, s)
            if sc is not None and sc > best_sc:
                best, best_sc = c, sc
        if best is None:
            raise SystemExit(f"no handle fits slot {s.slot_id} ({s.role}/{s.trade}/{s.region}); add candidates")
        used.add(best.handle)
        style_used[best.style] = style_used.get(best.style, 0) + 1
        result.append({
            "handle": best.handle,
            "slot_id": s.slot_id,
            "role": s.role,
            "trade": s.trade,
            "region": s.region,
            "county": s.county,
            "style": best.style,
            "reddit_status": best.status,
            "reddit_http": best.http,
            "checked_at": best.checked_at,
        })
    result.sort(key=lambda r: r["slot_id"])
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-url", default=LOCAL_DB_URL)
    ap.add_argument("--no-db", action="store_true", help="skip the Home Fixr DB checks")
    ap.add_argument("--no-reddit", action="store_true")
    ap.add_argument("--reuse-log", action="store_true",
                    help="re-use Reddit results from the existing handles_checked.csv instead of re-requesting")
    args = ap.parse_args()

    rng = random.Random(RNG_SEED)
    cands = generate(rng)
    print(f"generated {len(cands)} candidates")
    offline_checks(cands, None if args.no_db else args.db_url)
    print(f"passed offline checks: {sum(c.status == 'passed_offline' for c in cands)}")

    if args.reuse_log:
        reddit = reuse_previous_log(cands)
    else:
        reddit = reddit_check(cands, random.Random(RNG_SEED + 1), enabled=not args.no_reddit)
    print(f"reddit: {reddit}")

    log = SEED_DIR / "handles_checked.csv"
    with log.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["candidate", "style", "status", "http", "checked_at", "note"])
        for c in cands:
            w.writerow([c.handle, c.style, c.status, c.http, c.checked_at or datetime.now(timezone.utc).isoformat(timespec="seconds"), c.note])
    print(f"wrote {log}")

    accept = {"free"} if reddit == "ok" else {"free", "unverified"}
    assigned = assign(cands, random.Random(RNG_SEED + 2), accept)
    meta = {
        "batch_id": BATCH_ID,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reddit_check": reddit,
        "note": (
            "All handles passed the app's format/reserved/DB checks and Levenshtein>1 within the roster. "
            + ("Every handle has a Reddit 404." if reddit == "ok" else
               "Reddit could not be checked (see handles_checked.csv); every handle is UNVERIFIED against Reddit and must be re-checked before production use.")
        ),
        "handles": assigned,
    }
    write_json("personas/handles.json", meta)
    styles: dict[str, int] = {}
    for a in assigned:
        styles[a["style"]] = styles.get(a["style"], 0) + 1
    print(f"assigned {len(assigned)} handles; styles: {styles}")


if __name__ == "__main__":
    main()
