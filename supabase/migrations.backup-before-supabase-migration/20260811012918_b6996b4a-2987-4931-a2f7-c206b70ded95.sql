ALTER TABLE public.inbox_conversations
  ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inbox_conversations_archived_at ON public.inbox_conversations (archived_at);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_is_flagged ON public.inbox_conversations (is_flagged) WHERE is_flagged;