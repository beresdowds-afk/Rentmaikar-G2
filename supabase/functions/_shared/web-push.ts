// Shared browser/PWA web-push sender.
//
// Delivers a notification to every registered `push_subscriptions` endpoint of
// a user. Expired/gone endpoints (404/410) are pruned so the table stays clean.
// Missing VAPID keys degrade to a no-op instead of throwing.
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@rentmaikar.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export function webPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

export async function sendWebPushToUser(
  supa: ReturnType<typeof createClient>,
  userId: string,
  payload: WebPushPayload,
): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!webPushConfigured()) return { sent: 0, failed: 0, skipped: "vapid_not_configured" };

  const { data: subs } = await supa
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  let sent = 0;
  let failed = 0;
  for (const s of (subs ?? []) as Array<Record<string, string>>) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err) {
      failed++;
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await supa.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return { sent, failed };
}
