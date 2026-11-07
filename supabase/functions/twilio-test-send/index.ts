import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface TestSendRequest {
  to: string;
  channel: "sms" | "whatsapp";
  message?: string;
}

const isValidE164 = (phone: unknown): phone is string =>
  typeof phone === "string" && /^\+[1-9]\d{6,14}$/.test(phone.trim());
const maskPhone = (phone: string) =>
  phone.replace(/\d(?=\d{4})/g, "*");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
  if (userErr || !userRes?.user) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userRes.user.id,
    _role: "admin",
  });
  if (roleErr) console.error("[twilio-test-send] has_role rpc failed:", roleErr.message);
  let allowed = !!isAdmin;
  if (!allowed) {
    // Fallback: direct role lookup keeps admin diagnostics reachable if the
    // RPC is unavailable through the Data API.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
    allowed = !!roleRow;
  }
  if (!allowed) {
    return { error: json({ error: "Admin role required" }, 403) };
  }

  return { user: userRes.user, admin, supabaseUrl };
}

async function consumeDiagnosticLimit(
  admin: SupabaseClient,
  identifier: string,
  endpoint: string,
  maxRequests: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("check_auth_rate_limit", {
    _identifier: identifier,
    _endpoint: endpoint,
    _max_requests: maxRequests,
    _window_seconds: 60,
  });
  if (error) {
    console.error("[twilio-test-send] diagnostic rate limit failed:", error.message);
    throw new Error("SMS diagnostic rate limiting is unavailable");
  }
  return data === true;
}

async function hashRateLimitIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Admin session is the only way in — diagnostics included.
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const user = gate.user;
  const admin = gate.admin;
  const supabaseUrl = gate.supabaseUrl;

  try {
    if (!(await consumeDiagnosticLimit(admin, user.id, "twilio-test-send:user", 15))) {
      return json({ error: "Rate limit exceeded" }, 429);
    }
  } catch {
    return json({ error: "SMS diagnostic service unavailable" }, 503);
  }



  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  // RentMaikar authenticates Twilio REST with the API key/secret pair.
  const apiKeySid = Deno.env.get("TWILIO_API_KEY_SID") || Deno.env.get("TWILIO_API_KEY");
  const apiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET") || Deno.env.get("TWILIO_API_SECRET");
  if (!accountSid || (!apiKeySid && !authToken)) {
    return json({ error: "Twilio credentials not configured" }, 500);
  }
  const twilioAuth = apiKeySid && apiKeySecret
    ? `Basic ${btoa(`${apiKeySid}:${apiKeySecret}`)}`
    : `Basic ${btoa(`${accountSid}:${authToken}`)}`;


  // ---------- GET ?diagnostics=1 : verify configuration without sending ----------
  if (req.method === "GET" && new URL(req.url).searchParams.get("diagnostics")) {
    const envNames = [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_API_KEY_SID",
      "TWILIO_API_KEY_SECRET",

      "TWILIO_PHONE_NUMBER",
      "TWILIO_WHATSAPP_NUMBER",
      "TWILIO_MESSAGING_SERVICE_SID",
      "TWILIO_TWIML_APP_SID",
      "TWILIO_CUSTOMER_PROFILE_SID",
      "TWILIO_A2P_BRAND_SID",
      "TWILIO_A2P_CAMPAIGN_SID",
    ];
    const env: Record<string, boolean> = {};
    for (const n of envNames) env[n] = Boolean(Deno.env.get(n));

    const checks: Record<string, unknown> = {};

    // 1. Account credentials
    const accRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers: { Authorization: twilioAuth } },
    );
    const acc = await accRes.json().catch(() => ({}));
    checks.account = accRes.ok
      ? { ok: true, friendlyName: acc.friendly_name, status: acc.status, type: acc.type }
      : { ok: false, status: accRes.status, error: "Twilio account lookup failed" };

    // 2. Sender phone numbers owned by the account
    const numRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`,
      { headers: { Authorization: twilioAuth } },
    );
    const nums = await numRes.json().catch(() => ({}));
    const owned: string[] = (nums.incoming_phone_numbers ?? []).map((n: any) => n.phone_number);
    const smsNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const waNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER");
    checks.phoneNumber = {
      ok: numRes.ok && !!smsNumber && owned.includes(smsNumber),
      configured: smsNumber ?? null,
      ownedCount: owned.length,
      note: smsNumber && !owned.includes(smsNumber)
        ? "Configured number is not owned by this account (or is a Messaging Service sender)"
        : undefined,
    };
    checks.whatsappNumber = {
      ok: !!waNumber,
      configured: waNumber ?? null,
      note: waNumber && !owned.includes(waNumber.replace("whatsapp:", ""))
        ? "WhatsApp senders are managed separately from Incoming Phone Numbers — verify in Twilio WhatsApp senders"
        : undefined,
    };

    // 2b. Per-number webhook audit — catches voice/SMS webhooks left pointing at
    // stale/foreign hosts instead of the Supabase edge functions that handle them.
    const baseUrl = `${supabaseUrl}/functions/v1`;
    const expectedVoice = `${baseUrl}/incoming-call-forward`;
    const expectedSms = `${baseUrl}/twilio-webhook`;
    const numberWebhooks = (nums.incoming_phone_numbers ?? []).map((n: any) => {
      const voiceUrl: string = n.voice_url ?? "";
      const smsUrl: string = n.sms_url ?? "";
      const problems: string[] = [];
      if (!voiceUrl) problems.push("voice webhook not set");
      else if (voiceUrl !== expectedVoice) problems.push("voice webhook mismatch");
      if (smsUrl && smsUrl !== expectedSms)
        problems.push("sms webhook mismatch");
      return {
        phoneNumber: n.phone_number as string,
        sid: n.sid as string,
        friendlyName: n.friendly_name ?? null,
        ok: problems.length === 0,
        problems,
      };
    });
    checks.numberWebhooks = {
      ok: numRes.ok && numberWebhooks.every((n: { ok: boolean }) => n.ok),
      expected: { voice: expectedVoice, sms: expectedSms },
      numbers: numberWebhooks,
      note: numberWebhooks.some((n: { ok: boolean }) => !n.ok)
        ? "One or more numbers forward calls/SMS to a host that does not handle them. Use the fix-number-webhooks action to repoint them."
        : undefined,
    };

    // 3. Messaging service
    const msSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
    if (msSid) {
      const msRes = await fetch(
        `https://messaging.twilio.com/v1/Services/${msSid}`,
        { headers: { Authorization: twilioAuth } },
      );
      const ms = await msRes.json().catch(() => ({}));
      checks.messagingService = msRes.ok
        ? { ok: true, friendlyName: ms.friendly_name, statusCallbackConfigured: Boolean(ms.status_callback) }
        : { ok: false, status: msRes.status, error: "Messaging service lookup failed" };
    } else {
      checks.messagingService = { ok: false, error: "TWILIO_MESSAGING_SERVICE_SID not set" };
    }

    // 4. Customer profile (trust hub)
    const cpSid = Deno.env.get("TWILIO_CUSTOMER_PROFILE_SID");
    if (cpSid) {
      const cpRes = await fetch(
        `https://trusthub.twilio.com/v1/CustomerProfiles/${cpSid}`,
        { headers: { Authorization: twilioAuth } },
      );
      const cp = await cpRes.json().catch(() => ({}));
      checks.customerProfile = cpRes.ok
        ? { ok: cp.status === "twilio-approved", status: cp.status, friendlyName: cp.friendly_name }
        : { ok: false, status: cpRes.status, error: "Customer profile lookup failed" };
    } else {
      checks.customerProfile = { ok: false, error: "TWILIO_CUSTOMER_PROFILE_SID not set" };
    }

    // 5. API key (used for VoIP access tokens)
    const apiKey = Deno.env.get("TWILIO_API_KEY_SID") ?? Deno.env.get("TWILIO_API_KEY");
    if (apiKey) {
      const keyRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Keys/${apiKey}.json`,
        { headers: { Authorization: twilioAuth } },
      );
      const key = await keyRes.json().catch(() => ({}));
      checks.apiKey = keyRes.ok
        ? { ok: true, friendlyName: key.friendly_name }
        : { ok: false, status: keyRes.status, error: "API key lookup failed" };
    } else {
      checks.apiKey = { ok: false, error: "TWILIO_API_KEY_SID not set" };
    }

    // 6. Webhook signature validation readiness.
    // Inbound webhooks (voice/SMS) are verified with the ACCOUNT AUTH TOKEN —
    // API keys cannot validate X-Twilio-Signature. A stale token makes every
    // inbound call fail with "an application error has occurred".
    let authTokenValid: boolean | null = null;
    if (authToken) {
      const atRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        { headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` } },
      );
      authTokenValid = atRes.ok;
    }
    // baseUrl declared above in this diagnostics block
    checks.webhooks = {
      signatureValidationEnabled: Boolean(authToken),
      authTokenValid,
      note: authTokenValid === false
        ? "TWILIO_AUTH_TOKEN is stale — inbound call/SMS webhooks will be rejected (403) and callers hear an application error."
        : undefined,

      endpoints: {
        incomingMessages: `${baseUrl}/twilio-webhook`,
        whatsappCommands: `${baseUrl}/whatsapp-commands`,
        voipStatusCallback: `${baseUrl}/voip-status-callback`,
        recordingStatusCallback: `${baseUrl}/recording-status-callback`,
      },
    };

    return json({ env, checks, checkedBy: user.email, checkedAt: new Date().toISOString() });
  }

  // ---------- GET: poll delivery status by SID ----------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const sid = url.searchParams.get("sid");

    if (!sid || !/^[A-Z]{2}[0-9a-fA-F]{32}$/.test(sid)) {
      return json({ error: "Invalid or missing 'sid'" }, 400);
    }
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`,
      { headers: { Authorization: twilioAuth } },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ error: "Twilio lookup failed", status: res.status }, res.status);
    }
    return json({
      sid: body.sid,
      status: body.status, // queued, sending, sent, delivered, undelivered, failed, read
      to: maskPhone(String(body.to ?? "")),
      dateSent: body.date_sent,
      dateUpdated: body.date_updated,
    });
  }

  // ---------- POST: send a test message ----------
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: TestSendRequest & { action?: string };
  try {
    body = (await req.json()) as TestSendRequest & { action?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // ---------- POST {action:"fix-number-webhooks"} ----------
  // Repoints every owned number's voice/SMS webhooks at the backend functions,
  // undoing forwards to hosts that do not handle them.
  if (body?.action === "fix-number-webhooks") {
    const baseUrl = `${supabaseUrl}/functions/v1`;
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`,
      { headers: { Authorization: twilioAuth } },
    );
    const list = await listRes.json().catch(() => ({}));
    if (!listRes.ok) {
      return json({ error: "Failed to list phone numbers", status: listRes.status }, listRes.status);
    }
    const results: Array<Record<string, unknown>> = [];
    // Optional filter so a single number can be repaired without touching the
    // dial-out-only number or any Studio Flow it is attached to.
    const requestedNumbers = (body as { phoneNumbers?: unknown }).phoneNumbers;
    if (
      requestedNumbers !== undefined &&
      (!Array.isArray(requestedNumbers) ||
        requestedNumbers.some((phone) => typeof phone !== "string"))
    ) {
      return json({ error: "phoneNumbers must be an array of phone numbers" }, 400);
    }
    const onlyNumbers = Array.isArray(requestedNumbers)
      ? requestedNumbers.map((phone) => phone.trim())
      : null;
    for (const n of list.incoming_phone_numbers ?? []) {
      if (onlyNumbers && !onlyNumbers.includes(n.phone_number)) continue;

      const params = new URLSearchParams({
        VoiceUrl: `${baseUrl}/incoming-call-forward`,
        VoiceMethod: "POST",
        SmsUrl: `${baseUrl}/twilio-webhook`,
        SmsMethod: "POST",
        StatusCallback: `${baseUrl}/twilio-webhook`,
        StatusCallbackMethod: "POST",
      });
      const upRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${n.sid}.json`,
        {
          method: "POST",
          headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        },
      );
      results.push({
        ok: upRes.ok,
        error: upRes.ok ? undefined : "Twilio webhook update failed",
      });
    }
    try {
      await admin.from("messaging_events").insert({
        event_type: "number_webhooks_repair",
        channel: "voip",
        provider: "twilio",
        status: results.every((r) => r.ok) ? "sent" : "failed",
        metadata: { initiated_by: user.id, results },
      });
    } catch (e) {
      console.warn("messaging_events insert failed", e);
    }
    return json({ success: results.every((r) => r.ok), results });
  }

  if (!body?.to || !isValidE164(body.to)) {
    return json({ error: "Invalid 'to' phone (E.164 required, e.g. +15551234567)" }, 400);
  }
  if (body.channel !== "sms" && body.channel !== "whatsapp") {
    return json({ error: "channel must be 'sms' or 'whatsapp'" }, 400);
  }

  try {
    const recipientKey = await hashRateLimitIdentifier(body.to.trim());
    if (
      !(await consumeDiagnosticLimit(
        admin,
        `${user.id}:${recipientKey}`,
        "twilio-test-send:recipient:twilio",
        3,
      ))
    ) {
      return json({ error: "Rate limit exceeded for this recipient" }, 429);
    }
  } catch {
    return json({ error: "SMS diagnostic service unavailable" }, 503);
  }

  const smsFrom =
    Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ||
    Deno.env.get("TWILIO_PHONE_NUMBER");
  const waFrom = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

  if (body.message !== undefined && typeof body.message !== "string") {
    return json({ error: "message must be a string" }, 400);
  }
  const message = (body.message ?? "").trim();
  if (message.length > 320) {
    return json({ error: "message must be 320 characters or fewer" }, 400);
  }
  const testMessage =
    message || `Rentmaikar test ${body.channel.toUpperCase()} @ ${new Date().toISOString()}`;

  const params = new URLSearchParams();
  params.append("Body", testMessage);

  if (body.channel === "whatsapp") {
    if (!waFrom) return json({ error: "TWILIO_WHATSAPP_NUMBER not configured" }, 500);
    params.append("From", waFrom.startsWith("whatsapp:") ? waFrom : `whatsapp:${waFrom}`);
    params.append("To", `whatsapp:${body.to}`);
  } else {
    if (!smsFrom) {
      return json({ error: "TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER required" }, 500);
    }
    if (smsFrom.startsWith("MG")) {
      params.append("MessagingServiceSid", smsFrom);
    } else {
      params.append("From", smsFrom);
    }
    params.append("To", body.to);
  }

  params.append("StatusCallback", `${supabaseUrl}/functions/v1/twilio-webhook`);

  const twRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const twBody = await twRes.json().catch(() => ({}));

  // best-effort audit log
  try {
    await admin.from("messaging_events").insert({
      event_type: "test_send",
      channel: body.channel,
      recipient: body.to,
      status: twRes.ok ? "queued" : "failed",
      provider: "twilio",
      provider_message_id: twBody?.sid ?? null,
      metadata: {
        initiated_by: user.id,
        correlation_id: req.headers.get("x-correlation-id"),
        notification_type: "provider_diagnostic",
        twilio_status: twBody?.status,
        twilio_error_code: twBody?.error_code,
        failure_reason: twRes.ok ? null : "provider_rejected",
      },
    });
  } catch (e) {
    console.warn("messaging_events insert failed", e);
  }

  if (!twRes.ok) {
    console.error("Twilio diagnostic send rejected", twRes.status);
    return json(
      { error: "Twilio diagnostic send failed", status: twRes.status },
      twRes.status,
    );
  }

  return json({
    success: true,
    channel: body.channel,
    to: maskPhone(body.to),
    sid: twBody?.sid,
    twilioStatus: twBody?.status,
  });
});
