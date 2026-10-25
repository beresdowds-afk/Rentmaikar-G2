// Integration tests for the shared Resend transport: verified-domain sender
// rewrite, reply-to preservation, endpoint/header selection, and the 401/403
// alert path. Network is stubbed so the tests never send real mail.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isDirectResendKey,
  resendEmailsUrl,
  resendFrom,
  resendHeaders,
  resendSendEmail,
} from "./resend-gateway.ts";
import { resolveBusinessReplyTo, validateApprovedBusinessSender } from "./email-sender-policy.ts";

Deno.env.set("RESEND_SENDING_DOMAIN", "notify.rentmaikar.com");
Deno.env.set("DEFAULT_BUSINESS_FROM", "support@rentmaikar.com");
Deno.env.set("APPROVED_BUSINESS_SENDERS", "support@rentmaikar.com,custom-replies@rentmaikar.com");

Deno.test("uses one configured exact-domain sender and ignores caller sender values", () => {
  assertEquals(resendFrom("Rentmaikar <arbitrary@attacker.example>"), "RentMaikar <support@rentmaikar.com>");
});

Deno.test("sender allowlist rejects subdomains and lookalike domains", () => {
  const approved = ["support@rentmaikar.com"];
  assertEquals(validateApprovedBusinessSender("support@RENTMAIKAR.COM", approved), "support@rentmaikar.com");
  for (const rejected of [
    "support@notify.rentmaikar.com",
    "support@backend.rentmaikar.com",
    "support@staging.rentmaikar.com",
    "support@rentmaikar.com.attacker.example",
    "support@otherdomain.example",
    "unapproved@rentmaikar.com",
  ]) {
    let rejectedSender = false;
    try {
      validateApprovedBusinessSender(rejected, approved);
    } catch {
      rejectedSender = true;
    }
    assert(rejectedSender, `expected sender to be rejected: ${rejected}`);
  }
});

Deno.test("unapproved Reply-To is constrained to the configured sender", () => {
  assertEquals(resolveBusinessReplyTo("custom-replies@rentmaikar.com"), "custom-replies@rentmaikar.com");
  assertEquals(resolveBusinessReplyTo("person@example.com"), "support@rentmaikar.com");
});

Deno.test("establishes and maintains the Direct Resend connector", () => {
  assertEquals(isDirectResendKey("re_abc123"), true);
  assertEquals(resendEmailsUrl("re_abc123"), "https://api.resend.com/emails");
  assertEquals(resendEmailsUrl("re_prod_999"), "https://api.resend.com/emails");

  const headers = resendHeaders("re_abc123");
  assertEquals(headers.Authorization, "Bearer re_abc123");
  assertEquals(headers["Content-Type"], "application/json");
  assertEquals("X-Connection-Api-Key" in headers, false);
});

Deno.test("send uses the configured sender and does not derive reply_to from caller From", async () => {
  const original = globalThis.fetch;
  let captured: Record<string, unknown> = {};
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await resendSendEmail({
      from: "Rentmaikar <noreply@rentmaikar.com>",
      to: ["driver@example.com"],
      subject: "Booking confirmed",
      html: "<p>hi</p>",
    }, "re_test");
    assertEquals(res.status, 200);
    await res.text();
  } finally {
    globalThis.fetch = original;
  }

  assertEquals(captured.from, "RentMaikar <support@rentmaikar.com>");
  assertEquals("reply_to" in captured, false);
  assertEquals(captured.subject, "Booking confirmed");
});

Deno.test("rejects malformed recipients and caller-supplied CC/BCC before sending", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response("unexpected send", { status: 200 }));
  }) as typeof fetch;

  try {
    for (const overrides of [
      { to: ["not-an-email"] },
      { to: ["driver@example.com"], cc: ["copy@example.com"] },
      { to: ["driver@example.com"], bcc: ["copy@example.com"] },
    ]) {
      const response = await resendSendEmail({
        from: "support@rentmaikar.com",
        to: ["driver@example.com"],
        subject: "Test",
        html: "<p>x</p>",
        ...overrides,
      }, "re_test");
      assertEquals(response.status, 400);
    }
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(called, false);
});

Deno.test("missing sender configuration fails closed without contacting Resend", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response("should not send", { status: 200 }));
  }) as typeof fetch;
  Deno.env.delete("DEFAULT_BUSINESS_FROM");
  try {
    const response = await resendSendEmail({
      from: "support@notify.rentmaikar.com",
      to: ["driver@example.com"],
      subject: "Test",
      html: "<p>x</p>",
    }, "re_test");
    assertEquals(response.status, 503);
    assertEquals(called, false);
  } finally {
    Deno.env.set("DEFAULT_BUSINESS_FROM", "support@rentmaikar.com");
    globalThis.fetch = original;
  }
});

Deno.test("a 401 raises a provider alert and still returns the response", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("/emails")) {
      return Promise.resolve(new Response("API key is invalid", { status: 401 }));
    }
    return Promise.resolve(new Response("[]", { status: 200 }));
  }) as typeof fetch;

  Deno.env.set("SUPABASE_URL", "https://example.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

  try {
    const res = await resendSendEmail({
      from: "noreply@rentmaikar.com",
      to: ["driver@example.com"],
      subject: "Test",
      html: "<p>x</p>",
    }, "re_bad");
    assertEquals(res.status, 401);
    assertEquals(await res.text(), '{"error":"Resend delivery failed"}');
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }

  assert(
    calls.some((c) => c.includes("/rest/v1/email_provider_alerts")),
    "expected an email_provider_alerts insert",
  );
});

Deno.test("does not fall back to a second email provider when Resend fails", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: href, body });
    if (href.includes("/emails")) {
      return Promise.resolve(new Response("Resend error", { status: 500 }));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;

  Deno.env.set("SENT_API_KEY", "test_sent_key");
  Deno.env.set("SENT_ENABLED", "true");

  try {
    const res = await resendSendEmail({
      from: "Rentmaikar <noreply@rentmaikar.com>",
      to: ["driver@example.com"],
      subject: "Test Fallback",
      html: "<p>fallback body</p>",
    }, "re_test");

    assertEquals(res.status, 500);
    assertEquals(calls.some((c) => c.url.includes("api.sent.dm/v3/messages")), false);
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("SENT_API_KEY");
    Deno.env.delete("SENT_ENABLED");
  }
});
