# QA report

Run: 2026-10-05T10:41:04-04:00 · threads: `content/threads.sample.scheduled.json` · db: no · app: no

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
| PASS | display preference ≈80/18/2 | {'handle': 110, 'first_name_initial': 24, 'full_name': 2} |
| PASS | no seeded Senior shown as accepting mentees | [] |
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
| PASS | bullet points only from MiddlesexHeatPumps | [] |
| PASS | nobody mentions/praises Home Fixr | [] |
| PASS | plagiarism: no 12-word overlap (internal; no external corpus) | 8-gram overlaps: 3; 12+: [] |
| PASS | posting hours match §6 (evening/early/lunch ≥70%, 0–4am ≤3%) | rhythm 81%, 0-4am 0%; 5:12 6:10 7:1 8:5 9:2 10:4 11:1 12:6 13:2 14:2 15:3 16:1 17:4 18:4 19:7 20:17 21:12 22:13 23:13 |
| PASS | Friday nights quiet | 0 posts Fri after 6pm |
| PASS | fact lint written for human review | 55 flagged sentences -> seed/reports/fact_lint.md |
| PASS | About sentence present in source |  |
