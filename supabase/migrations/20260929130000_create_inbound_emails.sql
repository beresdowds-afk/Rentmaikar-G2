-- Phase 6: Durable Resend inbound email records
--
-- Cloud Run is the authoritative inbound processing layer.
-- This table stores the received email before forwarding is attempted.
-- resend_email_id is the authoritative Resend idempotency key.

create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),

  resend_email_id text not null,

  from_address text not null,

  to_addresses jsonb not null default '[]'::jsonb,

  cc_addresses jsonb not null default '[]'::jsonb,

  bcc_addresses jsonb not null default '[]'::jsonb,

  subject text,

  text_body text,

  html_body text,

  message_id text,

  headers jsonb not null default '{}'::jsonb,

  received_at timestamptz not null default now(),

  processing_status text not null default 'received',

  forwarding_status text not null default 'pending',

  forwarded_at timestamptz,

  forward_error text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint inbound_emails_resend_email_id_key
    unique (resend_email_id),

  constraint inbound_emails_processing_status_check
    check (
      processing_status in (
        'received',
        'processing',
        'forwarded',
        'forward_failed',
        'failed'
      )
    ),

  constraint inbound_emails_forwarding_status_check
    check (
      forwarding_status in (
        'pending',
        'forwarded',
        'failed'
      )
    )
);

create index if not exists idx_inbound_emails_received_at
  on public.inbound_emails (received_at desc);

create index if not exists idx_inbound_emails_processing_status
  on public.inbound_emails (processing_status);

create index if not exists idx_inbound_emails_forwarding_status
  on public.inbound_emails (forwarding_status);

create index if not exists idx_inbound_emails_message_id
  on public.inbound_emails (message_id);

comment on table public.inbound_emails is
  'Durable Cloud Run record of emails received through Resend inbound receiving.';

comment on column public.inbound_emails.resend_email_id is
  'Authoritative Resend received-email identifier and idempotency key.';

comment on column public.inbound_emails.processing_status is
  'Inbound processing lifecycle: received, processing, forwarded, forward_failed, or failed.';

comment on column public.inbound_emails.forwarding_status is
  'External forwarding lifecycle: pending, forwarded, or failed.';
