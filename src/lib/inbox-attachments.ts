import { supabase } from '@/integrations/supabase/client';

export interface InboxAttachment {
  id: string;
  name: string;
  contentType: string;
  bucket: string | null;
  path: string | null;
  /** Fallback direct URL (provider-hosted or public bucket). */
  url: string | null;
  size: number | null;
  status: 'accepted' | 'rejected';
  reason?: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const isImageAttachment = (a: InboxAttachment) =>
  a.contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.name);

export type AttachmentKind = 'image' | 'pdf' | 'document' | 'spreadsheet' | 'audio' | 'video' | 'archive' | 'other';

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  image: 'Images',
  pdf: 'PDFs',
  document: 'Documents',
  spreadsheet: 'Spreadsheets',
  audio: 'Audio',
  video: 'Video',
  archive: 'Archives',
  other: 'Other files',
};

/** Classifies an attachment by content type, falling back to its extension. */
export const attachmentKind = (a: InboxAttachment): AttachmentKind => {
  const type = (a.contentType || '').toLowerCase();
  const name = (a.name || '').toLowerCase();

  if (isImageAttachment(a)) return 'image';
  if (type === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
  if (type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|amr)$/.test(name)) return 'audio';
  if (type.startsWith('video/') || /\.(mp4|mov|webm|avi|3gp)$/.test(name)) return 'video';
  if (/\.(csv|xlsx?|ods)$/.test(name) || type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv')
    return 'spreadsheet';
  if (/\.(docx?|rtf|odt|txt|pages)$/.test(name) || type.includes('word') || type.startsWith('text/'))
    return 'document';
  if (/\.(zip|rar|7z|tar|gz)$/.test(name) || type.includes('zip') || type.includes('compressed'))
    return 'archive';
  return 'other';
};


export const formatFileSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Splits "bucket/path/to/file" or a storage URL into bucket + object path. */
const splitStorageRef = (ref: string): { bucket: string | null; path: string | null } => {
  const match = ref.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) };
  if (/^https?:\/\//i.test(ref)) return { bucket: null, path: null };
  const [bucket, ...rest] = ref.split('/');
  return rest.length ? { bucket, path: rest.join('/') } : { bucket: null, path: null };
};

const fileNameFrom = (value: string) => {
  const clean = value.split('?')[0];
  return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1)) || 'attachment';
};

/** Normalises the varied webhook metadata shapes into a single attachment list. */
export const parseMessageAttachments = (metadata: unknown): InboxAttachment[] => {
  if (!metadata || typeof metadata !== 'object') return [];
  const meta = metadata as Record<string, unknown>;
  const out: InboxAttachment[] = [];
  const seen = new Set<string>();

  const push = (a: InboxAttachment) => {
    const key = a.path || a.url || a.name;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };

  // Email webhook: attachments_detail[]
  const detail = meta.attachments_detail;
  if (Array.isArray(detail)) {
    detail.forEach((raw, i) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      const url = typeof d.url === 'string' ? d.url : null;
      const { bucket, path } = url ? splitStorageRef(url) : { bucket: null, path: null };
      push({
        id: `detail-${i}`,
        name: typeof d.filename === 'string' ? d.filename : url ? fileNameFrom(url) : 'attachment',
        contentType: typeof d.contentType === 'string' ? d.contentType : 'application/octet-stream',
        bucket,
        path,
        url,
        size: typeof d.size === 'number' ? d.size : null,
        status: d.status === 'rejected' ? 'rejected' : 'accepted',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
      });
    });
  }

  // Email webhook fallback: attachment_urls[]
  if (Array.isArray(meta.attachment_urls)) {
    meta.attachment_urls.forEach((raw, i) => {
      if (typeof raw !== 'string') return;
      const { bucket, path } = splitStorageRef(raw);
      push({
        id: `url-${i}`,
        name: fileNameFrom(raw),
        contentType: 'application/octet-stream',
        bucket,
        path,
        url: raw,
        size: null,
        status: 'accepted',
      });
    });
  }

  // SMS / WhatsApp webhooks: storage_path + media_url
  const storagePath = typeof meta.storage_path === 'string' ? meta.storage_path : null;
  const mediaUrl = typeof meta.media_url === 'string' ? meta.media_url : null;
  if (storagePath || mediaUrl) {
    const ref = storagePath || mediaUrl!;
    const { bucket, path } = splitStorageRef(ref);
    push({
      id: 'media-0',
      name: fileNameFrom(path || mediaUrl || 'attachment'),
      contentType:
        typeof meta.media_content_type === 'string'
          ? meta.media_content_type
          : 'application/octet-stream',
      bucket,
      path,
      url: mediaUrl,
      size: null,
      status: 'accepted',
    });
  }

  return out;
};

/** Returns a viewable URL, signing private storage objects on demand. */
export const resolveAttachmentUrl = async (
  attachment: InboxAttachment,
): Promise<{ url: string | null; error?: string }> => {
  if (attachment.bucket && attachment.path) {
    const { data, error } = await supabase.storage
      .from(attachment.bucket)
      .createSignedUrl(attachment.path, SIGNED_URL_TTL_SECONDS);
    if (data?.signedUrl) return { url: data.signedUrl };
    if (!attachment.url) return { url: null, error: error?.message || 'Could not open attachment' };
  }
  return attachment.url
    ? { url: attachment.url }
    : { url: null, error: 'Attachment location unavailable' };
};

/* ────────────────────────────────────────────────────────────────
 * Outbound (composer) attachments
 * ──────────────────────────────────────────────────────────────── */

export const OUTBOUND_BUCKET = 'chat-attachments';
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_EXTENSIONS = /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|csv|txt)$/i;

export interface OutboundAttachment {
  filename: string;
  contentType: string;
  size: number;
  /** "bucket/path" reference for storage. */
  storagePath: string;
  /** Signed URL (7 days) so providers can fetch the file. */
  url: string;
  status: 'accepted';
}

export const validateAttachmentFile = (file: File): string | null => {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than 10MB`;
  if (!ALLOWED_EXTENSIONS.test(file.name)) return `${file.name} has an unsupported file type`;
  return null;
};

/** Uploads composer files to private storage and returns signed references. */
export const uploadInboxAttachments = async (
  files: File[],
  userId: string,
  conversationId: string,
): Promise<{ attachments: OutboundAttachment[]; errors: string[] }> => {
  const attachments: OutboundAttachment[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const invalid = validateAttachmentFile(file);
    if (invalid) {
      errors.push(invalid);
      continue;
    }
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${userId}/outbound/${conversationId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(OUTBOUND_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

    if (uploadError) {
      errors.push(`${file.name}: ${uploadError.message}`);
      continue;
    }

    const { data: signed } = await supabase.storage
      .from(OUTBOUND_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    attachments.push({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      storagePath: `${OUTBOUND_BUCKET}/${path}`,
      url: signed?.signedUrl || '',
      status: 'accepted',
    });
  }

  return { attachments, errors };
};

/** Stable key used to store/lookup OCR text for an attachment. */
export const attachmentOcrKey = (a: InboxAttachment): string => a.path || a.url || a.name;

/** OCR is supported for images and PDFs only. */
export const supportsOcr = (a: InboxAttachment): boolean =>
  isImageAttachment(a) || attachmentKind(a) === 'pdf';
