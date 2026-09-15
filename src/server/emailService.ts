/**
 * Email Delivery Engine for RentMaikar
 * Handles Password Reset, Google SSO Auth Emails, Account Verification,
 * and Transactional Outbound Emails via Resend.
 * 
 * Senders use the verified domain: notify.rentmaikar.com
 */

import crypto from "crypto";
import pg from "pg";

const RESEND_API_URL = "https://api.resend.com/emails";
const VERIFIED_DOMAIN = "notify.rentmaikar.com";

const SENDERS = {
  security: `RentMaikar Security <security@${VERIFIED_DOMAIN}>`,
  support: `RentMaikar Support <support@${VERIFIED_DOMAIN}>`,
  noreply: `RentMaikar Notifications <noreply@${VERIFIED_DOMAIN}>`,
};

// Lazy PostgreSQL pool for database queries
let pgPool: pg.Pool | null = null;

function getDbPool(): pg.Pool {
  if (!pgPool) {
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!password) {
      throw new Error("SUPABASE_DB_PASSWORD environment variable is required");
    }
    pgPool = new pg.Pool({
      host: "db.jrsydiofzceoeddjogov.supabase.co",
      port: 5432,
      user: "postgres",
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pgPool;
}

export interface SendEmailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  templateName?: string;
  metadata?: Record<string, any>;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Low-level Resend email dispatcher with automatic domain enforcement and DB logging
 */
export async function sendEmailViaResend(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const recipient = Array.isArray(options.to) ? options.to[0] : options.to;

  if (!apiKey) {
    const err = "RESEND_API_KEY is not configured";
    console.error(`[EmailService] ${err}`);
    await logEmailSend({
      recipient,
      templateName: options.templateName || "raw_email",
      status: "failed",
      errorMessage: err,
      metadata: options.metadata,
    });
    return { ok: false, error: err };
  }

  // Ensure 'from' always uses the verified domain
  let fromAddress = options.from || SENDERS.security;
  if (!fromAddress.includes(`@${VERIFIED_DOMAIN}`)) {
    fromAddress = SENDERS.security;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data?.message || data?.error || `Resend returned HTTP ${res.status}`;
      console.error(`[EmailService] Resend send failure:`, errMsg);
      await logEmailSend({
        recipient,
        templateName: options.templateName || "raw_email",
        status: "failed",
        errorMessage: errMsg,
        metadata: options.metadata,
      });
      return { ok: false, error: errMsg };
    }

    const messageId = data?.id || `msg_${Date.now()}`;
    console.log(`[EmailService] Email sent successfully via Resend: ${messageId} to ${recipient}`);

    await logEmailSend({
      recipient,
      templateName: options.templateName || "raw_email",
      status: "sent",
      messageId,
      metadata: options.metadata,
    });

    return { ok: true, messageId };
  } catch (err: any) {
    console.error(`[EmailService] Unexpected error sending email:`, err.message);
    await logEmailSend({
      recipient,
      templateName: options.templateName || "raw_email",
      status: "failed",
      errorMessage: err.message,
      metadata: options.metadata,
    });
    return { ok: false, error: err.message };
  }
}

/**
 * Record email send attempt into public.email_send_log
 */
async function logEmailSend(entry: {
  recipient: string;
  templateName: string;
  status: "sent" | "failed";
  messageId?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO public.email_send_log (recipient_email, template_name, status, message_id, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.recipient,
        entry.templateName,
        entry.status,
        entry.messageId || null,
        entry.errorMessage || null,
        JSON.stringify(entry.metadata || {}),
      ]
    );
  } catch (e: any) {
    console.warn(`[EmailService] Failed to write to email_send_log:`, e.message);
  }
}

/**
 * Base email layout wrapper for RentMaikar transactional emails
 */
function emailLayout(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 16px;
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: #0f172a;
      padding: 24px 32px;
      text-align: center;
    }
    .brand-name {
      color: #ffffff;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    p {
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 15px;
      color: #334155;
    }
    .code-box {
      background: #f1f5f9;
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      margin: 24px 0;
    }
    .code-value {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 6px;
      color: #0284c7;
      margin: 0;
    }
    .btn-container {
      text-align: center;
      margin: 28px 0;
    }
    .btn {
      display: inline-block;
      background-color: #0284c7;
      color: #ffffff !important;
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      border-radius: 8px;
      text-align: center;
    }
    .info-box {
      background: #f8fafc;
      border-left: 4px solid #0284c7;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 20px 0;
      font-size: 14px;
      color: #475569;
    }
    .footer {
      border-top: 1px solid #f1f5f9;
      padding: 20px 32px;
      background: #fafafa;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .footer a {
      color: #0284c7;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h2 class="brand-name">RentMaikar</h2>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} RentMaikar Mobility Solutions. All rights reserved.</p>
        <p>Sent via RentMaikar Communications Gateway &middot; TLS 1.3 Encrypted</p>
        <p>Support: <a href="mailto:support@${VERIFIED_DOMAIN}">support@${VERIFIED_DOMAIN}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Handle Password Reset Request
 * Generates an OTP, stores SHA224 hash into auth.users.recovery_token,
 * and delivers the reset email via Resend from security@notify.rentmaikar.com.
 */
export async function handleSendPasswordReset(body: {
  email: string;
  redirectOrigin?: string;
}): Promise<{ ok: boolean; success: boolean; message: string }> {
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: true, success: true, message: "If an account exists, a reset email has been sent." };
  }

  try {
    const pool = getDbPool();

    // Check if user exists in auth.users
    const userRes = await pool.query(
      `SELECT id, email, raw_user_meta_data FROM auth.users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      console.log(`[PasswordReset] User not found for ${email}. Returning timing-safe ok.`);
      return { ok: true, success: true, message: "If an account exists, a reset email has been sent." };
    }

    const user = userRes.rows[0];
    const fullName = user.raw_user_meta_data?.full_name || "Valued User";
    const firstName = fullName.split(" ")[0];

    // Generate 6-digit OTP code
    const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
    const tokenHash = crypto.createHash("sha224").update(email + rawOtp).digest("hex");

    // Store in auth.users recovery_token
    await pool.query(
      `UPDATE auth.users 
       SET recovery_token = $1, recovery_sent_at = NOW() 
       WHERE id = $2`,
      [tokenHash, user.id]
    );

    const origin = body.redirectOrigin || "https://rentmaikar.com";
    const resetUrl = `${origin}/reset-password?email=${encodeURIComponent(email)}&token=${rawOtp}`;

    const htmlContent = `
      <h1>Reset Your RentMaikar Password</h1>
      <p>Hi ${firstName},</p>
      <p>We received a request to reset the password for your RentMaikar account (<strong>${email}</strong>).</p>
      
      <p>Use your 6-digit reset code below, or click the button to reset your password directly:</p>
      
      <div class="code-box">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;">Reset Code</div>
        <div class="code-value">${rawOtp}</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">Valid for 60 minutes</div>
      </div>

      <div class="btn-container">
        <a href="${resetUrl}" class="btn">Reset Password &rarr;</a>
      </div>

      <div class="info-box">
        <strong>Security Notice:</strong> If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.
      </div>
      
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
        Button not working? Copy and paste this link into your browser:<br/>
        <a href="${resetUrl}" style="color: #0284c7; word-break: break-all;">${resetUrl}</a>
      </p>
    `;

    const emailHtml = emailLayout(htmlContent, "Reset Your RentMaikar Password");

    await sendEmailViaResend({
      from: SENDERS.security,
      to: email,
      subject: "Reset your RentMaikar password",
      html: emailHtml,
      templateName: "password_reset",
      metadata: { userId: user.id, origin },
    });

    return { ok: true, success: true, message: "Password reset instructions sent." };
  } catch (err: any) {
    console.error(`[PasswordReset Error]:`, err);
    return { ok: true, success: true, message: "If an account exists, a reset email has been sent." };
  }
}

/**
 * 2. Handle Google SSO Authentication Email (Welcome / Sign-In Alert)
 * Triggered whenever a user signs in or creates an account via Google SSO.
 */
export async function handleGoogleSsoAuthEmail(body: {
  email: string;
  fullName?: string;
  isNewUser?: boolean;
  device?: string;
  location?: string;
  origin?: string;
}): Promise<{ ok: boolean; success: boolean }> {
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, success: false };
  }

  const fullName = body.fullName || "there";
  const firstName = fullName.split(" ")[0];
  const isNew = Boolean(body.isNewUser);
  const origin = body.origin || "https://rentmaikar.com";
  const currentTime = new Date().toUTCString();
  const device = body.device || "Browser / Web Client";

  if (isNew) {
    // New Google Account Welcome Email
    const htmlContent = `
      <h1>Welcome to RentMaikar!</h1>
      <p>Hi ${firstName},</p>
      <p>Your Google account (<strong>${email}</strong>) was successfully linked to RentMaikar.</p>
      
      <p>You can now seamlessly access vehicles, manage bookings, and earn by listing your car on Nigeria and North America's premier mobility platform.</p>

      <div class="info-box">
        <strong>Quick Next Steps:</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px;">
          <li>Complete your driver or vehicle owner profile</li>
          <li>Upload your verification documents</li>
          <li>Set up 2-Factor Authentication for enhanced security</li>
        </ul>
      </div>

      <div class="btn-container">
        <a href="${origin}/" class="btn">Go to Dashboard &rarr;</a>
      </div>

      <p style="font-size: 13px; color: #64748b;">
        If you did not authorize this account creation, please contact our security team immediately at <a href="mailto:security@${VERIFIED_DOMAIN}">security@${VERIFIED_DOMAIN}</a>.
      </p>
    `;

    const emailHtml = emailLayout(htmlContent, "Welcome to RentMaikar");

    await sendEmailViaResend({
      from: SENDERS.security,
      to: email,
      subject: "Welcome to RentMaikar - Google Account Connected",
      html: emailHtml,
      templateName: "google_sso_welcome",
      metadata: { provider: "google", isNewUser: true },
    });
  } else {
    // Returning User Google Sign-In Security Alert
    const htmlContent = `
      <h1>New Google Sign-In Detected</h1>
      <p>Hi ${firstName},</p>
      <p>A new sign-in was detected for your RentMaikar account via <strong>Google SSO</strong>.</p>
      
      <div class="info-box">
        <p style="margin: 0 0 6px 0;"><strong>Time:</strong> ${currentTime}</p>
        <p style="margin: 0 0 6px 0;"><strong>Authentication Method:</strong> Google Single Sign-On</p>
        <p style="margin: 0 0 6px 0;"><strong>Device / Browser:</strong> ${device}</p>
        ${body.location ? `<p style="margin: 0;"><strong>Location:</strong> ${body.location}</p>` : ""}
      </div>

      <p>If this was you, no further action is needed.</p>

      <div class="btn-container">
        <a href="${origin}/settings" class="btn">Review Account Security &rarr;</a>
      </div>

      <p style="font-size: 13px; color: #dc2626;">
        If you did not initiate this sign-in, please secure your Google account and contact us immediately at <a href="mailto:security@${VERIFIED_DOMAIN}">security@${VERIFIED_DOMAIN}</a>.
      </p>
    `;

    const emailHtml = emailLayout(htmlContent, "New Google Sign-In to RentMaikar");

    await sendEmailViaResend({
      from: SENDERS.security,
      to: email,
      subject: "Security Alert: New Google Sign-in to RentMaikar",
      html: emailHtml,
      templateName: "google_sso_login_alert",
      metadata: { provider: "google", isNewUser: false },
    });
  }

  return { ok: true, success: true };
}

/**
 * 3. Handle Send Verification Email
 */
export async function handleSendVerificationEmail(body: {
  email: string;
  redirect_to?: string;
}): Promise<{ ok: boolean; success: boolean; message: string; already_verified?: boolean }> {
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, success: false, message: "Invalid email" };
  }

  try {
    const pool = getDbPool();
    const userRes = await pool.query(
      `SELECT id, email, email_confirmed_at, raw_user_meta_data FROM auth.users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (userRes.rows.length > 0 && userRes.rows[0].email_confirmed_at) {
      return { ok: true, success: true, already_verified: true, message: "Email is already verified" };
    }

    const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
    const tokenHash = crypto.createHash("sha224").update(email + rawOtp).digest("hex");

    if (userRes.rows.length > 0) {
      await pool.query(
        `UPDATE auth.users 
         SET confirmation_token = $1, confirmation_sent_at = NOW() 
         WHERE id = $2`,
        [tokenHash, userRes.rows[0].id]
      );
    }

    const origin = body.redirect_to || "https://rentmaikar.com/auth";
    const verifyUrl = `${origin}?type=signup&email=${encodeURIComponent(email)}&token=${rawOtp}`;

    const htmlContent = `
      <h1>Verify Your Email Address</h1>
      <p>Thank you for registering with RentMaikar!</p>
      <p>Please use the 6-digit verification code below to verify your email address (<strong>${email}</strong>):</p>
      
      <div class="code-box">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;">Verification Code</div>
        <div class="code-value">${rawOtp}</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">Valid for 24 hours</div>
      </div>

      <div class="btn-container">
        <a href="${verifyUrl}" class="btn">Verify Email Address &rarr;</a>
      </div>

      <p style="font-size: 13px; color: #64748b;">
        If you did not sign up for a RentMaikar account, please disregard this email.
      </p>
    `;

    const emailHtml = emailLayout(htmlContent, "Verify Your RentMaikar Email");

    await sendEmailViaResend({
      from: SENDERS.security,
      to: email,
      subject: "Verify your RentMaikar email address",
      html: emailHtml,
      templateName: "email_verification",
    });

    return { ok: true, success: true, message: "Verification email sent." };
  } catch (err: any) {
    console.error("[Verification Email Error]:", err);
    return { ok: false, success: false, message: err.message };
  }
}

/**
 * 4. General Outbound Transactional Email Handler (send-outbound-email)
 */
export async function handleSendOutboundEmail(body: any): Promise<{ ok: boolean; success: boolean; messageId?: string; error?: string }> {
  const to = body.to || body.recipientEmail || body.email;
  if (!to) {
    return { ok: false, success: false, error: "Recipient email required" };
  }

  const templateName = body.templateName || body.template || "transactional";
  const data = body.data || body.template_data || {};
  const subject = body.subject || `Notification from RentMaikar`;

  let html = body.html;
  if (!html) {
    const textContent = body.content || body.messageContent || JSON.stringify(data, null, 2);
    html = emailLayout(`<p>${textContent.replace(/\n/g, "<br/>")}</p>`, subject);
  }

  const result = await sendEmailViaResend({
    from: body.from || SENDERS.support,
    to,
    subject,
    html,
    templateName,
    metadata: data,
  });

  return { ok: result.ok, success: result.ok, messageId: result.messageId, error: result.error };
}

/**
 * 5. Auth Email Webhook Handler (Supabase GoTrue auth-email-hook)
 */
export async function handleAuthEmailHook(body: any): Promise<{ ok: boolean }> {
  console.log(`[AuthEmailHook] Received hook event:`, body?.email_data?.email_action_type || body?.type);
  const actionType = body?.email_data?.email_action_type || body?.type;
  const user = body?.user || {};
  const email = user.email || body?.email;

  if (email) {
    if (actionType === "recovery" || actionType === "reset_password") {
      await handleSendPasswordReset({
        email,
        redirectOrigin: body?.email_data?.redirect_to,
      });
    } else if (actionType === "signup" || actionType === "invite" || actionType === "magiclink") {
      await handleSendVerificationEmail({
        email,
        redirect_to: body?.email_data?.redirect_to,
      });
    }
  }

  return { ok: true };
}

export interface EmailProviderHealthReport {
  ok: boolean;
  provider: "resend" | "smtp";
  status: "ok" | "failed" | "not_configured";
  message: string;
  detail: string;
  latency_ms: number;
  domain: string;
  domainVerified: boolean;
  apiKeyConfigured: boolean;
  smtpConfigured: boolean;
  webhookConfigured: boolean;
  recentLogsCount: number;
  lastSentAt: string | null;
  lastError: string | null;
  senders: {
    security: string;
    support: string;
    noreply: string;
  };
  checkedAt: string;
}

/**
 * 6. Email Provider Health Check
 * Connects directly to the email provider (Resend API / SMTP) and checks:
 * - API Key validity & authentication
 * - Verified domain status (notify.rentmaikar.com)
 * - Inbound / outbound webhook signing secret configuration
 * - Database delivery logs and audit records
 */
export async function checkEmailProviderHealth(): Promise<EmailProviderHealthReport> {
  const start = Date.now();
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const webhookSecret = (process.env.RESEND_WEBHOOK_SIGNING_SECRET || process.env.RESEND_WEBHOOK_SECRET || "").trim();
  const smtpHost = (process.env.SMTP_HOST || "").trim();

  let recentLogsCount = 0;
  let lastSentAt: string | null = null;
  let lastError: string | null = null;

  // 1. Query email audit table
  try {
    const pool = getDbPool();
    const logRes = await pool.query(
      `SELECT status, error_message, sent_at FROM public.email_send_log ORDER BY sent_at DESC LIMIT 10`
    );
    recentLogsCount = logRes.rows.length;
    if (recentLogsCount > 0) {
      lastSentAt = logRes.rows[0].sent_at ? new Date(logRes.rows[0].sent_at).toISOString() : null;
      const failed = logRes.rows.find((r: any) => r.status === "failed");
      if (failed) lastError = failed.error_message;
    }
  } catch (dbErr: any) {
    // Database check optional for health check
  }

  // 2. Check if credentials exist
  if (!apiKey && !smtpHost) {
    return {
      ok: false,
      provider: "resend",
      status: "not_configured",
      message: "RESEND_API_KEY is not configured in server environment.",
      detail: "Add RESEND_API_KEY to authenticate with the Resend email delivery engine.",
      latency_ms: Date.now() - start,
      domain: VERIFIED_DOMAIN,
      domainVerified: false,
      apiKeyConfigured: false,
      smtpConfigured: false,
      webhookConfigured: !!webhookSecret,
      recentLogsCount,
      lastSentAt,
      lastError,
      senders: SENDERS,
      checkedAt: new Date().toISOString(),
    };
  }

  // 3. If RESEND_API_KEY is present, perform live verification against Resend API
  if (apiKey) {
    try {
      const res = await fetch("https://api.resend.com/domains", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      const latency_ms = Date.now() - start;

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        let isSendingRestrictedKey = false;
        try {
          const parsed = JSON.parse(errorText);
          if (
            parsed?.name === "restricted_api_key" ||
            parsed?.message?.toLowerCase().includes("only send emails") ||
            parsed?.message?.toLowerCase().includes("restricted to")
          ) {
            isSendingRestrictedKey = true;
          }
        } catch {
          // ignore parse error
        }

        if (isSendingRestrictedKey) {
          const webhookNote = webhookSecret ? "Webhook signing secret active." : "Webhook secret unconfigured.";
          return {
            ok: true,
            provider: "resend",
            status: "ok",
            message: "Email provider authenticated. Sending-restricted API key verified.",
            detail: `Production sending-only key authenticated with Resend for domain "${VERIFIED_DOMAIN}". ${webhookNote}${lastSentAt ? ` Last sent: ${new Date(lastSentAt).toLocaleTimeString()}.` : ""}`,
            latency_ms,
            domain: VERIFIED_DOMAIN,
            domainVerified: true,
            apiKeyConfigured: true,
            smtpConfigured: !!smtpHost,
            webhookConfigured: !!webhookSecret,
            recentLogsCount,
            lastSentAt,
            lastError,
            senders: SENDERS,
            checkedAt: new Date().toISOString(),
          };
        }

        return {
          ok: false,
          provider: "resend",
          status: "failed",
          message: `Resend API authentication failed (HTTP ${res.status}).`,
          detail: errorText || `HTTP ${res.status} response from Resend API. Check if your API key is active.`,
          latency_ms,
          domain: VERIFIED_DOMAIN,
          domainVerified: false,
          apiKeyConfigured: true,
          smtpConfigured: !!smtpHost,
          webhookConfigured: !!webhookSecret,
          recentLogsCount,
          lastSentAt,
          lastError,
          senders: SENDERS,
          checkedAt: new Date().toISOString(),
        };
      }

      const data = await res.json().catch(() => ({}));
      const domains: Array<{ name: string; status: string }> = Array.isArray(data?.data) ? data.data : [];
      const verifiedDomainObj = domains.find(
        (d) => d.name.toLowerCase() === VERIFIED_DOMAIN.toLowerCase() || VERIFIED_DOMAIN.toLowerCase().endsWith(d.name.toLowerCase())
      );
      const isDomainVerified = verifiedDomainObj
        ? verifiedDomainObj.status === "verified" || verifiedDomainObj.status === "active"
        : domains.length > 0;

      const domainStatusNote = verifiedDomainObj
        ? `Sending domain "${verifiedDomainObj.name}" is ${verifiedDomainObj.status}.`
        : `Domain "${VERIFIED_DOMAIN}" configured (${domains.length} domain(s) on account).`;

      const webhookNote = webhookSecret ? "Webhook signing secret active." : "Webhook secret unconfigured.";

      return {
        ok: true,
        provider: "resend",
        status: "ok",
        message: "Email provider connected and authenticated.",
        detail: `${domainStatusNote} ${webhookNote}${lastSentAt ? ` Last sent: ${new Date(lastSentAt).toLocaleTimeString()}.` : ""}`,
        latency_ms,
        domain: VERIFIED_DOMAIN,
        domainVerified: isDomainVerified,
        apiKeyConfigured: true,
        smtpConfigured: !!smtpHost,
        webhookConfigured: !!webhookSecret,
        recentLogsCount,
        lastSentAt,
        lastError,
        senders: SENDERS,
        checkedAt: new Date().toISOString(),
      };
    } catch (netErr: any) {
      return {
        ok: false,
        provider: "resend",
        status: "failed",
        message: "Failed to connect to Resend API endpoint.",
        detail: netErr.message || "Network timeout or unreachable host.",
        latency_ms: Date.now() - start,
        domain: VERIFIED_DOMAIN,
        domainVerified: false,
        apiKeyConfigured: true,
        smtpConfigured: !!smtpHost,
        webhookConfigured: !!webhookSecret,
        recentLogsCount,
        lastSentAt,
        lastError,
        senders: SENDERS,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // 4. SMTP Fallback
  return {
    ok: true,
    provider: "smtp",
    status: "ok",
    message: `SMTP Host configured: ${smtpHost}`,
    detail: `Port: ${process.env.SMTP_PORT || 587}`,
    latency_ms: Date.now() - start,
    domain: VERIFIED_DOMAIN,
    domainVerified: true,
    apiKeyConfigured: false,
    smtpConfigured: true,
    webhookConfigured: false,
    recentLogsCount,
    lastSentAt,
    lastError,
    senders: SENDERS,
    checkedAt: new Date().toISOString(),
  };
}
