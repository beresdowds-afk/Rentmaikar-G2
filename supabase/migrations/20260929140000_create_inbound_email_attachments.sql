-- Phase 7: Durable Resend inbound attachment records
--
-- Attachment metadata is stored separately from inbound_emails.
-- Binary attachment storage is intentionally deferred to the
-- attachment-storage phase.

create table if not exists public.inbound_email_attachments (
  id uuid primary key default gen_random_uuid(),

  inbound_email_id uuid not null
    references public.inbound_emails(id)
    on delete cascade,

  resend_email_id text not null,

  resend_attachment_id text,

  filename text not null,

  content_type text,

  size_bytes bigint,

  storage_status text not null default 'pending',

  storage_provider text,

  storage_bucket text,

  storage_path text,

  download_error text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint inbound_email_attachments_storage_status_check
    check (
      storage_status in (
        'pending',
        'stored',
        'failed',
        'not_stored'
      )
    ),

  constraint inbound_email_attachments_resend_unique
    unique (
      inbound_email_id,
      resend_attachment_id
    )
);

create index if not exists idx_inbound_email_attachments_email_id
  on public.inbound_email_attachments (inbound_email_id);

create index if not exists idx_inbound_email_attachments_resend_email_id
  on public.inbound_email_attachments (resend_email_id);

create index if not exists idx_inbound_email_attachments_storage_status
  on public.inbound_email_attachments (storage_status);

comment on table public.inbound_email_attachments is
  'Durable metadata for attachments received through Resend inbound email receiving.';

comment on column public.inbound_email_attachments.resend_attachment_id is
  'Authoritative Resend attachment identifier when supplied by Resend.';

comment on column public.inbound_email_attachments.storage_status is
  'Attachment storage lifecycle: pending, stored, failed, or not_stored.';
