// Scheduled worker: sends one summary email per user with all their pending
// Persona identity verification status changes buffered since the last run.
// Users opt in by setting profiles.persona_notification_frequency = 'daily_digest'.
// Intended to be invoked once per day via pg_cron.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternal } from "../_shared/guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal-only endpoint: cron secret or service-role bearer required.
  const denied = requireInternal(req);
  if (denied) return denied;
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: pending, error } = await supa
    .from("persona_status_digest_queue")
    .select("id, user_id, inquiry_id, status, note, created_at")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const byUser = new Map<string, typeof pending>();
  for (const row of pending ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  let sent = 0, users = 0, skipped = 0;
  const statusUrl = `${Deno.env.get("APP_URL") ?? "https://rentmaikar.lovable.app"}/onboarding/verification-status`;

  for (const [userId, events] of byUser.entries()) {
    users++;
    const { data: prof } = await supa
      .from("profiles")
      .select("email, full_name, persona_notification_frequency")
      .eq("user_id", userId)
      .maybeSingle();

    const freq = (prof as { persona_notification_frequency?: string } | null)?.persona_notification_frequency;
    if (!prof?.email || freq !== "daily_digest") {
      // Preference changed since queueing — clear rows without emailing.
      await supa.from("persona_status_digest_queue")
        .update({ sent_at: new Date().toISOString() })
        .in("id", events!.map((e) => e.id));
      skipped++;
      continue;
    }

    const firstName = (prof.full_name as string | null)?.split(" ")[0] ?? "";
    const summary = events!
      .map((e) => `• ${new Date(e.created_at).toLocaleString()} — ${e.status}${e.note ? ` (${e.note})` : ""}`)
      .join("\n");
    const latest = events![events!.length - 1]!.status;

    const res = await supa.functions.invoke("send-outbound-email", {
      body: {
        action: "send",
        to: prof.email,
        templateName: "persona_status_digest",
        category: "verification",
        priority: "normal",
        data: {
          firstName,
          count: events!.length,
          latestStatus: latest,
          summary,
          statusUrl,
        },
      },
    }).catch((err) => ({ error: err }));

    if (!(res as { error?: unknown }).error) {
      await supa.from("persona_status_digest_queue")
        .update({ sent_at: new Date().toISOString() })
        .in("id", events!.map((e) => e.id));
      sent++;
    }
  }

  return new Response(JSON.stringify({ ok: true, users, sent, skipped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
