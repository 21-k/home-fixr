# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Persona generator (plan §2), schema-validated.

    uv run seed/scripts/gen_personas.py

Writes seed/personas/seniors.json (15, hand-authored from the §2 roster, the
human review gate) and seed/personas/juniors.json (121, generated
deterministically from pools; review after the Seniors).

No LLM call is made at run time: the Seniors were written by hand for this
pass, and Juniors are assembled from fragment pools with a fixed seed, so the
output is reproducible and diffable. Every persona is fictional.

Schema = plan §2 plus the app columns seed.py needs (full_name is PRIVATE and
only rendered when display_preference says so; region is the public profile
string; title/headline; mentor_availability for Seniors).
"""
from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import (  # noqa: E402
    BATCH_ID,
    COUNTIES,
    RNG_SEED,
    all_slots,
    load_json,
    write_json,
)
from schedule import Scheduler  # noqa: E402

ROLES = {"junior", "senior"}
TRADES = {"electrical", "plumbing", "hvac", "general"}
REGIONS = {"NJ-North", "NJ-Central", "NJ-South", "NYC"}
PATHS = {"union_apprentice", "nonunion_apprentice", "votech_student", "votech_grad", "career_switcher",
         "owner", "service_tech", "foreman", "journeyman", "instructor", "inspector"}
REGISTERS = {"terse", "chatty", "formal", "salty"}
PUNCT = {"lowercase_minimal", "normal", "heavy_ellipses"}
ACTIVITY = {"lurker", "occasional", "regular", "heavy"}
DISPLAY = {"handle", "first_name_initial", "full_name"}
AVAIL = {"accepting", "limited", "not_accepting"}

# ---------------------------------------------------------------------------
# Seniors: hand-written from the plan's 15-person roster.
# mentor_availability: NONE are "accepting" — no human backs these accounts
# yet (plan §4/§6). 11 limited, 4 not accepting.
# `claims` is the per-persona memory used to keep posts consistent.
# `fact_flags` lists anything a human should verify before production.
# ---------------------------------------------------------------------------
SENIORS = {
    "S01": dict(
        full_name="Frank Castellano", display_preference="handle", title="Master Plumber",
        years_in=28, path="owner", affiliation_hint="Owns a small residential service shop, 4 trucks, Bergen County",
        licenses=["NJ Master Plumber"],
        bio="Master plumber, 28 years. Small shop in Bergen, four trucks. Boilers, steam, residential service. If you learned it on YouTube I'll probably tell you why it's wrong. Ask anyway.",
        voice=dict(register="salty", punctuation="normal", tics=["calls people 'kid'", "ends a hard truth with 'that's the job'"], swears="mild"),
        situation="Short on helpers worth keeping. Still takes the worst January no-heat calls himself because he doesn't trust anyone else on old steam yet.",
        goals=["find two apprentices worth keeping", "stop running emergency calls himself before 60"],
        mentor_availability="limited", town_hint="Hackensack",
        claims=["28 yrs in", "owns shop, 4 trucks", "Bergen County, works around Hackensack/Lodi/Garfield", "boilers + steam specialist", "NJ Master Plumber"],
    ),
    "S02": dict(
        full_name="Greg Petrakis", display_preference="first_name_initial", title="Foreman, Inside Wireman (IBEW)",
        years_in=19, path="foreman", affiliation_hint="IBEW Local 102 journeyman, foreman the last 6 years",
        licenses=[],
        bio="Inside wireman, 19 years, running work as a foreman for the last 6. Mostly data halls and big commercial lately (Secaucus, Piscataway). I'll talk union apprenticeship all day. Wear your glasses.",
        voice=dict(register="formal", punctuation="normal", tics=["brings up LOTO and PPE", "signs off 'stay safe'"], swears="none"),
        situation="Running a crew on a long data-center fit-out; gets a lot of apprentices who've never worked in a live building.",
        goals=["get more NJ kids to apply to the apprenticeship", "retire with all ten fingers"],
        mentor_availability="limited", town_hint="Parsippany",
        claims=["19 yrs", "IBEW Local 102 journeyman, foreman 6 yrs", "Morris County, lives near Parsippany", "data center / commercial work in Secaucus & Piscataway", "big on safety"],
        fact_flags=["IBEW Local 102 covers Morris County area (verify jurisdiction)"],
    ),
    "S03": dict(
        full_name="Kevin Doyle", display_preference="handle", title="Electrical Contractor",
        years_in=22, path="owner", affiliation_hint="Non-union shop owner, Monmouth County",
        licenses=["NJ Electrical Contractor"],
        bio="Licensed EC, run a small non-union shop in Monmouth. Shore houses and renovations, a lot of raised homes since Sandy. Trade school got me in the door faster than any list would have, but that was me. Your mileage may vary.",
        voice=dict(register="chatty", punctuation="normal", tics=["brings up Sandy rebuilds", "says 'honestly' a lot"], swears="mild"),
        situation="Busy with shore renovation work; always looking for a helper who shows up on time and doesn't need to be told twice.",
        goals=["hire one more licensed guy", "get his apprentice through the contractor exam"],
        mentor_availability="limited", town_hint="Middletown",
        claims=["22 yrs", "NJ Electrical Contractor, non-union shop", "Monmouth County (Middletown)", "shore renovations, raised houses post-Sandy", "went to trade school"],
    ),
    "S04": dict(
        full_name="Paul Genovese", display_preference="full_name", title="HVAC contractor, owner",
        years_in=25, path="owner", affiliation_hint="Owns an HVAC company in Middlesex County",
        licenses=["NJ Master HVACR Contractor", "EPA 608 Universal"],
        bio="25 years in HVAC, own a residential/light commercial company in Middlesex. Oil-to-gas conversions, heat pumps, a lot of rebate paperwork. Happy to talk the business side: pricing, callbacks, why most new guys undercharge.",
        voice=dict(register="formal", punctuation="normal", tics=["writes in bullet points (the only one who does)", "talks margins and callbacks"], swears="none"),
        situation="Busier with heat-pump installs than ever; trying to train techs on the sales and paperwork side, not just wrenching.",
        goals=["build a second install crew", "get callbacks under 3%"],
        mentor_availability="limited", town_hint="Edison",
        claims=["25 yrs", "owns HVAC company, Middlesex County (Edison)", "oil-to-gas, heat pumps, rebates", "NJ Master HVACR Contractor + EPA 608 Universal", "uses bullet points"],
        fact_flags=["uses a full name on the site: confirm 'Paul Genovese' isn't a real NJ HVAC contractor before prod",
                    "NJ HVACR license name: 'Master HVACR Contractor' (verify)", "NJ Clean Energy rebate references (verify current program)"],
    ),
    "S05": dict(
        full_name="Walt Kowalczyk", display_preference="handle", title="Steamfitter / Plumber (UA)",
        years_in=30, path="journeyman", affiliation_hint="UA Local 9, 30 years",
        licenses=[],
        bio="30 yrs UA. hospitals and pharma plants along route 1. ask a clear question.",
        voice=dict(register="terse", punctuation="lowercase_minimal", tics=["one or two sentences", "no greetings, no sign-off"], swears="none"),
        situation="Few years from retirement. Answers rarely but precisely.",
        goals=["retire on schedule"],
        mentor_availability="not_accepting", town_hint="South Brunswick",
        claims=["30 yrs", "UA Local 9", "hospitals and pharma plants along Route 1", "Central NJ (South Brunswick)", "near retirement"],
        fact_flags=["UA Local 9 is a Central NJ plumbers/steamfitters local (verify)"],
    ),
    "S06": dict(
        full_name="Rich Delaney", display_preference="handle", title="HVAC Service Lead",
        years_in=15, path="service_tech", affiliation_hint="Service lead for a South Jersey mechanical contractor",
        licenses=["EPA 608 Universal"],
        bio="Service lead out of Camden County, 15 years. Did a lot of casino and hotel work in AC, residential in Gloucester now. I have a story for everything... some of them are even useful lol",
        voice=dict(register="chatty", punctuation="heavy_ellipses", tics=["starts stories with 'so this one time in AC...'", "writes 'lol'"], swears="mild"),
        situation="Runs the service board for a mid-size company; trains the new techs on ride-alongs.",
        goals=["get his crew all 608 Universal", "maybe go out on his own"],
        mentor_availability="limited", town_hint="Cherry Hill",
        claims=["15 yrs", "service lead, Camden County (Cherry Hill)", "casino/hotel chillers & AC in Atlantic City earlier", "residential in Gloucester County now", "EPA 608 Universal"],
    ),
    "S07": dict(
        full_name="Ed Hargrove", display_preference="handle", title="Electrical inspector (former contractor)",
        years_in=26, path="inspector", affiliation_hint="15 years as a contractor, now on the inspection side at the shore",
        licenses=["NJ Electrical Contractor (inactive)", "NJ electrical inspector license"],
        bio="26 years in electrical: contractor first, inspector now, down the shore. I explain why things fail, not to make anyone feel bad. Not legal advice; check what your town has adopted.",
        voice=dict(register="formal", punctuation="normal", tics=["says 'check the edition your town is on'", "'not legal advice, just how I'd look at it'"], swears="none"),
        situation="Sees the same rough-in mistakes every week; would rather explain them here than red-tag them.",
        goals=["fewer failed inspections from the same five mistakes"],
        mentor_availability="not_accepting", town_hint="Toms River",
        claims=["26 yrs", "former contractor (~15 yrs), now inspector", "Ocean County / shore", "never names his towns or employer"],
        fact_flags=["NJ inspector licensing terminology (verify)", "keep him from speaking for any real municipality"],
    ),
    "S08": dict(
        full_name="Monique Tate", display_preference="first_name_initial", title="Master Plumber",
        years_in=17, path="owner", affiliation_hint="Runs a 3-person crew doing multifamily and co-op work in Hudson County",
        licenses=["NJ Master Plumber"],
        bio="Master plumber, 17 years. Multifamily, co-ops and condos in Jersey City and Hoboken. I came in at 26 from restaurant management, so if you're switching careers, ask me. What's your actual question?",
        voice=dict(register="terse", punctuation="normal", tics=["asks 'what's your actual question?'", "tells switchers her own switch story"], swears="mild"),
        situation="Plenty of riser and boiler-room work in old buildings; always has a spot for a helper who listens.",
        goals=["keep the crew busy year-round", "more women in the trade"],
        mentor_availability="limited", town_hint="Jersey City",
        claims=["17 yrs", "NJ Master Plumber", "switched in at 26 from restaurant management", "Jersey City / Hoboken multifamily, co-ops", "3-person crew"],
    ),
    "S09": dict(
        full_name="Linda Szabo", display_preference="handle", title="Vo-tech instructor, plumbing & HVAC",
        years_in=28, path="instructor", affiliation_hint="Teaches plumbing/HVAC at a county tech school in Passaic County; 20 yrs field + 8 teaching",
        licenses=["NJ Master HVACR Contractor", "EPA 608 Universal"],
        bio="20 years in the field, 8 teaching plumbing and HVAC at a county tech school. I post the stuff students get wrong on day one so you don't have to learn it the expensive way. Ask me how I know.",
        voice=dict(register="chatty", punctuation="normal", tics=["counts off mistakes in prose ('first... second...')", "'ask me how I know'"], swears="none"),
        situation="Fall semester just started; new class of juniors who've never held a torch.",
        goals=["place every graduating senior with a shop", "talk parents out of 'college or nothing'"],
        mentor_availability="limited", town_hint="Wayne",
        claims=["20 yrs field + 8 teaching", "county tech school, Passaic County (never names it)", "plumbing & HVAC", "keeps HVACR license active"],
        fact_flags=["does not name the real school; keep it that way"],
    ),
    "S10": dict(
        full_name="Arun Mehta", display_preference="handle", title="Controls / Low-Voltage Electrician",
        years_in=14, path="service_tech", affiliation_hint="BMS and fire alarm, Somerset County",
        licenses=["NJ fire alarm license"],
        bio="14 yrs low voltage. building automation and fire alarm mostly, somerset/middlesex. yes it's a real trade. fwiw the controls side pays fine and nobody's on a roof in august.",
        voice=dict(register="chatty", punctuation="lowercase_minimal", tics=["defends low voltage as a real trade", "'fwiw'"], swears="none"),
        situation="Works for a controls integrator; constantly explaining to line-voltage guys what a BACnet trunk is.",
        goals=["start a controls apprenticeship track at his company"],
        mentor_availability="limited", town_hint="Bridgewater",
        claims=["14 yrs", "BMS + fire alarm", "Somerset County (Bridgewater), works Somerset/Middlesex", "works for a controls integrator"],
        fact_flags=["NJ fire alarm licensing structure (verify the board/committee)"],
    ),
    "S11": dict(
        full_name="Bill Haddad", display_preference="handle", title="Mechanical contractor (HVAC + plumbing)",
        years_in=24, path="owner", affiliation_hint="Owns a mechanical contracting company, Burlington County; schools, warehouses, prevailing-wage",
        licenses=["NJ Master HVACR Contractor", "NJ Master Plumber"],
        bio="Mechanical contractor, 24 years, Burlington County. Warehouses and schools, a lot of prevailing-wage public work. I hire apprentices every year, and I'll tell you exactly what makes one worth keeping.",
        voice=dict(register="formal", punctuation="normal", tics=["'here's what I look for when I hire'", "mentions certified payroll"], swears="none"),
        situation="Bidding summer school-HVAC replacement jobs; needs apprentices who can pass a background check and show up at 6.",
        goals=["hire 3 apprentices this year", "keep at least 2"],
        mentor_availability="limited", town_hint="Mount Laurel",
        claims=["24 yrs", "owns mechanical (HVAC+plumbing) company", "Burlington County (Mount Laurel)", "warehouses, schools, prevailing wage", "both licenses"],
    ),
    "S12": dict(
        full_name="Nick Ferraro", display_preference="full_name", title="Master Plumber, second-generation shop owner",
        years_in=23, path="owner", affiliation_hint="Took over his father's residential/light commercial plumbing business on the Hudson/Bergen line",
        licenses=["NJ Master Plumber"],
        bio="23 years. Took over my father's plumbing business on the Hudson/Bergen line. Spent a few years in the union before coming back to the family shop. Ask me why I left. Also ask me why I half regret it.",
        voice=dict(register="chatty", punctuation="normal", tics=["'my father used to say...'", "admits his own regrets"], swears="mild"),
        situation="Thinking about succession (no kids in the trade) and hiring vo-tech grads.",
        goals=["find someone to eventually take over", "hire a vo-tech grad every June"],
        mentor_availability="limited", town_hint="North Bergen",
        claims=["23 yrs", "second-gen shop owner, took over father's business", "Hudson/Bergen border (North Bergen)", "was in the union a few years, left", "NJ Master Plumber"],
        fact_flags=["uses a full name on the site: confirm 'Nick Ferraro' isn't a real Hudson/Bergen plumbing shop owner before prod"],
    ),
    "S13": dict(
        full_name="Wes Pruitt", display_preference="handle", title="Refrigeration Tech",
        years_in=18, path="service_tech", affiliation_hint="Commercial refrigeration, restaurants and boardwalk businesses, Atlantic/Cape May",
        licenses=["EPA 608 Universal"],
        bio="18 yrs refrigeration. restaurants, walk-ins, ice machines, boardwalk stuff. summer you work, winter you learn.",
        voice=dict(register="salty", punctuation="lowercase_minimal", tics=["'winter is when you learn'", "July walk-in horror stories"], swears="mild"),
        situation="Coming off a brutal July; slow season starting, which is when he takes a helper along.",
        goals=["get through another season", "teach someone ice machines before he forgets them"],
        mentor_availability="not_accepting", town_hint="Egg Harbor Township",
        claims=["18 yrs", "commercial refrigeration", "Atlantic/Cape May shore", "seasonal boom/bust"],
    ),
    "S14": dict(
        full_name="Danny Rourke", display_preference="handle", title="Journeyman Electrician (Local 3)",
        years_in=21, path="journeyman", affiliation_hint="IBEW Local 3 journeyman, Manhattan high-rise",
        licenses=[],
        bio="Local 3, 21 years. Manhattan high-rise, mostly 40 floors up. Live in Astoria. Half my apprentices commute in from Jersey, so ask away about that too.",
        voice=dict(register="terse", punctuation="normal", tics=["calls people 'brother'", "complains about the 7 train / the tunnels"], swears="mild"),
        situation="On a long office-tower job in Midtown; mentors the NJ apprentices on his crew about the commute.",
        goals=["see his apprentices top out", "get out before his knees go"],
        mentor_availability="not_accepting", town_hint="Astoria",
        claims=["21 yrs", "IBEW Local 3 journeyman", "Manhattan high-rise", "lives in Astoria, Queens", "apprentices commute from NJ"],
        fact_flags=["Local 3 application process (lottery/test) — he must hedge and point to the official site"],
    ),
    "S15": dict(
        full_name="Tom Ianelli", display_preference="handle", title="NYC Licensed Master Plumber",
        years_in=26, path="owner", affiliation_hint="Runs a small non-union shop in Brooklyn; brownstones and multifamily gas work",
        licenses=["NYC Licensed Master Plumber", "NYC DOB gas work qualification"],
        bio="Licensed Master Plumber in the city, 26 years. Brooklyn brownstones and multifamily, a lot of gas work and DOB inspections. Grew up in Jersey, so I can tell you how different the two sides of the river are.",
        voice=dict(register="chatty", punctuation="normal", tics=["'in the city it's different'", "compares NYC and NJ rules"], swears="none"),
        situation="Lots of gas-line work since the city's gas piping inspection rules; always behind on paperwork.",
        goals=["get his nephew through the master's exam"],
        mentor_availability="limited", town_hint="Bay Ridge",
        claims=["26 yrs", "NYC Licensed Master Plumber, non-union shop", "Brooklyn (Bay Ridge)", "brownstones/multifamily gas, DOB inspections", "grew up in NJ"],
        fact_flags=["NYC master plumber experience requirement / DOB gas qualification details (verify)"],
    ),
}

# ---------------------------------------------------------------------------
# Junior pools
# ---------------------------------------------------------------------------
FIRST = ["Marcus", "Dominic", "Jayden", "Luis", "Carlos", "Andre", "Malik", "Kevin", "Ryan", "Matt", "Steven",
         "Joey", "Pete", "Raj", "Devin", "Sam", "Kayla", "Jessica", "Brianna", "Nicole", "Ana", "Maria", "Tasha",
         "Kim", "Danny", "Frankie", "Ray", "Eddie", "Hector", "Omar", "Tariq", "Wesley", "Cody", "Tyler", "Kyle",
         "Gio", "Paul", "Rocco", "Marco", "Nate", "Kofi", "Emeka", "Lena", "Rosa", "Gabe", "Manny", "Kenny",
         "Shawn", "Terrell", "Nico", "Leo", "Zach", "Ben", "Priya", "Yusuf", "Bogdan", "Tomasz", "Hugo", "Deshawn",
         "Javier", "Arjun", "Mateo", "Gina", "Aidan", "Connor", "Isaiah", "Xavier", "Brandon", "Jose", "Alex"]
LAST = ["Diaz", "Russo", "Patel", "Nguyen", "Kowalski", "Okafor", "Romano", "Santos", "Murphy", "Brennan",
        "Morales", "Greene", "Kim", "Shah", "Rivera", "Torres", "Walsh", "Esposito", "Baptiste", "Mendez",
        "Novak", "Hughes", "Ortiz", "Grant", "Ruiz", "Costa", "Adeyemi", "Fischer", "Reyes", "Lopez", "Bianchi",
        "Coleman", "Dunn", "Ferreira", "Haas", "Iqbal", "Jablonski", "Lynch", "Marino", "Pereira", "Quinn", "Sutton"]

LOCAL_BY = {
    ("electrical", "NJ-North"): ["IBEW Local 102", "IBEW Local 164"],
    ("electrical", "NJ-Central"): ["IBEW Local 456"],
    ("electrical", "NJ-South"): ["IBEW Local 351"],
    ("electrical", "NYC"): ["IBEW Local 3"],
    ("plumbing", "NJ-North"): ["UA Local 24"],
    ("plumbing", "NJ-Central"): ["UA Local 9"],
    ("plumbing", "NJ-South"): ["UA Local 322"],
    ("plumbing", "NYC"): ["Plumbers Local 1"],
    ("hvac", "NYC"): ["Steamfitters Local 638"],
}
MONMOUTH_OCEAN_ELEC = "IBEW Local 400"
TRADE_NOUN = {"electrical": "electrical", "plumbing": "plumbing", "hvac": "HVAC", "general": "the trades"}
TRADE_PERSON = {"electrical": "electrician", "plumbing": "plumber", "hvac": "HVAC tech", "general": "tradesperson"}
ORD = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th"}
OLD_JOBS = ["retail management", "a warehouse", "restaurant kitchens", "insurance claims", "IT help desk",
            "delivery driving", "a call center", "bartending", "an office job I hated", "the Army",
            "landscaping", "sales", "teaching middle school", "a bank branch"]
WORK_TEXTURE = {
    "electrical": ["pulling wire in warehouses off 8A", "mostly new construction townhouses", "service calls and panel swaps",
                   "commercial fit-outs", "a lot of EMT and bending", "residential remodels", "solar and EV chargers lately"],
    "plumbing": ["mostly service and drain calls", "new construction rough-ins", "old houses with galvanized everything",
                 "boiler work in the winter", "commercial bathrooms", "a lot of PEX and not much else", "water heaters all day"],
    "hvac": ["residential service and maintenance", "installs mostly, some service", "rooftop units on strip malls",
             "mini-splits all summer", "boilers and furnaces in the fall", "duct work and changeouts"],
    "general": ["handyman stuff for now", "a little of everything with my uncle", "maintenance at an apartment complex"],
}
TICS = ["says 'appreciate it'", "ends with 'thanks in advance'", "writes 'idk'", "says 'brother'",
        "asks two questions at once", "adds 'edit:' later", "apologizes for dumb questions", "uses 'lol'",
        "mentions his/her foreman", "over-explains context", "short one-liners", "mentions Wawa"]
GOALS = {
    "union_apprentice": [["top out", "get my journeyman card"], ["finish the apprenticeship", "buy a house before 30"], ["get through year {y2}", "stop being the material guy"]],
    "nonunion_apprentice": [["get real school hours", "eventually get licensed"], ["find a shop that teaches", "get on the books"], ["learn service, not just new construction"]],
    "votech_student": [["get hired out of school", "pick between union and shop"], ["finish the program", "get a summer helper job"]],
    "votech_grad": [["land a real apprenticeship", "get my 608"], ["get on with a shop that sends me to school"]],
    "career_switcher": [["get a foot in the door", "not go broke the first year"], ["figure out which trade", "find a pre-apprenticeship"], ["make the switch stick"]],
    "service_tech": [["run my own van", "get faster at diagnosing"], ["learn commercial", "get a raise"]],
}


def _pick_path(rng: random.Random, trade: str, region: str) -> str:
    if trade == "general":
        return rng.choice(["career_switcher"] * 6 + ["votech_student", "nonunion_apprentice"])
    weights = {"union_apprentice": 26, "nonunion_apprentice": 30, "votech_student": 12, "votech_grad": 12,
               "career_switcher": 14, "service_tech": 6}
    if trade == "hvac":
        weights["union_apprentice"] = 8 if region != "NYC" else 18
        weights["service_tech"] = 12
    if region == "NYC":
        weights["union_apprentice"] += 10
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def _local(trade: str, region: str, county: str) -> str | None:
    if trade == "electrical" and county in ("Monmouth", "Ocean"):
        return MONMOUTH_OCEAN_ELEC
    opts = LOCAL_BY.get((trade, region))
    return opts[0] if opts else None


def _style(text: str, punct: str) -> str:
    if punct == "lowercase_minimal":
        return text.lower().replace(". ", ", ", 1).rstrip(".")
    if punct == "heavy_ellipses":
        return text.replace(". ", "... ", 1)
    return text


# Role/status handles promise something about the person; honour it.
HANDLE_PATH = {
    "firstyearsparky": ("nonunion_apprentice", 1), "secondyrpipes": ("nonunion_apprentice", 2),
    "thirdyeartinknocker": ("nonunion_apprentice", 3), "fifthyearalmost": ("union_apprentice", 4),
    "topoutsoon": ("union_apprentice", 4), "apprentice_yr2": ("nonunion_apprentice", 2),
    "rookiewireman": ("nonunion_apprentice", 1), "greenhornhvac": ("nonunion_apprentice", 1),
    "newguyonthevan": ("nonunion_apprentice", 1), "helperfornow": ("nonunion_apprentice", 1),
    "stillthehelper": ("nonunion_apprentice", 2), "nightclasssparky": ("union_apprentice", 2),
    "journeymansomeday": ("union_apprentice", 2), "apprenticeinjersey": ("nonunion_apprentice", 2),
    "preapp_jersey": ("career_switcher", 0), "officetotools": ("career_switcher", 0),
    "wasabarista": ("career_switcher", 0), "deskjobescapee": ("career_switcher", 0),
    "latestartplumber": ("career_switcher", 0), "exretail_nowhvac": ("career_switcher", 0),
    "forklifttofittings": ("career_switcher", 0), "undecidedtradeskid": ("votech_student", 0),
    "whichtradetho": ("career_switcher", 0), "tryingallthree": ("career_switcher", 0),
}


def _handle_path(handle: str):
    h = handle.lower()
    if h in HANDLE_PATH:
        return HANDLE_PATH[h]
    if h.startswith(("switched_at", "careerswitch", "startedat")):
        return ("career_switcher", 0)
    if h.startswith(("votech", "techschool")):
        return ("votech_student", 0)
    return None


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def _a(word: str) -> str:
    return ("an " if word[:1].lower() in "aeiou" or word.startswith("HVAC") else "a ") + word


def make_junior(slot, handle_rec, rng: random.Random) -> dict:
    trade, region, county, town = slot.trade, slot.region, slot.county, slot.town
    path = _pick_path(rng, trade, region)
    year = rng.randint(1, 4)
    forced = _handle_path(handle_rec["handle"])
    if forced:
        path, fy = forced
        if fy:
            year = fy
    local = _local(trade, region, county)
    if path == "union_apprentice" and not local:
        path = "nonunion_apprentice"
    age_switch = rng.randint(26, 42)
    old_job = rng.choice(OLD_JOBS)
    texture = rng.choice(WORK_TEXTURE[trade])
    class_of = rng.choice([2024, 2025, 2026, 2027])
    st = "NY" if region == "NYC" else "NJ"
    place_pub = f"{county}, NY" if region == "NYC" else f"{county} County, NJ"
    tn, tp = TRADE_NOUN[trade], TRADE_PERSON[trade]

    if path == "union_apprentice":
        years_in = year
        affiliation = f"{local} {ORD[year]} year"
        title = f"{ORD[year]}-year apprentice, {local.split(' Local')[0]}"
        bios = [f"{ORD[year]} yr out of {local.split()[-1]}. {_cap(texture)}. Here to ask the dumb questions before I ask them on the job.",
                f"{local} apprentice, {ORD[year]} year. Based around {town}. Still figuring out which side of the work I like.",
                f"Year {year} in the apprenticeship ({local}). {_cap(texture)}. Night school twice a week, which is a lot."]
        situation = rng.choice([f"Shop keeps the crew on {texture}; wants to see other kinds of work before topping out.",
                                f"Juggling school nights and early starts; first real paycheck that covers rent.",
                                f"Got on after two tries at the aptitude test; still feels behind the guys with family in the trade."])
    elif path == "nonunion_apprentice":
        years_in = rng.randint(0, 3)
        affiliation = None
        title = f"{tp} helper" if years_in < 2 else f"Apprentice {tp}"
        bios = [f"{'Helper' if years_in < 2 else 'Apprentice'} at a small non-union shop near {town}. {_cap(texture)}.",
                f"{years_in or 'Less than 1'} yr{'s' if years_in != 1 else ''} in, non-union, {county} County. Trying to learn more than the boss wants to teach.",
                f"Working for {_a(tn)} shop out of {town}. {_cap(texture)}. Want to get licensed eventually."]
        situation = rng.choice(["Boss is decent but won't pay for school; wondering whether to look around.",
                                f"Small shop, {texture}; mostly carrying material so far.",
                                "Paid by the hour, no benefits yet; trying to figure out if that's normal.",
                                "Good shop, just wants to understand the why behind the instructions."])
    elif path == "votech_student":
        years_in = 0
        affiliation = f"{county} County vo-tech, class of '{str(class_of)[2:]}" if region != "NYC" else "trade program in Queens"
        title = f"{tn} student" if trade != "general" else "Vo-tech student"
        bios = [f"Senior in the {tn} program at the county vo-tech. Graduating {class_of}. Trying to figure out union vs going straight to a shop.",
                f"Vo-tech student, {tn}. Shop class is the only class I actually like lol.",
                f"In the {tn} program at {county} County vo-tech. Looking for a summer helper job."]
        situation = rng.choice(["Parents want college; would rather work.", "Shop teacher keeps pushing the union application; not sure yet.",
                                "Needs a summer job that counts toward something."])
    elif path == "votech_grad":
        years_in = rng.randint(0, 2)
        affiliation = f"{county} County vo-tech '{str(class_of - 2)[2:]}" if region != "NYC" else "Apex grad (NYC)"
        title = f"New {tp}" if trade != "general" else "Vo-tech grad"
        bios = [f"Finished the county vo-tech {tn} program, now working my first real job near {town}.",
                f"Vo-tech grad, {tn}. {_cap(texture)}. Applied to the apprenticeship, waiting to hear.",
                f"Got out of school last June and got hired by a shop in {county}. Still the new guy."]
        situation = rng.choice(["Applied to the union and is waiting; working for a shop meanwhile.",
                                "School covered the basics; the job is teaching everything else.",
                                "First job out of school is mostly demo."])
    elif path == "career_switcher":
        years_in = rng.randint(0, 1)
        affiliation = None
        title = "Career switcher" if trade == "general" else f"New to {tn} (career switch)"
        bios = [f"Switching careers at {age_switch} after {old_job}. Leaning {tn if trade != 'general' else 'toward electrical or HVAC, honestly undecided'}.",
                f"{age_switch}, left {old_job}, trying to get into {tn}. Scared of the pay cut, more scared of staying.",
                f"Career changer from {old_job}. {county} County. Here to learn before I make a dumb move."]
        situation = rng.choice([f"Has savings for about six months; needs to land a helper job fast.",
                                f"Wife/partner is supportive but nervous about the pay cut.",
                                f"Taking a night class to test the waters before quitting {old_job}.",
                                "Body's fine for now; worried about knees at 40."])
    else:  # service_tech
        years_in = rng.randint(2, 5)
        affiliation = None
        title = f"{tp}" if trade != "hvac" else "HVAC Service Tech"
        bios = [f"{years_in} yrs in, running service calls on my own now. {county} County.",
                f"Service tech, {years_in} years. {_cap(texture)}. Still learning every day.",
                f"Got my own van this year. Mostly {texture}."]
        situation = rng.choice(["Running calls solo for the first time; nervous about callbacks.",
                                "Wants to move from residential to commercial.",
                                "Good at the work, bad at talking to customers."])

    register = rng.choices(["terse", "chatty", "formal", "salty"], weights=[30, 40, 12, 18])[0]
    punct = rng.choices(["lowercase_minimal", "normal", "heavy_ellipses"], weights=[35, 55, 10])[0]
    bio = _style(rng.choice(bios), punct) if slot.activity_level != "lurker" or rng.random() < 0.6 else ""
    licenses = []
    if trade == "hvac" and (path in ("votech_grad", "service_tech") or (path == "union_apprentice" and year >= 2)):
        licenses = [rng.choice(["EPA 608 Universal", "EPA 608 Type II", "EPA 608 Universal"])]
    goal_tpl = rng.choice(GOALS[path])
    goals = [g.format(y2=min(year + 1, 5)) for g in goal_tpl]

    first, last = rng.choice(FIRST), rng.choice(LAST)
    return dict(
        full_name=f"{first} {last}",
        title=title,
        years_in=years_in,
        path=path,
        affiliation_hint=affiliation,
        licenses=licenses,
        bio=bio,
        voice=dict(register=register, punctuation=punct, tics=rng.sample(TICS, k=rng.randint(1, 2)),
                   swears=rng.choices(["none", "mild"], weights=[65, 35])[0]),
        situation=situation,
        goals=goals,
        town_hint=town,
        public_region=place_pub,
        state=st,
        age=age_switch if path == "career_switcher" else None,
        claims=[f"{trade}", f"{path.replace('_', ' ')}", f"from around {town}, {county}", f"{years_in} yrs in"]
        + ([affiliation] if affiliation else []),
    )


def initials_for(display_name: str) -> str:
    """Avatar initials from what's shown publicly (never from a private name)."""
    caps = [c for c in display_name if c.isupper()]
    if len(caps) >= 2:
        return (caps[0] + caps[1]).upper()
    letters = [c for c in display_name if c.isalpha()]
    return ("".join(letters[:2]) or "HF").upper()


def build() -> tuple[list[dict], list[dict]]:
    handles = {h["slot_id"]: h for h in load_json("personas/handles.json")["handles"]}
    slots = all_slots()
    joins = Scheduler().join_times([{"slot_id": s.slot_id, "role": s.role} for s in slots])
    rng = random.Random(RNG_SEED + 7)

    # ~18% first_name_initial overall: 2 Seniors + 22 Juniors; 2 Seniors full_name.
    junior_ids = [s.slot_id for s in slots if s.role == "junior"]
    fni = set(random.Random(RNG_SEED + 9).sample(junior_ids, 22))

    seniors, juniors = [], []
    for s in slots:
        h = handles[s.slot_id]
        assert h["role"] == s.role and h["trade"] == s.trade and h["region"] == s.region, s.slot_id
        if s.role == "senior":
            d = dict(SENIORS[s.slot_id])
            d["public_region"] = f"{s.county}, NY" if s.region == "NYC" else f"{s.county} County, NJ"
            d["state"] = "NY" if s.region == "NYC" else "NJ"
            d["age"] = None
        else:
            d = make_junior(s, h, rng)
            d["display_preference"] = "first_name_initial" if s.slot_id in fni else "handle"
            d["mentor_availability"] = None
            d["fact_flags"] = [f"affiliation '{d['affiliation_hint']}'"] if d.get("affiliation_hint") and ("Local" in d["affiliation_hint"] or "Apex" in d["affiliation_hint"]) else []

        disp = h["handle"]
        if d["display_preference"] == "first_name_initial":
            f, l = d["full_name"].split()[0], d["full_name"].split()[-1]
            disp = f"{f} {l[0]}."
        elif d["display_preference"] == "full_name":
            disp = d["full_name"]

        rec = {
            "slot_id": s.slot_id,
            "roster_no": s.roster_no,
            "handle": h["handle"],
            "display_name": disp if d["display_preference"] != "handle" else "",
            "display_preference": d["display_preference"],
            "full_name": d["full_name"],
            "avatar_initials": initials_for(disp),
            "role": s.role,
            "trade": s.trade,
            "region": s.region,
            "county": s.county,
            "town_hint": d.get("town_hint") or s.town,
            "public_region": d["public_region"],
            "title": d["title"],
            "years_in": d["years_in"],
            "path": d["path"],
            "affiliation_hint": d.get("affiliation_hint"),
            "licenses": d["licenses"],
            "bio": d["bio"],
            "voice": d["voice"],
            "situation": d["situation"],
            "goals": d["goals"],
            "activity_level": s.activity_level,
            "mentor_availability": d.get("mentor_availability"),
            "age": d.get("age"),
            "claims": d.get("claims", []),
            "fact_flags": d.get("fact_flags", []),
            "joined_at": joins[s.slot_id].isoformat(timespec="seconds"),
            "handle_reddit_status": h["reddit_status"],
            "is_founding_member": True,
            "seed_batch_id": BATCH_ID,
        }
        (seniors if s.role == "senior" else juniors).append(rec)
    return seniors, juniors


def validate(seniors: list[dict], juniors: list[dict]) -> list[str]:
    errs = []
    everyone = seniors + juniors
    if len(seniors) != 15 or len(juniors) != 121:
        errs.append(f"counts {len(seniors)}/{len(juniors)} != 15/121")
    handles = [p["handle"].lower() for p in everyone]
    if len(set(handles)) != len(handles):
        errs.append("duplicate handles")
    for p in everyone:
        for k, allowed in [("role", ROLES), ("trade", TRADES), ("region", REGIONS), ("path", PATHS),
                           ("activity_level", ACTIVITY), ("display_preference", DISPLAY)]:
            if p[k] not in allowed:
                errs.append(f"{p['handle']}: bad {k}={p[k]}")
        v = p["voice"]
        if v["register"] not in REGISTERS or v["punctuation"] not in PUNCT or v["swears"] not in ("none", "mild"):
            errs.append(f"{p['handle']}: bad voice")
        if p["role"] == "senior":
            if p["mentor_availability"] not in AVAIL or p["mentor_availability"] == "accepting":
                errs.append(f"{p['handle']}: seeded Senior must be limited/not_accepting")
            if p["trade"] == "general" or p["activity_level"] not in ("regular", "heavy"):
                errs.append(f"{p['handle']}: Senior trade/activity")
        if not p["is_founding_member"] or p["seed_batch_id"] != BATCH_ID:
            errs.append(f"{p['handle']}: missing founding flag/batch")
    nyc = sum(p["region"] == "NYC" for p in everyone)
    if not (13 <= nyc <= 15):
        errs.append(f"NYC count {nyc} not 14±1")
    n = len(everyone)
    for trade, target in [("electrical", 35), ("plumbing", 33), ("hvac", 25), ("general", 7)]:
        share = 100 * sum(p["trade"] == trade for p in everyone) / n
        if abs(share - target) > 3:
            errs.append(f"trade {trade} {share:.1f}% vs {target}%±3")
    return errs


def main() -> None:
    seniors, juniors = build()
    errs = validate(seniors, juniors)
    if errs:
        print("\n".join(errs))
        raise SystemExit(1)
    write_json("personas/seniors.json", seniors)
    write_json("personas/juniors.json", juniors)
    everyone = seniors + juniors
    from collections import Counter
    print("seniors:", len(seniors), "juniors:", len(juniors))
    print("region:", dict(Counter(p["region"] for p in everyone)))
    print("trade:", dict(Counter(p["trade"] for p in everyone)))
    print("display:", dict(Counter(p["display_preference"] for p in everyone)))
    print("junior activity:", dict(Counter(p["activity_level"] for p in juniors)))
    print("junior paths:", dict(Counter(p["path"] for p in juniors)))
    print("senior availability:", dict(Counter(p["mentor_availability"] for p in seniors)))


if __name__ == "__main__":
    main()
