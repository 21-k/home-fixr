-- ================================================================
-- Home Fixr — migration 0012: public mentee COUNTS (not who mentors whom)
-- ================================================================
-- Run AFTER 0011_avatar_styles.sql. Idempotent.
--
-- WHY: the mentor directory and profiles show "N mentees", tallied from
-- mentorships. RLS on mentorships (schema.sql: "visible to junior or senior")
-- lets only the two people in a mentorship read its row, so every other
-- viewer, and every logged-out visitor, counted 0 for every Senior.
--
-- Decision (Gaurav, Oct 7 2026): publish the NUMBER of active mentees per
-- Senior and nothing else. The rows, and so who mentors whom, stay private to
-- the two people involved. This function returns only (senior_id, count).
-- ================================================================

create or replace function public.active_mentee_counts(p_senior_ids uuid[] default null)
returns table (senior_id uuid, mentees int)
language sql
stable
security definer
set search_path = public
as $$
  select m.senior_id, count(*)::int
    from mentorships m
   where m.status = 'active'
     and (p_senior_ids is null or m.senior_id = any (p_senior_ids))
   group by m.senior_id;
$$;

revoke all on function public.active_mentee_counts(uuid[]) from public;
grant execute on function public.active_mentee_counts(uuid[]) to anon, authenticated;
