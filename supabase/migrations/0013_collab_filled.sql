-- ================================================================
-- Home Fixr — migration 0013: "Position filled" job collabs
-- ================================================================
-- Run AFTER 0012_public_mentee_counts.sql. One transaction, idempotent.
--
-- WHY: a collab stayed "open" forever, even after the poster had taken
-- someone on, so the Jobs board filled up with dead ends and people kept
-- pitching for work that was already gone.
--
--   * job_collabs.filled_at (null = open). The poster marks their own collab
--     filled, or reopens it, through the existing RLS policy
--     "posters can update their own collabs" (schema.sql: using auth.uid() =
--     poster_id, which also checks the new row, so nobody else's collab can
--     be touched and poster_id can't be handed to someone else).
--   * For API users (anon / authenticated) a filled_at value is always the
--     moment they marked it (no backdating), and seed_batch_id can't be set
--     or changed (it's what wipe.py deletes by).
--   * Applications: an API user can't apply to a filled collab, or revise an
--     application on one. The poster can still accept/decline, and an
--     applicant can still withdraw (delete) their row. The trigger name sorts
--     before collab_interests_founding_guard, so on a filled Founding
--     Community collab the member sees "position has been filled" first.
--   * express_collab_interest() (0004) is SECURITY DEFINER, so the triggers
--     it fires see the function owner, not the member, and skip their API-role
--     rules. That let a member register interest on a Founding Community
--     collab through the RPC. It now applies both rules itself.
--
-- Staff and the seed scripts (postgres / service_role) are not restricted:
-- the Founding Community seed writes filled collabs with their applications.
-- ================================================================

begin;

alter table job_collabs add column if not exists filled_at timestamptz;

create index if not exists job_collabs_open_idx
  on job_collabs (created_at desc) where filled_at is null;

-- ----------------------------------------------------------------
-- job_collabs guard (API roles only)
-- ----------------------------------------------------------------
create or replace function public.job_collabs_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.seed_batch_id := null;
    if new.filled_at is not null then
      new.filled_at := now();
    end if;
    return new;
  end if;

  if new.seed_batch_id is distinct from old.seed_batch_id then
    raise exception 'Seed batch tags can only be changed by Home Fixr staff'
      using errcode = '42501';
  end if;

  -- Marking filled (or re-marking) stamps the current time.
  if new.filled_at is not null and new.filled_at is distinct from old.filled_at then
    new.filled_at := now();
  end if;
  return new;
end $$;

drop trigger if exists job_collabs_guard on job_collabs;
create trigger job_collabs_guard
  before insert or update on job_collabs
  for each row execute function public.job_collabs_guard();

-- ----------------------------------------------------------------
-- No new or revised applications on a filled collab (API roles only)
-- ----------------------------------------------------------------
create or replace function public.collab_is_filled(p_collab_id uuid)
returns boolean language sql stable set search_path = public as $$
  -- job_collabs is publicly readable, so this needs no elevated rights.
  select coalesce((select filled_at is not null from job_collabs where id = p_collab_id), false)
$$;

create or replace function public.guard_collab_interest_filled()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  -- The poster answering an applicant is still allowed on a filled collab;
  -- what's refused is a new application or the applicant editing theirs.
  if (tg_op = 'INSERT' or new.user_id = auth.uid())
     and public.collab_is_filled(new.collab_id) then
    raise exception 'This position has been filled'
      using errcode = '42501', hint = 'collab_filled',
            detail = 'The poster has marked this job filled, so it isn''t taking applications.';
  end if;
  return new;
end $$;

-- "filled" sorts before "founding": this guard runs first.
drop trigger if exists collab_interests_filled_guard on collab_interests;
create trigger collab_interests_filled_guard
  before insert or update on collab_interests
  for each row execute function public.guard_collab_interest_filled();

-- ----------------------------------------------------------------
-- The 0004 RPC: apply the founding and filled rules explicitly, because the
-- triggers it fires run as the function owner.
-- ----------------------------------------------------------------
create or replace function public.express_collab_interest(
  p_collab_id uuid,
  p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_poster uuid;
  v_filled timestamptz;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;

  select poster_id, filled_at into v_poster, v_filled from job_collabs where id = p_collab_id;
  if v_poster is null then raise exception 'no such collab'; end if;
  if v_poster = auth.uid() then
    raise exception 'you posted this collab';
  end if;
  if v_filled is not null then
    raise exception 'This position has been filled'
      using errcode = '42501', hint = 'collab_filled';
  end if;
  if exists (select 1 from profiles where id = v_poster and is_founding_member) then
    raise exception 'This is a Founding Community account'
      using errcode = '42501', hint = 'founding_member';
  end if;

  insert into collab_interests (collab_id, user_id, note)
  values (p_collab_id, auth.uid(), nullif(btrim(p_note), ''))
  on conflict (collab_id, user_id) do nothing;
end $$;

grant execute on function public.express_collab_interest(uuid, text) to authenticated;

commit;
