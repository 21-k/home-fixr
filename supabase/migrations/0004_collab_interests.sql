-- ================================================================
-- Home Fixr — migration 0004: real job-collab interests
-- ================================================================
-- Run in Supabase → SQL Editor AFTER 0003_post_slugs.sql. Fully idempotent
-- (create ... if not exists / create or replace / drop ... if exists).
--
-- WHY: 0001's express_collab_interest() only did
--        update job_collabs set interested_count = interested_count + 1
--      so nothing recorded WHO was interested. Consequences: clicking the
--      button twice inflated the counter forever, the poster could never see
--      who wanted the job, and no "my jobs" tracking was possible.
--
-- This migration stores one row per (collab, user), derives interested_count
-- from those rows via trigger, and lets the poster accept/decline each one.
--
-- NOTE: if the `alter type ... add value` block below errors with
-- "cannot run inside a transaction block", run just that block on its own
-- first, then re-run the whole file.
-- ================================================================

-- ----------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'collab_interest_status') then
    create type collab_interest_status as enum ('interested', 'accepted', 'declined');
  end if;
end $$;

-- Two new notification kinds. Safe to re-run; the values are only *used* at
-- trigger runtime, never in this transaction, so adding them here is fine.
alter type notification_type add value if not exists 'collab_interest';
alter type notification_type add value if not exists 'collab_accepted';

-- ----------------------------------------------------------------
-- COLLAB_INTERESTS
-- One row per person per collab. The unique constraint is what makes
-- "I'm interested" idempotent instead of an unbounded counter bump.
-- ----------------------------------------------------------------
create table if not exists collab_interests (
  id         uuid primary key default gen_random_uuid(),
  collab_id  uuid not null references job_collabs(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  status     collab_interest_status not null default 'interested',
  note       text,                       -- optional "why me" pitch
  created_at timestamptz not null default now(),
  unique (collab_id, user_id)
);

create index if not exists collab_interests_collab_idx on collab_interests(collab_id);
create index if not exists collab_interests_user_idx on collab_interests(user_id, created_at desc);

alter table collab_interests enable row level security;

-- Visible to the interested person and to the collab's poster — NOT public,
-- since who applied for a job is between those two.
drop policy if exists "interests visible to applicant or poster" on collab_interests;
create policy "interests visible to applicant or poster" on collab_interests
  for select using (
    auth.uid() = user_id
    or auth.uid() = (select poster_id from job_collabs where id = collab_id)
  );

-- You may only register your own interest, and not on your own posting.
drop policy if exists "users can express their own interest" on collab_interests;
create policy "users can express their own interest" on collab_interests
  for insert with check (
    auth.uid() = user_id
    and auth.uid() <> (select poster_id from job_collabs where id = collab_id)
  );

-- Withdrawing is deleting your own row.
drop policy if exists "users can withdraw their interest" on collab_interests;
create policy "users can withdraw their interest" on collab_interests
  for delete using (auth.uid() = user_id);

-- Only the poster moves a row to accepted/declined.
drop policy if exists "poster can respond to interest" on collab_interests;
create policy "poster can respond to interest" on collab_interests
  for update using (
    auth.uid() = (select poster_id from job_collabs where id = collab_id)
  );

-- ----------------------------------------------------------------
-- Keep job_collabs.interested_count derived from the rows above.
-- SECURITY DEFINER because the person expressing interest does not own the
-- job_collabs row and so cannot update it under RLS.
-- ----------------------------------------------------------------
create or replace function public.sync_collab_interest_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_collab uuid;
begin
  v_collab := coalesce(new.collab_id, old.collab_id);
  update job_collabs
     set interested_count = (
       select count(*) from collab_interests where collab_id = v_collab
     )
   where id = v_collab;
  return null;
end $$;

drop trigger if exists on_collab_interest_count on collab_interests;
create trigger on_collab_interest_count
  after insert or delete on collab_interests
  for each row execute function public.sync_collab_interest_count();

-- ----------------------------------------------------------------
-- Notifications: poster hears about new interest, applicant hears about an
-- accept.
-- ----------------------------------------------------------------
create or replace function public.notify_on_collab_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poster uuid;
begin
  select poster_id into v_poster from job_collabs where id = new.collab_id;
  if v_poster is not null and v_poster <> new.user_id then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (v_poster, 'collab_interest', new.user_id, 'collab', new.collab_id);
  end if;
  return null;
end $$;

drop trigger if exists on_collab_interest_notify on collab_interests;
create trigger on_collab_interest_notify after insert on collab_interests
  for each row execute function public.notify_on_collab_interest();

create or replace function public.notify_on_collab_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poster uuid;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    select poster_id into v_poster from job_collabs where id = new.collab_id;
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (new.user_id, 'collab_accepted', v_poster, 'collab', new.collab_id);
  end if;
  return null;
end $$;

drop trigger if exists on_collab_accepted_notify on collab_interests;
create trigger on_collab_accepted_notify after update on collab_interests
  for each row execute function public.notify_on_collab_accepted();

-- ----------------------------------------------------------------
-- Replace the old counter-bumping RPC.
-- The 0001 version is already granted to `authenticated`, so a stale client
-- (or a hand-rolled POST) could still inflate the counter. Redefining it to
-- write a real row closes that hole; the app itself now inserts directly.
-- ----------------------------------------------------------------
create or replace function public.express_collab_interest(
  p_collab_id uuid,
  p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_poster uuid;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;

  select poster_id into v_poster from job_collabs where id = p_collab_id;
  if v_poster is null then raise exception 'no such collab'; end if;
  if v_poster = auth.uid() then
    raise exception 'you posted this collab';
  end if;

  insert into collab_interests (collab_id, user_id, note)
  values (p_collab_id, auth.uid(), nullif(btrim(p_note), ''))
  on conflict (collab_id, user_id) do nothing;
end $$;

-- The single-argument signature from 0001 is now redundant (p_note defaults to
-- null) and would be ambiguous alongside the two-argument one, so drop it.
drop function if exists public.express_collab_interest(uuid);

-- ----------------------------------------------------------------
-- Grants for the API roles
-- ----------------------------------------------------------------
grant select on collab_interests to anon, authenticated;
grant insert, update, delete on collab_interests to authenticated;
grant execute on function public.express_collab_interest(uuid, text) to authenticated;

-- ----------------------------------------------------------------
-- Backfill: make existing counters truthful. Pre-migration counts were
-- untracked increments (and hand-set seed values) with no rows behind them,
-- so they are recomputed from collab_interests. seed.sql inserts real interest
-- rows, so re-running it restores demo-looking numbers.
-- ----------------------------------------------------------------
update job_collabs jc
   set interested_count = (
     select count(*) from collab_interests ci where ci.collab_id = jc.id
   )
 where interested_count <> (
     select count(*) from collab_interests ci where ci.collab_id = jc.id
   );
