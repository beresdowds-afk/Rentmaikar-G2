-- Phase 8: Inbound email attachment storage
--
-- Attachment binaries are stored in a private Supabase Storage bucket.
-- The database remains the authoritative metadata/index for each file.

insert into storage.buckets (
  id,
  name,
  public
)
values (
  'inbound-email-attachments',
  'inbound-email-attachments',
  false
)
on conflict (id) do nothing;

comment on table storage.objects is
  'Supabase Storage objects, including private inbound email attachments.';
