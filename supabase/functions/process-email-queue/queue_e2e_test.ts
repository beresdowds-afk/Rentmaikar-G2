// End-to-end email delivery test through the live queue worker.
//
// Enqueues a transactional email, runs `process-email-queue`, and asserts the
// message left the queue and was logged as `sent`. Requires service-role
// credentials; skipped automatically when they are not present (e.g. local
// runs without secrets).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isDirectResendKey,
  resendFrom,
  resendHeaders,
  resendSendingDomain,
} from "../_shared/resend-gateway.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TEST_RECIPIENT = Deno.env.get("EMAIL_E2E_RECIPIENT") ?? "";

const ready = Boolean(SUPABASE_URL && SERVICE_KEY && TEST_RECIPIENT);

Deno.test("sender rewrite: normalises unverified domains onto notify.rentmaikar.com", () => {
  const verifiedDomain = resendSendingDomain();
  assertEquals(verifiedDomain, "notify.rentmaikar.com");

  // Display name + unverified apex domain -> rewritten onto verified domain preserving display name
  assertEquals(
    resendFrom("Rentmaikar <noreply@rentmaikar.com>"),
    `Rentmaikar <noreply@${verifiedDomain}>`
  );

  // Bare email address without display name
  assertEquals(
    resendFrom("noreply@rentmaikar.com"),
    `noreply@${verifiedDomain}`
  );

  // Subdomain rewriting (e.g. mail.rentmaikar.com -> notify.rentmaikar.com)
  assertEquals(
    resendFrom("Rentmaikar Operations <ops@mail.rentmaikar.com>"),
    `Rentmaikar Operations <ops@${verifiedDomain}>`
  );

  // Already verified domain -> left untouched
  assertEquals(
    resendFrom(`Rentmaikar Support <support@${verifiedDomain}>`),
    `Rentmaikar Support <support@${verifiedDomain}>`
  );
});

Deno.test("resend headers: distinguishes direct API key vs Lovable connection gateway key", () => {
  // Raw Resend API keys start with re_
  const directKey = "re_test_123456789";
  assertEquals(isDirectResendKey(directKey), true);
  const directHeaders = resendHeaders(directKey);
  assertEquals(directHeaders["Authorization"], `Bearer ${directKey}`);
  assertEquals("X-Connection-Api-Key" in directHeaders, false);

  // Connector connection keys
  const connKey = "conn_resend_987654321";
  assertEquals(isDirectResendKey(connKey), false);
  const connHeaders = resendHeaders(connKey);
  assertEquals(connHeaders["X-Connection-Api-Key"], connKey);
});

Deno.test({
  name: "queue worker delivers a transactional email and logs it as sent",
  ignore: !ready,
  fn: async () => {
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const messageId = `e2e-${crypto.randomUUID()}`;

    // Verify sender rewrite in payload before queueing
    const originalFrom = "Rentmaikar <noreply@rentmaikar.com>";
    const expectedRewrittenFrom = resendFrom(originalFrom);
    assertEquals(expectedRewrittenFrom, "Rentmaikar <noreply@notify.rentmaikar.com>");

    const { error: enqErr } = await supa.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: TEST_RECIPIENT,
        from: originalFrom,
        subject: "Rentmaikar delivery test",
        html: "<p>Automated delivery test verifying queue worker and sender rewrite.</p>",
        label: "email_e2e_test",
        purpose: "transactional",
        queued_at: new Date().toISOString(),
      },
    });
    assertEquals(enqErr, null);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-email-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({}),
    });
    const body = await res.text();
    assertEquals(res.status, 200, `worker failed: ${body}`);

    // Poll the log briefly — the worker writes the outcome synchronously, but
    // PostgREST reads can lag a moment behind.
    let status: string | null = null;
    for (let i = 0; i < 10 && status !== "sent"; i++) {
      const { data } = await supa
        .from("email_send_log")
        .select("status, metadata")
        .eq("message_id", messageId)
        .order("created_at", { ascending: false })
        .limit(1);
      status = data?.[0]?.status ?? null;
      if (status !== "sent") await new Promise((r) => setTimeout(r, 500));
    }
    assertEquals(status, "sent", "email was not logged as sent");

    // The message must no longer be sitting in the queue.
    const { data: remaining } = await supa.rpc("read_email_batch", {
      queue_name: "transactional_emails",
      batch_size: 50,
      vt: 1,
    });
    const stillQueued = (remaining ?? []).some(
      (m: { message?: { message_id?: string } }) => m.message?.message_id === messageId,
    );
    assert(!stillQueued, "message is still in the queue after a successful send");
  },
});

