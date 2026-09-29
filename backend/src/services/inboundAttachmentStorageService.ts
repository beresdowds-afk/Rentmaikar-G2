import crypto from "crypto";
import { supabaseBackendService } from "./supabaseService";

const STORAGE_BUCKET = "inbound-email-attachments";

const MAX_ATTACHMENT_BYTES =
  10 * 1024 * 1024;

function sanitizeFilename(
  filename: string,
): string {
  const cleaned = String(filename || "")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ");

  return cleaned || "unnamed-attachment";
}

function createStoragePath(
  inboundEmailId: string,
  filename: string,
): string {
  const safeFilename =
    sanitizeFilename(filename);

  const uniquePrefix =
    crypto.randomUUID();

  return `inbound/${inboundEmailId}/${uniquePrefix}-${safeFilename}`;
}

export interface StoreInboundAttachmentInput {
  inboundEmailId: string;
  filename: string;
  contentType?: string | null;
  size?: number | null;
  content: Buffer;
}

export interface StoreInboundAttachmentResult {
  ok: boolean;
  storageBucket: string;
  storagePath?: string;
  sizeBytes: number;
  error?: string;
}

export async function storeInboundAttachment(
  input: StoreInboundAttachmentInput,
): Promise<StoreInboundAttachmentResult> {
  const content = input.content;

  if (!Buffer.isBuffer(content)) {
    return {
      ok: false,
      storageBucket: STORAGE_BUCKET,
      sizeBytes: 0,
      error:
        "Inbound attachment content is not a Buffer",
    };
  }

  if (
    content.length >
    MAX_ATTACHMENT_BYTES
  ) {
    return {
      ok: false,
      storageBucket: STORAGE_BUCKET,
      sizeBytes: content.length,
      error:
        "Inbound attachment exceeds the 10 MB storage limit",
    };
  }

  const storagePath = createStoragePath(
    input.inboundEmailId,
    input.filename,
  );

  const supabase =
  supabaseBackendService.getAdminClient();

const { error } =
  await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(
      storagePath,
      content,
      {
        contentType:
          input.contentType ||
          "application/octet-stream",
        upsert: false,
      },
    );

  if (error) {
    return {
      ok: false,
      storageBucket: STORAGE_BUCKET,
      storagePath,
      sizeBytes: content.length,
      error: error.message,
    };
  }

  return {
    ok: true,
    storageBucket: STORAGE_BUCKET,
    storagePath,
    sizeBytes: content.length,
  };
}
