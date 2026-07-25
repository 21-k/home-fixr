-- ================================================================
-- Home Fixr — migration 0005: job application notes + CV attachments
-- ================================================================
-- Run in Supabase → SQL Editor AFTER 0004_collab_interests.sql.
-- Fully idempotent. Creates the private `cvs` Storage bucket in SQL, so there
-- is nothing to click in the Storage dashboard.
--
-- A CV carries someone's name, phone, and address, so the bucket is PRIVATE
-- and readable by exactly two parties: the applicant who uploaded it, and the
-- poster of the job they applied to. Downloads go through short-lived signed
-- URLs minted server-side.
-- ================================================================

-- ----------------------------------------------------------------
-- Application payload on the interest row.
-- `note` already exists from 0004; these track the uploaded file.
-- cv_path is the object key inside the `cvs` bucket ("<user_id>/<uuid>.pdf");
-- cv_name is the original filename, for display only.
-- ----------------------------------------------------------------
alter table collab_interests add column if not exists cv_path text;
alter table collab_interests add column if not exists cv_name text;

-- An applicant may revise their own pitch while it's still pending. The
-- with-check pins status to 'interested' so they cannot accept themselves,
-- and the using clause stops edits after the poster has already decided.
drop policy if exists "applicants can revise their own application" on collab_interests;
create policy "applicants can revise their own application" on collab_interests
  for update
  using (auth.uid() = user_id and status = 'interested')
  with check (auth.uid() = user_id and status = 'interested');

-- ----------------------------------------------------------------
-- The `cvs` bucket. public = false, 5 MB cap, documents + images only.
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs',
  'cvs',
  false,
  5242880,                                  -- 5 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------
-- Storage policies. Objects are keyed "<user_id>/<uuid>.<ext>", so the first
-- path segment is the owner and drives every rule below.
-- ----------------------------------------------------------------

drop policy if exists "users can upload their own cv" on storage.objects;
create policy "users can upload their own cv" on storage.objects
  for insert with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can replace their own cv" on storage.objects;
create policy "users can replace their own cv" on storage.objects
  for update using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can read their own cv" on storage.objects;
create policy "users can read their own cv" on storage.objects
  for select using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can delete their own cv" on storage.objects;
create policy "users can delete their own cv" on storage.objects
  for delete using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The one cross-owner read: a poster may fetch a CV only while it is attached
-- to an application on a job they themselves posted.
drop policy if exists "posters can read attached applicant cvs" on storage.objects;
create policy "posters can read attached applicant cvs" on storage.objects
  for select using (
    bucket_id = 'cvs'
    and exists (
      select 1
        from collab_interests ci
        join job_collabs jc on jc.id = ci.collab_id
       where ci.cv_path = storage.objects.name
         and jc.poster_id = auth.uid()
    )
  );
