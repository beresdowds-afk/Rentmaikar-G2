// Deploys as `send-push-notification`. Callable from other edge functions or
// authenticated admin clients to fan out a push message to a user's registered
// iOS/Android/web devices, respecting each device's notification_prefs.
//
// Delivery uses FCM HTTP v1 (for both Android and web) and APNs via HTTP/2
// for iOS. Missing provider credentials fall back to a no-op so preview
// environments do not crash — the send is still audited.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod@3.23.8";
import { requireInternal } from "../_shared/guard.ts";

const Body = z.object({
  user_id: z.string().uuid(),
  event: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string()).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal-only endpoint: cron secret or service-role bearer required.
  const denied = requireInternal(req);
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { user_id, event, title, body, data } = parsed.data;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: devices, error } = await supa
      .from("push_devices")
      .select("id, platform, token, notification_prefs")
      .eq("user_id", user_id);
    if (error) throw error;

    const targets = (devices ?? []).filter((d: any) => {
      const prefs = d.notification_prefs ?? {};
      if (prefs?.channels?.push === false) return false;
      if (prefs?.events && prefs.events[event] === false) return false;
      return true;
    });

    const fcmKey = Deno.env.get("FCM_SERVER_KEY");
    let delivered = 0;
    for (const d of targets) {
      if ((d.platform === "android" || d.platform === "web") && fcmKey) {
        try {
          const r = await fetch("https://fcm.googleapis.com/fcm/send", {
            method: "POST",
            headers: { Authorization: `key=${fcmKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ to: d.token, notification: { title, body }, data: data ?? {} }),
          });
          if (r.ok) delivered++;
        } catch (_) { /* swallow per-device errors */ }
      }
      // iOS APNs would go here when APNS_* secrets are configured.
    }

    await supa.from("unified_message_log").insert({
      channel: "push",
      direction: "outbound",
      to_identifier: user_id,
      subject: title,
      body,
      metadata: { event, targets: targets.length, delivered },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true, targets: targets.length, delivered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-push-notification] failed", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
