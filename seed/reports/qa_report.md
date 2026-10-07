# QA report

Run: 2026-10-05T21:02:09-04:00 · threads: `content/threads.sample.scheduled.json` · db: yes · app: http://localhost:3000

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
| PASS | posting hours match §6 (evening/early/lunch ≥70%, 0–4am ≤3%) | rhythm 82%, 0-4am 1%; 0:1 5:8 6:11 7:2 8:4 9:3 10:6 11:1 12:5 13:7 15:3 17:2 18:4 19:8 20:14 21:23 22:7 23:10 |
| PASS | Friday nights quiet | 0 posts Fri after 6pm |
| PASS | fact lint written for human review | 56 flagged sentences -> seed/reports/fact_lint.md |
| PASS | About sentence present in source |  |
| PASS | DB: 136 seeded profiles | 136 |
| PASS | DB: every seeded profile is_founding_member |  |
| PASS | DB: no handle collision with any other member | 0 |
| PASS | DB: zero notifications involving seeded accounts | 0 |
| PASS | DB: no seeded Senior accepting mentees | 0 |
| PASS | DB: seeded avatar fields written and consistent | 0 |
| PASS | DB: seeded auth users have no password and are banned | 0 |
| PASS | app: /feed renders | 200 |
| PASS | app: no full_name of handle-preference users on /feed | [] |
| PASS | app: Founding Community badge on /feed | 80 badges for 20 posts |
| PASS | app: /mentors lists all 15 seeded Seniors with badge | 15 shown, 60 badges |
| PASS | app: no full_name of handle-preference Seniors on /mentors | [] |
| PASS | app: 'Accepting mentees' filter excludes every Founding account |  |
| PASS | app: all 136 profile pages render (200) | [] |
| PASS | app: Founding Community badge on every seeded profile | [] |
| PASS | app: no private full_name on handle-preference profiles | [] |
| PASS | app: seeded thread pages render with badges | 20 threads checked; bad: [] |
| PASS | app: About page carries the §0.3 sentence |  |
| PASS | app: landing FAQ + footer link to About |  |
