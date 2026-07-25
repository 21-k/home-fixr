-- ================================================================
-- Home Fixr — migration 0007: message file & image attachments
-- ================================================================
-- Run in Supabase → SQL Editor AFTER 0006_onboarding.sql. Idempotent.
-- Creates the private `message-attachments` bucket and its policies in SQL,
-- so there is nothing to configure in the Storage dashboard.
--
-- Purpose is practical: juniors want to photograph a panel or a fitting and
-- ask "is this right?", and seniors want to look over a quote or a permit.
-- ================================================================

alter table messages add column if not exists attachment_path text;
alter table messages add column if not exists attachment_name text;
alter table messages add column if not exists attachment_type text;

-- A photo with no caption is a perfectly normal message, so `body` can now be
-- empty — but a message must still carry *something*.
alter table messages alter column body drop not null;

alter table messages drop constraint if exists messages_have_content;
alter table messages add constraint messages_have_content check (
  coalesce(btrim(body), '') <> '' or attachment_path is not null
);

-- ----------------------------------------------------------------
-- The bucket: private, 10 MB, images + the document types people actually
-- send from a job site.
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760,                                 -- 10 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------
-- Storage policies. Objects are keyed "<sender_id>/<uuid>.<ext>".
-- ----------------------------------------------------------------

drop policy if exists "users can upload their own message attachments" on storage.objects;
create policy "users can upload their own message attachments" on storage.objects
  for insert with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can delete their own message attachments" on storage.objects;
create policy "users can delete their own message attachments" on storage.objects
  for delete using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Senders can always read what they uploaded. This also covers the window
-- between upload and the message row being inserted.
drop policy if exists "senders can read their own message attachments" on storage.objects;
create policy "senders can read their own message attachments" on storage.objects
  for select using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The recipient can read an attachment only once it is actually attached to a
-- message addressed to them — the same shape as the CV rule in 0005.
drop policy if exists "recipients can read attachments sent to them" on storage.objects;
create policy "recipients can read attachments sent to them" on storage.objects
  for select using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from messages m
       where m.attachment_path = storage.objects.name
         and m.recipient_id = auth.uid()
    )
  );

create index if not exists messages_attachment_path_idx
  on messages(attachment_path) where attachment_path is not null;
