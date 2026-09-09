import { supabase } from '@/integrations/supabase/client';
import { InboxAttachment, attachmentOcrKey } from '@/lib/inbox-attachments';

export type AttachmentAccessAction = 'view' | 'preview' | 'download' | 'open_external' | 'ocr';

export interface AttachmentAccessLogRow {
  id: string;
  message_id: string | null;
  conversation_id: string | null;
  attachment_key: string;
  filename: string;
  content_type: string | null;
  action: AttachmentAccessAction;
  user_id: string;
  user_email: string | null;
  succeeded: boolean;
  error: string | null;
  created_at: string;
}

/**
 * Records that a staff member accessed an inbox attachment.
 * Fire-and-forget: never blocks or breaks the user action.
 */
export async function logAttachmentAccess(params: {
  attachment: InboxAttachment;
  action: AttachmentAccessAction;
  messageId?: string | null;
  conversationId?: string | null;
  succeeded?: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;

    await supabase.from('inbox_attachment_access_log').insert({
      message_id: params.messageId ?? null,
      conversation_id: params.conversationId ?? null,
      attachment_key: attachmentOcrKey(params.attachment),
      filename: params.attachment.name || 'attachment',
      content_type: params.attachment.contentType ?? null,
      action: params.action,
      user_id: user.id,
      user_email: user.email ?? null,
      succeeded: params.succeeded ?? true,
      error: params.error ?? null,
    });
  } catch (err) {
    console.warn('Attachment access log failed', err);
  }
}
