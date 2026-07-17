-- ================================================================
-- Home Fixr — app functions, triggers, and grants
-- ================================================================
-- Run this in Supabase → SQL Editor AFTER schema.sql (safe to re-run — it uses
-- `create or replace` and `if not exists`). It adds everything the app needs
-- beyond the base tables:
--   * a `title` column on profiles (display headline, e.g. "Master Plumber")
--   * a trigger that auto-creates a profile row on signup
--   * a trigger that keeps posts.reply_count in sync
--   * RPCs for cross-owner actions (accept answer, helpful/interest counters)
-- ================================================================

alter table profiles add column if not exists title text;

-- ----------------------------------------------------------------
-- 1. Auto-create a profile when a new auth user signs up.
--    The signup form passes profile fields via the user's metadata.
--    Runs as SECURITY DEFINER so it can write even before a session exists
--    (e.g. when email confirmation is enabled).
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, username, full_name, avatar_initials, title,
    role, trade, region, bio, years_experience
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'New Member'),
    coalesce(nullif(new.raw_user_meta_data->>'avatar_initials', ''),
             upper(left(coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'N'), 2))),
    nullif(new.raw_user_meta_data->>'title', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'junior'),
    (nullif(new.raw_user_meta_data->>'trade', ''))::trade_type,
    nullif(new.raw_user_meta_data->>'region', ''),
    nullif(new.raw_user_meta_data->>'bio', ''),
    (nullif(new.raw_user_meta_data->>'years_experience', ''))::int
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------
-- 2. Keep posts.reply_count in sync with the replies table.
-- ----------------------------------------------------------------
create or replace function public.sync_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update posts set reply_count = reply_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_reply_change on replies;
create trigger on_reply_change
  after insert or delete on replies
  for each row execute function public.sync_reply_count();

-- ----------------------------------------------------------------
-- 3. Accept a reply — only the author of the QUESTION may mark an answer
--    on their own post as accepted. RLS wouldn't allow this (the post author
--    doesn't own the reply row), so it goes through a SECURITY DEFINER RPC
--    that checks ownership itself.
-- ----------------------------------------------------------------
create or replace function public.accept_reply(p_reply_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post uuid;
begin
  select post_id into v_post from replies where id = p_reply_id;
  if v_post is null then
    raise exception 'reply not found';
  end if;
  if not exists (select 1 from posts where id = v_post and author_id = auth.uid()) then
    raise exception 'only the author of the question can accept an answer';
  end if;
  update replies set is_accepted = false where post_id = v_post;
  update replies set is_accepted = true  where id = p_reply_id;
end;
$$;

-- ----------------------------------------------------------------
-- 4. Lightweight counters (demo-grade — no per-user dedupe).
-- ----------------------------------------------------------------
create or replace function public.mark_post_helpful(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  update posts set helpful_count = helpful_count + 1 where id = p_post_id;
end; $$;

create or replace function public.mark_reply_helpful(p_reply_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  update replies set helpful_count = helpful_count + 1 where id = p_reply_id;
end; $$;

create or replace function public.express_collab_interest(p_collab_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  update job_collabs set interested_count = interested_count + 1 where id = p_collab_id;
end; $$;

-- ----------------------------------------------------------------
-- 5. Allow the logged-in API role to call the RPCs.
-- ----------------------------------------------------------------
grant execute on function public.accept_reply(uuid) to authenticated;
grant execute on function public.mark_post_helpful(uuid) to authenticated;
grant execute on function public.mark_reply_helpful(uuid) to authenticated;
grant execute on function public.express_collab_interest(uuid) to authenticated;
