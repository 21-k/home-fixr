# QA report

Run: 2026-10-07T08:59:57-04:00 · threads: `content/threads.sample.scheduled.json` · db: yes · app: http://localhost:3000

| status | check | detail |
|---|---|---|
| PASS | counts: 15 Seniors / 121 Juniors = 136 | 15 / 121 |
| PASS | NJ 122 / NYC 14 (±1) | NJ 122 / NYC 14 |
| PASS | trade mix within ±3 pts | electrical 34.6%, plumbing 33.1%, hvac 25.7%, general 6.6% |
| PASS | no seeded Senior general/undecided |  |
| PASS | handles unique (case-insensitive) |  |
| PASS | no near-duplicate handles (Levenshtein <= 1) | [] |
| PASS | handle format 4-22 [A-Za-z0-9_.] | [] |
| PASS | every handle logged in handles_checked.csv | [] |
| WARN | every handle has a logged Reddit 404 | 0/136 have a 404; rest unverified (Reddit returned 403, see REPORT.md) |
| PASS | display preference ≈80/18/2 | {'handle': 110, 'first_name_initial': 25, 'full_name': 1} |
| PASS | no seeded Senior shown as accepting mentees | [] |
| PASS | avatar mix ≈45% none / 40% initials / 15% icon (±5 pts) | icon 16%, initials 40%, none 44% |
| PASS | every 'icon' persona has an allowed icon (and only they do) | [] |
| PASS | Junior icons match their trade | [] |
| PASS | junior activity 40/35/20/5 | {'regular': 24, 'occasional': 42, 'lurker': 49, 'heavy': 6} |
| PASS | all flagged is_founding_member + batch |  |
| WARN | ≥8% zero-reply threads | 1/20 = 5% (sample of 20; 2 needed for 8%) |
| PASS | reply length right-skewed (median < mean) | median 27, mean 33.3, max 118 |
| PASS | no two threads share a title stem | [] |
| PASS | ~85% of starters are Juniors | {'junior': 17, 'senior': 3} |
| PASS | ≥2 NYC threads in sample |  |
| PASS | all categories A–F present | {'A': 4, 'B': 4, 'C': 3, 'D': 3, 'E': 4, 'F': 2} |
| PASS | persona consistency: Seniors' stated years match |  |
| PASS | lowercase-voice Seniors stay lowercase | [] |
| PASS | bullet points only from Kash_sing | [] |
| PASS | nobody mentions/praises Home Fixr | [] |
| PASS | plagiarism: no 12-word overlap (internal; no external corpus) | 8-gram overlaps: 3; 12+: [] |
| PASS | posting hours match §6 (evening/early/lunch ≥70%, 0–4am ≤3%) | rhythm 82%, 0-4am 0%; 5:8 6:11 7:2 8:4 9:3 10:6 11:1 12:5 13:7 15:3 17:2 18:4 19:8 20:14 21:23 22:7 23:11 |
| PASS | Friday nights quiet | 0 posts Fri after 6pm |
| PASS | fact lint written for human review | 56 flagged sentences -> seed/reports/fact_lint.md |
| PASS | About sentence present in source |  |
| PASS | social: ~35 mentorships (30-40) | 36: active 22, declined 3, pending 11 |
| PASS | social: ~60% active (50-70%) | 61% active |
| PASS | social: a few declined (2-5), rest pending | declined 3, pending 11 |
| PASS | social: every mentorship is junior -> senior | [] |
| PASS | social: no duplicate mentorship pairs | [] |
| PASS | social: no Junior has two active mentors | [] |
| PASS | social: a second, pending request is rare (<= 2 Juniors) | ['joe.plumb'] |
| PASS | social: pending requests mostly to 'limited' Seniors (>= 70%) | 11/11 |
| PASS | social: no pending/declined request to a 'not taking mentees' Senior (the app hides the button) | [] |
| PASS | social: active mentees per Senior vary (>=2 with 3-5, >=3 with 1-2, >=2 with 0, none >5) | 3-5: 3, 1-2: 6, 0: 6; oldsteam_zig:4 mbell_wireman:2 thiago_sparks:1 Kash_sing:3 codebook_dale:1 joyd_plumbing:2 ms_almonte:5 dreb_jman:2 bklyn_arkady:2 |
| PASS | social: 'not taking mentees' Seniors carry 0-2 actives (some 1-2: that's why they're full) | {'dhollis61': 0, 'codebook_dale': 1, 'tnguyen_refrig': 0, 'dreb_jman': 2} |
| PASS | social: no full Senior shown as 'Accepting mentees' | [] |
| PASS | social: actives matched by trade (>= 80%) | 22/22 |
| PASS | social: actives often in the same region (>= 40%) | 14/22 |
| PASS | social: NYC Juniors' mentors mostly the NYC Seniors; NJ Juniors' almost never | NYC 4/4; NJ->NYC 0 |
| PASS | social: career switchers / vo-tech more likely to have a mentor | 27% of 56 vs 11% of 65 |
| PASS | social: regular+heavy > occasional > lurker for having a mentor; lurkers rarely (<= 10%) | regular+heavy 40% (heavy 17%, regular 46%, occasional 21%, lurker 2%) |
| PASS | social: mentorship times inside the window, after both joined, accepted hours-days later | latency h: min 2, median 23, max 143;  |
| PASS | social: thread-implied pairs (thanks / 'update: did what X said') are in the graph, after the exchange | 10 anchored; [] |
| PASS | social: no mentor answers their mentee's later thread as a stranger | [] |
| PASS | social: no self-follows, no duplicate follows, both ends are personas | 389 follows |
| PASS | social: every mentee follows their mentor | [] |
| PASS | social: ~20% of accounts follow nobody (17-23%) | 28/136 = 21% |
| PASS | social: followers by kind in band (pillars 15-40, Seniors 5-15, active Juniors 0-8, occasional 0-5, lurkers 0-3) | pillar 22-40 (median 26); senior 6-14 (median 12); heavy 2-8 (median 7); regular 0-8 (median 3); occasional 0-3 (median 0); lurker 0-1 (median 0) |
| PASS | social: the graph is skewed (top 5 accounts hold >= 25% of follows) | top 5: [('oldsteam_zig', 40), ('Kash_sing', 31), ('mbell_wireman', 26), ('codebook_dale', 22), ('ms_almonte', 22)] |
| PASS | social: follows of non-pillars mostly within trade or region (>= 75%) | 195/248 |
| PASS | social: Seniors who follow anyone follow some other Seniors | [] |
| PASS | social: Seniors follow only the occasional standout Junior (regular/heavy) | {'heavy': 6, 'regular': 2} |
| PASS | social: Juniors mostly follow the Senior whose answer they accepted (>= 50%) | 11/11 |
| PASS | social: every follow is after both joined and inside the window | [] |
| PASS | social: thread-prompted follows come after the exchange | 51 prompted; early: [] |
| PASS | social: follows/requests keep the posting rhythm (0-4am <= 3%) | 0/425 at 0-4am |
| PASS | helpful: the accepted answer has the most helpful votes in its thread | [] |
| PASS | helpful: no short reply outvotes the substantive Senior answer | [] |
| PASS | answered: Seniors' 'answered' = their reply count (replies/threads; own-thread replies noted) | oldsteam_zig:9/7 mbell_wireman:3/3 thiago_sparks:7/6 Kash_sing:4/4(+1 own) dhollis61:2/2 hec_does_ac:6/6(+1 own) codebook_dale:4/4 joyd_plumbing:4/4 ms_almonte:3/3(+1 own) wchen_controls:0/0 haddad_mech:4/4 rui_t_kearny:7/6 tnguyen_refrig:4/4 dreb_jman:1/1 bklyn_arkady:2/2 |
| PASS | collabs: ~20 job collabs (18-22), all posted by seeded Seniors | 20 collabs by 12 Seniors: oldsteam_zig 2, haddad_mech 2, thiago_sparks 2, hec_does_ac 2, joyd_plumbing 2, Kash_sing 2, rui_t_kearny 2, ms_almonte 2, bklyn_arkady 1, mbell_wireman 1, wchen_controls 1, tnguyen_refrig 1 |
| PASS | collabs: 2-4 pitches each, from seeded Juniors, one per Junior per collab | 61 pitches; sizes {2: 4, 3: 11, 4: 5} |
| PASS | collabs: exactly 1 accepted per collab; the rest declined or pending ('interested') | {'declined': 25, 'accepted': 20, 'interested': 16}; bad: [] |
| PASS | collabs: types extra_hand / ride_along / specialist all used; pay_type per schema | {'extra_hand': 12, 'ride_along': 6, 'specialist': 2}; pay {'day_rate': 12, 'unpaid': 5, 'flexible': 3} |
| PASS | collabs: every collab filled_at after its last application and its accept, before the job day | [] |
| PASS | collabs: job dates Aug 1 - Oct 3; every timestamp inside the window, none at 0-4 am | 146 timestamps; window [] night [] dates [] |
| PASS | collabs: poster joined before posting; applicants joined before applying, after posting; decisions after pitches | [] |
| PASS | collabs: trade match (applicants' trade = the job's; the poster works that trade) | [] |
| PASS | collabs: region match (job county in the poster's region; every applicant lives in it) | [] |
| PASS | collabs: some accepted pitches are the poster's mentee (3-10), each sent after the mentorship was accepted | 7 of 20: C06 big_zach_hvac->Kash_sing, C08 briplumb87->bklyn_arkady, C09 DinerCoffeeHVAC->ms_almonte, C10 threeway_02->mbell_wireman, C13 Kearny_Pipefitter->joyd_plumbing, C15 Edison.volts->thiago_sparks, C17 sweatjoint200amp->oldsteam_zig |
| PASS | collabs: town-level locations only; no street address, phone or email anywhere | [] [] |
| PASS | collabs: application detail and stated years match each persona; no CV files | [] |
| PASS | collabs: persona voice (lowercase voices stay lowercase, bullets only from Kash_sing, nobody mentions Home Fixr) | [] |
| PASS | collabs: no 12-word overlap with each other or with the threads | [] |
| PASS | DB: 136 seeded profiles | 136 |
| PASS | DB: every seeded profile is_founding_member |  |
| PASS | DB: no handle collision with any other member | 0 |
| PASS | DB: zero notifications involving seeded accounts | 0 |
| PASS | DB: no seeded Senior accepting mentees | 0 |
| PASS | DB: seeded avatar fields written and consistent | 0 |
| PASS | DB: seeded auth users have no password and are banned | 0 |
| PASS | DB: batch mentorships / follows match the files | mentorships 36/36, follows 389/389 |
| PASS | DB: mentorship statuses as generated | {'declined': 3, 'active': 22, 'pending': 11} |
| PASS | DB: social rows are seeded-to-seeded only | 0 |
| PASS | DB: every mentorship is junior -> senior | 0 |
| PASS | DB: no Junior with two active mentors | 0 |
| PASS | DB: every active mentee follows their mentor | 0 |
| PASS | DB: social timestamps inside the window and after both joined | 0 |
| PASS | DB: no notifications from the social rows (or anything seeded) | 0 |
| PASS | DB: reply helpful counts match the (rebalanced) files | [] |
| PASS | DB: logged-out visitors can read follows but no mentorship rows (RLS unchanged) | anon sees 0 mentorships, 389 follows |
| PASS | DB: batch job collabs / pitches match the file | collabs 20/20, pitches 61/61 |
| PASS | DB: pitch statuses as generated | {'declined': 25, 'interested': 16, 'accepted': 20} |
| PASS | DB: exactly one accepted pitch per batch collab | 0 |
| PASS | DB: every batch collab filled, after its last pitch | 0 |
| PASS | DB: interested_count matches the pitches (trigger) | 0 |
| PASS | DB: collab rows are seeded-to-seeded only | 0 |
| PASS | DB: no CV files on seeded pitches | 0 |
| PASS | DB: no collab notifications from the seeded collabs | 0 |
| PASS | DB: logged-out visitors see the filled collabs but no pitches (RLS) | anon sees 20 filled collabs, 0 pitches |
| PASS | DB: a real member applying to any seeded collab is refused with 'position has been filled' | 20 tries: Counter({'This position has been filled': 20}) |
| PASS | app: /feed renders | 200 |
| PASS | app: no full_name of handle-preference users on /feed | [] |
| PASS | app: Founding Community badge on /feed | 92 badges for 20 posts |
| PASS | app: /mentors lists all 15 seeded Seniors with badge | 15 shown, 60 badges |
| PASS | app: no full_name of handle-preference Seniors on /mentors | [] |
| PASS | app: /mentors 'answered' counts match the DB | 15 cards; [] |
| PASS | app: /mentors 'mentees' counts match the DB | 0 of 15 cards differ: [] |
| PASS | app: 'Accepting mentees' filter excludes every Founding account |  |
| PASS | app: all 136 profile pages render (200) | [] |
| PASS | app: Founding Community badge on every seeded profile | [] |
| PASS | app: no private full_name on handle-preference profiles | [] |
| PASS | app: /u/<handle> 'followers' match the DB (all 136) | 0 differ: [] |
| PASS | app: /u/<handle> 'active mentees' match the DB (all 136) | 0 differ: [] |
| PASS | app: /u/<handle> 'answers' match the DB (all 136) | 0 differ: [] |
| PASS | app: seeded thread pages render with badges | 20 threads checked; bad: [] |
| PASS | app: About page carries the §0.3 sentence |  |
| PASS | app: landing FAQ + footer link to About |  |
| PASS | app (logged out): /collabs shows 'Position filled' and no apply control on every seeded collab | 200; 23 cards; missing []; [] |
| PASS | app (logged out): open collabs listed before filled ones | 3 open, 20 filled |
| PASS | app (logged out): 'Open only' hides every seeded (filled) collab | 200; shown: [] |
| PASS | app (signed-in member): /collabs shows 'Position filled' and no apply control on every seeded collab | 200; 23 cards; missing []; [] |
| PASS | app (signed-in member): open collabs listed before filled ones | 3 open, 20 filled |
| PASS | app (signed-in member): seeded collabs also keep the Founding notice, under Position filled | signed in: True; founding notice on 20/20 |
| PASS | app (signed-in member): 'Open only' hides every seeded (filled) collab | 200; shown: [] |
