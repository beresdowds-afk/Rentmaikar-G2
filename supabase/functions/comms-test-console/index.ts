// ════════════════════════════════════════════════════════════
// Admin communications test console
//
// Resolves the exact routing RentMaikar would use for a given channel +
// destination (public sender / caller ID, region, forwarding switch, master
// endpoint) and — when asked — actually dispatches a single test message or
// voice call so an admin can confirm the path end to end.
//
// Messaging goes through Sent.dm (Termii/Twilio remain fallbacks elsewhere);
// Twilio is used for VOICE ONLY.
// ════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaSent } from "../_shared/sent-client.ts";
import {
  getForwardingDestination,
  isForwardingEnabled,
  normaliseRegion,
  regionFromPhone,
} from "../_shared/forwarding.ts";
import {
  getMasterEndpoint,
  publicSenderFor,
  RENTMAIKAR_NUMBERS,
} from "../_shared/comms-endpoints.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { twilioCredentialsConfigured, twilioRequest } from "../_shared/twilio-auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type TestChannel = "sms" | "whatsapp" | "call";

const isValidE164 = (phone: string) => /^\+[1-9]\d{6,14}$/.test((phone || "").trim());

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: json({ error: "Missing bearer token" }, 401) };
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return { error: json({ error: "Unauthorized" }, 401) };

  const admin = createClient(supabaseUrl, serviceKey);
  // `is_admin()` resolves auth.uid() server-side; fall back to a direct
  // user_roles lookup so a renamed RPC never locks a genuine admin out.
  let isStaff = false;
  const { data: adminFlag } = await userClient.rpc("is_admin");
  if (adminFlag === true) {
    isStaff = true;
  } else {
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id);
    isStaff = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
  }
  if (!isStaff) return { error: json({ error: "Admin role required" }, 403) };

  return { user: userRes.user, admin };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const supabase = gate.admin;

  try {
    const body = await req.json().catch(() => ({}));
    const channel = String(body.channel ?? "sms").toLowerCase() as TestChannel;
    const to = String(body.to ?? "").trim();
    const dryRun = body.dry_run === true;
    const message = String(
      body.message ?? "RentMaikar routing test — no action needed.",
    ).slice(0, 480);

    if (!["sms", "whatsapp", "call"].includes(channel)) {
      return json({ error: "channel must be sms, whatsapp or call" }, 400);
    }
    if (!isValidE164(to)) {
      return json({ error: "Enter the destination in full international format (E.164)" }, 400);
    }

    // ─── Routing resolution (always returned, send or not) ───
    const region = regionFromPhone(to);
    const master = await getMasterEndpoint(supabase);
    const forwardingEnabled = await isForwardingEnabled(supabase, channel);
    const endpoint = await getForwardingDestination(supabase, channel, region);
    const sender = publicSenderFor(channel === "call" ? "call" : channel);

    const routing = {
      channel,
      to,
      region: normaliseRegion(region),
      sender,
      caller_id: channel === "call" ? sender : null,
      forwarding_enabled: forwardingEnabled,
      inbound_endpoint: endpoint,
      master_endpoint: channel === "call" ? master.voice : channel === "whatsapp" ? master.whatsapp : master.sms,
      provider: channel === "call" ? "twilio" : "sent",
      public_numbers: RENTMAIKAR_NUMBERS,
    };

    if (dryRun) return json({ ok: true, dry_run: true, routing });

    // ─── Voice test call (Twilio — voice only) ───
    if (channel === "call") {
      if (!twilioCredentialsConfigured()) {
        return json({ ok: false, routing, error: "Twilio voice credentials are not configured" }, 400);
      }
      const twiml =
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${
          message.replace(/[<&>]/g, " ")
        }</Say></Response>`;

      const params = new URLSearchParams({ To: to, From: sender, Twiml: twiml });
      const res = await twilioRequest("/Calls.json", { method: "POST", body: params });
      const payload = res.payload as { sid?: string; status?: string; message?: string; code?: number };
      if (!res.ok) {
        console.error(`[comms-test-console] twilio call failed [${res.status}]`, payload);
        const hint = res.status === 401
          ? "Twilio rejected the credentials (error 20003). Check TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (primary), or TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN (fallback) for this account."
          : payload.code === 21216 || payload.code === 21215
          ? `Twilio geo permissions block calls to ${to}. Confirm the number is correct (Nigerian numbers start +234, e.g. +2349163072576 — +240 is Equatorial Guinea) and enable that country under Twilio Voice Geo Permissions.`
          : payload.code === 21211 || payload.code === 21214
          ? `${to} is not a dialable number. Re-enter it in full E.164 format including the correct country code.`
          : undefined;

        return json(
          {
            ok: false,
            routing,
            status: res.status,
            credential_tried: res.credential,
            error: [payload.message ?? "Twilio call failed", hint].filter(Boolean).join(" — "),
          },
          res.status,
        );
      }


      await logMessagingEvent(supabase, {
        channel: "voip",
        provider: "twilio",
        event_type: "sent",
        direction: "outbound",
        recipient: to,
        sender,
        region: routing.region,
        provider_message_id: payload.sid,
        metadata: { purpose: "admin_test_console", caller_id: sender },
      }).catch((e) => console.error("[comms-test-console] event log failed:", e));

      return json({ ok: true, routing, result: { sid: payload.sid, status: payload.status } });
    }

    // ─── SMS / WhatsApp test (Sent.dm) ───
    const sent = await sendViaSent({
      to,
      channel,
      text: message,
      senderId: sender,
      metadata: { purpose: "admin_test_console", region: routing.region },
    });

    await logMessagingEvent(supabase, {
      channel,
      provider: "sent",
      event_type: sent.ok ? "sent" : "failed",
      direction: "outbound",
      recipient: to,
      sender,
      region: routing.region,
      provider_message_id: sent.messageId,
      metadata: { purpose: "admin_test_console", error: sent.error ?? null },
    }).catch((e) => console.error("[comms-test-console] event log failed:", e));

    if (!sent.ok) {
      return json({ ok: false, routing, error: sent.error ?? "Sent.dm dispatch failed", skipped: sent.skipped }, 502);
    }

    return json({
      ok: true,
      routing,
      result: { message_id: sent.messageId, status: sent.status, sandbox: sent.sandbox },
    });
  } catch (error) {
    console.error("[comms-test-console] error:", error);
    return json({ error: error instanceof Error ? error.message : "unknown" }, 500);
  }
});
