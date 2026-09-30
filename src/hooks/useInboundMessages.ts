import { useCallback, useEffect, useState } from 'react';
import {
  getInboundEmail,
  listInboundEmails,
  type InboundEmail,
  type InboundEmailAttachment,
  type InboundEmailListParams,
} from '@/lib/inbound-email-api';

export interface UnifiedInboundEmailMessage {
  sourceType: 'inbound_email';
  sourceId: string;
  channel: 'email';

  id: string;
  sender: string | null;
  recipient: string | null;
  subject: string;
  body: string;
  htmlBody: string | null;

  receivedAt: string;

  processingStatus: string;
  forwardingStatus: string;

  attachments: InboundEmailAttachment[];

  original: InboundEmail;
}

interface InboundEmailListResponse {
  data?: {
    emails?: InboundEmail[];
    items?: InboundEmail[];
    total?: number;
    page?: number;
    pageSize?: number;
  };
  emails?: InboundEmail[];
  items?: InboundEmail[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: unknown;
}

interface InboundEmailDetailResponse {
  data?: InboundEmail;
  email?: InboundEmail;
  error?: unknown;
}

function unwrapList(response: InboundEmailListResponse): {
  emails: InboundEmail[];
  total: number;
  page: number;
  pageSize: number;
} {
  const payload = response?.data ?? response;

  return {
    emails: payload?.emails ?? payload?.items ?? [],
    total: payload?.total ?? 0,
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 25,
  };
}

function unwrapDetail(response: InboundEmailDetailResponse): InboundEmail | null {
  return response?.data ?? response?.email ?? null;
}

function normalizeInboundEmail(
  email: InboundEmail,
): UnifiedInboundEmailMessage {
  return {
    sourceType: 'inbound_email',
    sourceId: email.id,
    channel: 'email',

    id: email.id,
    sender: email.fromEmail,
    recipient: email.toEmail,
    subject: email.subject || '(No subject)',
    body: email.textBody || '',
    htmlBody: email.htmlBody,

    receivedAt: email.receivedAt,

    processingStatus: email.processingStatus,
    forwardingStatus: email.forwardingStatus,

    attachments: [],

    original: email,
  };
}

export function useInboundMessages(
  params: InboundEmailListParams = {},
) {
  const [messages, setMessages] = useState<UnifiedInboundEmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(params.page ?? 1);
  const [pageSize, setPageSize] = useState(params.pageSize ?? 25);

  const fetchMessages = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listInboundEmails(params);
      const result = unwrapList(response as InboundEmailListResponse);

      setMessages(result.emails.map(normalizeInboundEmail));
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err: any) {
      console.error('[useInboundMessages] Failed to load inbound email:', err);
      setMessages([]);
      setError(err?.message || 'Failed to load inbound messages');
    } finally {
      setIsLoading(false);
    }
  }, [
    params.page,
    params.pageSize,
    params.search,
    params.processingStatus,
    params.forwardingStatus,
  ]);

  const fetchMessage = useCallback(async (
    sourceId: string,
  ): Promise<UnifiedInboundEmailMessage | null> => {
    try {
      const response = await getInboundEmail(sourceId);
      const email = unwrapDetail(response as InboundEmailDetailResponse);

      if (!email) return null;

      const normalized = normalizeInboundEmail(email);

      normalized.attachments = email.attachments ?? [];

      return normalized;
    } catch (err) {
      console.error(
        '[useInboundMessages] Failed to load inbound email detail:',
        err,
      );
      return null;
    }
  }, []);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  return {
    messages,
    isLoading,
    error,
    total,
    page,
    pageSize,
    refresh: fetchMessages,
    fetchMessage,
  };
}
