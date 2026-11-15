import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  resolveBusinessEmailSender,
  resolveBusinessReplyTo,
  validateApprovedBusinessSender,
} from "../emailSenderPolicy";
import {
  checkEmailProviderHealth,
  handleAuthEmailHook,
  rewriteSenderAddress,
  sendEmailViaResend,
} from "../emailService";
import { verifyStandardWebhookSignature } from "../resendReceivingService";

function signStandardWebhook(
  secret: string,
  webhookId: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  const b64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(b64, "base64");
  const sig = crypto
    .createHmac("sha256", key)
    .update(`${webhookId}.${timestampSeconds}.${rawBody}`)
    .digest("base64");
  return `v1,${sig}`;
}

describe("email architecture remediation & Resend exclusivity policy", () => {
  const originalFetch = globalThis.fetch;
  const savedEnv: Record<string, string | undefined> = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_SENDING_DOMAIN: process.env.RESEND_SENDING_DOMAIN,
    DEFAULT_BUSINESS_FROM: process.env.DEFAULT_BUSINESS_FROM,
    APPROVED_BUSINESS_SENDERS: process.env.APPROVED_BUSINESS_SENDERS,
    SENT_API_KEY: process.env.SENT_API_KEY,
    SUPABASE_DB_PASSWORD: process.env.SUPABASE_DB_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("enforces exact rentmaikar.com sender allowlist and reply-to constraint", () => {
    const env = {
      DEFAULT_BUSINESS_FROM: "support@rentmaikar.com",
      APPROVED_BUSINESS_SENDERS: "support@rentmaikar.com,security@rentmaikar.com",
    };

    assert.equal(resolveBusinessEmailSender("spoof@evil.com", env), "RentMaikar <support@rentmaikar.com>");
    assert.equal(resolveBusinessReplyTo("security@rentmaikar.com", env), "security@rentmaikar.com");
    assert.equal(resolveBusinessReplyTo("external@gmail.com", env), "support@rentmaikar.com");
    assert.throws(() => validateApprovedBusinessSender("support@sub.rentmaikar.com", ["support@rentmaikar.com"]));
  });

  it("enforces configured approved rentmaikar.com sender in rewriteSenderAddress and fails closed when unconfigured", () => {
    delete process.env.DEFAULT_BUSINESS_FROM;
    delete process.env.APPROVED_BUSINESS_SENDERS;
    assert.throws(() => rewriteSenderAddress("spoof@evil.com"), /DEFAULT_BUSINESS_FROM/);

    process.env.DEFAULT_BUSINESS_FROM = "security@rentmaikar.com";
    process.env.APPROVED_BUSINESS_SENDERS = "support@rentmaikar.com,security@rentmaikar.com";
    const rewritten = rewriteSenderAddress("Untrusted Caller <spoof@evil.com>");
    assert.equal(rewritten.from, "RentMaikar <security@rentmaikar.com>");
    assert.equal(rewritten.preservedReplyTo, undefined);
  });

  it("verifies Standard Webhooks signatures across multiple secrets and fails closed on invalid or stale requests", () => {
    const primary = `whsec_${Buffer.from("primary-signing-secret-bytes-12345").toString("base64")}`;
    const secondary = `whsec_${Buffer.from("secondary-signing-secret-bytes-999").toString("base64")}`;
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_1" } });
    const sig = signStandardWebhook(secondary, "msg_123", now, body);

    const valid = verifyStandardWebhookSignature(
      body,
      {
        "svix-id": "msg_123",
        "svix-timestamp": String(now),
        "svix-signature": sig,
      },
      [primary, secondary],
      "Resend",
    );
    assert.equal(valid.ok, true);

    const noSecrets = verifyStandardWebhookSignature(
      body,
      { "svix-id": "msg_123", "svix-timestamp": String(now), "svix-signature": sig },
      [],
      "AuthHook",
    );
    assert.equal(noSecrets.ok, false);

    const stale = verifyStandardWebhookSignature(
      body,
      {
        "svix-id": "msg_123",
        "svix-timestamp": String(now - 600),
        "svix-signature": signStandardWebhook(secondary, "msg_123", now - 600, body),
      },
      [secondary],
      "Resend",
    );
    assert.equal(stale.ok, false);

    const mismatch = verifyStandardWebhookSignature(
      body,
      {
        "svix-id": "msg_123",
        "svix-timestamp": String(now),
        "svix-signature": "v1,AAAA",
      },
      [primary],
      "Resend",
    );
    assert.equal(mismatch.ok, false);
  });

  it("fails closed without RESEND_API_KEY and never falls back to SENT.DM or SMTP", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SUPABASE_DB_PASSWORD;
    delete process.env.DATABASE_URL;
    process.env.SENT_API_KEY = "sent_should_never_be_called_for_email";

    const calledUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      calledUrls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const result = await sendEmailViaResend({
      to: "driver@example.com",
      subject: "Policy Check",
      html: "<p>Hello</p>",
    });

    assert.equal(result.ok, false);
    assert.match(result.error || "", /RESEND_API_KEY/i);
    assert.equal(calledUrls.some((u) => u.includes("sent.dm")), false);
    assert.equal(calledUrls.length, 0);
  });

  it("preserves Supabase token_hash, email_action_type, and redirect_to in handleAuthEmailHook and fails closed on Resend rejection", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    process.env.DEFAULT_BUSINESS_FROM = "security@rentmaikar.com";
    process.env.APPROVED_BUSINESS_SENDERS = "support@rentmaikar.com,security@rentmaikar.com";
    delete process.env.SUPABASE_DB_PASSWORD;
    delete process.env.DATABASE_URL;

    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      assert.equal(url, "https://api.resend.com/emails");
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({ id: "re_msg_auth_1" }), { status: 200 });
    }) as typeof fetch;

    const okResult = await handleAuthEmailHook({
      user: { email: "driver@example.com", user_metadata: { full_name: "Ada Lovelace" } },
      email_data: {
        token: "123456",
        token_hash: "tokhash_abc123",
        redirect_to: "https://rentmaikar.com/reset-password",
        email_action_type: "recovery",
      },
    });

    assert.equal(okResult.ok, true);
    assert.equal(okResult.messageId, "re_msg_auth_1");
    assert.equal(capturedBody.from, "RentMaikar <security@rentmaikar.com>");
    assert.match(String(capturedBody.html || ""), /tokhash_abc123/);
    assert.match(String(capturedBody.html || ""), /type=recovery/);
    assert.match(String(capturedBody.html || ""), /rentmaikar\.com%2Freset-password/);

    // Fail closed when Resend rejects
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Resend upstream error" }), { status: 502 })) as typeof fetch;

    const failResult = await handleAuthEmailHook({
      user: { email: "driver@example.com" },
      email_data: {
        token_hash: "tokhash_abc123",
        redirect_to: "https://rentmaikar.com/reset-password",
        email_action_type: "recovery",
      },
    });

    assert.equal(failResult.ok, false);
  });

  it("reports Resend-only provider health and never reports smtp fallback", async () => {
    delete process.env.RESEND_API_KEY;
    const report = await checkEmailProviderHealth();
    assert.equal(report.provider, "resend");
    assert.equal(report.status, "not_configured");
    assert.equal("smtpConfigured" in (report as unknown as Record<string, unknown>), false);
  });
});
