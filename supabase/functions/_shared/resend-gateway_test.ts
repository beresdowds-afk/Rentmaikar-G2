// Integration tests for the centralized Resend transport:
// verified-domain sender rewrite, reply-to preservation, delegation to
// rentmaikar-backend, and fail-closed enforcement (no SENT.DM email fallback).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isDirectResendKey,
  resendEmailsUrl,
  resendFrom,
  resendHeaders,
  resendSendEmail,
} from "./resend-gateway.ts";

Deno.env.set("RESEND_SENDING_DOMAIN", "notify.rentmaikar.com");
Deno.env.delete("RESEND_FALLBACK_FROM");

Deno.test("rewrites unverified senders onto the verified domain", () => {
  assertEquals(
    resendFrom("Rentmaikar <noreply@rentmaikar.com>"),
    "Rentmaikar <noreply@notify.rentmaikar.com>",
  );
  assertEquals(resendFrom("support@mail.rentmaikar.com"), "support@notify.rentmaikar.com");
});

Deno.test("leaves already-verified senders untouched", () => {
  const from = "Rentmaikar <noreply@notify.rentmaikar.com>";
  assertEquals(resendFrom(from), from);
});

Deno.test("exposes direct Resend endpoint metadata helpers", () => {
  assertEquals(isDirectResendKey("re_abc123"), true);
  assertEquals(resendEmailsUrl("re_abc123"), "https://api.resend.com/emails");

  const headers = resendHeaders("re_abc123");
  assertEquals(headers.Authorization, "Bearer re_abc123");
  assertEquals(headers["Content-Type"], "application/json");
});

Deno.test("delegates send through rentmaikar-backend with sender rewrite and reply_to", async () => {
  const original = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: HeadersInit | undefined;
  let captured: Record<string, unknown> = {};
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedHeaders = init?.headers;
    captured = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({ ok: true, messageId: "msg_1" }), { status: 200 }));
  }) as typeof fetch;

  Deno.env.set("RENTMAIKAR_BACKEND_URL", "https://staging.rentmaikar.com");
  Deno.env.set("RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET", "bridge-secret-test");

  try {
    const res = await resendSendEmail({
      from: "Rentmaikar <noreply@rentmaikar.com>",
      to: ["driver@example.com"],
      subject: "Booking confirmed",
      html: "<p>hi</p>",
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.messageId, "msg_1");
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("RENTMAIKAR_BACKEND_URL");
    Deno.env.delete("RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET");
  }

  assertEquals(capturedUrl, "https://staging.rentmaikar.com/api/functions/send-outbound-email");
  assertEquals((capturedHeaders as Record<string, string>)["x-rentmaikar-internal-secret"], "bridge-secret-test");
  assertEquals(captured.from, "Rentmaikar <noreply@notify.rentmaikar.com>");
  assertEquals(captured.reply_to, "Rentmaikar <noreply@rentmaikar.com>");
  assertEquals(captured.subject, "Booking confirmed");
});

Deno.test("fails closed when backend fails and never falls back to SENT.DM", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    return Promise.resolve(new Response(JSON.stringify({ ok: false, error: "Resend error" }), { status: 502 }));
  }) as typeof fetch;

  Deno.env.set("RENTMAIKAR_BACKEND_URL", "https://staging.rentmaikar.com");
  Deno.env.set("RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET", "bridge-secret-test");
  Deno.env.set("SENT_API_KEY", "test_sent_key");
  Deno.env.set("SENT_ENABLED", "true");

  try {
    const res = await resendSendEmail({
      from: "Rentmaikar <noreply@rentmaikar.com>",
      to: ["driver@example.com"],
      subject: "Fail Closed Test",
      html: "<p>body</p>",
    });

    assertEquals(res.status, 502);
    assert(!calls.some((u) => u.includes("api.sent.dm")), "SENT.DM email fallback must never be called");
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("RENTMAIKAR_BACKEND_URL");
    Deno.env.delete("RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET");
    Deno.env.delete("SENT_API_KEY");
    Deno.env.delete("SENT_ENABLED");
  }
});
