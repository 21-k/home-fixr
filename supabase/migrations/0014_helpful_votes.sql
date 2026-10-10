-- ================================================================
-- Home Fixr — migration 0014: "helpful" counts once per member
-- ================================================================
-- Run AFTER 0013_collab_filled.sql. Idempotent.
--
-- WHY: mark_post_helpful / mark_reply_helpful (0001) added 1 on every call
-- ("demo-grade — no per-user dedupe"), so one member could click "Helpful"
-- again and again and keep raising the total.
--
-- Now each member's vote is a row in helpful_votes, unique per member per post
-- or reply, and the counter only moves when a new vote row is created. Votes
-- are written only through the two functions; members can read their own
-- votes (so the page can show "Marked helpful") and nobody else's.
-- helpful_count stays the displayed total; earlier counts are kept as they are.
-- ================================================================

create table if not exists helpful_votes (
  user_id    uuid not null references profiles(id) on delete cascade,
  post_id    uuid references posts(id) on delete cascade,
  reply_id   uuid references replies(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint helpful_votes_one_target check ((post_id is null) <> (reply_id is null))
);

create unique index if not exists helpful_votes_user_post
  on helpful_votes (user_id, post_id) where post_id is not null;
create unique index if not exists helpful_votes_user_reply
  on helpful_votes (user_id, reply_id) where reply_id is not null;
create index if not exists helpful_votes_post_idx on helpful_votes (post_id) where post_id is not null;
create index if not exists helpful_votes_reply_idx on helpful_votes (reply_id) where reply_id is not null;

alter table helpful_votes enable row level security;

drop policy if exists "members see their own helpful votes" on helpful_votes;
create policy "members see their own helpful votes"
  on helpful_votes for select using (auth.uid() = user_id);

-- Read-only to the API roles: votes are only ever written by the functions below.
revoke all on helpful_votes from anon, authenticated;
grant select on helpful_votes to authenticated;

create or replace function public.mark_post_helpful(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_new int;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  insert into helpful_votes (user_id, post_id) values (auth.uid(), p_post_id)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 1 then
    update posts set helpful_count = helpful_count + 1 where id = p_post_id;
  end if;
end; $$;

create or replace function public.mark_reply_helpful(p_reply_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_new int;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  insert into helpful_votes (user_id, reply_id) values (auth.uid(), p_reply_id)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 1 then
    update replies set helpful_count = helpful_count + 1 where id = p_reply_id;
  end if;
end; $$;

revoke all on function public.mark_post_helpful(uuid) from public, anon;
revoke all on function public.mark_reply_helpful(uuid) from public, anon;
grant execute on function public.mark_post_helpful(uuid) to authenticated;
grant execute on function public.mark_reply_helpful(uuid) to authenticated;
