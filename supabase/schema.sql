-- ================================================================
-- Home Fixr — Supabase schema
-- ================================================================
-- Run this in Supabase → SQL Editor as one script.
-- It creates all tables, indexes, RLS policies, and seed data.
--
-- Assumes you've enabled Supabase Auth (default on new projects).
-- Do NOT run twice on the same DB — it will error on the ENUM types.
-- If you need to reset in development, run the DROP block at the top.
-- ================================================================

-- Uncomment ONLY in development if you need a clean reset:
-- drop table if exists mentorships cascade;
-- drop table if exists job_collabs cascade;
-- drop table if exists replies cascade;
-- drop table if exists posts cascade;
-- drop table if exists profiles cascade;
-- drop type if exists user_role;
-- drop type if exists trade_type;
-- drop type if exists post_type;
-- drop type if exists collab_type;
-- drop type if exists mentorship_status;

-- ================================================================
-- 1. Enums
-- ================================================================

create type user_role as enum ('junior', 'senior');
create type trade_type as enum ('plumbing', 'hvac', 'electrical', 'other');
create type post_type as enum ('question', 'tip', 'discussion');
create type collab_type as enum ('extra_hand', 'ride_along', 'specialist');
create type mentorship_status as enum ('pending', 'active', 'declined');

-- ================================================================
-- 2. profiles
-- One row per user. Linked to auth.users (Supabase Auth).
-- ================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  avatar_initials text not null,           -- e.g. "MR" for Mike Rodriguez
  role user_role not null,
  trade trade_type,
  region text,                              -- e.g. "Newark, NJ"
  bio text,
  years_experience int,                     -- null for juniors
  is_open_to_messages boolean default true,
  is_open_to_ride_alongs boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);
create index profiles_trade_idx on profiles(trade);

-- ================================================================
-- 3. posts (community feed items)
-- ================================================================

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  type post_type not null,
  title text not null,
  body text not null,
  trade trade_type,
  region text,
  helpful_count int not null default 0,
  reply_count int not null default 0,
  created_at timestamptz not null default now()
);

create index posts_author_idx on posts(author_id);
create index posts_trade_idx on posts(trade);
create index posts_created_idx on posts(created_at desc);

-- ================================================================
-- 4. replies (answers on posts)
-- ================================================================

create table replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  is_accepted boolean not null default false,
  helpful_count int not null default 0,
  created_at timestamptz not null default now()
);

create index replies_post_idx on replies(post_id);
create index replies_author_idx on replies(author_id);

-- ================================================================
-- 5. job_collabs (optional job board)
-- ================================================================

create table job_collabs (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references profiles(id) on delete cascade,
  type collab_type not null,
  title text not null,
  body text not null,
  trade trade_type,
  location text,
  scheduled_date date,
  pay_type text,                            -- "day_rate" | "unpaid" | "trade" | "flexible"
  interested_count int not null default 0,
  created_at timestamptz not null default now()
);

create index job_collabs_poster_idx on job_collabs(poster_id);
create index job_collabs_trade_idx on job_collabs(trade);
create index job_collabs_created_idx on job_collabs(created_at desc);

-- ================================================================
-- 6. mentorships (junior <-> senior links)
-- ================================================================

create table mentorships (
  id uuid primary key default gen_random_uuid(),
  junior_id uuid not null references profiles(id) on delete cascade,
  senior_id uuid not null references profiles(id) on delete cascade,
  status mentorship_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique(junior_id, senior_id)
);

create index mentorships_junior_idx on mentorships(junior_id);
create index mentorships_senior_idx on mentorships(senior_id);

-- ================================================================
-- 7. Row Level Security (RLS)
-- Everyone can READ public content. Only the owner can WRITE.
-- ================================================================

alter table profiles enable row level security;
alter table posts enable row level security;
alter table replies enable row level security;
alter table job_collabs enable row level security;
alter table mentorships enable row level security;

-- profiles: everyone can read; users can update only their own row
create policy "profiles are viewable by everyone"
  on profiles for select using (true);
create policy "users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);
create policy "users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- posts: readable by everyone; only author can insert/update/delete
create policy "posts are viewable by everyone"
  on posts for select using (true);
create policy "authenticated users can post"
  on posts for insert with check (auth.uid() = author_id);
create policy "authors can update their own posts"
  on posts for update using (auth.uid() = author_id);
create policy "authors can delete their own posts"
  on posts for delete using (auth.uid() = author_id);

-- replies: readable by everyone; only author can write
create policy "replies are viewable by everyone"
  on replies for select using (true);
create policy "authenticated users can reply"
  on replies for insert with check (auth.uid() = author_id);
create policy "authors can update their own replies"
  on replies for update using (auth.uid() = author_id);
create policy "authors can delete their own replies"
  on replies for delete using (auth.uid() = author_id);

-- job_collabs: readable by everyone; only poster can write
create policy "job_collabs are viewable by everyone"
  on job_collabs for select using (true);
create policy "authenticated users can post collabs"
  on job_collabs for insert with check (auth.uid() = poster_id);
create policy "posters can update their own collabs"
  on job_collabs for update using (auth.uid() = poster_id);
create policy "posters can delete their own collabs"
  on job_collabs for delete using (auth.uid() = poster_id);

-- mentorships: visible to the two parties involved; either can create/update
create policy "mentorships visible to junior or senior"
  on mentorships for select using (auth.uid() = junior_id or auth.uid() = senior_id);
create policy "juniors can request mentorship"
  on mentorships for insert with check (auth.uid() = junior_id);
create policy "junior or senior can update"
  on mentorships for update using (auth.uid() = junior_id or auth.uid() = senior_id);

-- ================================================================
-- 7b. Grants (REQUIRED)
-- RLS policies decide WHICH ROWS a role may touch, but Postgres first checks
-- table-level privileges. Without these grants the Supabase API roles
-- (anon = logged-out visitors, authenticated = logged-in users) get
-- "permission denied for table ..." before RLS is ever evaluated.
-- Safe to re-run — grants are idempotent.
-- ================================================================

grant usage on schema public to anon, authenticated;

-- Public read access (row visibility is still narrowed by the RLS policies above).
grant select on all tables in schema public to anon, authenticated;

-- Only logged-in users can write; RLS policies enforce per-row ownership.
grant insert, update, delete on all tables in schema public to authenticated;

-- ================================================================
-- 8. Optional: seed data for local dev
-- (Comment out for production. Requires you to insert into auth.users
-- first, or use the Supabase dashboard to create test users.)
-- ================================================================

-- Example after creating a test user with id 'YOUR-UUID-HERE':
-- insert into profiles (id, username, full_name, avatar_initials, role, trade, region, bio, years_experience)
-- values (
--   'YOUR-UUID-HERE',
--   'mike.rodriguez',
--   'Mike Rodriguez',
--   'MR',
--   'senior',
--   'plumbing',
--   'Newark, NJ',
--   '30 years of fixing other people''s mistakes. Happy to help you avoid most of mine.',
--   28
-- );
