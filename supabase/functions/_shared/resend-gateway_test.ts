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

Deno.test("routes connector keys through the Lovable gateway", () => {
  assertEquals(isDirectResendKey("re_abc123"), true);
  assertEquals(isDirectResendKey("conn_abc123"), false);
  assertEquals(resendEmailsUrl("re_abc123"), "https://api.resend.com/emails");
  assertEquals(
    resendEmailsUrl("conn_abc123"),
    "https://connector-gateway.lovable.dev/resend/emails",
  );

  const direct = resendHeaders("re_abc123");
  assertEquals(direct.Authorization, "Bearer re_abc123");
  const gateway = resendHeaders("conn_abc123");
  assertEquals(gateway["X-Connection-Api-Key"], "conn_abc123");
});

Deno.test("send rewrites the sender and keeps the original as reply_to", async () => {
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

  assertEquals(captured.from, "Rentmaikar <noreply@notify.rentmaikar.com>");
  assertEquals(captured.reply_to, "Rentmaikar <noreply@rentmaikar.com>");
  assertEquals(captured.subject, "Booking confirmed");
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
    assertEquals(await res.text(), "API key is invalid");
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
