// End-to-end email delivery test through the live queue worker.
//
// Enqueues a transactional email, runs `process-email-queue`, and asserts the
// message left the queue and was logged as `sent`. Requires service-role
// credentials; skipped automatically when they are not present (e.g. local
// runs without secrets).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TEST_RECIPIENT = Deno.env.get("EMAIL_E2E_RECIPIENT") ?? "";

const ready = Boolean(SUPABASE_URL && SERVICE_KEY && TEST_RECIPIENT);

Deno.test({
  name: "queue worker delivers a transactional email and logs it as sent",
  ignore: !ready,
  fn: async () => {
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const messageId = `e2e-${crypto.randomUUID()}`;

    const { error: enqErr } = await supa.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: TEST_RECIPIENT,
        from: "Rentmaikar <noreply@rentmaikar.com>",
        subject: "Rentmaikar delivery test",
        html: "<p>Automated delivery test.</p>",
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
        .select("status")
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
