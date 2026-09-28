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
  sendEmailViaSent,
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

Deno.test("establishes and maintains the Direct Resend connector", () => {
  assertEquals(isDirectResendKey("re_abc123"), true);
  assertEquals(resendEmailsUrl("re_abc123"), "https://api.resend.com/emails");
  assertEquals(resendEmailsUrl("re_prod_999"), "https://api.resend.com/emails");

  const headers = resendHeaders("re_abc123");
  assertEquals(headers.Authorization, "Bearer re_abc123");
  assertEquals(headers["Content-Type"], "application/json");
  assertEquals("X-Connection-Api-Key" in headers, false);
});

Deno.test(
  "send rewrites the sender and routes through Backend Email Bridge",
  async () => {
    const original = globalThis.fetch;

    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    Deno.env.set(
      "RENTMAIKAR_BACKEND_URL",
      "https://staging.rentmaikar.com",
    );

    Deno.env.set(
      "RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET",
      "test-bridge-secret",
    );

    globalThis.fetch = (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedUrl = String(url);

      const rawHeaders = init?.headers;

      if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((value, key) => {
          capturedHeaders[key] = value;
        });
      } else if (rawHeaders) {
        capturedHeaders = Object.fromEntries(
          Object.entries(rawHeaders as Record<string, string>)
            .map(([key, value]) => [key.toLowerCase(), String(value)]),
        );
      }

      capturedBody = JSON.parse(
        String(init?.body ?? "{}"),
      );

      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            success: true,
            messageId: "backend_msg_1",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    };

    try {
      const res = await resendSendEmail({
        from:
          "Rentmaikar <noreply@rentmaikar.com>",
        to: ["driver@example.com"],
        subject: "Booking confirmed",
        html: "<p>hi</p>",
      });

      assertEquals(res.status, 200);
      const result = await res.json();

      assertEquals(result.ok, true);
      assertEquals(result.success, true);
      assertEquals(result.messageId, "backend_msg_1");

      assertEquals(
        capturedUrl,
        "https://staging.rentmaikar.com/api/functions/send-outbound-email",
      );

      assertEquals(
        capturedHeaders["x-rentmaikar-internal-secret"],
        "test-bridge-secret",
      );

      assertEquals(
        capturedBody.from,
        "Rentmaikar <noreply@notify.rentmaikar.com>",
      );

      assertEquals(
        capturedBody.reply_to,
        "Rentmaikar <noreply@rentmaikar.com>",
      );

      assertEquals(
        capturedBody.subject,
        "Booking confirmed",
      );
    } finally {
      globalThis.fetch = original;

      Deno.env.delete("RENTMAIKAR_BACKEND_URL");
      Deno.env.delete(
        "RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET",
      );
    }
  },
);
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

  

