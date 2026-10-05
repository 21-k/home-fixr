-- ================================================================
-- Home Fixr — migration 0010: let the seeder run without notifications
-- ================================================================
-- Run AFTER 0009. Idempotent.
--
-- The notification triggers from 0002/0004 fire on every reply, follow,
-- mentorship and collab-interest insert. When the Founding Community seed is
-- loaded we don't want any of those rows: they would be noise for seeded
-- accounts and, if anything ever touched a real member, a fake notification.
--
-- Rather than disabling triggers (ALTER TABLE ... DISABLE TRIGGER takes an
-- exclusive lock on the table for the whole seed transaction), each notify
-- function returns early when the transaction-local setting
--     set local homefixr.seeding = 'on';
-- is present. Only the seed script sets it; PostgREST requests can't. The
-- counter, slug and guard triggers are untouched and keep running.
--
-- Function bodies are otherwise identical to their latest versions
-- (0002 for reply/mentorship/message/follow, 0004 for the collab ones).
-- ================================================================

create or replace function public.seeding_in_progress()
returns boolean language sql stable as $$
  select coalesce(current_setting('homefixr.seeding', true), '') = 'on'
$$;

create or replace function public.notify_on_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  if public.seeding_in_progress() then return null; end if;
  select author_id into v_author from posts where id = new.post_id;
  if v_author is not null and v_author <> new.author_id then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (v_author, 'reply', new.author_id, 'post', new.post_id);
  end if;
  return null;
end $$;

create or replace function public.notify_on_mentorship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.seeding_in_progress() then return null; end if;
  if (tg_op = 'INSERT') then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (new.senior_id, 'mentorship_request', new.junior_id, 'mentorship', new.id);
  elsif (tg_op = 'UPDATE' and new.status = 'active' and old.status <> 'active') then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (new.junior_id, 'mentorship_accepted', new.senior_id, 'mentorship', new.id);
  end if;
  return null;
end $$;

create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.seeding_in_progress() then return null; end if;
  insert into notifications (user_id, type, actor_id, entity_type, entity_id)
  values (new.recipient_id, 'message', new.sender_id, 'message', new.id);
  return null;
end $$;

create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.seeding_in_progress() then return null; end if;
  insert into notifications (user_id, type, actor_id, entity_type, entity_id)
  values (new.following_id, 'follow', new.follower_id, 'profile', new.follower_id);
  return null;
end $$;

create or replace function public.notify_on_collab_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poster uuid;
begin
  if public.seeding_in_progress() then return null; end if;
  select poster_id into v_poster from job_collabs where id = new.collab_id;
  if v_poster is not null and v_poster <> new.user_id then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (v_poster, 'collab_interest', new.user_id, 'collab', new.collab_id);
  end if;
  return null;
end $$;

create or replace function public.notify_on_collab_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poster uuid;
begin
  if public.seeding_in_progress() then return null; end if;
  if new.status = 'accepted' and old.status <> 'accepted' then
    select poster_id into v_poster from job_collabs where id = new.collab_id;
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (new.user_id, 'collab_accepted', v_poster, 'collab', new.collab_id);
  end if;
  return null;
end $$;
