import crypto from "crypto";

const RESEND_API_BASE = "https://api.resend.com";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

export interface ResendReceivedAttachment {
  id?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  download_url?: string;
}

export interface ResendReceivedEmail {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html: string;
  messageId?: string;
  headers: Record<string, string>;
  attachments: Array<{
    id?: string;
    filename: string;
    contentType: string;
    size: number;
    downloadUrl?: string;
  }>;
}

function getResendApiKey(): string {
  const key = String(process.env.RESEND_API_KEY || "").trim();

  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  return key;
}

function resendHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getResendApiKey()}`,
    Accept: "application/json",
  };
}

function normalizeAddressList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};

  if (Array.isArray(value)) {
    for (const header of value) {
      if (!header?.name) continue;

      result[String(header.name).toLowerCase()] =
        String(header.value ?? "");
    }

    return result;
  }

  if (value && typeof value === "object") {
    for (const [name, headerValue] of Object.entries(value)) {
      result[name.toLowerCase()] = String(headerValue ?? "");
    }
  }

  return result;
}

async function resendGet(path: string): Promise<any> {
  const response = await fetch(`${RESEND_API_BASE}${path}`, {
    method: "GET",
    headers: resendHeaders(),
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `Resend Receiving API ${response.status}: ${detail}`,
    );
  }

  return response.json();
}

export async function fetchResendReceivedAttachment(
  emailId: string,
  attachmentId: string,
): Promise<Buffer> {
  const normalizedEmailId =
    String(emailId || "").trim();

  const normalizedAttachmentId =
    String(attachmentId || "").trim();

  if (!normalizedEmailId) {
    throw new Error(
      "Resend inbound email_id is required",
    );
  }

  if (!normalizedAttachmentId) {
    throw new Error(
      "Resend attachment_id is required",
    );
  }

  const response = await fetch(
    `${RESEND_API_BASE}/emails/receiving/${encodeURIComponent(
      normalizedEmailId,
    )}/attachments/${encodeURIComponent(
      normalizedAttachmentId,
    )}`,
    {
      method: "GET",
      headers: resendHeaders(),
    },
  );

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `Resend attachment retrieval failed: HTTP ${response.status}: ${detail}`,
    );
  }

  const buffer =
    Buffer.from(await response.arrayBuffer());

  if (
    buffer.length >
    MAX_ATTACHMENT_BYTES
  ) {
    throw new Error(
      `Resend attachment exceeds the ${MAX_ATTACHMENT_BYTES} byte limit`,
    );
  }

  return buffer;
}

/**
 * Retrieve the complete inbound email from Resend Receiving.
 *
 * The email.received webhook is treated as an event envelope.
 * payload.data.email_id is the authoritative identifier.
 */
export async function fetchResendReceivedEmail(
  emailId: string,
): Promise<ResendReceivedEmail> {
  const normalizedEmailId = String(emailId || "").trim();

  if (!normalizedEmailId) {
    throw new Error("Resend inbound email_id is required");
  }

  const email = await resendGet(
    `/emails/receiving/${encodeURIComponent(normalizedEmailId)}`,
  );

  let attachmentMetadata: ResendReceivedAttachment[] = Array.isArray(
    email?.attachments,
  )
    ? email.attachments
    : [];

  /*
   * Some Resend responses expose attachment metadata directly while
   * others require the attachments endpoint.
   */
  if (attachmentMetadata.length === 0) {
    try {
      const attachmentResponse = await resendGet(
        `/emails/receiving/${encodeURIComponent(
          normalizedEmailId,
        )}/attachments`,
      );

      if (Array.isArray(attachmentResponse?.data)) {
        attachmentMetadata = attachmentResponse.data;
      }
    } catch (error: any) {
      console.warn(
        "[ResendReceiving] Unable to list attachments:",
        error?.message || error,
      );
    }
  }

  const attachments: ResendReceivedEmail["attachments"] =
    attachmentMetadata
      .slice(0, MAX_ATTACHMENTS)
      .map((attachment) => ({
        id: attachment.id
          ? String(attachment.id)
          : undefined,

        filename:
          String(
            attachment.filename || "attachment",
          ),

        contentType:
          String(
            attachment.content_type ||
              "application/octet-stream",
          ),

        size:
          Number.isFinite(attachment.size)
            ? Number(attachment.size)
            : 0,

        downloadUrl:
          attachment.download_url
            ? String(attachment.download_url)
            : undefined,
      }));

  return {
    from: String(email?.from || ""),
    to: normalizeAddressList(email?.to),
    cc: normalizeAddressList(email?.cc),
    bcc: normalizeAddressList(email?.bcc),
    subject: String(email?.subject || "(no subject)"),
    text: String(email?.text || ""),
    html: String(email?.html || ""),
    messageId: email?.message_id
      ? String(email.message_id)
      : undefined,
    headers: normalizeHeaders(email?.headers),
    attachments,
  };
}

/**
 * Verify Resend/Svix webhook signatures against the exact raw request body.
 */
export function verifyResendWebhookSignature(
  rawBody: Buffer | string,
  headers: Record<
    string,
    string | string[] | undefined
  >,
): { ok: boolean; reason?: string } {
  const secret = String(
    process.env.RESEND_INBOUND_WEBHOOK_SECRET ||
      process.env.RESEND_WEBHOOK_SIGNING_SECRET ||
      process.env.RESEND_WEBHOOK_SECRET ||
      "",
  ).trim();

  if (!secret) {
    return {
      ok: false,
      reason:
        "Resend webhook signing secret is not configured",
    };
  }

  const webhookId = String(
    headers["svix-id"] ||
      headers["webhook-id"] ||
      "",
  ).trim();

  const timestamp = String(
    headers["svix-timestamp"] ||
      headers["webhook-timestamp"] ||
      "",
  ).trim();

  const signatureHeader = String(
    headers["svix-signature"] ||
      headers["webhook-signature"] ||
      "",
  ).trim();

  if (!webhookId) {
    return {
      ok: false,
      reason: "Missing Resend webhook id",
    };
  }

  if (!timestamp) {
    return {
      ok: false,
      reason: "Missing Resend webhook timestamp",
    };
  }

  if (!signatureHeader) {
    return {
      ok: false,
      reason: "Missing Resend webhook signature",
    };
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    return {
      ok: false,
      reason: "Invalid Resend webhook timestamp",
    };
  }

  /*
   * Five-minute replay protection.
   */
  if (
    Math.abs(
      Date.now() / 1000 - timestampSeconds,
    ) > 300
  ) {
    return {
      ok: false,
      reason:
        "Resend webhook timestamp outside five-minute replay window",
    };
  }

  /*
   * Resend/Svix signing secrets are normally whsec_<base64>.
   */
  const secretValue = secret.startsWith("whsec_")
   ? secret.slice("whsec_".length)
   : secret;

  let secretBytes: Buffer;

  if (!secretValue) {
  return {
    ok: false,
    reason: "Empty Resend webhook signing secret",
  };
}

try {
  secretBytes = Buffer.from(secretValue, "base64");
} catch {
  return {
    ok: false,
    reason: "Invalid Resend webhook signing secret encoding",
  };
}

if (secretBytes.length === 0) {
  return {
    ok: false,
    reason: "Empty Resend webhook signing secret",
  };
}

  const body = Buffer.isBuffer(rawBody)
    ? rawBody.toString("utf8")
    : rawBody;

  const signedPayload =
    `${webhookId}.${timestamp}.${body}`;

  const expectedSignature = crypto
    .createHmac("sha256", secretBytes)
    .update(signedPayload)
    .digest("base64");

  const candidates = signatureHeader
    .split(" ")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      /*
       * Svix signatures are normally formatted:
       * v1,<base64-signature>
       */
      const commaIndex = value.indexOf(",");

      return commaIndex >= 0
        ? value.slice(commaIndex + 1)
        : value;
    });

  const expectedBuffer = Buffer.from(
    expectedSignature,
    "base64",
  );

  const valid = candidates.some((candidate) => {
    try {
      const candidateBuffer = Buffer.from(
        candidate,
        "base64",
      );

      return (
        candidateBuffer.length ===
          expectedBuffer.length &&
        crypto.timingSafeEqual(
          candidateBuffer,
          expectedBuffer,
        )
      );
    } catch {
      return false;
    }
  });

  return valid
    ? { ok: true }
    : {
        ok: false,
        reason:
          "Resend webhook signature mismatch",
      };
}
