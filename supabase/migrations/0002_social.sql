-- ================================================================
-- Home Fixr — migration 0002: follows, messages, notifications
-- ================================================================
-- Run in Supabase → SQL Editor AFTER 0001_app.sql. Fully idempotent
-- (create ... if not exists / create or replace / drop ... if exists).
-- ================================================================

-- ----------------------------------------------------------------
-- FOLLOWS
-- ----------------------------------------------------------------
create table if not exists follows (
  follower_id  uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on follows(following_id);

alter table follows enable row level security;
drop policy if exists "follows are viewable by everyone" on follows;
create policy "follows are viewable by everyone" on follows for select using (true);
drop policy if exists "users can follow" on follows;
create policy "users can follow" on follows for insert with check (auth.uid() = follower_id);
drop policy if exists "users can unfollow" on follows;
create policy "users can unfollow" on follows for delete using (auth.uid() = follower_id);

-- ----------------------------------------------------------------
-- MESSAGES (direct 1:1 messages; conversations derived in the app)
-- ----------------------------------------------------------------
create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body         text not null,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists messages_pair_idx on messages(sender_id, recipient_id, created_at);
create index if not exists messages_recipient_idx on messages(recipient_id, created_at desc);

alter table messages enable row level security;
drop policy if exists "messages visible to sender or recipient" on messages;
create policy "messages visible to sender or recipient" on messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "users can send messages" on messages;
create policy "users can send messages" on messages
  for insert with check (auth.uid() = sender_id);
drop policy if exists "recipient can mark read" on messages;
create policy "recipient can mark read" on messages
  for update using (auth.uid() = recipient_id);

-- ----------------------------------------------------------------
-- NOTIFICATIONS (created by triggers below; users read + mark read)
-- ----------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type notification_type as enum
      ('reply', 'mentorship_request', 'mentorship_accepted', 'message', 'follow');
  end if;
end $$;

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,  -- recipient
  type        notification_type not null,
  actor_id    uuid references profiles(id) on delete cascade,           -- who triggered it
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

alter table notifications enable row level security;
drop policy if exists "users see their notifications" on notifications;
create policy "users see their notifications" on notifications
  for select using (auth.uid() = user_id);
drop policy if exists "users can mark their notifications" on notifications;
create policy "users can mark their notifications" on notifications
  for update using (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- Notification triggers (SECURITY DEFINER so they can insert rows for
-- the recipient regardless of who caused the event).
-- ----------------------------------------------------------------
create or replace function public.notify_on_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from posts where id = new.post_id;
  if v_author is not null and v_author <> new.author_id then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (v_author, 'reply', new.author_id, 'post', new.post_id);
  end if;
  return null;
end $$;
drop trigger if exists on_reply_notify on replies;
create trigger on_reply_notify after insert on replies
  for each row execute function public.notify_on_reply();

create or replace function public.notify_on_mentorship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (new.senior_id, 'mentorship_request', new.junior_id, 'mentorship', new.id);
  elsif (tg_op = 'UPDATE' and new.status = 'active' and old.status <> 'active') then
    insert into notifications (user_id, type, actor_id, entity_type, entity_id)
    values (new.junior_id, 'mentorship_accepted', new.senior_id, 'mentorship', new.id);
  end if;
  return null;
end $$;
drop trigger if exists on_mentorship_notify on mentorships;
create trigger on_mentorship_notify after insert or update on mentorships
  for each row execute function public.notify_on_mentorship();

create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, actor_id, entity_type, entity_id)
  values (new.recipient_id, 'message', new.sender_id, 'message', new.id);
  return null;
end $$;
drop trigger if exists on_message_notify on messages;
create trigger on_message_notify after insert on messages
  for each row execute function public.notify_on_message();

create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, actor_id, entity_type, entity_id)
  values (new.following_id, 'follow', new.follower_id, 'profile', new.follower_id);
  return null;
end $$;
drop trigger if exists on_follow_notify on follows;
create trigger on_follow_notify after insert on follows
  for each row execute function public.notify_on_follow();

-- ----------------------------------------------------------------
-- Grants for the API roles
-- ----------------------------------------------------------------
grant select on follows, messages, notifications to anon, authenticated;
grant insert, delete on follows to authenticated;
grant insert, update on messages to authenticated;
grant update on notifications to authenticated;
