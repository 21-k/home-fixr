-- ================================================================
-- Home Fixr — DEV seed data
-- ================================================================
-- Run in Supabase → SQL Editor AFTER schema.sql.
-- Safe to re-run (idempotent via `on conflict do nothing`).
--
-- These auth.users rows are placeholders so that profiles' foreign key
-- (profiles.id -> auth.users.id) is satisfied. They are NOT set up for real
-- login — replace them with real signups once auth is wired up.
-- Do NOT run this in production.
-- ================================================================

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mike@homefixr.test',  now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dana@homefixr.test',  now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@homefixr.test',   now(), now())
on conflict (id) do nothing;

insert into profiles (id, username, full_name, avatar_initials, role, trade, region, bio, years_experience) values
  ('11111111-1111-1111-1111-111111111111', 'mike.rodriguez', 'Mike Rodriguez', 'MR', 'senior', 'plumbing',   'Newark, NJ',      '30 years of fixing other people''s mistakes. Happy to help you avoid most of mine.', 28),
  ('22222222-2222-2222-2222-222222222222', 'dana.lee',       'Dana Lee',       'DL', 'junior', 'plumbing',   'Jersey City, NJ', 'Second-year apprentice trying to learn everything I can before I''m out on my own.', null),
  ('33333333-3333-3333-3333-333333333333', 'sam.okafor',     'Sam Okafor',     'SO', 'senior', 'electrical', 'Trenton, NJ',     'Master electrician. Ask me about panel upgrades and why you should never trust old aluminum wiring.', 15)
on conflict (id) do nothing;

insert into posts (id, author_id, type, title, body, trade, region, helpful_count, reply_count) values
  ('aaaa1111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'question',   'How do you price a small bathroom re-pipe?',        'Customer wants copper swapped for PEX in a single bathroom. I have never quoted one solo. How do you all think about the day rate vs. fixed price here?', 'plumbing',   'Jersey City, NJ', 4, 2),
  ('aaaa1111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'tip',        'The shutoff valve nobody tells you about',          'Before you cut anything, find the building''s main AND the fixture stops. Nine times out of ten there is a second valve behind the access panel. Saves you a flooded floor.', 'plumbing',   'Newark, NJ',      12, 1),
  ('aaaa1111-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'discussion', 'When do you walk away from a job?',                  'Had a homeowner this week who wanted me to "just make it pass inspection" on some sketchy wiring. Curious how others handle pressure to cut corners.', 'electrical', 'Trenton, NJ',     8, 0)
on conflict (id) do nothing;

insert into replies (id, post_id, author_id, body, is_accepted, helpful_count) values
  ('bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'For a single bath I''d quote fixed, not day rate. You''ll get faster than you think and the customer wants a number, not a meter running. Pad it 15% for surprises behind the wall.', true,  6),
  ('bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Agree with Mike. Also always look before you quote — pop the access panel first.', false, 2),
  ('bbbb2222-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Learned this the hard way last month. Wish I''d seen this post first.', false, 3)
on conflict (id) do nothing;

insert into job_collabs (id, poster_id, type, title, body, trade, location, pay_type, interested_count) values
  ('cccc3333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'extra_hand', 'Need a second set of hands Saturday — water heater swap', 'Straightforward 50-gal gas water heater replacement in Newark. Looking for an apprentice who wants the reps. Day rate, lunch on me.', 'plumbing', 'Newark, NJ', 'day_rate', 2)
on conflict (id) do nothing;

insert into mentorships (junior_id, senior_id, status) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'active')
on conflict (junior_id, senior_id) do nothing;
