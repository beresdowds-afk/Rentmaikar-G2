/**
 * Resend native inbound email ("email.received" webhook events).
 *
 * Delegates fetching of full message + attachment payloads to the authoritative
 * `rentmaikar-backend` gateway so Resend credentials never leave Cloud Run.
 */

import { delegateToBackendEmail } from "./backend-email-client.ts";

export interface NormalisedInboundEmail {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  messageId?: string;
  headers: Record<string, string>;
  attachments: {
    filename: string;
    contentType: string;
    size: number;
    content: string; // base64
  }[];
  source: string;
}

/** True when the payload is a Resend native inbound event. */
export function isResendInboundEvent(payload: unknown): boolean {
  const p = payload as { type?: string; data?: { email_id?: string } } | null;
  return !!p && p.type === "email.received" && typeof p.data?.email_id === "string";
}

/**
 * Fetch and normalise a Resend inbound email via rentmaikar-backend.
 */
export async function fetchResendInboundEmail(emailId: string): Promise<NormalisedInboundEmail> {
  const delegation = await delegateToBackendEmail("fetch-resend-inbound-email", { emailId });
  if (!delegation.ok || !delegation.data?.email) {
    throw new Error(
      `Failed to fetch inbound email ${emailId} via rentmaikar-backend: ${String(
        delegation.data?.error || delegation.status,
      )}`,
    );
  }
  const email = delegation.data.email as NormalisedInboundEmail;
  return {
    ...email,
    source: email.source || "resend-inbound",
  };
}
