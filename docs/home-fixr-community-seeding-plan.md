# Home Fixr — Community Seeding Plan (NJ-focused)

Plan for Claude Code. Goal: populate home-fixr.com with **136** fictional founding-member accounts (15 Seniors, 121 Juniors) and a realistic body of threads, replies, mentor-directory entries and collab posts, so the site reads as an active NJ trades community on day one. (136 is deliberate — a round 100 looks seeded.) **Prerequisite:** the app currently signs people up with Full name / Email / Password only and has no alias or handle; §2a adds one before any seeding, since the personas are handle-first like every trades forum. 90% of personas and discussions are New Jersey; ~10% are NYC-centered (Local 3 / Local 1 / DOB licensing / trade school in the five boroughs). Content is modeled on how people actually talk on r/skilledtrades, r/plumbing, r/hvac, r/electricians — topics, register, pacing — but every person, shop and quote is invented.

---

## 0. Ground rules (hard constraints)

1. **No real people.** Do not scrape, reuse or imitate real Reddit usernames, display names, flair, avatars or post text. Reddit is a reference for *themes and tone only*. Every handle generated must pass the collision check in §3 before use.
2. **No real small businesses or individuals as characters.** Employers, shops and instructors in the content are fictional ("Raritan Bay Mechanical", "a shop out of Toms River"). Real *institutions* are fine as background: unions (IBEW Local 102, UA Local 9), licensing boards (NJ Division of Consumer Affairs, NYC DOB), schools (Bergen County Technical Schools, Lincoln Tech Union, Apex Technical School), roads (Turnpike exit 8A, Route 1, GWB), utilities (PSE&G, JCP&L, Con Ed). Don't put invented facts or quotes in a real institution's mouth — "Local 102's exam is in the spring" is fine if true-ish and hedged; "the Local 9 training director told me X" is not.
3. **Honest framing on the site.** Every seeded account gets an `is_founding_member = true` flag rendered as a small "Founding Community" badge on profiles and posts. Add one sentence to the About/FAQ page: *"Our earliest discussions were seeded by the Home Fixr team, with help from NJ tradespeople, to show how the community works. Founding Community accounts are marked."* Seeded accounts never DM real users and never get listed as "available" mentors without a human behind them (see §6).
4. **Idempotent & reversible.** All seeded rows carry `seed_batch_id`. One command wipes a batch. Nothing seeded is mixed into analytics as organic.
5. **Site vocabulary.** Home Fixr uses **Seniors** (master-level pros / shop owners) and **Juniors** (apprentices, vo-tech grads, career switchers). Trades: Plumbing, HVAC, Electrical, General. Surfaces: Feed/Threads (vote + "mark helpful"), Mentor Directory (trade/region/availability, opt-in requests), Collabs/Jobs (ride-alongs, extra hands; pitch + CV), Profiles (credentials, post history, follow). Use these names everywhere.

---

## 1. Deliverables

```
/seed
  /personas/seniors.json          15 Seniors
  /personas/juniors.json          121 Juniors
  /content/threads.json           ~190 threads with nested replies
  /content/collabs.json           ~20 collab/ride-along posts (+ 2–4 pitches each)
  /content/mentor_requests.json   ~35 request/accept pairs (status only, no DM bodies)
  /content/follows.json           follow graph
  /scripts/gen_handles.py         handle generator + Reddit collision check
  /scripts/gen_personas.py        persona generator (LLM-assisted, schema-validated)
  /scripts/gen_threads.py         thread/reply generator keyed to persona voices
  /scripts/schedule.py            timestamp distribution
  /scripts/seed.py                writes to DB via the app's own models/API
  /scripts/wipe.py                removes a seed_batch_id
  /scripts/qa.py                  lint + realism checks (§8)
  REPORT.md                       counts, charts, sample threads, QA results
```

First step for Claude Code: inspect the repo and record the actual user/post/reply/collab/mentor schema, auth flow, and whether seeding should go through ORM, a REST endpoint, or SQL. Adapt field names below to the real schema; don't invent a parallel one.

---

## 2. Persona model

### Counts and split

| | NJ | NYC | Total |
|---|---|---|---|
| Seniors | 13 | 2 | 15 |
| Juniors | 109 | 12 | 121 |
| **Total** | **122** | **14** | **136** |

(NYC = 10.3%.)

Trade mix (apply to both roles): Electrical 35%, Plumbing 33%, HVAC 25%, General/undecided 7% (Juniors only — career switchers who haven't picked; Seniors always have a trade).

### NJ geography (weighted so it feels like the real state, not a Bergen-only site)

- North (Bergen, Passaic, Hudson, Essex, Morris) — 38%
- Central (Middlesex, Union, Somerset, Monmouth, Mercer) — 37%
- South / Shore (Ocean, Burlington, Camden, Gloucester, Atlantic) — 25%

NYC: Queens and Brooklyn heaviest, then Bronx and Staten Island; one Manhattan high-rise electrician Senior.

### Schema

```json
{
  "handle": "RaritanSparky",
  "display_name": "Marcus D.",            // first name + initial, or blank — many tradespeople leave it blank
  "role": "junior|senior",
  "trade": "electrical|plumbing|hvac|general",
  "region": "NJ-Central",
  "town_hint": "Old Bridge",              // mentioned in posts, not necessarily shown on profile
  "years_in": 2,
  "path": "union_apprentice|nonunion_apprentice|votech_student|votech_grad|career_switcher|owner|service_tech|foreman",
  "affiliation_hint": "IBEW Local 456 2nd year",   // or "Middlesex County Vo-Tech, class of '24", or null
  "licenses": ["EPA 608 Universal"],       // Seniors: "NJ Master Plumber", "NJ Electrical Contractor", "NJ HVACR Contractor", "NYC Master Plumber", "NYC Master Electrician"
  "bio": "2nd yr out of 456. Mostly commercial in Edison/Piscataway. Here to ask dumb questions before I ask them on the job.",
  "voice": {
    "register": "terse|chatty|formal|salty",
    "punctuation": "lowercase_minimal|normal|heavy_ellipses",
    "tics": ["says 'brother'", "ends with 'just my 2 cents'"],
    "swears": "none|mild"
  },
  "situation": "Shop keeps him pulling wire in warehouses off 8A; wants to see residential service before deciding.",
  "goals": ["finish apprenticeship", "eventually get contractor license"],
  "activity_level": "lurker|occasional|regular|heavy",
  "joined_at": "2026-07-14T19:22:00-04:00",
  "is_founding_member": true,
  "seed_batch_id": "fm-2026-10"
}
```

Activity distribution for Juniors: 40% lurker (0–1 posts, a few votes), 35% occasional (1–3 posts), 20% regular (4–8), 5% heavy (9–15, these are the "characters" people recognize). Seniors: all regular or heavy; 4–5 of them should be the obvious pillars who answer everything.

### Senior roster (sketch — generate full records from these; 13 NJ + 2 NYC)

1. NJ Master Plumber, Bergen County, 28 yrs, residential service + boilers, owns a 4-truck shop. Blunt, generous, allergic to "YouTube plumbers."
2. IBEW Local 102 journeyman turned foreman, Morris County, 19 yrs, commercial/industrial, data-center work in Secaucus/Piscataway. Big on safety and union path.
3. Non-union electrical contractor, Monmouth County, 22 yrs, shore residential/renovation. Pro-trade-school, mildly skeptical of union wait lists.
4. HVAC owner, Middlesex, 25 yrs, oil-to-gas conversions, heat pumps, NJ Clean Energy rebates. Likes talking about the business side (pricing, callbacks).
5. UA Local 9 steamfitter/plumber, Central NJ, 30 yrs, hospitals and pharma plants along Route 1. Dry, few words, always right.
6. South Jersey HVAC service tech / lead, Camden County, 15 yrs, casino and hospitality work in AC, residential in Gloucester. Chatty, lots of war stories.
7. Electrical inspector (former contractor), Ocean County, 26 yrs. Explains code and NJ UCC permits patiently; the "why did I fail inspection" oracle.
8. Woman master plumber, Essex/Hudson, 17 yrs, multifamily and co-op/condo work in Jersey City and Hoboken. Direct, encouraging to career-switchers.
9. Vo-tech instructor (plumbing/HVAC), Passaic or Union County tech school, 20 yrs field + 8 teaching. Posts about what students get wrong on day one.
10. Low-voltage / controls electrician, Somerset, 14 yrs, BMS and fire alarm. Bridge to the "is low-voltage a real trade" debate.
11. Mechanical contractor (HVAC + plumbing), Burlington County, 24 yrs, warehouses and schools, prevailing-wage jobs. Talks hiring and what makes an apprentice keepable.
12. Second-generation plumbing shop owner, Hudson/Bergen border, 23 yrs, took over his father's residential/light-commercial business; talks succession, hiring kids out of vo-tech, why he left the union and why he half regrets it.
13. Shore HVAC/refrigeration tech, Atlantic/Cape May, 18 yrs, restaurants and boardwalk commercial refrigeration, seasonal boom-and-bust. The "winter is when you learn" guy.
14. **NYC:** Local 3 journeyman electrician, Queens, 21 yrs, Manhattan high-rise. Local 3 application, JIB, DOB inspections, commuting from Jersey.
15. **NYC:** Licensed Master Plumber, Brooklyn, 26 yrs, brownstone and multifamily gas work; DOB gas-qualification and inspection stories, Local 1 vs. non-union in the boroughs.

---

## 2a. Alias / handle feature (build first)

**Finding (Oct 5, 2026):** the Join form collects Full name, Email, Password; the trade questionnaire follows account creation. There is no username, handle or display alias. Tradespeople on forums almost never post under full names, so the seeded roster (and real users) need one.

Add to the app before seeding:

- **Schema:** `users.handle` (citext/unique, 3–22 chars, `[A-Za-z0-9_.]`, cannot start/end with `.`, immutable after 30 days or admin-changeable), `users.display_preference` enum `handle | first_name_initial | full_name` (default `handle`), `users.handle_changed_at`. Keep `full_name` private by default; show it only to accepted mentor/mentee pairs and on collab pitches if the user opts in.
- **Reserved/blocked list:** `admin`, `homefixr`, `mod`, `support`, trade-board and union names as whole handles (`ibewlocal102`, `ualocal9`), slur list, plus any real brand as the whole string.
- **Onboarding:** add a "Pick a handle" step right after email verification, pre-filled with 2–3 suggestions derived from first name + trade + county (e.g. `MarcusD_Elec`, `Marcus_Middlesex`) with a live availability check. Explain in one line: *"This is how you'll appear on the Feed. Your full name stays private unless you share it."*
- **Everywhere names render** (Feed, replies, Mentor Directory cards, Collabs, pitches, Search, Profile header, notifications): switch to a single `displayName(user)` helper that honors `display_preference`. Add `@handle` in the profile header and make `@handle` autolink in post bodies (mentions) — optional but cheap and very forum-like.
- **Profile URL:** `/u/<handle>` with a redirect from any existing id-based route.
- **Settings:** handle change (rate-limited), display preference toggle, "show full name to connections" checkbox.
- **Backfill migration:** for any existing real accounts, generate a provisional handle from first name + random 3 digits, flag `handle_provisional = true`, and prompt them to choose on next login.
- **Seeding dependency:** `seed.py` writes `handle` and `display_preference` for every persona (~80% `handle`, ~18% `first_name_initial`, ~2% `full_name` — a couple of shop-owner Seniors who use their business-facing name).
- Tests: uniqueness (case-insensitive), reserved list, migration idempotence, rendering helper used on every surface (grep for raw `full_name` in templates/components and fail CI if found outside the private contexts).

---

## 3. Handle generation and collision check

### Style targets
Trades-forum handles cluster into a few shapes. Generate across all of them so the roster doesn't look templated:

- Trade + place: `BergenSparky`, `ShorePipes`, `ParsippanyPipefitter`, `JerseyCityJourneyman`
- Trade + number/year: `wiremonkey_93`, `pex_and_prayers`, `608certified`
- Job-site humor: `AtticInAugust`, `CrawlspaceCardio`, `ThreeWireTuesday`, `EightA_Warehouses`
- Plain first name + initial / nickname: `Dom_V`, `big_tony_hvac`, `Kaylee.wires`
- Role/status: `FirstYearFlunky`, `ApprenticeNoMore`, `CareerSwitch_at34`, `VoTechSenior2027`
- NJ-specific flavor (use sparingly, 10–15%): `TurnpikeTradesman`, `GSP_Exit98`, `PorkRollAndPEX`, `TaylorHamTech`

Rules: 4–22 chars, letters/digits/underscore/dot, no real brand as the whole handle, no slurs, no real person's name+surname. Mix casing styles. ~15% of handles should look slightly lazy or old (`mike2277`, `jrplumbnj`).

### Collision check (`gen_handles.py`)
For each candidate:
1. `GET https://www.reddit.com/user/<handle>/about.json` with a descriptive User-Agent, ≤1 req/sec with jitter, exponential backoff on 429. A 404 means free; 200 means **reject** and regenerate; anything else → retry later, don't assume free.
2. Also reject if a case-insensitive Levenshtein distance ≤ 1 to any *accepted* handle in our own roster (avoid near-duplicates).
3. Also check the Home Fixr DB for existing users.
4. Log every check to `handles_checked.csv` (candidate, status, timestamp) so the audit trail exists.

Generate ~240 candidates to land 136 clean handles. Run every candidate through the app's own reserved/blocked list from §2a as well.

---

## 4. Conversation taxonomy

Target **~190 threads**, **~1,200 replies**. Reply depth: 60% of threads 2–5 replies, 30% 6–12, 10% 13–25 (the ones that "blow up"). ~8% of threads get zero replies — real forums have those. 85% of thread *starters* are Juniors; Seniors start the rest (tips, "ask me anything", rants).

Distribute threads across categories (NJ unless marked):

**A. Getting in (22%)**
- Union apprenticeship vs. trade school vs. just finding a shop — the perennial. Specifics: IBEW 102/164/456/351/400 application windows and aptitude test, UA Local 9/24/322 waitlists, what the interview is actually like, "I got ranked 180th, is it over."
- County vo-tech questions: is a 2-yr HVAC program at [Bergen/Union/Middlesex/Camden County Tech] worth it, Lincoln Tech (Union/Mahwah/Paramus) cost vs. payoff, Pennco Tech, Eastwick, HoHoKus. Honest mixed answers.
- Career switchers at 28/34/41: "too old?", pay cut math, body concerns, how to pitch yourself with no hours.
- Pre-apprenticeship: what to bring day one, which tools to buy vs. wait, boots.

**B. Licensing & exams (14%)**
- NJ licensing is master/contractor-centric: the licenses that let you pull permits and run work are Master Plumber (Board of Examiners of Master Plumbers) and Electrical Contractor (Board of Examiners of Electrical Contractors); journeyman-level credentials exist but are optional and confuse newcomers — a recurring "wait, so what am I after 4 years?" thread. Cover hours, classroom requirements, the business-and-law exam, HVACR Contractor license (licensing began ~2014) and EPA 608. **Verify every requirement against the board pages before generating; hedge in-character where the Seniors would.**
- Permit/inspection threads: NJ UCC, failed rough-in, local inspector variability town to town.
- **NYC (within the 10%):** DOB Master Plumber / Master Electrician, 7-yr experience affidavits, difference from NJ.

**C. On the job (20%)**
- "Am I being used as a laborer" — 6 months of demo and material runs. Senior consensus: normal for a while, red flags listed.
- Boss won't let me touch anything but PEX / won't send me to school / pays cash. When to leave, how to leave without burning a bridge in a small state where everyone knows everyone.
- First on-call winter in HVAC. First no-heat call. Boiler-heavy NJ housing stock (steam systems in Essex/Hudson, oil tanks in Morris/Sussex).
- Safety near-miss stories, arc flash, confined space in crawlspaces, roofing in July on a Toms River split-level.
- Commute & logistics: Turnpike/Parkway tolls, parking in Hoboken/JC, gas, company van policies, Route 1 at 6 a.m.

**D. Pay & business (14%)**
- What should a 2nd-year make in Central Jersey (non-union)? Union package vs. non-union cash. Prevailing-wage jobs (schools, municipal). Honest ranges, with Seniors pushing back on both lowballs and fantasy numbers.
- Side work ethics and legality (unlicensed side work in NJ is a real exposure — Seniors warn).
- Going out on your own: insurance, NJ HIC registration vs. trade license, first truck.

**E. Technical "dumb questions" (18%)**
- Beginner-level but specific: sweating copper vs. ProPress, why my joint leaked, sizing a condensate line, 3-way switch confusion, AFCI nuisance trips, superheat/subcool basics, oil-to-gas conversion steps, heat pump cold-weather performance in NJ, mini-split vs. ducted for a Cape Cod.
- Seniors answer with the *field* version, not the textbook version, and occasionally disagree with each other.

**F. Culture, venting, wins (12%)**
- Passed the 608. Got the call from the Local. Quit the bad shop. First solo service call went fine. Got yelled at by a GC. Weather rants. Taylor ham vs. pork roll (one thread, let it run).
- "Anyone else from [Ocean County / Hudson County] on here?" regional roll calls.

**NYC share (~10% of threads = ~19):** Local 3 lottery/aptitude/interview timing, Local 1 and Local 638 realities, Apex Technical School / Berk Trade / NYC College of Technology questions, DOB inspections and expeditors, living in Queens working in Manhattan, NJ-resident apprentices working NYC jobs (parking, tolls, "should I move"). Cross-pollinate: a few NJ Juniors ask about going into the city; the two NYC Seniors answer.

### Collabs / ride-alongs (~20)
Seniors post: "Need an extra set of hands Sat for a boiler swap in Clifton — 8 hrs, cash, you learn", "Ride-along for a Junior interested in commercial — Piscataway warehouse fit-out, 2 days", "Shadow a service tech for a week, Monmouth County". Juniors submit 2–4 short pitches each; one gets marked accepted. Fictional addresses at town level only.

### Mentor directory
All 15 Seniors listed with trade/region. Availability: 6 "accepting", 5 "limited", 4 "not accepting". ~35 mentor requests from Juniors (short pitch text), ~60% accepted, some pending, a few declined with no reason shown. **Important:** accepting mentors must be backed by a real human (Home Fixr team or recruited NJ pros) who will respond to real users, or set them to "limited" and route requests to the team inbox. Don't let a real Junior send a request into a void.

---

## 5. Writing the content (`gen_threads.py`)

Generate with an LLM but constrain it hard:

- Pass each thread a cast: 1 starter persona + 3–8 repliers chosen by trade/region/activity, with their `voice` block and `situation`. Replies must be *in character* and consistent with earlier posts by that persona (keep a per-persona memory file of claims made: years, employer type, town, licenses).
- Style guide for realism: inconsistent capitalization across users, some typos (≤1 per 100 words, never in Senior answers about code), occasional "edit: thanks everyone", quoting a previous reply, a reply that misreads the question, a Senior correcting another Senior politely, a Junior saying "update:" two weeks later. No marketing language. No one praises Home Fixr. Nobody writes in bullet points except one Senior who always does.
- Length: thread bodies 40–250 words, replies 10–160 words, heavy right-skew (most replies short).
- Local texture per post (not every post): town names, roads, weather, specific NJ housing (split-levels, Capes, Hoboken brownstones, Shore raised houses post-Sandy), utilities, rebate programs, the DMV at Lodi, Wawa vs. QuickChek.
- Research step (allowed): browse r/skilledtrades, r/electricians, r/plumbing, r/hvac via public listing pages to extract *topic frequencies and phrasings*, store as `themes.yaml` (topic, typical framing, typical pushback). Do **not** store usernames or verbatim post text. Spot-check output with a similarity scan (§8) against the fetched reference text to confirm nothing was copied.
- Vote counts: log-normal; thread starters 2–40 upvotes, Senior answers get more; "marked helpful" on ~55% of threads with ≥3 replies, always a Senior or an experienced Junior.

---

## 5a. Imagery (avatars and post photos)

**Do not pull avatars or photos from Reddit** or any other forum — they belong to identifiable people and are trivially reverse-image-searchable. Same rule as usernames.

**Avatars**
- ~45% no avatar (default silhouette), matching real trades forums.
- ~40% generated initials or geometric/identicon marks (deterministic from handle, via a library such as DiceBear "initials"/"shapes" or a local SVG generator). Muted palette, no two identical.
- ~15% trade-flavored icons from an openly licensed icon set (pipe wrench, wire nut, gauge manifold, hard hat) — things a user would plausibly choose.
- No AI-generated faces. No stock faces.

**Post photos (~25% of threads get 1–3 images; technical "dumb question" threads ~50%)**
Approved sources, in order of preference. "Publicly viewable" is not "free to reuse" — only images with an explicit open license or public-domain status qualify.
1. **Openly licensed / public-domain images from the web** — the primary source. Search only the open-license slice: Openverse (openverse.org — aggregates Flickr CC, Wikimedia Commons and others, filter to CC0 / CC BY / CC BY-SA), Wikimedia Commons directly, Pexels and Unsplash (their own licenses permit reuse), Flickr with the Creative Commons filter, Google Images with Usage Rights → "Creative Commons licenses", and US federal sites whose photos are public domain (DOE/EERE, EPA, NIST, NREL image library, GSA, military housing/public-works pages — lots of unglamorous boilers, panels and ductwork). Subjects: sinks, toilets, P-traps, water heaters, boilers, panels, breakers, wire pulls, mini-splits, condensers, ductwork, crawlspaces, vans, tool bags. Prefer amateur-looking shots over catalog/product photography. For each image record `source_url`, `author`, `license`, `license_url`, `attribution_text`, `retrieved_at` in `images/manifest.json`; honor attribution where the license requires it (a small "photo: <author>, CC BY" caption is fine and looks natural). Reject: anything from a contractor's site, supply-house blog, manufacturer page or news article without an explicit license; anything with faces, addresses, license plates or company logos; ND-licensed images if we crop or re-encode.
2. **Team-shot originals.** Home Fixr team and partner vo-tech instructors photograph real NJ work: boiler rooms, panel swaps, lineset runs, rough-ins, a crawlspace, a van shelf. Phone quality, slightly off-angle, mixed lighting. Store originals + a consent note from the shop/homeowner (no faces, no addresses, no license plates, no company logos). Use these for the NJ-specific threads (steam boilers, oil tanks, Shore raised houses) where generic stock won't match.
3. **Diagrams/sketches** drawn by the team (a 3-way switch sketch on a notepad, a condensate line layout) photographed on a bench.
4. **Forum photos with the poster's written permission.** Reddit/forum photos of fixtures, fittings, panels, etc. (no people, no addresses) may be used **only after** the original poster has said yes in a DM or comment. Claude Code may build a shortlist (`images/permission_requests.csv`: post URL, poster handle, what's pictured, suggested thread), and a human on the Home Fixr team sends the ask and records the reply. Nothing from this list is downloaded or seeded until `consent = yes` with the message text saved. Credit the poster if they want it; treat a non-reply as a no. This doubles as outreach to real tradespeople.

Processing: strip EXIF, re-encode at phone-like quality (JPEG q 70–85), random slight crop/rotate (≤2°), occasional vertical orientation. File names like `IMG_4471.jpg`. Match image to thread content — a leaking ProPress joint photo belongs on the ProPress thread, and the Seniors' replies should refer to what's visible ("that's a 1/2 on a 3/4 fitting, brother").

No AI-generated "work" photos: fittings and wiring come out wrong and tradespeople spot it immediately, which undermines the whole site.

QA additions: every image has a manifest entry with a permitted license or an internal-consent record; no faces (run a face detector and reject hits); no text overlays with real business names.

---

## 6. Timestamps (`schedule.py`)

- Backfill window: **July 1 → October 4, 2026** (~95 days), joins front-loaded in July/August, posting ramping up through September.
- Weekly rhythm: trades post evenings (6–11 pm ET) and early mornings (5–6:30 am, on the way to the job); weekday lunch spike at 12–1; Sundays busy, Saturdays quiet; Friday nights dead. Hurricane/heat-wave days get a bump in HVAC threads (pick 2–3 real 2026 hot stretches by checking a weather archive).
- Reply latency: first reply 20 min–6 hrs; Seniors reply mostly evenings; long tails with a reply 9 days later.
- Joins: 136 accounts over 95 days, clustered around 4–5 "school starts / Local posts application" moments, not uniform.
- All stored in America/New_York, converted to UTC on write.

---

## 7. Seeding (`seed.py`)

1. Read repo → map schema → write adapters (ORM preferred; fall back to internal API with a service token; raw SQL last resort and only with FK integrity checks).
2. Create users with `is_founding_member`, `seed_batch_id`, placeholder avatars (initials or a generated-geometry avatar — **not** scraped photos, not AI faces). ~40% of accounts have no avatar, like real forums.
3. Insert threads → replies (preserving parent ids and timestamps) → votes → helpful marks → follows → collabs + pitches → mentor requests.
4. Disable notification emails during seeding. Mark seeded users as not-searchable to real users for mentor *availability* unless a human backs them (§4).
5. Write `REPORT.md`: counts by role/trade/region, thread category histogram, activity timeline chart, 10 sample threads rendered as markdown, QA results.
6. `wipe.py --batch fm-2026-10` reverses everything in FK-safe order. Test wipe on a staging copy before touching prod.

---

## 8. QA (`qa.py`) — must pass before prod seed

- Counts: 15 Seniors / 121 Juniors = 136; NJ 122 / NYC 14 (±1); trade mix within ±3 pts.
- Alias feature: every seeded user has a unique handle; no raw `full_name` renders on Feed, Mentors, Collabs or Search for users whose preference is `handle`.
- Every handle has a logged Reddit 404 from §3 and no DB collision.
- Persona consistency: no persona contradicts its own years/town/trade/license across posts.
- Fact lint: regex-flag claims about licenses, hours, union locals, schools and have a human review the flagged set against the official sources (NJ Consumer Affairs board pages, NYC DOB, the locals' own sites). Fix or hedge ("I think", "last I checked").
- Plagiarism scan: 8-gram overlap between generated text and `themes.yaml` reference corpus must be ~0; any hit ≥ 12 words → regenerate.
- Realism heuristics: ≥8% zero-reply threads; reply-length right-skew; ≥20% of users with zero posts; no two threads share a title stem; posting-hour histogram matches §6.
- Labeling: every seeded profile renders the Founding Community badge; About page sentence present.
- Wipe test: seed → wipe → row counts return to baseline on staging.

---

## 9. Hand-off to real community

- Recruit 3–5 real NJ tradespeople (vo-tech partner instructors are the obvious start) to take over the "accepting" mentor slots and to post under their own names from week one; seeded Seniors go to "limited" as real ones arrive.
- Have the team answer real Junior questions within 24 hrs for the first 60 days; seeded content buys attention, response time keeps it.
- After ~6 months, consider archiving or clearly collapsing the seeded era ("Founding Community archive") so the live feed is organic.

---

## 10. Suggested execution order for Claude Code

1. Repo recon → schema map → `REPORT.md` section 0.
2. **Build the alias/handle feature (§2a)**, migrate, ship to staging.
3. `themes.yaml` from reference browsing (topics only).
4. `gen_handles.py` → 136 verified handles.
5. `gen_personas.py` → review 15 Seniors by hand with Gaurav before continuing.
6. `gen_threads.py` → generate 20 threads first, review tone, then the rest.
7. `schedule.py` → timestamps; `qa.py` → iterate until green.
8. Badge + About copy in the app.
9. Seed staging → review in the UI → wipe test → seed prod.
