-- ================================================================
-- Home Fixr — DEV seed data
-- ================================================================
-- Run order:  schema.sql  ->  migrations/0001..0005  ->  seed.sql
-- (The reply-count trigger from the migration keeps posts.reply_count
--  accurate as these replies are inserted, so posts start at 0 here.)
--
-- Safe to re-run (idempotent via `on conflict do nothing`).
-- The auth.users rows are placeholders to satisfy the profiles FK — they are
-- NOT set up for real login. Do NOT run this in production.
-- ================================================================

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mike@homefixr.test',   now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'linda@homefixr.test',  now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tony@homefixr.test',   now(), now()),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah@homefixr.test',  now(), now()),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@homefixr.test',   now(), now()),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ramon@homefixr.test',  now(), now()),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emma@homefixr.test',   now(), now()),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jamal@homefixr.test',  now(), now()),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcus@homefixr.test', now(), now())
on conflict (id) do nothing;

insert into profiles (id, username, full_name, avatar_initials, title, role, trade, region, bio, years_experience, is_open_to_messages, is_open_to_ride_alongs) values
  ('10000000-0000-0000-0000-000000000001', 'mike.rodriguez', 'Mike Rodriguez',  'MR', 'Master Plumber',      'senior', 'plumbing',   'Newark, NJ',      '30 years of fixing other people''s mistakes. Happy to help you avoid most of mine. Specializing in residential repipes and boiler systems. Open to ride-alongs once a month.', 28, true,  true),
  ('10000000-0000-0000-0000-000000000002', 'linda.chen',     'Linda Chen',      'LC', 'HVAC Technician',     'senior', 'hvac',       'Edison, NJ',      'Commercial HVAC, focus on rooftop units and refrigeration. I do ride-alongs once a month. Ask me about EPA 608 prep.', 22, true,  true),
  ('10000000-0000-0000-0000-000000000003', 'tony.martinez',  'Tony Martinez',   'TM', 'Master Electrician',  'senior', 'electrical', 'Jersey City, NJ', 'Started my own shop at 24. Made every mistake. Ask me anything about pulling permits, dealing with inspectors, or pricing a service call.', 30, true,  false),
  ('10000000-0000-0000-0000-000000000004', 'sarah.williams', 'Sarah Williams',  'SW', 'HVAC Specialist',     'senior', 'hvac',       'Trenton, NJ',     'Residential heating and AC. I run a 3-person team. Always looking to bring along apprentices. Big believer in women in the trades.', 18, true,  true),
  ('10000000-0000-0000-0000-000000000005', 'dave.kowalski',  'Dave Kowalski',   'DK', 'Plumber',             'senior', 'plumbing',   'Paterson, NJ',    'Old-school plumber. New-school customer service. Will tell you when you''re undercharging, because everyone is.', 25, true,  true),
  ('10000000-0000-0000-0000-000000000006', 'ramon.gutierrez','Ramon Gutierrez', 'RG', 'Electrician',         'senior', 'electrical', 'Elizabeth, NJ',   'Service work, panel upgrades, EV chargers. Bilingual EN/ES. I answer messages fast — usually same day.', 16, true, false),
  ('20000000-0000-0000-0000-000000000001', 'emma.reyes',     'Emma Reyes',      'ER', 'Apprentice Plumber',  'junior', 'plumbing',   'Newark, NJ',      'Second-year apprentice trying to learn everything I can before I''m out on my own.', null, true, false),
  ('20000000-0000-0000-0000-000000000002', 'jamal.thompson', 'Jamal Thompson',  'JT', 'Apprentice Electrician','junior','electrical', 'Jersey City, NJ', 'Just finished my vocational program. Soaking up everything I can.', null, true, false),
  ('20000000-0000-0000-0000-000000000003', 'marcus.johnson', 'Marcus Johnson',  'MJ', 'New to the trade',    'junior', 'hvac',       'Newark, NJ',      'Career switcher, starting out in HVAC. Excited to learn from people who''ve done it.', null, true, false)
-- Upsert (not "do nothing"): the signup trigger auto-creates a placeholder
-- profile the instant the auth.users rows above are inserted, so we must
-- OVERWRITE those placeholders with the real seed data here.
on conflict (id) do update set
  username               = excluded.username,
  full_name              = excluded.full_name,
  avatar_initials        = excluded.avatar_initials,
  title                  = excluded.title,
  role                   = excluded.role,
  trade                  = excluded.trade,
  region                 = excluded.region,
  bio                    = excluded.bio,
  years_experience       = excluded.years_experience,
  is_open_to_messages    = excluded.is_open_to_messages,
  is_open_to_ride_alongs = excluded.is_open_to_ride_alongs;

insert into posts (id, author_id, type, title, body, trade, region, helpful_count, reply_count) values
  ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'question',   'First customer asked me to do work I''m not licensed for — how do I say no without losing them?', 'Homeowner wants me to swap out a panel while I''m there for a plumbing job. I''m not licensed for electrical. Want to keep the relationship but not break the rules. What''s the script?', 'plumbing',   'Newark, NJ',      28, 0),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'tip',        'If you''re under 25 and starting your own truck — get a real CPA before you book your first job.', 'I see new guys try to do their own books for the first year to save money. By tax season they''ve lost more in mistakes than 12 months of a bookkeeper would''ve cost. Get a CPA who knows the trades. That''s it. That''s the post.', 'electrical', 'Jersey City, NJ', 67, 0),
  ('a0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'question',   'Best multimeter for under $200?', 'Starting to build out my own tools. What multimeter would you all recommend that will actually last?', 'electrical', 'Jersey City, NJ', 12, 0),
  ('a0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'discussion', 'How do you handle a customer who wants everything in cash?', 'Had one this week. Not comfortable with it but don''t want to lose the job. How do the veterans handle this without it getting weird?', 'hvac',       'Trenton, NJ',     19, 0),
  ('a0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'tip',        'The shutoff valve nobody tells you about', 'Before you cut anything, find the building''s main AND the fixture stops. Nine times out of ten there is a second valve behind the access panel. Saves you a flooded floor.', 'plumbing', 'Newark, NJ', 33, 0)
on conflict (id) do nothing;

insert into replies (id, post_id, author_id, body, is_accepted, helpful_count) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Easy script: "I''d love to help you with that but it''s outside my license — if I do it and something goes wrong, your insurance won''t cover it. Let me put you in touch with someone I trust." Then actually have someone to refer. Customers respect this every single time. The ones who push back after that aren''t customers you want.', true,  41),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Adding to Mike''s answer — if you DM me your zip I''ll send you 2 or 3 licensed electricians in NJ I''d send my mom to. Building that referral network early is how you turn a one-time job into a long-term customer.', false, 19),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'One more thing — write it down somewhere. Every time a customer asks you to do something out of scope, you should already know which trusted person you''d refer them to. That''s how you build a real business in 3 years instead of 10.', false, 14),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Fluke 117. It''s $180-ish, it lasts 20 years, and every inspector and contractor recognizes the brand. Don''t buy on Amazon — buy from a proper supply house so the warranty is real.', true, 28)
on conflict (id) do nothing;

insert into job_collabs (id, poster_id, type, title, body, trade, location, scheduled_date, pay_type, interested_count) values
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'ride_along', 'Junior welcome — boiler install ride-along, Saturday in Trenton', 'Doing a residential boiler swap this Saturday. Happy to bring 1 apprentice along to watch and help. Bring your own boots. No pay, but I''ll buy lunch and you''ll see a full install start to finish.', 'plumbing',   'Trenton, NJ', (current_date + 8), 'unpaid',   9),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'extra_hand', 'Need a 2nd hand on a service panel upgrade — Newark, this Sat',    '200A service panel swap on a residential. Need a licensed apprentice or junior electrician. 8am-2pm, paid day rate. NJ ticket required.', 'electrical', 'Newark, NJ',  (current_date + 9), 'day_rate', 3),
  ('c0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'specialist', 'HVAC commissioning help needed — Edison, NJ commercial rooftop',   'Looking for someone with VRF commissioning experience to consult on a 4-zone install. Day on-site or remote walk-through both work. Happy to pay or trade hours.', 'hvac', 'Edison, NJ', null, 'flexible', 2)
-- Upsert content fields so edits to this seed (e.g. dates) apply on re-run.
on conflict (id) do update set
  title = excluded.title, body = excluded.body, type = excluded.type,
  trade = excluded.trade, location = excluded.location,
  scheduled_date = excluded.scheduled_date, pay_type = excluded.pay_type;
  -- NOTE: interested_count is deliberately NOT upserted — migration 0004's
  -- trigger derives it from collab_interests below.

-- Who's interested in each collab (migrations/0004_collab_interests.sql).
-- The count trigger recomputes job_collabs.interested_count from these rows,
-- so these are the numbers the Jobs page shows.
insert into collab_interests (collab_id, user_id, status, note) values
  ('c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'accepted',   'Second-year apprentice in Newark, I can be in Trenton by 7. I''ve never seen a full boiler swap start to finish.'),
  ('c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'interested', 'Career switcher into HVAC — I know it''s a plumbing job but the hydronics overlap is exactly what I want to learn.'),
  ('c0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'interested', 'Apprentice electrician, NJ ticket in hand. Done two panel swaps under supervision.'),
  ('c0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'interested', 'I''ve commissioned a handful of 4-zone VRF systems. Happy to do a remote walk-through first.')
on conflict (collab_id, user_id) do update set
  status = excluded.status, note = excluded.note;

insert into mentorships (junior_id, senior_id, status) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'active'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'active'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active')
on conflict (junior_id, senior_id) do nothing;
