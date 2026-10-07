# Founding Community seed: pass 1 report

Branch `feat/founding-community`. Everything here ran against the **local** Supabase stack only.
No production project was connected to, migrated or seeded; nothing was deployed or pushed.

**Waiting on human review:** the 15 Seniors (`seed/personas/seniors.json`, summarised in §6) and the
20 sample threads (`seed/content/threads.sample.authored.yaml`). Per the plan, the remaining ~170
threads, collabs, mentor requests and follows are **not** written yet.

**Pass 2 (after Gaurav's Senior review):** the 15 Seniors have new names and handles (including
`Kash_sing`) and every persona has an avatar style. Migration **0011** adds `avatar_style`
(`initials | icon | none`) and `avatar_icon` (wrench, flame, plug, snowflake, hardhat, zap, thermometer,
hammer). `<Avatar>` renders initials on a per-handle muted colour pair, a lucide trade icon on a muted
tile, or a grey silhouette at all 13 call sites, and Settings has an avatar picker. Screenshots are in
`seed/reports/screens/` (mentors, Kash_sing's profile, a thread). No Junior's identity changed; Juniors
only gained avatar fields.

---

## 0. Repo recon: schema, auth, seeding mechanism

### Tables (after `schema.sql` + migrations 0001–0011)

| table | key columns (seeding-relevant) | notes |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`, cascade), `username` (unique, not null; **the handle**), `full_name` (not null, private), `avatar_initials` (not null), `title`, `role` (`junior`/`senior`), `trade`, `region`, `bio`, `years_experience`, `is_open_to_messages`, `is_open_to_ride_alongs`, `onboarded_at` (0006); **0009:** `display_preference`, `username_changed_at`, `is_founding_member`, `seed_batch_id`, `mentor_availability`; **0011:** `avatar_style` (`initials`/`icon`/`none`), `avatar_icon` | public read (RLS `using (true)`), owner update |
| `posts` | `author_id`, `type` (`question`/`tip`/`discussion`), `title`, `body`, `trade`, `region`, `helpful_count`, `reply_count` (trigger), `slug` (0003, trigger), `created_at`, `seed_batch_id` | public read |
| `replies` | `post_id`, `author_id`, `body`, `is_accepted`, `helpful_count`, `created_at`, `seed_batch_id` | public read |
| `job_collabs` | `poster_id`, `type` (`extra_hand`/`ride_along`/`specialist`), `title`, `body`, `trade`, `location`, `scheduled_date`, `pay_type`, `interested_count` (trigger), `seed_batch_id` | public read |
| `collab_interests` (0004/0005/0008) | `collab_id`, `user_id`, `status`, `note`, CV + screening fields, `seed_batch_id` | applicant + poster only |
| `mentorships` | `junior_id`, `senior_id`, `status` (`pending`/`active`/`declined`), unique pair, `seed_batch_id` | the two parties only |
| `follows` (0002) | `follower_id`, `following_id`, PK pair, `seed_batch_id` | public read |
| `messages` (0002/0007) | `sender_id`, `recipient_id`, `body`, attachments | two parties only; **never seeded** |
| `notifications` (0002) | `user_id`, `type`, `actor_id`, `entity_*` | created only by triggers |
| `reserved_handles`, `blocked_handle_terms` (0009) | | no API access |

Enums: `user_role`, `trade_type` (`plumbing | hvac | electrical | other`; the plan's "General" is `other`),
`post_type`, `collab_type`, `mentorship_status`, `collab_interest_status`, `notification_type`,
**0009:** `display_preference` (`handle | first_name_initial | full_name`), `mentor_availability`
(`accepting | limited | not_accepting`). There is no vote table: the plan's "votes" map to
`helpful_count`, "marked helpful" to `replies.is_accepted`. The existing helpful RPCs have no per-user
dedupe (already true before this pass). All FKs to `profiles` cascade; `profiles.id` cascades from `auth.users`.

### Triggers that matter for seeding

| trigger | effect | seeding treatment |
|---|---|---|
| `on_auth_user_created` → `handle_new_user` | creates the profile row from metadata | seed passes the chosen handle in metadata, then UPDATEs every field |
| `on_reply_change`, `on_post_set_slug`, `on_collab_interest_count` | counters / slugs | left on |
| `on_reply_notify`, `on_mentorship_notify`, `on_message_notify`, `on_follow_notify`, `on_collab_interest_notify`, `on_collab_accepted_notify` | insert notifications | **0010:** return early under `set local homefixr.seeding = 'on'` |
| **0009** `profiles_guard` | handle rules; API roles can't set founding flags; 30-day handle limit | seed runs as owner (allowed) |
| **0009** `*_founding_guard` (messages, mentorships, collab_interests) | API users can't contact Founding accounts or request a `not_accepting` mentor | n/a to seeding |

### Auth flow
Email/password (`/join`: name, email, password, role) or Google OAuth (`/auth/callback`). The signup
trigger creates the profile (username from metadata or the email local part, `onboarded_at = null`); the
member finishes at `/welcome`, which now includes **Pick a handle**. Profiles live at `/u/<username>`.
The Next 16 Proxy (`src/proxy.ts`) only refreshes the session.

### Seeding mechanism (chosen)
**SQL as the database owner, in one transaction, with integrity checks before commit.** There is no ORM,
and the REST path would need a login per persona (seeded accounts must not be able to log in).
`seed.py`: `set local homefixr.seeding = 'on'` → insert `auth.users` (empty password, `banned_until
9999-12-31`, `<handle>@founding.home-fixr.invalid`) → the trigger creates the profile with the handle →
UPDATE profile → posts → replies → checks (counts, every FK resolves, seeded replies only on seeded posts,
reply counts, slugs, nothing before its author joined, no Senior accepting, zero notifications, no
passwords) → commit. Ids are `uuid5(batch, key)`, so reruns are deterministic. `wipe.py` deletes by
`seed_batch_id` in FK-safe order and refuses if real members have built on the batch.

---

## 1. What was built

### Database (`supabase/migrations/`)
- **0009_handles_and_founding_members.sql** (one transaction, idempotent). `username` is the handle:
  3–22 chars, `[A-Za-z0-9_.]`, no edge dots; case-insensitive unique index (the migration aborts with the
  colliding names listed if existing data would violate it, rather than renaming anyone); a reserved/blocked
  list (platform words, routes, unions/boards, utilities/brands, schools, a short slur/profanity substring
  list) enforced by trigger for API users; a once-per-30-days change limit (moving off an auto-derived
  handle the first time is always allowed; staff are exempt); `display_preference`; `is_founding_member` +
  `seed_batch_id` on profiles and every seeded table (partial indexes); API roles can't flip those flags;
  `mentor_availability`; contact guards; `check_handle()` RPC for the live check; `confirm_current_handle()`
  ("keep my handle" without starting the 30-day clock). The signup trigger now always derives a valid,
  non-reserved, case-insensitively unique handle. The rules fire only when a username is inserted or
  changed, so legacy rows (e.g. a hyphenated email-derived username) keep working. Applied to a DB that
  already had data, and re-applied for idempotence.
- **0010_quiet_notifications_while_seeding.sql**: the notify functions return early under the seeding flag
  (no table locks, unlike `ALTER TABLE … DISABLE TRIGGER`).

### App (`src/`)
- `displayName(profile)` (`src/lib/display.ts`) and the `<UserName>` component are used on every surface that
  shows another member: feed, post cards, thread and replies, profile, mentors, collabs, My jobs,
  mentorships, notifications, search, messages, header. `full_name` remains only in the member's own
  Settings, welcome and signup screens. Search matches handle/bio/title and no longer matches full names.
- **Founding Community badge** next to the name wherever it renders. It links to the new **/about** page,
  which carries the plan's sentence verbatim. The same sentence is in the landing FAQ, and About is linked
  in the footer.
- **/welcome**: "Pick a handle" with 2–3 suggestions from first name + trade + town (only available ones are
  shown), a live availability check, the plan's one-line explanation, and display preference.
- **Settings**: handle change (disabled within 30 days, with the next allowed date shown), display
  preference, and mentoring availability for Seniors. The feed nudges members whose handle was auto-derived.
- `/u/<handle>` resolves case-insensitively and from old id links, redirecting to the canonical handle.
  `@handle` mentions autolink in post and reply bodies.
- **Mentor safety**: Founding profiles show no message / mentorship / apply controls, just a notice
  (logged in or out). A message thread with a Founding account shows the notice instead of the composer.
  The server actions `sendMessage`, `requestMentorship`, `applyToCollab` and `toggleCollabInterest` refuse
  with "This is a Founding Community account…", and DB triggers enforce the same. The directory shows
  availability and has an **Accepting mentees** filter that excludes Founding accounts.
- Fixed two pre-existing `react-hooks/set-state-in-effect` lint errors (PostComposer, CollabComposer) so
  `npm run lint` is clean.

### Tests
- `npm test` (node:test, no new dependencies): handle format, suggestions, the display helper and error
  mapping, plus a guard that **fails on any raw `full_name` outside the allow-listed private files**, the
  badge wiring, the About sentence, and (pass 2) the avatar icon set, colour hashing and call sites. 12/12 pass.
- `npm run test:db` (`tests/db_rules_test.py`, rollback-only against local, simulating PostgREST's
  `authenticated` role): signup derivation, format, case-insensitive uniqueness, reserved list, rate limit
  and tamper resistance, founding-flag protection, legacy rows, all contact guards, availability, and
  notification suppression, and (pass 2) members setting their own avatar within the allowed set. 16/16 pass.
- End-to-end checks through the real local REST API with a real local member's JWT:
  - messaging a Founding account → 42501 `founding_member`
  - a mentorship request → 42501
  - flipping one's own `is_founding_member` → 42501
  - handle `admin` → `handle_reserved`; `WalkInCoolerWES` → `handle_taken`
  - first handle change OK, second → `handle_rate_limited`
  - password login as a seeded account → `invalid_credentials`

### Seed tooling (`seed/`)
- Scripts: `scripts/common.py` (roster slots, safety rails), `gen_handles.py`, `gen_personas.py`,
  `gen_threads.py`, `schedule.py`, `seed.py`, `wipe.py`, `qa.py`, `local_db_setup.sh`.
- Inputs and generated data: `themes.yaml`; `personas/{handles,seniors,juniors}.json`;
  `content/threads.sample.authored.yaml`, built into `threads.sample.json` and then
  `threads.sample.scheduled.json`; `content/thread_briefs.json` (cast plans for 170 more threads, no
  content); `content/persona_memory.json`; `handles_checked.csv`.
- Reports: `reports/{qa_report.md, fact_lint.md, local_cycle.txt, seed_run.json, wipe_run.json}`.

All seed scripts refuse any database host other than localhost, and always refuse `mcchiylrzxnoomznfapm`.
There is deliberately no working path to production yet.

---

## 2. How to run (local)

```bash
npm ci
npx supabase start                                  # config.toml disables auto-migrations (schema.sql must run first)
seed/scripts/local_db_setup.sh --with-demo-seed     # schema.sql -> 0001..0011 (+ demo members as "existing users")
uv run seed/scripts/gen_handles.py --reuse-log      # re-assign handles without re-hitting Reddit (drop the flag to re-check)
uv run seed/scripts/gen_personas.py                 # seniors.json + juniors.json (validated)
uv run seed/scripts/gen_threads.py sample           # validate + build the 20 sample threads
uv run seed/scripts/gen_threads.py briefs --n 170   # cast briefs for the rest (next pass)
uv run seed/scripts/schedule.py [--plan] [--end D]    # timestamps (America/New_York -> UTC); --plan shows the ramp
uv run seed/scripts/seed.py [--dry-run|--replace]   # write batch fm-2026-10 to LOCAL
npm run dev                                         # gitignored .env.local -> http://127.0.0.1:54321 + local anon key
uv run seed/scripts/qa.py --db --app http://localhost:3000 [--allow-unverified-handles]
uv run seed/scripts/wipe.py [--dry-run]             # remove the batch
npm run lint && npm run build && npm test && npm run test:db
npx supabase stop
```
Python dependencies are declared inline (PEP 723), so `uv run` installs them. `npm test` needs Node 22+.

---

## 3. QA and test results (all run in this pass)

- `npm run lint` is clean. `npm run build` compiles all 21 routes. `npm test` 12/12, `npm run test:db` 16/16 (pass 2, on a fresh `supabase db reset` + 0001–0011).
- With the dev server pointed at local Supabase, logged out and logged in as a real local junior, these
  all return 200: `/`, `/feed`, `/mentors`, `/collabs`, `/about`, `/search`, `/welcome`, `/settings`,
  `/u/<handle>`, `/messages/<founding handle>`. Welcome shows the handle step, and Settings shows the
  handle lock date after a change. Headless screenshots of a thread and a profile were checked by eye.
- **Seed → QA → wipe on local** (`seed/reports/local_cycle.txt`):

  | table | baseline | seeded | after wipe |
  |---|---|---|---|
  | profiles / auth.users | 10 | 146 | 10 |
  | posts | 5 | 25 | 5 |
  | replies | 4 | 103 | 4 |
  | notifications | 11 | 11 | 11 |
  | job_collabs / collab_interests / mentorships / follows / messages | 3 / 4 / 3 / 0 / 0 | unchanged | unchanged |
  | reply_count sum on non-seeded posts | 4 | 4 | 4 |

  Seeding created zero notifications. Wipe refused (1 dependent row) while a real member's reply sat on a
  seeded post, then succeeded after that reply was removed.
- **qa.py** (`seed/reports/qa_report.md`): 48 pass, 2 warn, 0 fail (pass 2; was 44 before the avatar checks) with `--allow-unverified-handles`.
  Without that flag the Reddit check FAILs, which is correct: it's a production blocker.
  - Warnings: 0/136 handles have a Reddit 404; 1 of 20 threads has zero replies (5%; the plan wants ≥8%,
    so 2 are needed).
  - Counts and mix: 15/121; NJ 122 / NYC 14; trade mix 34.6/33.1/25.7/6.6; display preference 110/24/2;
    no near-duplicate handles; no Senior accepting.
  - Timing: 81% of posts fall in the §6 windows, 0% at 0–4 am, none on Friday night.
  - Content: no internal 12-word overlaps.
  - Rendering: all 136 profile pages render with the badge. No private full name appears in the HTML for
    handle-preference members on the feed, mentors or profile pages. The "Accepting mentees" filter shows
    no Founding account. The About sentence is present.
- gen_threads warnings left on purpose: one thread body is 34 words (target 40–250), and nine short quips
  are under 10 words (target 10–160), mostly in the pork roll thread.

---

## 4. Handle-check outcome

Reddit answered **HTTP 403** (Reddit's own server, an HTML block page) to every unauthenticated
`about.json` request: 3 manual probes during recon, then 5 from `gen_handles.py` spaced ≥1.5 s plus jitter.
Per the rules the check **stopped** and nothing was worked around. The 251 candidates that passed the
offline checks are logged as `unverified` in `seed/handles_checked.csv`; 2 more were rejected as
near-duplicates.

The 136 assigned handles pass the app's format and reserved/blocked rules, don't collide with existing
members (case-insensitive), and are at Levenshtein distance ≥ 2 from each other. **None has a Reddit
404.**

Pass 2: the 15 renamed Senior handles were run through the app's format and reserved rules (all `ok`)
and checked against every Junior handle (no Levenshtein ≤1 pairs). They were never sent to Reddit (not
retried); the 5 pass-1 Reddit requests were for Senior handles that are now retired, and those rows stay
in `handles_checked.csv` marked `retired`. No Junior handle changed.

Style mix: trade+place 24, trade+number 16, humor 16, name 20, role/status 12, NJ flavor 15 (11%),
lazy/old 18 (13%), curated Senior 15.

---

## 5. Factual claims that need human verification

The sentence-level list is in `seed/reports/fact_lint.md` (55 flagged sentences). The 24 still marked as
not hedged are questions or personal statements, not claims. The claims themselves:

**Unions and jurisdictions (persona affiliations and threads)**
1. IBEW Local 102 covers Morris/Passaic/Essex; IBEW Local 164 covers Bergen/Hudson. Juniors were mapped
   this way, and in T01 an Irvington member guesses "102?".
2. IBEW Local 456 for Middlesex/Union/Somerset/Mercer juniors, IBEW Local 400 for Monmouth/Ocean, IBEW
   Local 351 for South Jersey.
3. UA Local 24 for North NJ, UA Local 9 for Central NJ (also Senior #5), UA Local 322 for South NJ.
4. NYC: IBEW Local 3, Plumbers Local 1, Steamfitters Local 638.
5. The apprenticeship process as S02 and S14 remember it: aptitude test (math and reading), interview,
   ranked list; retest rules; whether Local 3 currently uses a lottery or a test. Both Seniors defer to
   the official site.

**Licensing (NJ)**
6. NJ licensing centres on master/contractor licenses. A journeyman plumber license exists, and whether
   it's required depends on the employer and the work (S01, T05).
7. In T05, S12 says "five years as a journeyman before the master". S01 corrects him and both defer to the
   board. Confirm the correction is right, i.e. that the 5-year figure is not current.
8. NJ license names: Master Plumber, Electrical Contractor, and **Master HVACR Contractor** (HVACR
   licensing began ~2014, per the plan); a fire-alarm license (S10); an electrical inspector license (S07).
9. Electrical work for pay must be done by or under a licensed electrical contractor, with permits where
   required (S07, T13).
10. Home-improvement contractor registration is not a trade license and doesn't allow licensed work
    (S04, T14).
11. Prevailing-wage public jobs involve certified payroll (S11).
12. NJ's construction code edition applies statewide (S07's wording was changed to "the edition in
    effect").

**Licensing (NYC)**
13. The NYC Licensed Master Plumber license needs documented years under a licensed master, remembered as
    seven, with affidavits (S15, T08).
14. "NYC DOB gas work qualification" is listed as a credential on the S15 persona.

**EPA 608**
15. The Core section covers rules, dates and recovery, and is where people fail. Type I can be taken
    open-book online while the others are proctored (stated as "at least that's how mine was").

**Code and technical (field advice)**
16. Cable run through studs near the edge needs nail-plate protection; box fill counts conductors, devices
    and clamps (S07, T07).
17. One-pipe steam: check the sight glass, never feed cold water into a hot low-water boiler, then check the
    LWCO and pressuretrol (S01, T11).
18. Fixed orifice → measure superheat; TXV/EEV → measure subcool; check airflow first (T17).
19. 3-way switch commons and travelers (T18).

**Pay**
20. $21/hr for a 2nd-year non-union worker with their own car and no benefits is called "on the low side";
    $40/hr for a 2nd-year non-union worker is called "not typical" (T12).

**Schools and programs**
21. Junior affiliation hints name county vo-techs generically (e.g. "Essex County vo-tech '22", across 13
    counties) plus one "Apex grad (NYC)". T03 mentions a county vo-tech HVAC night program. S09 teaches at
    an **unnamed** Passaic County tech school.

**People and names**
22. One Senior displays a full name (the plan's "business-facing name"): **Rui Teixeira** (S12,
    Hudson/Bergen plumbing shop, Kearny). Confirm that isn't a real Hudson/Bergen plumbing shop owner before
    prod. Three Seniors show first name + initial ("Marcus B.", "Joy D.", "Arkady V."), as do 21 Juniors.

**Schedule**
23. The heat-wave dates in `schedule.py` (Jul 20–24 and Aug 10–13, 2026) are placeholders that haven't been
    checked against a weather archive.

---

## 6. Seniors (review gate)

All 15 have `is_founding_member = true`. None can log in, be messaged, be sent a mentorship request, or
receive a job application, and none is "accepting". The full records (bio, voice, situation, goals,
claims, fact flags) are in `personas/seniors.json`.

| # | handle | shows as | avatar | trade | region | yrs | title | licenses | mentoring | activity | voice |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | oldsteam_zig | handle ("Ziggy" to friends) | icon: wrench | plumbing | Bergen County, NJ | 28 | Master Plumber | NJ Master Plumber | limited | heavy | salty |
| 2 | mbell_wireman | Marcus B. | initials | electrical | Morris County, NJ | 19 | Foreman, inside wireman (IBEW 102) | — | limited | heavy | formal |
| 3 | thiago_sparks | handle | none | electrical | Monmouth County, NJ (Long Branch) | 22 | Electrical Contractor (non-union) | NJ Electrical Contractor | limited | regular | chatty |
| 4 | Kash_sing | handle | icon: flame | hvac | Middlesex County, NJ | 25 | HVAC contractor, owner | NJ Master HVACR Contractor, EPA 608 Universal | limited | heavy | formal; the only one who uses bullets |
| 5 | dhollis61 | handle | none | plumbing | Middlesex County, NJ | 30 | Steamfitter/plumber (UA 9) | — | not accepting | regular | terse, lowercase |
| 6 | hec_does_ac | handle | initials | hvac | Camden County, NJ | 15 | HVAC service lead | EPA 608 Universal | limited | regular | chatty, ellipses |
| 7 | codebook_dale | handle | none | electrical | Ocean County, NJ | 26 | Electrical inspector (ex-contractor) | NJ EC (inactive), inspector license | not accepting | heavy | formal |
| 8 | joyd_plumbing | Joy D. | initials | plumbing | Hudson County, NJ | 17 | Master Plumber | NJ Master Plumber | limited | regular | terse, direct |
| 9 | ms_almonte | handle | initials | hvac | Passaic County, NJ | 28 | Vo-tech instructor | NJ Master HVACR Contractor, EPA 608 Universal | limited | heavy | chatty |
| 10 | wchen_controls | handle | icon: plug | electrical | Somerset County, NJ | 14 | Controls / low-voltage | NJ fire alarm license | limited | regular | chatty, lowercase |
| 11 | haddad_mech | handle | none | hvac | Burlington County, NJ | 24 | Mechanical contractor | NJ Master HVACR + Master Plumber | limited | regular | formal |
| 12 | rui_t_kearny | Rui Teixeira | initials | plumbing | Hudson County, NJ (Kearny) | 23 | Second-generation shop owner | NJ Master Plumber | limited | regular | chatty |
| 13 | tnguyen_refrig | handle | icon: snowflake | hvac | Atlantic County, NJ | 18 | Refrigeration tech | EPA 608 Universal | not accepting | regular | salty, lowercase |
| 14 | dreb_jman | handle | none | electrical | Queens, NY | 21 | Journeyman (Local 3) | — | not accepting | regular | terse |
| 15 | bklyn_arkady | Arkady V. | initials | plumbing | Brooklyn, NY | 26 | NYC Licensed Master Plumber | NYC LMP, DOB gas qualification | limited | regular | chatty |

Pass 2 (Gaurav's review): the Seniors were renamed (private names: Zbigniew Nowak, Marcus Bell, Thiago
Ferreira, Kashmir Singh, Dwayne Hollis, Hector Rivera, Dale Whitacre, Joy Dimaculangan, Rosa Almonte, Wei
Chen, Sami Haddad, Rui Teixeira, Tuan Nguyen, Andre Baptiste, Arkady Volkov) and given avatars. Roles,
counties, trades, years, voices, bios and situations are unchanged; town hints moved for S03 (Long Branch)
and S12 (Kearny).

**Juniors (121):** 109 NJ / 12 NYC. Paths: non-union 35, union 24, vo-tech grad 19, vo-tech student 13,
career switcher 24, service tech 6. Activity: lurker 49, occasional 42, regular 24, heavy 6. They were
generated from pools with no LLM, so expect some templated feel in the bios. Review them after the
Seniors.

**20 sample threads:**
- Mix: A4 B4 C3 D3 E4 F2; 2 NYC (Local 3 application; NYC master license at 42); 1 with zero replies;
  3 started by Seniors; 99 replies in total.
- The plan's style beats: an `edit:`, two `update:` posts, a quote-style "^" reply, a reply that misreads
  the question (and gets corrected), and a Senior politely correcting another Senior.
- Voice and texture: Kash_sing's bullets; regional detail (Wawa vs QuickChek, the Turnpike, Hoboken parking,
  steam heat in Bayonne, shore raised houses, pork roll).

---

## 7. Decisions that deviate from the plan (and why)

1. **No Reddit research** (§5): skipped per the brief. `themes.yaml` comes from the plan's §4 plus general
   knowledge. The §8 plagiarism scan is internal-only because there is no reference corpus.
2. **Handles are unverified against Reddit** (§3/§8): Reddit blocks unauthenticated requests, and I didn't
   work around it.
3. **No Senior is "accepting"** (§4 asks for 6/5/4): 11 limited, 4 not accepting, because no human backs
   any account yet.
4. **The contact guard also covers job applications** to Founding accounts, since a pitch would go
   unanswered just like a DM.
5. **No `handle` column and no provisional backfill** (§2a): `username` already is the handle (per the
   brief). Instead, `username_changed_at` null means the handle was never chosen, which triggers a feed
   nudge; `confirm_current_handle()` keeps the handle without starting the 30-day clock.
6. **Existing members default to `display_preference = handle`**, so their email-derived username becomes
   their public name until they choose one. See open question 7.
7. **A case-insensitive collision aborts 0009** rather than renaming real members.
8. **Handle length:** the DB allows 3–22 characters (per the brief); generated handles are 4–22 (plan §3).
9. **Deferred:** the "show full name to connections" checkbox (§2a) and redirects from old handles.
10. **Search no longer matches full names** (privacy).
11. **Seeding uses SQL** with FK and integrity checks; the plan prefers an ORM, but none exists.
12. **Seeded auth users** have an empty password, are banned, and use `.invalid` emails, so nobody can log
    in as them or reset a password into them.
13. **Juniors are generated from pools; Seniors and threads are hand-written.** No LLM runs at script time.
14. **Persona schema additions:** the paths `journeyman`, `instructor` and `inspector`, plus the fields
    `full_name` (private), `public_region`, `title`, `mentor_availability`, `claims` and `fact_flags`.
    Juniors get `mentor_availability = not_accepting`, which doesn't matter for juniors.
15. **The sample's category mix is A4 B4 C3 D3 E4 F2, with 1 zero-reply thread (5%).** The plan's shares
    and its ≥8% zero-reply target apply to the full ~190 threads.
16. **Avatar initials come from the public name** (the handle's capitals), so they don't leak private
    initials. Avatars (pass 2, migration 0011) are styles, not images: initials on a muted colour pair
    derived from the handle, a trade icon, or a grey silhouette. Mix: 44% none / 40% initials / 16% icon.
17. **`supabase/config.toml` disables auto-migrations and auto-seed**; `local_db_setup.sh` applies
    everything in order.
18. Fixed two pre-existing lint errors so lint passes.
19. `docs/` (the plan) is committed on the branch.

## 8. Open questions for Gaurav

1. ~~**Backfill window**~~ **Decided (Gaurav, Oct 5):** seeded history starts at the July 24 launch and ramps
   rather than spreading evenly: 1-2 threads a day after launch, 3-4 a day from Aug 7, Aug 24-26 blank, a
   weekend spike Aug 29-30 (5 and 9), then a slow climb through September. `schedule.py --plan` prints the
   day-by-day plan (213 threads, a bit above the plan's ~190 because of the September climb); the 20-thread
   sample takes evenly spaced slots from it. Joins now run Jul 24 - Oct 1 (Seniors Jul 24 - Aug 1). When the
   full set is seeded to prod, pass `--end` = the day before seeding.
2. **Disclosure accuracy:** the About sentence says the seed was made "with help from NJ tradespeople", but
   this pass's content was written by Claude with no tradesperson review. Either recruit reviewers before
   prod or change the wording. Also decide whether to say the text was AI-assisted.
3. **Reddit verification:** use Reddit's authenticated API (an OAuth app, within their terms), check by
   hand, or accept the risk? Nothing should go to prod with all 136 handles unverified.
4. **Who backs mentor slots?** The plan's 6 "accepting" Seniors need real humans. Today the contact guard
   blocks every Founding account outright, so a human-backed account would need a separate "staffed" flag
   that routes to a team inbox.
5. **`full_name` is still readable through the API.** Rendering hides it, but RLS lets anyone with the anon
   key run `select full_name` on `profiles`. Making it truly private needs column privileges or a public
   view. That's a bigger change and isn't done.
6. **The full-name Senior** (Rui Teixeira): keep, or switch to a handle to rule
   out matching a real contractor?
7. **Existing members' display default:** keep `handle` (privacy-first, as the plan says) or set existing
   rows to `full_name` so they aren't surprised?
8. **Union-local mapping** for junior affiliations (§5 items 1–4): confirm it, or have a tradesperson
   correct it before the full set.
9. **Production path:** 0009–0011 must run on prod before any seed, and `seed.py` refuses non-local hosts
   by design. Decide the prod mechanism (DB connection string or a service-role job) and who runs it.
10. **Replies from real users on seeded posts** will notify a seeded account nobody reads, and a seeded
    question author can never accept a real answer. Is that acceptable for the founding period?
11. **Helpful counts:** seeded counts are log-normal (threads 2–40), and the live counters have no per-user
    dedupe. Fine as-is?
12. **Next pass:** the remaining ~170 threads from `content/thread_briefs.json`, collabs with pitches,
    mentor requests (status only), follows, real heat-wave dates, and images (§5a).

---

## 9. Social layer (mentorships + follows), branch `feat/seed-social`

The live batch `fm-2026-10` (136 Founding accounts, 20 threads) showed 0 followers and 0 mentees
everywhere. This pass adds the social graph, fixes the helpful-vote oddities, and ships both to
production as one additions-only SQL file.

### What was built
- **`seed/scripts/gen_social.py`** (deterministic, `common.RNG_SEED + 29`; two runs give byte-identical
  files) → `seed/content/mentorships.json` and `seed/content/follows.json`.
- **`gen_threads.py` `rebalance_helpful()`**: accepted answers and substantive Senior answers (40+
  words) now lead on helpful votes. It swaps counts with the reply that outranks them (any reply when the
  leader is accepted, only short ones under 25 words otherwise), so the thread keeps the same numbers;
  a tie bumps the leader by 1. 11 replies in 6 threads changed (T02, T05, T07, T10, T15, T17), e.g. T15:
  Ziggy's accepted answer 8 → 29, Rui's 21-word "Agree with Ziggy" 29 → 8. Timestamps and everything
  else are byte-identical. **These rows are already live**, so the production file corrects them.
- **`seed.py`** inserts mentorships and follows in the same transaction and batch (`seed_batch_id`,
  `homefixr.seeding = 'on'`) for local seeding and for `--emit-sql`, with new checks (seeded-to-seeded
  only, junior → senior, one active mentor per Junior, every mentee follows their mentor, nothing outside
  the window or before both people joined). New **`--emit-additions-sql PATH`** (see below).
  `--no-social` seeds the batch as it went live.
- **`wipe.py`** needed no change: it already deletes `follows` and `mentorships` by `seed_batch_id`
  before replies/posts/users, and its dependent-row refusal only counts rows *not* tagged with the batch.
- **`qa.py`**: 34 new checks (pure data, DB, rendered pages), listed under QA results.
- `seed/content/live_helpful_fm-2026-10.json`: the helpful counts as seeded to production (from
  `e3b036e`, confirmed on the live T15 page on Oct 7: 8 on the accepted answer, 29 on Rui's reply). The
  additions file applies the difference from these, so real members' votes since then are kept.

### How the graph was made
**Mentorships (36: 22 active = 61%, 11 pending, 3 declined)**
- Active mentees per Senior are set by hand: three pillars with 3–5 (ms_almonte 5, the vo-tech
  instructor; oldsteam_zig 4; Kash_sing 3), six with 1–2, six with 0. Two of the four "not taking
  mentees" Seniors carry actives (dreb_jman 2, codebook_dale 1), which is why they're full.
- Pairs the threads imply come first (10 rows): threeway_02 → mbell_wireman (T01, thanked the accepted
  answer), Edison.volts → thiago_sparks (T02, "update: got hired" at the kind of shop Thiago pointed to),
  TryingAllThree → joyd_plumbing (T03, "the ride-along idea"), Kearny_Pipefitter → joyd_plumbing (T09,
  "like Joy said"), Exit117Plumber → oldsteam_zig (T15), ExRetail_NowHVAC → ms_almonte (T06 + T19),
  Flushing.sparks → dreb_jman (T04, NYC); pending: Dev_H → rui_t_kearny (T10), LiveFrontLessons →
  thiago_sparks (T07; he thanked Dale too, but Dale isn't taking mentees), epa60812_2 → hec_does_ac (T16).
  Every request is dated after the thread exchange.
- The rest are drawn: Juniors weighted by path (career switcher 2.6, vo-tech 2.0, non-union 1.0, union
  0.45) × activity (heavy 3.2, regular 2.2, occasional 0.8, lurker 0.1); matched by trade first
  (ms_almonte and haddad_mech also take plumbing), then region; NYC Juniors only to the NYC Seniors.
  Pending and declined requests go only to "limited" Seniors (the app hides the request button on "Not
  taking mentees" profiles), pending ones mostly in the last three weeks. A Senior never answers their own
  mentee's later thread as if they were strangers (the request always follows the exchange).
- `mentorships` stores only `created_at`, so it is the request time. The accept/decline time is kept in
  the JSON (`decided_at`) for QA: 2 h to 6 days, median about a day.
- Result: 8/24 career switchers and 7/32 vo-tech Juniors have a mentor vs 7/65 others; regular 11/24,
  heavy 1/6 (two more heavy Juniors have a pending request), occasional 9/42, lurkers 1/49. All 22
  actives are in the mentor's trade; 14/22 in the same region; NYC 4/4.

**Follows (389)**
- 28/136 accounts (21%) follow nobody, mostly lurkers. Every mentee follows their mentor (22), most
  requesters follow the Senior they asked (9), Juniors follow the Seniors who answered their threads,
  usually within hours (23), Seniors who argued in the same thread follow each other (28 thread-prompted
  in all), the rest by popularity × trade × region (307). Seniors follow other Seniors (49 follows) and
  only a few standout Juniors (heavy/regular, 7).
- Followers: pillars 22–40 (oldsteam_zig 40, Kash_sing 31, mbell_wireman 26, codebook_dale 22,
  ms_almonte 22); other Seniors 6–14; heavy Juniors 2–8; regular 0–8 (median 3); occasional 0–3;
  lurkers 0–1. 231/389 follows are within the same trade, 158 within the same region.
- No follow or request is before both people joined, at 0–4 am, or after Oct 4 23:59 ET.

### Per-Senior
| handle | availability | active mentees | pending | declined | followers | follows |
|---|---|---|---|---|---|---|
| oldsteam_zig | limited | 4 | 1 | 0 | 40 | 4 |
| mbell_wireman | limited | 2 | 1 | 0 | 26 | 4 |
| thiago_sparks | limited | 1 | 3 | 0 | 14 | 4 |
| Kash_sing | limited | 3 | 0 | 1 | 31 | 4 |
| dhollis61 | not accepting | 0 | 0 | 0 | 12 | 5 |
| hec_does_ac | limited | 0 | 1 | 0 | 10 | 4 |
| codebook_dale | not accepting | 1 | 0 | 0 | 22 | 3 |
| joyd_plumbing | limited | 2 | 0 | 0 | 11 | 2 |
| ms_almonte | limited | 5 | 2 | 1 | 22 | 3 |
| wchen_controls | limited | 0 | 1 | 1 | 13 | 3 |
| haddad_mech | limited | 0 | 1 | 0 | 13 | 2 |
| rui_t_kearny | limited | 0 | 1 | 0 | 14 | 5 |
| tnguyen_refrig | not accepting | 0 | 0 | 0 | 11 | 6 |
| dreb_jman | not accepting | 2 | 0 | 0 | 6 | 5 |
| bklyn_arkady | limited | 2 | 0 | 0 | 6 | 3 |

<!-- SOCIAL-RESULTS -->
