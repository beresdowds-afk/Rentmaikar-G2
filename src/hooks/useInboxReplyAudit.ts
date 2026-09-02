import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InboxReplyAuditEntry {
  id: string;
  conversation_id: string;
  message_id: string | null;
  channel: string;
  reply_type: string;
  rule_id: string | null;
  rule_name: string | null;
  matched_keywords: string[];
  match_type: string | null;
  cooldown_minutes: number | null;
  cooldown_status: string;
  cooldown_remaining_minutes: number | null;
  canned_reply_id: string | null;
  canned_reply_title: string | null;
  body_preview: string | null;
  delivered: boolean;
  error_message: string | null;
  actor_id: string | null;
  created_at: string;
}

export const useInboxReplyAudit = (conversationId?: string) => {
  const [entries, setEntries] = useState<InboxReplyAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inbox_reply_audit')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading reply audit log:', error);
    } else {
      setEntries((data || []) as InboxReplyAuditEntry[]);
    }
    setIsLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`inbox-reply-audit-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_reply_audit',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setEntries((prev) => [payload.new as InboxReplyAuditEntry, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { entries, isLoading, fetchEntries };
};

/** Records a manually-sent canned reply against the thread audit log. */
export const logCannedReplyUsage = async (params: {
  conversationId: string;
  channel: string;
  cannedReplyId: string;
  cannedReplyTitle: string;
  bodyPreview: string;
  delivered: boolean;
  errorMessage?: string | null;
}) => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('inbox_reply_audit').insert({
      conversation_id: params.conversationId,
      channel: params.channel,
      reply_type: 'canned',
      canned_reply_id: params.cannedReplyId,
      canned_reply_title: params.cannedReplyTitle,
      body_preview: params.bodyPreview.slice(0, 280),
      cooldown_status: 'not_applicable',
      delivered: params.delivered,
      error_message: params.errorMessage ?? null,
      actor_id: userData.user?.id ?? null,
    });
  } catch (err) {
    console.error('Failed to log canned reply usage:', err);
  }
};
