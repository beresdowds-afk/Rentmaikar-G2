import { backendBridge } from "@/lib/backend-bridge";

export interface InboundEmailListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  processingStatus?: string;
  forwardingStatus?: string;
}

export interface InboundEmailAttachment {
  id: string;
  inboundEmailId: string;
  resendEmailId: string;
  resendAttachmentId: string | null;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  storageStatus: string;
  storageProvider: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  downloadError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundEmail {
  id: string;
  resendEmailId: string;
  fromEmail: string | null;
  toEmail: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  messageId: string | null;
  headers?: unknown;
  receivedAt: string;
  processingStatus: string;
  forwardingStatus: string;
  forwardedAt: string | null;
  forwardError: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

export async function listInboundEmails(
  params: InboundEmailListParams = {},
) {
  return backendBridge.invokeEdgeFunction(
    "list-inbound-emails",
    params,
  );
}

export async function getInboundEmail(
  inboundEmailId: string,
) {
  return backendBridge.invokeEdgeFunction(
    "get-inbound-email",
    {
      inboundEmailId,
    },
  );
}

export async function getInboundAttachmentUrl(
  attachmentId: string,
) {
  return backendBridge.invokeEdgeFunction(
    "get-inbound-attachment-url",
    {
      attachmentId,
    },
  );
}

export async function retryInboundEmail(
  inboundEmailId: string,
) {
  return backendBridge.invokeEdgeFunction(
    "retry-inbound-email",
    {
      inboundEmailId,
    },
  );
}
