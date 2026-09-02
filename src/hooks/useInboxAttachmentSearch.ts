import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  parseMessageAttachments,
  attachmentKind,
  attachmentOcrKey,
  type AttachmentKind,
  type InboxAttachment,
} from '@/lib/inbox-attachments';

export interface AttachmentHit {
  conversationId: string;
  messageId: string;
  createdAt: string;
  attachment: InboxAttachment;
  /** Matched because the OCR-extracted text contains the query. */
  matchedOcr?: boolean;
  /** Short snippet of extracted text around the match. */
  ocrSnippet?: string;
}

interface Options {
  /** 'all' disables attachment filtering entirely. 'any' = has any attachment. */
  kind: AttachmentKind | 'all' | 'any';
  /** Filename / content-type substring search. */
  query: string;
}

/**
 * Scans inbox messages for attachments and resolves which conversations
 * contain files matching the selected type and filename search.
 */
export const useInboxAttachmentSearch = ({ kind, query }: Options) => {
  const [hits, setHits] = useState<AttachmentHit[]>([]);
  const [conversationIds, setConversationIds] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const active = kind !== 'all' || query.trim().length > 0;

  useEffect(() => {
    let cancelled = false;

    if (!active) {
      setHits([]);
      setConversationIds(null);
      setIsLoading(false);
      return;
    }

    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('inbox_messages')
        .select('id, conversation_id, created_at, metadata')
        .not('metadata', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (cancelled) return;

      if (error) {
        console.error('Attachment search failed:', error);
        setHits([]);
        setConversationIds([]);
        setIsLoading(false);
        return;
      }

      const q = query.trim().toLowerCase();

      // Pull OCR-extracted text matching the query so scanned files are searchable
      const ocrByKey: Record<string, string> = {};
      if (q) {
        const { data: ocrRows } = await supabase
          .from('inbox_attachment_ocr')
          .select('message_id, attachment_key, extracted_text')
          .eq('status', 'completed')
          .ilike('extracted_text', `%${query.trim()}%`)
          .limit(2000);
        (ocrRows || []).forEach((row) => {
          ocrByKey[`${row.message_id}::${row.attachment_key}`] = (row.extracted_text as string) || '';
        });
      }

      const snippetFor = (text: string) => {
        const idx = text.toLowerCase().indexOf(q);
        if (idx < 0) return text.slice(0, 160);
        const start = Math.max(0, idx - 60);
        return `${start > 0 ? '…' : ''}${text.slice(start, idx + q.length + 80)}…`;
      };

      const found: AttachmentHit[] = [];

      (data || []).forEach((m) => {
        parseMessageAttachments(m.metadata).forEach((attachment) => {
          const matchesKind =
            kind === 'all' || kind === 'any' || attachmentKind(attachment) === kind;
          if (!matchesKind) return;
          const ocrText = ocrByKey[`${m.id}::${attachmentOcrKey(attachment)}`];
          const matchedOcr = Boolean(q && ocrText);
          if (
            q &&
            !matchedOcr &&
            !attachment.name.toLowerCase().includes(q) &&
            !attachment.contentType.toLowerCase().includes(q)
          ) {
            return;
          }
          found.push({
            matchedOcr,
            ocrSnippet: matchedOcr ? snippetFor(ocrText) : undefined,
            conversationId: m.conversation_id as string,
            messageId: m.id as string,
            createdAt: m.created_at as string,
            attachment,
          });
        });
      });

      setHits(found);
      setConversationIds([...new Set(found.map((h) => h.conversationId))]);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [active, kind, query]);

  return { hits, conversationIds, isLoading, isActive: active };
};
