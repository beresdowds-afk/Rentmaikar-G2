import { supabaseBackendService } from "./supabaseService";
import { getDbPool } from "./dbPool";

const ALLOWED_ROLES = new Set([
  "admin",
  "admin_assistant",
]);

const ATTACHMENT_URL_EXPIRY_SECONDS = 300;

export interface InboundEmailListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  processingStatus?: string;
  forwardingStatus?: string;
}

export interface InboundEmailListItem {
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
  receivedAt: string;
  processingStatus: string;
  forwardingStatus: string;
  forwardedAt: string | null;
  forwardError: string | null;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
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

async function authenticateAdminCaller(
  authorizationHeader: string | undefined,
): Promise<{
  userId: string;
  role: string;
}> {
  const token = String(authorizationHeader || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    throw new Error("Authentication required");
  }

  const adminClient =
    supabaseBackendService.getAdminClient();

  const { data, error } =
    await adminClient.auth.getUser(token);

  if (error || !data?.user?.id) {
    throw new Error("Invalid authentication session");
  }

  const pool = getDbPool();

  const roleResult = await pool.query(
    `
      SELECT role
      FROM public.user_roles
      WHERE user_id = $1
      LIMIT 1
    `,
    [data.user.id],
  );

  const role = String(
    roleResult.rows[0]?.role || "",
  ).trim();

  if (!ALLOWED_ROLES.has(role)) {
    throw new Error(
      "Administrator privileges required",
    );
  }

  return {
    userId: data.user.id,
    role,
  };
}

export async function listInboundEmails(
  authorizationHeader: string | undefined,
  params: InboundEmailListParams = {},
) {
  await authenticateAdminCaller(
    authorizationHeader,
  );

  const pool = getDbPool();

  const page = Math.max(
    1,
    Number(params.page) || 1,
  );

  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number(params.pageSize) || 25,
    ),
  );

  const offset = (page - 1) * pageSize;

  const values: unknown[] = [];
  const conditions: string[] = [];

  if (params.processingStatus) {
    values.push(params.processingStatus);
    conditions.push(
      `e.processing_status = $${values.length}`,
    );
  }

  if (params.forwardingStatus) {
    values.push(params.forwardingStatus);
    conditions.push(
      `e.forwarding_status = $${values.length}`,
    );
  }

  const search = String(
    params.search || "",
  ).trim();

  if (search) {
    values.push(`%${search}%`);
    const index = values.length;

    conditions.push(`
      (
        e.from_email ILIKE $${index}
        OR e.to_email ILIKE $${index}
        OR e.subject ILIKE $${index}
        OR e.text_body ILIKE $${index}
        OR e.message_id ILIKE $${index}
      )
    `);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::integer AS count
      FROM public.inbound_emails e
      ${whereClause}
    `,
    values,
  );

  const count = Number(
    countResult.rows[0]?.count || 0,
  );

  values.push(pageSize);
  values.push(offset);

  const rowsResult = await pool.query(
    `
      SELECT
        e.id,
        e.resend_email_id,
        e.from_email,
        e.to_email,
        e.cc,
        e.bcc,
        e.subject,
        e.text_body,
        e.html_body,
        e.message_id,
        e.received_at,
        e.processing_status,
        e.forwarding_status,
        e.forwarded_at,
        e.forward_error,
        e.created_at,
        e.updated_at,
        COUNT(a.id)::integer AS attachment_count
      FROM public.inbound_emails e
      LEFT JOIN
        public.inbound_email_attachments a
        ON a.inbound_email_id = e.id
      ${whereClause}
      GROUP BY e.id
      ORDER BY e.received_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values,
  );

  return {
    success: true,
    page,
    pageSize,
    total: count,
    totalPages: Math.ceil(count / pageSize),
    items: rowsResult.rows.map(
      (row) => ({
        id: row.id,
        resendEmailId:
          row.resend_email_id,
        fromEmail:
          row.from_email,
        toEmail:
          row.to_email,
        cc: row.cc,
        bcc: row.bcc,
        subject:
          row.subject,
        textBody:
          row.text_body,
        htmlBody:
          row.html_body,
        messageId:
          row.message_id,
        receivedAt:
          row.received_at,
        processingStatus:
          row.processing_status,
        forwardingStatus:
          row.forwarding_status,
        forwardedAt:
          row.forwarded_at,
        forwardError:
          row.forward_error,
        attachmentCount:
          Number(row.attachment_count || 0),
        createdAt:
          row.created_at,
        updatedAt:
          row.updated_at,
      }),
    ),
  };
}

export async function getInboundEmail(
  authorizationHeader: string | undefined,
  inboundEmailId: string,
) {
  await authenticateAdminCaller(
    authorizationHeader,
  );

  const pool = getDbPool();

  const emailResult = await pool.query(
    `
      SELECT
        id,
        resend_email_id,
        from_email,
        to_email,
        cc,
        bcc,
        subject,
        text_body,
        html_body,
        message_id,
        headers,
        received_at,
        processing_status,
        forwarding_status,
        forwarded_at,
        forward_error,
        metadata,
        created_at,
        updated_at
      FROM public.inbound_emails
      WHERE id = $1
      LIMIT 1
    `,
    [inboundEmailId],
  );

  if (emailResult.rowCount === 0) {
    throw new Error(
      "Inbound email not found",
    );
  }

  const attachmentResult = await pool.query(
    `
      SELECT
        id,
        inbound_email_id,
        resend_email_id,
        resend_attachment_id,
        filename,
        content_type,
        size_bytes,
        storage_status,
        storage_provider,
        storage_bucket,
        storage_path,
        download_error,
        created_at,
        updated_at
      FROM public.inbound_email_attachments
      WHERE inbound_email_id = $1
      ORDER BY created_at ASC
    `,
    [inboundEmailId],
  );

  const row = emailResult.rows[0];

  return {
    success: true,
    email: {
      id: row.id,
      resendEmailId:
        row.resend_email_id,
      fromEmail:
        row.from_email,
      toEmail:
        row.to_email,
      cc: row.cc,
      bcc: row.bcc,
      subject:
        row.subject,
      textBody:
        row.text_body,
      htmlBody:
        row.html_body,
      messageId:
        row.message_id,
      headers:
        row.headers,
      receivedAt:
        row.received_at,
      processingStatus:
        row.processing_status,
      forwardingStatus:
        row.forwarding_status,
      forwardedAt:
        row.forwarded_at,
      forwardError:
        row.forward_error,
      metadata:
        row.metadata,
      createdAt:
        row.created_at,
      updatedAt:
        row.updated_at,
    },
    attachments:
      attachmentResult.rows.map(
        (attachment) => ({
          id: attachment.id,
          inboundEmailId:
            attachment.inbound_email_id,
          resendEmailId:
            attachment.resend_email_id,
          resendAttachmentId:
            attachment.resend_attachment_id,
          filename:
            attachment.filename,
          contentType:
            attachment.content_type,
          sizeBytes:
            attachment.size_bytes,
          storageStatus:
            attachment.storage_status,
          storageProvider:
            attachment.storage_provider,
          storageBucket:
            attachment.storage_bucket,
          storagePath:
            attachment.storage_path,
          downloadError:
            attachment.download_error,
          createdAt:
            attachment.created_at,
          updatedAt:
            attachment.updated_at,
        }),
      ),
  };
}

export async function getInboundAttachmentUrl(
  authorizationHeader: string | undefined,
  attachmentId: string,
) {
  await authenticateAdminCaller(
    authorizationHeader,
  );

  const pool = getDbPool();

  const result = await pool.query(
    `
      SELECT
        a.id,
        a.inbound_email_id,
        a.filename,
        a.content_type,
        a.size_bytes,
        a.storage_status,
        a.storage_bucket,
        a.storage_path
      FROM public.inbound_email_attachments a
      WHERE a.id = $1
      LIMIT 1
    `,
    [attachmentId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Inbound attachment not found",
    );
  }

  const attachment = result.rows[0];

  if (attachment.storage_status !== "stored") {
    throw new Error(
      "Attachment is not available in storage",
    );
  }

  if (
    !attachment.storage_bucket ||
    !attachment.storage_path
  ) {
    throw new Error(
      "Attachment storage location is missing",
    );
  }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Cloud Run service-role storage credential is not configured",
    );
  }

  const adminClient =
    supabaseBackendService.getAdminClient();

  const {
    data,
    error,
  } = await adminClient.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(
      attachment.storage_path,
      ATTACHMENT_URL_EXPIRY_SECONDS,
    );

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ||
        "Failed to create attachment access URL",
    );
  }

  return {
    success: true,
    attachmentId:
      attachment.id,
    inboundEmailId:
      attachment.inbound_email_id,
    filename:
      attachment.filename,
    contentType:
      attachment.content_type,
    sizeBytes:
      attachment.size_bytes,
    expiresIn:
      ATTACHMENT_URL_EXPIRY_SECONDS,
    url:
      data.signedUrl,
  };
}
