import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InboxAttachment } from '@/lib/inbox-attachments';
import { attachmentOcrKey, supportsOcr } from '@/lib/inbox-attachments';

export interface AttachmentOcrRecord {
  attachment_key: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  extracted_text: string | null;
  char_count: number;
  error: string | null;
  processed_at: string | null;
}

/** Loads and triggers OCR text extraction for a message's attachments. */
export const useAttachmentOcr = (messageId: string | null, conversationId?: string | null) => {
  const [records, setRecords] = useState<Record<string, AttachmentOcrRecord>>({});
  const [isRunning, setIsRunning] = useState(false);

  const load = useCallback(async () => {
    if (!messageId) return;
    const { data, error } = await supabase
      .from('inbox_attachment_ocr')
      .select('attachment_key, filename, status, extracted_text, char_count, error, processed_at')
      .eq('message_id', messageId);
    if (error) return;
    const map: Record<string, AttachmentOcrRecord> = {};
    (data || []).forEach((row) => {
      map[row.attachment_key as string] = row as AttachmentOcrRecord;
    });
    setRecords(map);
  }, [messageId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (attachments: InboxAttachment[], force = false) => {
      if (!messageId) return { error: 'Missing message' };
      const eligible = attachments.filter(supportsOcr);
      if (eligible.length === 0) return { error: 'No image or PDF attachments to scan' };

      setIsRunning(true);
      const { data, error } = await supabase.functions.invoke('inbox-attachment-ocr', {
        body: {
          messageId,
          conversationId: conversationId ?? null,
          force,
          attachments: eligible.map((a) => ({
            key: attachmentOcrKey(a),
            name: a.name,
            contentType: a.contentType,
            bucket: a.bucket,
            path: a.path,
            url: a.url,
          })),
        },
      });
      setIsRunning(false);

      if (error) return { error: error.message };
      await load();
      const failed = (data?.results || []).find((r: { status: string }) => r.status === 'failed');
      return failed ? { error: failed.error as string } : {};
    },
    [messageId, conversationId, load],
  );

  return { records, isRunning, run, reload: load };
};
