// In-app messaging dispatcher.
//
// Complements SMS / WhatsApp / email: the message is stored in
// `in_app_messages` (read inside the web app or PWA) and a web-push
// notification is delivered to every browser/PWA the user has opted in from.
//
// Callable by admin/admin_assistant staff, or internally (cron / other edge
// functions) with the cron secret or service-role bearer.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminCaller } from "../_shared/guard.ts";
import { sendWebPushToUser, webPushConfigured } from "../_shared/web-push.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { looksLikeOtpMessage, OTP_IN_APP_BLOCK_MESSAGE } from "../_shared/otp-guard.ts";

const Body = z.object({
  recipient_ids: z.array(z.string().uuid()).min(1).max(500),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  category: z.string().max(64).optional(),
  link_url: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  notify: z.boolean().optional(),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireAdminCaller(req);
  if (caller instanceof Response) return caller;

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { recipient_ids, subject, body, category, link_url, metadata, notify } = parsed.data;

    // Hard block: OTP / 2FA codes must never travel over the in-app channel.
    if (
      looksLikeOtpMessage(body, category) ||
      looksLikeOtpMessage(subject, category)
    ) {
      return json({ ok: false, error: OTP_IN_APP_BLOCK_MESSAGE }, 400);
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rows = recipient_ids.map((recipient_id) => ({
      recipient_id,
      sender_id: caller.userId,
      category: category ?? "general",
      subject: subject ?? null,
      body,
      link_url: link_url ?? null,
      metadata: metadata ?? {},
    }));

    const { data: inserted, error } = await supa
      .from("in_app_messages")
      .insert(rows)
      .select("id, recipient_id");
    if (error) throw error;

    let pushed = 0;
    let pushFailed = 0;
    if (notify !== false) {
      for (const r of inserted ?? []) {
        const res = await sendWebPushToUser(supa, (r as { recipient_id: string }).recipient_id, {
          title: subject || "New message from Rentmaikar",
          body: body.slice(0, 180),
          url: link_url || "/messages",
          tag: `in-app-${(r as { id: string }).id}`,
          data: { messageId: (r as { id: string }).id, category: category ?? "general" },
        });
        pushed += res.sent;
        pushFailed += res.failed;
      }
    }

    for (const r of inserted ?? []) {
      await logMessagingEvent(supa, {
        channel: "push",
        provider: "resend",
        event_type: "sent",
        direction: "outbound",
        recipient: (r as { recipient_id: string }).recipient_id,
        user_id: (r as { recipient_id: string }).recipient_id,
        metadata: { surface: "in_app", category: category ?? "general" },
      });
    }

    return json({
      ok: true,
      created: inserted?.length ?? 0,
      pushed,
      push_failed: pushFailed,
      push_configured: webPushConfigured(),
    });
  } catch (e) {
    console.error("[send-in-app-message] failed", e);
    return json({ error: (e as Error).message }, 500);
  }
});
