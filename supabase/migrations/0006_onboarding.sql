-- ================================================================
-- Home Fixr — migration 0006: minimal signup + post-login onboarding
-- ================================================================
-- Run in Supabase → SQL Editor AFTER 0005_cv_attachments.sql. Idempotent.
--
-- WHY: signup asked for name, email, password, role, trade, region, years, and
-- title all up front, which is friction at exactly the moment a stranger is
-- deciding whether to trust us. Signup now collects the minimum, and the rest
-- is asked once the user is already inside.
--
-- Google sign-in makes this necessary as well as desirable: an OAuth user never
-- sees our form at all, so there is no opportunity to ask for role or trade
-- before their profile row exists.
-- ================================================================

-- Null = has not completed the welcome step yet.
alter table profiles add column if not exists onboarded_at timestamptz;

-- Backfill everyone who already exists so only NEW signups get prompted.
-- Without this, every seeded and existing member would be sent to /welcome.
update profiles set onboarded_at = coalesce(onboarded_at, created_at)
 where onboarded_at is null;

-- ----------------------------------------------------------------
-- The signup trigger from 0001 defaults role to 'junior' when the metadata
-- doesn't carry one — which is exactly what happens with Google sign-in.
-- Rather than guess, we leave the default and let /welcome ask. This replaces
-- the function so a Google user's name and avatar come through: Supabase puts
-- Google's profile under raw_user_meta_data as `full_name` / `name` /
-- `avatar_url`, none of which the 0001 version read beyond `full_name`.
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
  -- Google sends `full_name` and/or `name`; the email form sends `full_name`.
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    'New Member'
  );

  -- Usernames are unique. The old version could collide (two people at
  -- different domains with the same local part, e.g. mike@a.com / mike@b.com)
  -- and the insert would fail, leaving a user with no profile row at all.
  v_base := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9._-]', '', 'g'),
    'member'
  );
  if v_base = '' then v_base := 'member'; end if;
  v_username := v_base;
  while exists (select 1 from profiles where username = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := v_base || v_suffix::text;
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
    -- Always null for new signups: both the email form and Google sign-in now
    -- collect the bare minimum, and /welcome asks for the rest once the user is
    -- already inside. The backfill above spares existing members.
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
