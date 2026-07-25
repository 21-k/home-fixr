-- ================================================================
-- Home Fixr — migration 0008: richer job application details
-- ================================================================
-- Run in Supabase → SQL Editor AFTER 0007_message_attachments.sql. Idempotent.
--
-- WHY: an application was a free-text pitch plus an optional CV, which left
-- posters guessing at the things they actually screen on — how long someone has
-- been in the trade, what they can do unsupervised, whether they're licensed,
-- and whether they can get themselves to site with their own tools.
--
-- PRIVACY NOTE on age_range: we deliberately store a coarse BAND, never a date
-- of birth, and 'undisclosed' is a first-class value rather than a blank. Only
-- the poster of the job can read it — the existing RLS select policy on
-- collab_interests already limits rows to the applicant and that poster, and
-- these columns inherit it.
--
-- 'under_18' is worth handling consciously in the UI: a minor on a job site
-- raises labor-law and insurance questions for the poster, so it is surfaced
-- rather than buried.
-- ================================================================

alter table collab_interests add column if not exists years_experience int;
alter table collab_interests add column if not exists graduation_year int;
alter table collab_interests add column if not exists age_range text;
alter table collab_interests add column if not exists skills text[];
alter table collab_interests add column if not exists is_licensed boolean;
alter table collab_interests add column if not exists license_note text;
alter table collab_interests add column if not exists has_own_tools boolean;
alter table collab_interests add column if not exists has_transport boolean;

-- ----------------------------------------------------------------
-- Sanity constraints. A typo'd year is worse than a blank one, because the
-- poster reads it as fact.
-- ----------------------------------------------------------------
alter table collab_interests drop constraint if exists collab_interests_years_sane;
alter table collab_interests add constraint collab_interests_years_sane check (
  years_experience is null or (years_experience >= 0 and years_experience <= 70)
);

-- Deliberately open-ended at the top so this doesn't need revisiting; the lower
-- bound rules out obvious typos like a 3-digit year.
alter table collab_interests drop constraint if exists collab_interests_grad_year_sane;
alter table collab_interests add constraint collab_interests_grad_year_sane check (
  graduation_year is null or (graduation_year >= 1950 and graduation_year <= 2100)
);

alter table collab_interests drop constraint if exists collab_interests_age_range_valid;
alter table collab_interests add constraint collab_interests_age_range_valid check (
  age_range is null or age_range in (
    'under_18', '18_24', '25_34', '35_44', '45_54', '55_plus', 'undisclosed'
  )
);

-- Cap the skills array so a crafted request can't stuff the row.
alter table collab_interests drop constraint if exists collab_interests_skills_sane;
alter table collab_interests add constraint collab_interests_skills_sane check (
  skills is null or array_length(skills, 1) is null or array_length(skills, 1) <= 20
);
