-- ================================================================
-- Home Fixr — migration 0009: handles, display preference, Founding
-- Community flag, mentor availability, and contact guards
-- ================================================================
-- Run AFTER 0008_application_details.sql. Idempotent (if not exists /
-- create or replace / drop ... if exists) and wrapped in one transaction, so
-- it either applies completely or not at all.
--
-- WHAT THIS DOES
--   1. Treats the existing `profiles.username` as the member's public HANDLE
--      (no parallel column). Adds:
--        * format rules: 3–22 chars, [A-Za-z0-9_.], no leading/trailing dot;
--        * case-insensitive uniqueness (unique index on lower(username));
--        * a reserved/blocked list enforced in the DB;
--        * a once-per-30-days limit on changing it (API users only);
--        * display_preference (handle | first_name_initial | full_name).
--      Rules are enforced by a trigger ONLY when a username is inserted or
--      changed, so existing rows that predate the rules (e.g. an email-derived
--      "mike-r" with a hyphen) keep working and can still edit their profile.
--   2. Adds is_founding_member + seed_batch_id (profiles and every table the
--      seeder writes) so seeded rows are labelled and removable by batch.
--      Only staff (non-API roles) can set these; API users can't flip them.
--   3. Adds mentor_availability (accepting | limited | not_accepting).
--   4. Blocks API users from messaging, requesting mentorship from, or
--      applying to a job posted by a Founding Community account, and from
--      requesting mentorship from a senior who is not accepting.
--   5. Updates the signup trigger so auto-derived usernames always satisfy the
--      new rules (it sanitises, avoids reserved words, and dedupes
--      case-insensitively).
--
-- SAFETY ON AN EXISTING DATABASE
--   * The only step that can fail on existing data is the case-insensitive
--     unique index. A guard below checks first and aborts the whole migration
--     with the colliding names listed, instead of half-applying.
--   * No existing username is rewritten.
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'display_preference') then
    create type display_preference as enum ('handle', 'first_name_initial', 'full_name');
  end if;
  if not exists (select 1 from pg_type where typname = 'mentor_availability') then
    create type mentor_availability as enum ('accepting', 'limited', 'not_accepting');
  end if;
end $$;

-- ----------------------------------------------------------------
-- 2. Columns
-- ----------------------------------------------------------------
alter table profiles add column if not exists display_preference display_preference not null default 'handle';
-- Null = the handle was auto-derived at signup and never chosen by the member.
alter table profiles add column if not exists username_changed_at timestamptz;
alter table profiles add column if not exists is_founding_member boolean not null default false;
alter table profiles add column if not exists seed_batch_id text;
-- Default preserves today's behaviour for real seniors (anyone may request).
alter table profiles add column if not exists mentor_availability mentor_availability not null default 'accepting';

alter table posts            add column if not exists seed_batch_id text;
alter table replies          add column if not exists seed_batch_id text;
alter table job_collabs      add column if not exists seed_batch_id text;
alter table collab_interests add column if not exists seed_batch_id text;
alter table mentorships      add column if not exists seed_batch_id text;
alter table follows          add column if not exists seed_batch_id text;

create index if not exists profiles_founding_idx         on profiles(is_founding_member) where is_founding_member;
create index if not exists profiles_seed_batch_idx       on profiles(seed_batch_id)      where seed_batch_id is not null;
create index if not exists posts_seed_batch_idx          on posts(seed_batch_id)         where seed_batch_id is not null;
create index if not exists replies_seed_batch_idx        on replies(seed_batch_id)       where seed_batch_id is not null;
create index if not exists job_collabs_seed_batch_idx    on job_collabs(seed_batch_id)   where seed_batch_id is not null;
create index if not exists collab_interests_seed_batch_idx on collab_interests(seed_batch_id) where seed_batch_id is not null;
create index if not exists mentorships_seed_batch_idx    on mentorships(seed_batch_id)   where seed_batch_id is not null;
create index if not exists follows_seed_batch_idx        on follows(seed_batch_id)       where seed_batch_id is not null;

-- ----------------------------------------------------------------
-- 3. Reserved / blocked handles
--    reserved_handles: whole-handle matches (compared lowercased, and again
--    with '.' and '_' stripped so "IBEW_Local_102" hits "ibewlocal102").
--    blocked_handle_terms: substrings that may not appear anywhere.
--    Neither table is readable through the API; check_handle() is the door.
-- ----------------------------------------------------------------
create table if not exists reserved_handles (
  handle text primary key check (handle = lower(handle)),
  reason text not null default 'reserved'
);
create table if not exists blocked_handle_terms (
  term text primary key check (term = lower(term))
);
alter table reserved_handles enable row level security;
alter table blocked_handle_terms enable row level security;
revoke all on reserved_handles, blocked_handle_terms from anon, authenticated;

insert into reserved_handles (handle, reason) values
  -- platform / staff / routes
  ('admin','platform'),('administrator','platform'),('root','platform'),('system','platform'),
  ('sysadmin','platform'),('homefixr','platform'),('homefix','platform'),('hf','platform'),
  ('mod','platform'),('mods','platform'),('moderator','platform'),('moderators','platform'),
  ('support','platform'),('help','platform'),('helpdesk','platform'),('staff','platform'),
  ('team','platform'),('official','platform'),('security','platform'),('abuse','platform'),
  ('postmaster','platform'),('webmaster','platform'),('info','platform'),('contact','platform'),
  ('noreply','platform'),('null','platform'),('undefined','platform'),('anonymous','platform'),
  ('deleted','platform'),('everyone','platform'),('here','platform'),('me','platform'),
  ('settings','route'),('welcome','route'),('feed','route'),('mentors','route'),
  ('mentorships','route'),('collabs','route'),('jobs','route'),('messages','route'),
  ('notifications','route'),('search','route'),('login','route'),('logout','route'),
  ('join','route'),('signup','route'),('api','route'),('auth','route'),('about','route'),
  ('faq','route'),('founding','platform'),('founder','platform'),('founders','platform'),
  ('foundingmember','platform'),('foundingcommunity','platform'),
  -- unions, boards, regulators (whole string only)
  ('ibew','union'),('ibewlocal102','union'),('ibew102','union'),('local102','union'),
  ('ibewlocal164','union'),('ibew164','union'),('local164','union'),
  ('ibewlocal456','union'),('ibew456','union'),('local456','union'),
  ('ibewlocal351','union'),('ibew351','union'),('local351','union'),
  ('ibewlocal400','union'),('ibew400','union'),('local400','union'),
  ('ibewlocal3','union'),('ibew3','union'),('local3','union'),
  ('ualocal9','union'),('ua9','union'),('local9','union'),
  ('ualocal24','union'),('ua24','union'),('local24','union'),
  ('ualocal322','union'),('ua322','union'),('local322','union'),
  ('ualocal1','union'),('plumberslocal1','union'),('local1','union'),
  ('ualocal638','union'),('local638','union'),('steamfitters638','union'),
  ('unitedassociation','union'),
  ('njdca','regulator'),('consumeraffairs','regulator'),('njconsumeraffairs','regulator'),
  ('nycdob','regulator'),('dob','regulator'),('nycbuildings','regulator'),
  -- utilities, brands, schools (whole string only)
  ('pseg','brand'),('psege','brand'),('jcpl','brand'),('coned','brand'),('conedison','brand'),
  ('carrier','brand'),('trane','brand'),('lennox','brand'),('rheem','brand'),('fluke','brand'),
  ('milwaukee','brand'),('milwaukeetool','brand'),('dewalt','brand'),('ridgid','brand'),
  ('klein','brand'),('kleintools','brand'),('homedepot','brand'),('lowes','brand'),
  ('ferguson','brand'),('mitsubishi','brand'),('daikin','brand'),('navien','brand'),
  ('lincolntech','school'),('penncotech','school'),('apextech','school'),
  ('apextechnical','school'),('bergentech','school'),('reddit','brand')
on conflict (handle) do nothing;

-- Kept deliberately short and unambiguous: substring matching on short or
-- common fragments blocks innocent handles (e.g. "retard" would block
-- fire-retardant jokes). The team should extend this from a maintained list.
insert into blocked_handle_terms (term) values
  ('fuck'),('shit'),('cunt'),('nazi'),('hitler'),('kkk'),
  ('nigger'),('nigga'),('faggot'),('kike'),('chink')
on conflict (term) do nothing;

-- ----------------------------------------------------------------
-- 4. Handle rule helpers
-- ----------------------------------------------------------------
-- Returns null when the format is fine, else a short machine-readable reason.
create or replace function public.handle_format_error(p text)
returns text language sql immutable as $$
  select case
    when p is null or p = ''               then 'empty'
    when length(p) < 3                     then 'too_short'
    when length(p) > 22                    then 'too_long'
    when p !~ '^[A-Za-z0-9_.]+$'           then 'bad_chars'
    when left(p, 1) = '.' or right(p, 1) = '.' then 'dot_edge'
    else null
  end
$$;

create or replace function public.is_reserved_handle(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from reserved_handles r
       where r.handle = lower(p)
          or r.handle = regexp_replace(lower(p), '[._]', '', 'g')
    )
    -- staff-impersonation prefixes
    or lower(p) ~ '^(home[._]?fixr|admin|moderator|official)'
    or exists (
      select 1 from blocked_handle_terms b
       where position(b.term in regexp_replace(lower(p), '[._0-9]', '', 'g')) > 0
    )
$$;

-- The one public door: 'ok' | 'taken' | 'reserved' | a format reason.
-- The caller's own current handle counts as available to them.
create or replace function public.check_handle(p_handle text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_err text;
begin
  v_err := public.handle_format_error(p_handle);
  if v_err is not null then return v_err; end if;
  if public.is_reserved_handle(p_handle) then return 'reserved'; end if;
  if exists (
    select 1 from profiles
     where lower(username) = lower(p_handle)
       and id is distinct from auth.uid()
  ) then
    return 'taken';
  end if;
  return 'ok';
end $$;

-- is_reserved_handle is called by the profiles guard trigger, which runs as
-- the API role, so those roles need execute. It only returns a boolean.
grant execute on function public.is_reserved_handle(text) to anon, authenticated;
grant execute on function public.check_handle(text) to anon, authenticated;
grant execute on function public.handle_format_error(text) to anon, authenticated;

-- ----------------------------------------------------------------
-- 5. Case-insensitive uniqueness. Check before building the index so a
--    collision aborts with a readable message rather than a raw error.
-- ----------------------------------------------------------------
do $$
declare v_dupes text;
begin
  select string_agg(u, ', ') into v_dupes
    from (select lower(username) as u from profiles group by 1 having count(*) > 1) d;
  if v_dupes is not null then
    raise exception
      '0009 aborted: these usernames collide case-insensitively: %. Rename one of each pair by hand, then re-run.',
      v_dupes;
  end if;
end $$;

create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

-- ----------------------------------------------------------------
-- 6. profiles guard trigger
--    * API roles (anon/authenticated) can't set the founding/seed flags.
--    * Handle rules apply when a username is inserted or changed.
--    * API users may change their handle once per 30 days (the first change
--      away from an auto-derived handle is always allowed).
--    Staff (postgres / service_role) bypass the reserved list and the rate
--    limit, so a handle stays "admin-changeable".
-- ----------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_api boolean := current_user in ('anon', 'authenticated');
  v_err text;
begin
  if v_api then
    if tg_op = 'INSERT' then
      new.is_founding_member := false;
      new.seed_batch_id := null;
      new.username_changed_at := null;
    else
      if new.is_founding_member is distinct from old.is_founding_member
         or new.seed_batch_id is distinct from old.seed_batch_id then
        raise exception 'Founding Community flags can only be changed by Home Fixr staff'
          using errcode = '42501';
      end if;
      -- Direct tampering with the rate-limit clock is ignored.
      if new.username is not distinct from old.username then
        new.username_changed_at := old.username_changed_at;
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.username is distinct from old.username then
    v_err := public.handle_format_error(new.username);
    if v_err is not null then
      raise exception 'Invalid handle "%" (%)', new.username, v_err
        using errcode = '23514', hint = 'handle_' || v_err;
    end if;
    if v_api and public.is_reserved_handle(new.username) then
      raise exception 'The handle "%" is reserved', new.username
        using errcode = '23514', hint = 'handle_reserved';
    end if;
    if exists (
      select 1 from profiles
       where lower(username) = lower(new.username) and id <> new.id
    ) then
      raise exception 'The handle "%" is taken', new.username
        using errcode = '23505', hint = 'handle_taken';
    end if;
    if tg_op = 'UPDATE' then
      if v_api and old.username_changed_at is not null
         and old.username_changed_at > now() - interval '30 days' then
        raise exception 'Handles can be changed once every 30 days'
          using errcode = '42501', hint = 'handle_rate_limited';
      end if;
      new.username_changed_at := now();
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before insert or update on profiles
  for each row execute function public.profiles_guard();

-- "Keep my current handle." Marks an auto-derived handle as chosen (so the app
-- stops nudging) WITHOUT starting the 30-day change clock: the stamp is
-- backdated by 30 days.
create or replace function public.confirm_current_handle()
returns void language sql security definer set search_path = public as $$
  update profiles
     set username_changed_at = now() - interval '30 days'
   where id = auth.uid() and username_changed_at is null;
$$;
revoke all on function public.confirm_current_handle() from public, anon;
grant execute on function public.confirm_current_handle() to authenticated;

-- ----------------------------------------------------------------
-- 7. Contact guards. Founding Community accounts have no human behind them,
--    so a real member must not be able to send them a message, a mentorship
--    request, or a job application. Also honours mentor_availability.
--    Staff/seed roles are not restricted.
-- ----------------------------------------------------------------
create or replace function public.guard_contact_with_founding()
returns trigger language plpgsql set search_path = public as $$
declare v_target uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_table_name = 'messages' then
    v_target := new.recipient_id;
  elsif tg_table_name = 'mentorships' then
    v_target := new.senior_id;
  elsif tg_table_name = 'collab_interests' then
    select poster_id into v_target from job_collabs where id = new.collab_id;
  end if;

  if exists (select 1 from profiles where id = v_target and is_founding_member) then
    raise exception 'This is a Founding Community account'
      using errcode = '42501', hint = 'founding_member',
            detail = 'Founding Community accounts were set up by the Home Fixr team to seed early discussions. They don''t take messages, mentorship requests, or job applications.';
  end if;

  if tg_table_name = 'mentorships' and exists (
    select 1 from profiles where id = v_target and mentor_availability = 'not_accepting'
  ) then
    raise exception 'This mentor isn''t taking new mentees right now'
      using errcode = '42501', hint = 'mentor_not_accepting';
  end if;

  return new;
end $$;

drop trigger if exists messages_founding_guard on messages;
create trigger messages_founding_guard
  before insert on messages
  for each row execute function public.guard_contact_with_founding();

drop trigger if exists mentorships_founding_guard on mentorships;
create trigger mentorships_founding_guard
  before insert on mentorships
  for each row execute function public.guard_contact_with_founding();

drop trigger if exists collab_interests_founding_guard on collab_interests;
create trigger collab_interests_founding_guard
  before insert on collab_interests
  for each row execute function public.guard_contact_with_founding();

-- ----------------------------------------------------------------
-- 8. Signup trigger: same behaviour as 0006, but the derived username now
--    always satisfies the handle rules, so a signup can never fail on them.
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_username text;
  v_base text;
  v_suffix int := 0;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    'New Member'
  );

  -- An explicit username in metadata keeps its casing; an email-derived one
  -- is lowercased. Either way: '-' becomes '_', other invalid characters are
  -- dropped, edge dots trimmed, and the result capped to leave suffix room.
  v_base := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    lower(split_part(coalesce(new.email, ''), '@', 1))
  );
  v_base := regexp_replace(replace(coalesce(v_base, ''), '-', '_'), '[^A-Za-z0-9_.]', '', 'g');
  v_base := btrim(left(v_base, 18), '.');
  if length(v_base) < 3 or public.is_reserved_handle(v_base) then
    v_base := 'member';
  end if;

  v_username := v_base;
  while exists (select 1 from profiles where lower(username) = lower(v_username)) loop
    v_suffix := v_suffix + 1;
    v_username := btrim(left(v_base, 22 - length(v_suffix::text)), '.') || v_suffix::text;
  end loop;

  insert into public.profiles (
    id, username, full_name, avatar_initials, title,
    role, trade, region, bio, years_experience, onboarded_at
  )
  values (
    new.id,
    v_username,
    v_name,
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_initials', ''),
      upper(left(regexp_replace(v_name, '[^A-Za-z]', '', 'g'), 2))
    ),
    nullif(new.raw_user_meta_data->>'title', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'junior'),
    (nullif(new.raw_user_meta_data->>'trade', ''))::trade_type,
    nullif(new.raw_user_meta_data->>'region', ''),
    nullif(new.raw_user_meta_data->>'bio', ''),
    (nullif(new.raw_user_meta_data->>'years_experience', ''))::int,
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
