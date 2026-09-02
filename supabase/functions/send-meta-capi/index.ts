// Meta Conversions API (CAPI) — server-side companion to the browser Pixel.
// The client sends the same event with a shared event_id; Meta deduplicates.
//
// Public endpoint (verify_jwt = false in config.toml) because it must be
// callable from unauthenticated visitors. The function requires the
// Meta-issued CAPI access token, which is stored server-side only.
//
// Consent is gated on the client (see src/lib/meta-pixel.ts); the client
// never calls this function unless the user has accepted consent.
//
// Env: META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_TEST_EVENT_CODE (optional)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface IncomingEvent {
  event_name: string;
  event_id?: string;              // shared with client Pixel for dedupe
  event_source_url?: string;
  action_source?: "website" | "email" | "app" | "chat" | "phone_call" | "physical_store" | "system_generated" | "other";
  event_time?: number;             // unix seconds
  user_data?: {
    email?: string;
    phone?: string;
    external_id?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    country?: string;              // ISO-3166-1 alpha-2
    fbp?: string;                  // _fbp cookie
    fbc?: string;                  // _fbc cookie / fbclid
  };
  custom_data?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const pixelId = Deno.env.get("META_PIXEL_ID");
  const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  const testEventCode = Deno.env.get("META_TEST_EVENT_CODE") || undefined;

  if (!pixelId || !accessToken) {
    // Fail soft — client Pixel still fires. Return 200 so the browser
    // request doesn't spam the console when secrets aren't set.
    return new Response(JSON.stringify({ ok: false, reason: "not_configured" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { events: IncomingEvent[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0) {
    return new Response(JSON.stringify({ error: "No events provided" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Client IP + UA (Meta requires at least one of these when action_source=website)
  const clientIp =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  const nowSec = Math.floor(Date.now() / 1000);
  const built = await Promise.all(events.map(async (evt) => {
    const ud: Record<string, unknown> = {};
    if (evt.user_data?.email) ud.em = [await sha256(evt.user_data.email)];
    if (evt.user_data?.phone) ud.ph = [await sha256(evt.user_data.phone.replace(/[^\d]/g, ""))];
    if (evt.user_data?.first_name) ud.fn = [await sha256(evt.user_data.first_name)];
    if (evt.user_data?.last_name) ud.ln = [await sha256(evt.user_data.last_name)];
    if (evt.user_data?.city) ud.ct = [await sha256(evt.user_data.city)];
    if (evt.user_data?.country) ud.country = [await sha256(evt.user_data.country)];
    if (evt.user_data?.external_id) ud.external_id = [await sha256(evt.user_data.external_id)];
    if (evt.user_data?.fbp) ud.fbp = evt.user_data.fbp;
    if (evt.user_data?.fbc) ud.fbc = evt.user_data.fbc;
    if (clientIp) ud.client_ip_address = clientIp;
    if (userAgent) ud.client_user_agent = userAgent;

    return {
      event_name: evt.event_name,
      event_time: evt.event_time || nowSec,
      event_id: evt.event_id,
      event_source_url: evt.event_source_url,
      action_source: evt.action_source || "website",
      user_data: ud,
      custom_data: evt.custom_data || {},
    };
  }));

  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
  const payload: Record<string, unknown> = { data: built };
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const respBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Meta CAPI error:", res.status, respBody);
      return new Response(JSON.stringify({ ok: false, status: res.status, error: respBody }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, received: built.length, fb: respBody }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Meta CAPI dispatch failed:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
