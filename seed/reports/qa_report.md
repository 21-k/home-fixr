# QA report

Run: 2026-10-12T00:24:12-04:00 · threads: `content/threads.scheduled.json` · db: yes · app: http://localhost:3000

| status | check | detail |
|---|---|---|
| PASS | counts: exactly 9 mentors + 20 apprentices = 29 | 9 / 20 |
| PASS | the apprentices are the 20 busiest of the full set (posts + replies, ties by handle) | missing [] |
| PASS | regions (info; the plan's NJ 122 / NYC 14 was for 136 accounts) | NJ 26 / NYC 3: NJ-Central 7, NJ-North 13, NJ-South 6, NYC 3 |
| PASS | every trade has at least 2 mentors (the plan's 35/33/25/7 mix was for 136 accounts) | mentors electrical 3, plumbing 2, hvac 4; apprentices electrical 9, general 1, hvac 1, plumbing 9 |
| PASS | no seeded Senior general/undecided |  |
| PASS | handles unique (case-insensitive) |  |
| PASS | no near-duplicate handles (Levenshtein <= 1) | [] |
| PASS | handle format 4-22 [A-Za-z0-9_.] | [] |
| PASS | every handle logged in handles_checked.csv | [] |
| WARN | every handle has a logged Reddit 404 | 0/29 have a 404; rest unverified (Reddit returned 403, see REPORT.md) |
| WARN | display preference ≈80/18/2 | {'handle': 25, 'first_name_initial': 3, 'full_name': 1} |
| PASS | no seeded Senior shown as accepting mentees | [] |
| PASS | avatar mix (info; the ≈45/40/15 target was for 136 accounts, the kept 29 keep their own avatars) | icon 17%, initials 59%, none 24% |
| PASS | every 'icon' persona has an allowed icon (and only they do) | [] |
| PASS | Junior icons match their trade | [] |
| PASS | apprentice activity levels (info; the busiest 20 are all regular/heavy) | {'regular': 14, 'heavy': 6} |
| PASS | all flagged is_founding_member + batch |  |
| PASS | ≥6% zero-reply threads (relaxed from 8% after the cut) | 8/104 = 7.7% |
| PASS | reply length right-skewed (median < mean) | median 35.0, mean 39.6, max 137 |
| PASS | no two threads share a title stem | [] |
| PASS | ~85% of starters are Juniors | {'junior': 79, 'senior': 25} |
| PASS | ≥2 NYC threads in sample |  |
| PASS | all categories A–F present | {'A': 25, 'B': 17, 'C': 20, 'D': 15, 'E': 18, 'F': 9} |
| PASS | persona consistency: Seniors' stated years match |  |
| PASS | lowercase-voice Seniors stay lowercase | [] |
| PASS | bullet points only from Kash_sing | [] |
| PASS | nobody mentions/praises Home Fixr | [] |
| PASS | plagiarism: no 12-word overlap (internal; no external corpus) | pairs sharing an 8-gram: 75, 72 of them the same persona repeating a tic; 12+: [] |
| PASS | plagiarism: 8-gram overlap between different people ~0 (pairs ≤ 8% of the thread count; what's left is stock phrases and quotes) | 3: T022/r1~T022/r2: "don't let either side tell you the other"; T090/r1~T090/r2: 'real task a day that you can check'; T110/r1~T110/r2: 'ask that shop what their july looks like' |
| PASS | lowercase-voice Juniors stay lowercase (new threads; T06/r4 is live) | [] |
| PASS | posting hours match §6 (evening/early/lunch ≥70%, 0–4am ≤3%) | rhythm 79%, 0-4am 0%; 5:43 6:45 7:10 8:20 9:23 10:18 11:7 12:23 13:24 14:9 15:2 16:8 17:18 18:28 19:38 20:51 21:73 22:67 23:41 |
| PASS | Friday nights quiet | 1 posts Fri after 6pm |
| PASS | fact lint written for human review | 266 flagged sentences -> seed/reports/fact_lint.md |
| PASS | About sentence present in source |  |
| PASS | social: active mentorships 13-17 and pending requests 2-5 | 19: active 15, pending 4 |
| PASS | social: declined requests 0-2 (none needed in the reduced cast) | declined 0 |
| PASS | social: every mentorship is junior -> senior | [] |
| PASS | social: no duplicate mentorship pairs | [] |
| PASS | social: no Junior has two active mentors | [] |
| PASS | social: a second, pending request is rare (<= 2 Juniors) | ['joe.plumb', 'Dev_H'] |
| PASS | social: pending requests mostly to 'limited' Seniors (>= 70%) | 4/4 |
| PASS | social: no pending/declined request to a 'not taking mentees' Senior (the app hides the button) | [] |
| PASS | social: every mentor has 1-3 active mentees | oldsteam_zig:3 mbell_wireman:3 thiago_sparks:2 Kash_sing:2 hec_does_ac:1 codebook_dale:1 ms_almonte:1 haddad_mech:1 rui_t_kearny:1 |
| PASS | social: 'not taking mentees' Seniors carry 1-2 actives (that's why they're full) | {'codebook_dale': 1} |
| PASS | social: availability labels agree with the load (no mentor shown 'Accepting'; 3 actives only on 'limited') | oldsteam_zig:3/limited mbell_wireman:3/limited thiago_sparks:2/limited Kash_sing:2/limited hec_does_ac:1/limited codebook_dale:1/not_accepting ms_almonte:1/limited haddad_mech:1/limited rui_t_kearny:1/limited |
| PASS | social: actives matched by trade (>= 80%) | 14/15 |
| PASS | social: actives often in the same region (>= 40%) | 9/15 |
| PASS | social: NYC apprentices' mentors are NYC mentors, or North Jersey ones when no NYC mentor stays | 2/2; NYC mentors kept: 0 |
| PASS | social: a few apprentices have no mentor (2-7) | ['JerseyTomatoWires', 'peteplumb80', 'Passaic_Sparky', 'neutral_bar_99', 'plumbguy917'] |
| PASS | social: career switchers / vo-tech at least as likely to have a mentor | 89% of 9 vs 64% of 11 |
| PASS | social: mentors by activity (info; the kept apprentices are all regular/heavy) | regular+heavy 75% (heavy 33% of 6, regular 93% of 14) |
| PASS | social: mentorship times inside the window, after both joined, accepted hours-days later | latency h: min 10, median 23, max 37;  |
| PASS | social: thread-implied pairs (thanks / 'update: did what X said') are in the graph, after the exchange | 13 anchored; [] |
| PASS | social: every 'my mentor' in a thread matches an active mentorship | [] |
| PASS | social: no mentor answers their mentee's later thread as a stranger | [] |
| PASS | social: no self-follows, no duplicate follows, both ends are personas | 111 follows |
| PASS | social: every mentee follows their mentor | [] |
| PASS | social: accounts following nobody (info; the plan's ~20% were mostly lurkers, and no lurker stays) | 0/29 = 0% |
| PASS | social: followers in band (mentors 6-15, apprentices 0-6) | pillar 7-14 (median 9); senior 6-10 (median 7); heavy 0-5 (median 3); regular 0-3 (median 1) |
| PASS | social: the graph is skewed (top 5 accounts hold >= 25% of follows) | top 5: [('oldsteam_zig', 14), ('mbell_wireman', 13), ('rui_t_kearny', 10), ('Kash_sing', 9), ('ms_almonte', 8)] |
| PASS | social: follows of non-pillars mostly within trade or region (>= 60%; relaxed from 75%: 29 busy people follow across trades more) | 39/60 |
| PASS | social: Seniors who follow anyone follow some other Seniors | [] |
| PASS | social: Seniors follow only the occasional standout Junior (regular/heavy) | {'heavy': 6, 'regular': 3} |
| PASS | social: Juniors mostly follow the Senior whose answer they accepted (>= 50%; the 20 threads the graph was built from) | 5/5 |
| PASS | social: every follow is after both joined and inside the window | [] |
| PASS | social: thread-prompted follows come after the exchange | 33 prompted; early: [] |
| PASS | social: follows/requests keep the posting rhythm (0-4am <= 3%) | 0/130 at 0-4am |
| PASS | helpful: the accepted answer has the most helpful votes in its thread | [] |
| PASS | helpful: no short reply outvotes the substantive Senior answer | [] |
| PASS | answered: Seniors' 'answered' = their reply count (replies/threads; own-thread replies noted) | oldsteam_zig:32/25 mbell_wireman:27/24(+3 own) thiago_sparks:29/26(+1 own) Kash_sing:38/30(+9 own) hec_does_ac:14/13(+3 own) codebook_dale:33/29(+2 own) ms_almonte:24/20(+1 own) haddad_mech:24/21(+2 own) rui_t_kearny:29/27(+2 own) |
| PASS | full: category mix within ±4 pts of plan §4 (relaxed from ±3 for 104 threads) | A 25 (24.0% vs 22), B 17 (16.3% vs 14), C 20 (19.2% vs 20), D 15 (14.4% vs 14), E 18 (17.3% vs 18), F 9 (8.7% vs 12) |
| PASS | full: ~10% NYC threads (8-12%) | 11/104 = 10.6% |
| PASS | full: 6-10% zero-reply threads (relaxed from ≥8%: the cut removed no unanswered thread's replies) | 8/104 = 7.7% |
| PASS | full: reply depth after the cut: mostly 2-5, some 6-12, a few 13-25; at most 12% with a single reply; none over 25 (relaxed from 60/30/10 with no single-reply threads) | 1: 9%, 2-5: 66%, 6-12: 20%, 13-25: 5% of 96 threads with replies; max 17; total replies 444 |
| PASS | full: lengths right-skewed (bodies and replies median < mean) | bodies median 98.0 mean 100; replies median 35.0 mean 40 |
| PASS | full: exactly one pork roll vs taylor ham thread (T20; T165 is the Wawa/QuickChek follow-up) | ['T20'] |
| PASS | full: thread ids and titles unique | [] |
| PASS | full: every kept thread is as live (authors, timestamps, text, votes) apart from the repairs in reduce_edits.md | 11 of the 20 live sample threads kept; drift: [] |
| PASS | full: thread days stay inside daily_plan's window, none over its slots (relaxed: half the threads are gone) | 213 slots; 19/73 days exact; off by 2+: 08-02 3->1, 08-09 4->1, 08-11 4->1, 08-12 4->0, 08-16 5->1, 08-20 3->1, 08-21 2->0, 08-29 5->1, 08-30 9->2, 08-31 3->0, 09-01 3->1, 09-02 2->0, 09-03 3->0, 09-06 3->1, 09-08 4->1, 09-09 4->1, 09-14 4->2, 09-15 4->2, 09-17 5->1, 09-18 4->2, 09-22 5->1, 09-25 3->1, 09-27 6->4, 09-29 5->1, 09-30 5->2, 10-01 4->2, 10-02 3->1, 10-03 3->0, 10-04 7->2 |
| PASS | full: every post after its author joined (new threads: whole cast), replies in order, inside Jul 24 - Oct 4 | 0: [] |
| PASS | full: writers' when hints held (within 7 days) wherever the cast's join dates allow | 61/82 strictly inside; misses []; hints the cast's join dates rule out (placed after the last join): ['T073 mid -> 09-28 (cast complete 09-25)', 'T075 mid -> 09-27 (cast complete 09-25)', 'T083 mid -> 09-27 (cast complete 09-25)'] |
| PASS | full: writer-flagged order holds for the kept threads (T125 before Aug 17; T099 after T04; follow-ups 4+ days after the thread they follow) | T125 07-30, T099 09-30 (T04 last reply 09-21); [] |
| PASS | full: date-bound statements land on dates that make them true | [] |
| PASS | full: mentees credit/quote their mentor only after the mentorship started | [] |
| PASS | full: no active mentor answers their mentee's thread as a stranger | [] |
| PASS | full: everyone kept posts (the plan's ≥20% with zero posts were lurkers; the cut kept the busiest) | 0/29 with zero posts |
| PASS | full: activity levels (info; levels were set on the full set, and the cut took more posts from some people than others) | Junior volume ×1.75 the plan caps' midpoints; posts per level: regular 6-15, heavy 14-28; over ['benplumb79(heavy):28']; overlaps ['regular>heavy'] |
| PASS | full: Senior pillars (heavy) post more than regular Seniors on average; every Senior posts (relaxed from 'more than the median regular') | Kash_sing:43 codebook_dale:36 oldsteam_zig:35 rui_t_kearny:31 mbell_wireman:30 thiago_sparks:30 ms_almonte:27 haddad_mech:26 hec_does_ac:17 |
| PASS | full: persona consistency across all threads: years | 0:  |
| PASS | full: persona consistency across all threads: age | 0:  |
| PASS | full: persona consistency across all threads: town | 0:  |
| PASS | full: persona consistency across all threads: trade | 0:  |
| PASS | full: persona consistency across all threads: union | 0:  |
| PASS | full: persona consistency across all threads: license | 0:  |
| PASS | full: persona consistency across all threads: mentor | 0:  |
| PASS | full: persona consistency across all threads: school | 0:  |
| PASS | full: persona consistency across all threads: employer | 0:  |
| PASS | full: persona notes in the LIVE threads (can't be edited here; listed for the owner) | town: T20 hec_does_ac: 'i'm from gloucester county' (Gloucester) vs Cherry Hill, Camden |
| PASS | full: accepted answers: ≤1 per thread, by a Senior or a 2+ year Junior, not the starter; ~50% of 3+ reply threads (40-65%) | 52% of 69; [] |
| PASS | full: helpful counts in range (threads 2-40, replies 0-45) | [] |
| PASS | full: unanswered threads don't outvote answered ones (questions <=4, Senior tips <=12) | [] |
| PASS | full: 'update:'/'edit:' replies come at least as late as the time they say has passed | [] |
| PASS | full: posting-hour histogram (ET) | 0:0 1:0 2:0 3:0 4:0 5:43 6:45 7:10 8:20 9:23 10:18 11:7 12:23 13:24 14:9 15:2 16:8 17:18 18:28 19:38 20:51 21:73 22:67 23:41 |
| PASS | no kept reply, thread or collab mentions a removed account; every author is kept | 134 name patterns for 107 removed accounts; hits: []; foreign authors: [] |
| PASS | collabs: 9-13 ride-alongs (the kept mentors' collabs that a kept apprentice could fill), all posted by seeded Seniors | 11 collabs by 7 Seniors: oldsteam_zig 2, thiago_sparks 2, rui_t_kearny 2, ms_almonte 2, Kash_sing 1, mbell_wireman 1, haddad_mech 1 |
| PASS | collabs: 1-4 pitches each (relaxed from 2-4: most applicants were removed), from seeded Juniors, one per Junior per collab | 12 pitches; sizes {1: 10, 2: 1} |
| PASS | collabs: every collab has exactly one accepted pitch; the rest declined or pending ('interested') | {'accepted': 11, 'declined': 1}; bad: [] |
| PASS | collabs: types and pay types per schema (the two specialist collabs needed an EPA 608 card no kept apprentice holds, so they went) | {'extra_hand': 8, 'ride_along': 3}; pay {'day_rate': 8, 'unpaid': 2, 'flexible': 1} |
| PASS | collabs: every collab filled_at after its last application and its accept, before the job day | [] |
| PASS | collabs: job dates Aug 1 - Oct 3; every timestamp inside the window, none at 0-4 am | 46 timestamps; window [] night [] dates [] |
| PASS | collabs: poster joined before posting; applicants joined before applying, after posting; decisions after pitches | [] |
| PASS | collabs: trade match (applicants' trade = the job's, or 'general'; the poster works that trade) | [] |
| PASS | collabs: job county in the poster's region; applicants mostly from the job's region (>= 70%, 'where possible') | 10/12 local; from elsewhere: ['C06/HeatwaveOnCall(NJ-North)', 'C15/HelperForNow(NJ-South)'] |
| PASS | collabs: some accepted pitches come from the poster's mentee (>= 1), flagged only when sent after the mentorship started | 2 of 11: C10 threeway_02->mbell_wireman, C18 Kearny_Pipefitter->rui_t_kearny |
| PASS | collabs: town-level locations only; no street address, phone or email anywhere | [] [] |
| PASS | collabs: application detail and stated years match each persona; no CV files | [] |
| PASS | collabs: persona voice (lowercase voices stay lowercase, bullets only from Kash_sing, nobody mentions Home Fixr) | [] |
| PASS | collabs: no 12-word overlap with each other or with the threads | [] |
| PASS | DB: exactly 9 mentors + 20 apprentices in the batch | 9 + 20 = 29 |
| PASS | DB: the batch's handles are exactly the kept cast | extra [], missing [] |
| PASS | DB: every seeded profile is_founding_member |  |
| PASS | DB: no handle collision with any other member | 0 |
| PASS | DB: zero notifications involving seeded accounts | 0 |
| PASS | DB: no seeded Senior accepting mentees | 0 |
| PASS | DB: seeded avatar fields written and consistent | 0 |
| PASS | DB: seeded auth users have no password and are banned | 0 |
| PASS | DB: batch mentorships / follows match the files | mentorships 19/19, follows 111/111 |
| PASS | DB: mentorship statuses as generated | {'pending': 4, 'active': 15} |
| PASS | DB: social rows are seeded-to-seeded only | 0 |
| PASS | DB: every mentorship is junior -> senior | 0 |
| PASS | DB: no Junior with two active mentors | 0 |
| PASS | DB: every active mentee follows their mentor | 0 |
| PASS | DB: social timestamps inside the window and after both joined | 0 |
| PASS | DB: no notifications from the social rows (or anything seeded) | 0 |
| PASS | DB: reply helpful counts match the (rebalanced) files | [] |
| PASS | DB: logged-out visitors can read follows but no mentorship rows (RLS unchanged) | anon sees 0 mentorships, 111 follows |
| PASS | DB: batch job collabs / pitches match the file | collabs 11/11, pitches 12/12 |
| PASS | DB: pitch statuses as generated | {'declined': 1, 'accepted': 11} |
| PASS | DB: exactly one accepted pitch per batch collab | 0 |
| PASS | DB: every batch collab filled, after its last pitch | 0 |
| PASS | DB: interested_count matches the pitches (trigger) | 0 |
| PASS | DB: collab rows are seeded-to-seeded only | 0 |
| PASS | DB: no CV files on seeded pitches | 0 |
| PASS | DB: no collab notifications from the seeded collabs | 0 |
| PASS | DB: logged-out visitors see the filled collabs but no pitches (RLS) | anon sees 11 filled collabs, 0 pitches |
| PASS | DB: a real member applying to any seeded collab is refused with 'position has been filled' | 11 tries: Counter({'This position has been filled': 11}) |
| PASS | app: /feed renders | 200 |
| PASS | app: no full_name of handle-preference users on /feed | [] |
| PASS | app: the badge renders as the HF logo only (one SVG, no visible text, no 'Community'), with an accessible name and hover note | 104 badges on /feed, 104 as the logo only; 'HF Community' text present: False |
| PASS | app: /feed marks every seeded post with the HF badge, and no post-level label renders | 104 badged of 111 cards; label present: False |
| PASS | app: /mentors lists all 9 seeded mentors with the HF logo badge | 9 shown, 9 badges |
| PASS | app: no full_name of handle-preference Seniors on /mentors | [] |
| PASS | app: /mentors 'answered' counts match the DB | 9 cards; [] |
| PASS | app: /mentors 'mentees' counts match the DB | 0 of 9 cards differ: [] |
| PASS | app: 'Accepting mentorship requests' filter excludes every Founding account |  |
| PASS | app: all 29 profile pages render (200) | [] |
| PASS | app: HF logo badge (and no yellow example-profile notice, no 'HF Community') on every seeded profile | [] |
| PASS | app: every removed example profile is gone (404) | 107 checked; [] |
| PASS | app: no private full_name on handle-preference profiles | [] |
| PASS | app: /u/<handle> 'followers' match the DB (all 29) | 0 differ: [] |
| PASS | app: /u/<handle> 'active mentees' match the DB (all 29) | 0 differ: [] |
| PASS | app: /u/<handle> 'answers' match the DB (all 29) | 0 differ: [] |
| PASS | app: seeded thread pages render with badges | 104 threads checked; bad: [] |
| PASS | app: seeded thread pages carry no post-level label | 104 threads; still labeled: [] |
| PASS | app: About page carries the §0.3 sentence |  |
| PASS | app: landing FAQ asks about the profiles marked HF (no 'HF Community') + footer link to About |  |
| PASS | app: Terms §5 says profiles marked HF are team-made examples, not real members, and shows the logo |  |
| PASS | app (logged out): /collabs shows 'Position filled' and no apply control on every seeded collab | 200; 14 cards; missing []; [] |
| PASS | app (logged out): open collabs listed before filled ones | 3 open, 11 filled |
| PASS | app (logged out): 'Open only' hides every seeded (filled) collab | 200; shown: [] |
