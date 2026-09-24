/**
 * Twilio VoIP, Voice WebRTC, and Call Center Service for RentMaikar
 *
 * Implements the authoritative server-side engine for:
 * - Twilio Voice WebRTC Access Token minting (HS256 JWT, VoiceGrant)
 * - TwiML outbound dial routing (/api/functions/voice-twiml-dial)
 * - Twilio Call Status Callbacks (/api/functions/voip-status-callback)
 * - Twilio Recording Status Callbacks (/api/functions/recording-status-callback)
 * - Call Recording storage pipeline (Twilio MP3 -> Supabase Storage 'call-recordings' bucket)
 * - Signed playback URL generation (/api/functions/get-recording-url)
 * - Multi-party & 1:1 Call Initiation (/api/functions/initiate-voip-call)
 * - Call Termination (/api/functions/end-voip-call)
 * - TwiML Application configuration sync & verification (/api/functions/voice-twiml-config)
 * - Inbound call routing & browser softphone ring (/api/functions/incoming-call-forward)
 * - Voice Call Request handshakes (/api/functions/voice-call-request)
 * - Outbound caller-ID routing (voip_outbound_numbers, voip_resolve_outbound_number)
 */

import { SignJWT } from "jose";
import pg from "pg";
import { Request } from "express";
import { supabaseBackendService } from "./supabaseService";

let pgPool: pg.Pool | null = null;

function getDbPool(): pg.Pool | null {
  if (!pgPool && process.env.SUPABASE_DB_PASSWORD) {
    try {
      pgPool = new pg.Pool({
        host: "db.jrsydiofzceoeddjogov.supabase.co",
        port: 5432,
        user: "postgres",
        password: process.env.SUPABASE_DB_PASSWORD,
        database: "postgres",
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
      });
    } catch (e: any) {
      console.warn("[VoIP Service] Failed to initialize Postgres pool:", e.message);
    }
  }
  return pgPool;
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function normalizeE164(phone: string): string {
  const cleaned = (phone || "").trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+1${cleaned}`;
  return `+${cleaned}`;
}

function xmlEscape(v: string): string {
  return (v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getBaseCallbackUrl(req?: Request): string {
  if (process.env.PUBLIC_BACKEND_URL) {
    return process.env.PUBLIC_BACKEND_URL.replace(/\/+$/, "");
  }
  if (process.env.VOICE_SUPABASE_URL) {
    // If explicit voice base URL configured
    return process.env.VOICE_SUPABASE_URL.replace(/\/+$/, "");
  }
  if (req) {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "staging.rentmaikar.com";
    return `${proto}://${host}`;
  }
  return "https://staging.rentmaikar.com";
}

// -----------------------------------------------------------------
// Twilio REST API Client Helper with Fallback
// -----------------------------------------------------------------

export async function twilioRequest(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: any; credential?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_SECRET;

  if (!accountSid) {
    return { ok: false, status: 500, data: { message: "TWILIO_ACCOUNT_SID is not configured" } };
  }

  const credentials: Array<{ user: string; pass: string; label: string }> = [];
  if (apiKeySid && apiKeySecret && apiKeySid.startsWith("SK")) {
    credentials.push({ user: apiKeySid, pass: apiKeySecret, label: "api_key" });
  }
  if (accountSid && authToken) {
    credentials.push({ user: accountSid, pass: authToken, label: "auth_token" });
  }

  if (!credentials.length) {
    return {
      ok: false,
      status: 500,
      data: { message: "No valid Twilio credentials (need Auth Token or API Key)" },
    };
  }

  let lastRes: Response | null = null;
  for (const cred of credentials) {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: "Basic " + Buffer.from(`${cred.user}:${cred.pass}`).toString("base64"),
        },
      });
      lastRes = res;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, data, credential: cred.label };
      }
      if (res.status !== 401 && res.status !== 403) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, status: res.status, data, credential: cred.label };
      }
    } catch (e: any) {
      console.warn(`[Twilio Request] Error using ${cred.label}:`, e.message);
    }
  }

  const data = await lastRes?.json().catch(() => ({}));
  return { ok: false, status: lastRes?.status || 500, data };
}

// -----------------------------------------------------------------
// 1. Twilio Voice WebRTC Access Token Minting
// -----------------------------------------------------------------

export async function mintVoiceAccessToken(
  identityParam?: string,
  userToken?: string
): Promise<{
  token: string;
  identity: string;
  ttl: number;
  error?: string;
  details?: string;
}> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  let resolvedIdentity = identityParam;

  if (userToken) {
    try {
      const supabase = supabaseBackendService.getClient();
      const cleanToken = userToken.replace(/^Bearer\s+/i, "").trim();
      const { data: { user }, error } = await supabase.auth.getUser(cleanToken);
      if (!error && user?.id) {
        resolvedIdentity = `user_${user.id}`;
      }
    } catch (e: any) {
      console.warn("[Voice Token] Could not resolve user from token:", e.message);
    }
  }

  if (!resolvedIdentity) {
    resolvedIdentity = `agent_${Math.random().toString(36).slice(2, 9)}`;
  }

  const missing = [
    !accountSid && "TWILIO_ACCOUNT_SID",
    !twimlAppSid && "TWILIO_TWIML_APP_SID",
    !apiKeySid && "TWILIO_API_KEY_SID",
    !apiKeySecret && "TWILIO_API_SECRET",
  ].filter(Boolean);

  if (missing.length && !process.env.TWILIO_AUTH_TOKEN) {
    console.error("[Voice Token] In-app calling is not configured. Missing:", missing);
    return {
      token: "",
      identity: resolvedIdentity,
      ttl: 0,
      error: "In-app calling is not configured",
      details: `Missing: ${missing.join(", ")}`,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const TTL_SECONDS = 3600;

  const signingKey = apiKeySid || accountSid!;
  const signingSecret = apiKeySecret || process.env.TWILIO_AUTH_TOKEN!;

  try {
    const token = await new SignJWT({
      jti: `${signingKey}-${now}`,
      grants: {
        identity: resolvedIdentity,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: twimlAppSid },
        },
      },
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" })
      .setIssuer(signingKey)
      .setSubject(accountSid!)
      .setNotBefore(now)
      .setIssuedAt(now)
      .setExpirationTime(now + TTL_SECONDS)
      .sign(new TextEncoder().encode(signingSecret));

    return { token, identity: resolvedIdentity, ttl: TTL_SECONDS };
  } catch (err: any) {
    console.error("[Voice Token] Failed to sign JWT:", err.message);
    return {
      token: "",
      identity: resolvedIdentity,
      ttl: 0,
      error: "Failed to generate voice access token",
      details: err.message,
    };
  }
}

// -----------------------------------------------------------------
// 2. Caller-ID Resolution (DB or fallback)
// -----------------------------------------------------------------

export async function resolveCallerId(callerUserId?: string | null, region: string = "USA"): Promise<string> {
  const pool = getDbPool();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callerUserId || "");

  if (callerUserId && isUuid && pool) {
    try {
      const res = await pool.query("SELECT public.voip_resolve_outbound_number($1, $2) as num", [
        callerUserId,
        region,
      ]);
      if (res.rows?.[0]?.num) {
        return res.rows[0].num;
      }
    } catch (e: any) {
      console.warn("[VoIP Service] voip_resolve_outbound_number error:", e.message);
    }
  }

  if (pool) {
    try {
      const res = await pool.query(
        "SELECT phone_number FROM public.voip_outbound_numbers WHERE is_active = true ORDER BY is_default DESC, priority ASC LIMIT 1"
      );
      if (res.rows?.[0]?.phone_number) {
        return res.rows[0].phone_number;
      }
    } catch (e: any) {
      console.warn("[VoIP Service] voip_outbound_numbers query error:", e.message);
    }
  }

  return (
    process.env.TWILIO_VOICE_FROM ||
    process.env.TWILIO_OUTBOUND_NUMBER ||
    process.env.TWILIO_PHONE_NUMBER ||
    "+13806003018"
  );
}

// -----------------------------------------------------------------
// 3. TwiML Outbound Dialing Handler (/api/functions/voice-twiml-dial)
// -----------------------------------------------------------------

export async function handleVoiceTwimlDial(params: {
  To?: string;
  From?: string;
  CallSid?: string;
  Region?: string;
  baseUrl: string;
}): Promise<string> {
  const to = String(params.To || "").trim();
  const from = String(params.From || "").trim();
  const callSid = String(params.CallSid || "");
  const region = String(params.Region || "USA");
  const baseUrl = params.baseUrl.replace(/\/+$/, "");

  if (!to) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">No destination was provided for this call.</Say><Hangup/></Response>`;
  }

  // Caller identity user_<uuid>
  const rawCaller = from.startsWith("client:user_")
    ? from.replace("client:user_", "")
    : from.startsWith("user_")
    ? from.replace("user_", "")
    : null;
  const isCallerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCaller || "");
  const callerUserId = isCallerUuid ? rawCaller : null;

  const callerId = await resolveCallerId(callerUserId, region);

  let dialTarget = "";
  if (to.startsWith("client:") || to.startsWith("user_")) {
    const identity = to.replace(/^client:/, "");
    dialTarget = `<Client>${xmlEscape(identity)}</Client>`;
  } else if (to === "support") {
    dialTarget = `<Number>${xmlEscape(callerId)}</Number>`;
  } else {
    const normalizedTo = normalizeE164(to);
    dialTarget = `<Number>${xmlEscape(normalizedTo || to)}</Number>`;
  }

  // Insert initial call record into voip_calls
  const pool = getDbPool();
  let callRecordId: string | null = null;

  if (pool) {
    try {
      const callRes = await pool.query(
        `INSERT INTO public.voip_calls (
          call_sid, initiated_by, call_type, region, status, direction, started_at, created_at, updated_at
        ) VALUES ($1, $2, 'individual', $3, 'in-progress', 'outbound', NOW(), NOW(), NOW())
        ON CONFLICT (call_sid) DO UPDATE SET updated_at = NOW()
        RETURNING id`,
        [callSid || null, callerUserId || null, region]
      );
      callRecordId = callRes.rows?.[0]?.id || null;

      if (callRecordId && to) {
        await pool.query(
          `INSERT INTO public.voip_call_participants (
            call_id, phone_number, participant_type, region, status, joined_at, created_at
          ) VALUES ($1, $2, 'recipient', $3, 'ringing', NOW(), NOW())`,
          [callRecordId, to, region]
        );
      }
    } catch (dbErr: any) {
      console.warn("[Voice Dial] Failed to record call in DB:", dbErr.message);
    }
  }

  const statusCallback = `${baseUrl}/api/functions/voip-status-callback`;
  const recordingCallback = `${baseUrl}/api/functions/recording-status-callback`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" timeout="30"${callerId ? ` callerId="${xmlEscape(callerId)}"` : ""} record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(recordingCallback)}" recordingStatusCallbackEvent="completed" action="${xmlEscape(statusCallback)}" method="POST">
    ${dialTarget}
  </Dial>
</Response>`;

  return twiml;
}

// -----------------------------------------------------------------
// 4. VoIP Status Callback Handler (/api/functions/voip-status-callback)
// -----------------------------------------------------------------

const statusMap: Record<string, string> = {
  queued: "pending",
  ringing: "ringing",
  "in-progress": "in-progress",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  "no-answer": "no-answer",
  canceled: "canceled",
};

export async function handleVoipStatusCallback(body: any): Promise<{
  success: boolean;
  status: string;
  callSid?: string;
  messageSid?: string;
}> {
  const pool = getDbPool();

  // Route: Message Delivery Status (Twilio SMS/WhatsApp)
  const messageSid = body.MessageSid || body.messageSid;
  const messageStatus = body.MessageStatus || body.messageStatus;
  const callSid = body.CallSid || body.callSid;

  if (messageSid && !callSid) {
    if (pool) {
      try {
        await pool.query(
          `UPDATE public.unified_message_log
           SET delivery_status = $1, updated_at = NOW()
           WHERE provider_message_id = $2`,
          [
            messageStatus === "delivered" || messageStatus === "read"
              ? "delivered"
              : messageStatus === "failed" || messageStatus === "undelivered"
              ? "failed"
              : "pending",
            messageSid,
          ]
        );
      } catch (err: any) {
        console.warn("[VoIP Status Callback] Message status update warning:", err.message);
      }
    }
    return { success: true, status: messageStatus, messageSid };
  }

  // Route: Call Status
  const callStatus = String(body.CallStatus || body.callStatus || "").toLowerCase();
  const duration = body.CallDuration || body.callDuration;
  const to = body.To || body.to;
  const recordingUrl = body.RecordingUrl || body.recordingUrl;
  const mappedStatus = statusMap[callStatus] || callStatus || "completed";

  if (callSid && pool) {
    try {
      const isTerminal = ["completed", "failed", "busy", "no-answer", "canceled"].includes(callStatus);
      const durationSec = duration ? parseInt(String(duration), 10) : null;

      await pool.query(
        `UPDATE public.voip_calls
         SET status = $1,
             ended_at = CASE WHEN $2 = true THEN NOW() ELSE ended_at END,
             duration_seconds = COALESCE($3, duration_seconds),
             recording_url = COALESCE($4, recording_url),
             updated_at = NOW()
         WHERE call_sid = $5`,
        [mappedStatus, isTerminal, durationSec, recordingUrl || null, callSid]
      );

      if (to) {
        const participantStatus =
          callStatus === "in-progress"
            ? "connected"
            : callStatus === "completed"
            ? "disconnected"
            : callStatus === "ringing"
            ? "ringing"
            : "failed";

        await pool.query(
          `UPDATE public.voip_call_participants
           SET status = $1,
               left_at = CASE WHEN $2 = true THEN NOW() ELSE left_at END
           WHERE phone_number = $3
             AND call_id IN (SELECT id FROM public.voip_calls WHERE call_sid = $4)`,
          [participantStatus, isTerminal, to, callSid]
        );
      }
    } catch (err: any) {
      console.warn("[VoIP Status Callback] DB update error:", err.message);
    }
  }

  return { success: true, status: mappedStatus, callSid };
}

// -----------------------------------------------------------------
// 5. Recording Status Callback Handler & Storage Pipeline
// -----------------------------------------------------------------

export async function handleRecordingStatusCallback(
  body: any,
  baseUrl: string
): Promise<{ success: boolean; recordingSid?: string; callSid?: string }> {
  const callSid = body.CallSid || body.callSid;
  const recordingSid = body.RecordingSid || body.recordingSid;
  const recordingUrl = body.RecordingUrl || body.recordingUrl;
  const recordingStatus = body.RecordingStatus || body.recordingStatus;
  const recordingDuration = body.RecordingDuration || body.recordingDuration;

  if (!callSid || !recordingSid) {
    return { success: false };
  }

  const pool = getDbPool();
  let callId: string | null = null;

  if (pool) {
    try {
      const callRes = await pool.query("SELECT id FROM public.voip_calls WHERE call_sid = $1", [callSid]);
      callId = callRes.rows?.[0]?.id || null;

      if (callId) {
        const durationSec = recordingDuration ? parseInt(String(recordingDuration), 10) : null;
        await pool.query(
          `UPDATE public.voip_calls
           SET recording_status = $1,
               recording_duration_seconds = COALESCE($2, recording_duration_seconds),
               recording_url = COALESCE($3, recording_url),
               updated_at = NOW()
           WHERE id = $4`,
          [recordingStatus === "completed" ? "pending" : "failed", durationSec, `${recordingUrl}.mp3`, callId]
        );
      }
    } catch (err: any) {
      console.warn("[Recording Callback] DB update error:", err.message);
    }
  }

  if (recordingStatus === "completed" && recordingUrl && callId) {
    // Process recording in background
    processCallRecording({
      callId,
      recordingUrl: `${recordingUrl}.mp3`,
      recordingSid,
    }).catch((err) => console.error("[Recording Pipeline] Processing error:", err));
  }

  return { success: true, recordingSid, callSid };
}

export async function processCallRecording(params: {
  callId: string;
  recordingUrl: string;
  recordingSid: string;
}): Promise<{ success: boolean; filePath?: string; directUrl?: string; error?: string }> {
  const { callId, recordingUrl, recordingSid } = params;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_SECRET;

  const authUser = apiKeySid && apiKeySecret ? apiKeySid : accountSid;
  const authPass = apiKeySid && apiKeySecret ? apiKeySecret : authToken;

  const pool = getDbPool();

  try {
    const fetchHeaders: Record<string, string> = {};
    if (authUser && authPass) {
      fetchHeaders["Authorization"] = "Basic " + Buffer.from(`${authUser}:${authPass}`).toString("base64");
    }

    const audioRes = await fetch(recordingUrl, { headers: fetchHeaders });
    if (!audioRes.ok) {
      throw new Error(`Failed to download recording audio from Twilio (HTTP ${audioRes.status})`);
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const filePath = `${callId}/${Date.now()}_${recordingSid}.mp3`;

    // Attempt to persist in Supabase Storage 'call-recordings' bucket
    const supabase = supabaseBackendService.getClient();
    const { error: uploadError } = await supabase.storage
      .from("call-recordings")
      .upload(filePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.warn("[Recording Storage] Storage upload error, falling back to direct URL:", uploadError.message);
      if (pool) {
        await pool.query(
          `UPDATE public.voip_calls
           SET recording_status = 'ready',
               recording_url = $1,
               recording_size_bytes = $2,
               recording_stored_at = NOW(),
               updated_at = NOW()
           WHERE id = $3`,
          [recordingUrl, audioBuffer.length, callId]
        );
      }
      return { success: true, directUrl: recordingUrl };
    }

    if (pool) {
      await pool.query(
        `UPDATE public.voip_calls
         SET recording_status = 'ready',
             recording_url = $1,
             recording_size_bytes = $2,
             recording_stored_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        [filePath, audioBuffer.length, callId]
      );
    }

    return { success: true, filePath };
  } catch (err: any) {
    console.error("[Process Recording] Error:", err.message);
    if (pool) {
      await pool.query(
        `UPDATE public.voip_calls
         SET recording_status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [callId]
      ).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

// -----------------------------------------------------------------
// 6. Get Recording Playback URL (/api/functions/get-recording-url)
// -----------------------------------------------------------------

export async function handleGetRecordingUrl(
  body: any,
  userToken?: string
): Promise<{ success: boolean; url: string; expiresIn?: number; error?: string }> {
  const callId = body.callId || body.call_id;
  const recordingSid = body.recordingSid || body.recording_sid;

  if (!callId && !recordingSid) {
    return { success: false, url: "", error: "Missing callId or recordingSid" };
  }

  const pool = getDbPool();
  let recordingPathOrUrl = "";
  let recordingStatus = "";

  if (pool) {
    try {
      const res = await pool.query(
        "SELECT recording_url, recording_status FROM public.voip_calls WHERE id = $1 OR call_sid = $2 LIMIT 1",
        [callId || null, recordingSid || null]
      );
      if (res.rows?.[0]) {
        recordingPathOrUrl = res.rows[0].recording_url || "";
        recordingStatus = res.rows[0].recording_status || "";
      }
    } catch (e: any) {
      console.warn("[Get Recording URL] DB error:", e.message);
    }
  }

  if (!recordingPathOrUrl) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    if (accountSid && recordingSid) {
      return {
        success: true,
        url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`,
        expiresIn: 3600,
      };
    }
    return { success: false, url: "", error: "Recording not found or not yet available" };
  }

  // If already an absolute HTTP URL, return directly
  if (recordingPathOrUrl.startsWith("http://") || recordingPathOrUrl.startsWith("https://")) {
    return { success: true, url: recordingPathOrUrl, expiresIn: 3600 };
  }

  // Generate signed URL from Supabase Storage 'call-recordings'
  try {
    const supabase = supabaseBackendService.getClient();
    const { data, error } = await supabase.storage
      .from("call-recordings")
      .createSignedUrl(recordingPathOrUrl, 3600);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Failed to create signed URL");
    }

    return { success: true, url: data.signedUrl, expiresIn: 3600 };
  } catch (err: any) {
    console.error("[Get Recording URL] Storage error:", err.message);
    return { success: false, url: "", error: err.message };
  }
}

// -----------------------------------------------------------------
// 7. Initiate Multi-party / 1:1 VoIP Call (/api/functions/initiate-voip-call)
// -----------------------------------------------------------------

export async function handleInitiateVoipCall(
  body: any,
  baseUrl: string,
  userToken?: string
): Promise<{
  success: boolean;
  callId: string;
  results: Array<{ recipient: string; success: boolean; callSid?: string; error?: string }>;
  conferenceName?: string | null;
}> {
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  if (!recipients.length) {
    throw new Error("At least one recipient is required");
  }

  const callType = body.callType === "group" || recipients.length > 1 ? "group" : "individual";
  const region = body.region || "USA";
  const isConference = callType === "group";
  const callResults: Array<{ recipient: string; success: boolean; callSid?: string; error?: string }> = [];

  let callerUserId: string | null = null;
  if (userToken) {
    try {
      const supabase = supabaseBackendService.getClient();
      const cleanToken = userToken.replace(/^Bearer\s+/i, "").trim();
      const { data: { user } } = await supabase.auth.getUser(cleanToken);
      callerUserId = user?.id || null;
    } catch {}
  }

  const pool = getDbPool();
  let callRecordId: string | null = null;

  if (pool) {
    try {
      const callRes = await pool.query(
        `INSERT INTO public.voip_calls (
          call_type, region, status, direction, initiated_by, started_at, created_at, updated_at
        ) VALUES ($1, $2, 'pending', 'outbound', $3, NOW(), NOW(), NOW())
        RETURNING id`,
        [callType, region, callerUserId]
      );
      callRecordId = callRes.rows?.[0]?.id || null;
    } catch (e: any) {
      console.warn("[Initiate Call] DB error:", e.message);
    }
  }

  const callId = callRecordId || `call_${Date.now()}`;
  const conferenceName = isConference ? `RentMaikar_${callId}` : null;
  const callerId = await resolveCallerId(callerUserId, region);
  const statusCallback = `${baseUrl}/api/functions/voip-status-callback`;
  const recordingCallback = `${baseUrl}/api/functions/recording-status-callback`;

  for (const recipient of recipients) {
    const rawPhone = recipient.phoneNumber || recipient.phone || "";
    const to = normalizeE164(rawPhone);

    if (!to) {
      callResults.push({ recipient: rawPhone, success: false, error: "Invalid phone number" });
      continue;
    }

    const twiml = isConference
      ? `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceName}</Conference></Dial></Response>`
      : `<Response><Say voice="alice">Connecting you to RentMaikar verified support.</Say><Dial timeout="30" callerId="${xmlEscape(callerId)}"><Number>${xmlEscape(to)}</Number></Dial></Response>`;

    const formParams = new URLSearchParams();
    formParams.append("To", to);
    formParams.append("From", callerId);
    formParams.append("Twiml", twiml);
    formParams.append("Record", "true");
    formParams.append("RecordingStatusCallback", recordingCallback);
    formParams.append("RecordingStatusCallbackEvent", "completed");
    formParams.append("StatusCallback", statusCallback);
    formParams.append("StatusCallbackEvent", "initiated ringing answered completed");

    const twilioRes = await twilioRequest("/Calls.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formParams.toString(),
    });

    if (twilioRes.ok) {
      const sid = twilioRes.data?.sid;
      callResults.push({ recipient: to, success: true, callSid: sid });

      if (pool && callRecordId) {
        await pool.query(
          `INSERT INTO public.voip_call_participants (
            call_id, phone_number, participant_type, display_name, region, status, joined_at, created_at
          ) VALUES ($1, $2, 'recipient', $3, $4, 'ringing', NOW(), NOW())`,
          [callRecordId, to, recipient.displayName || null, region]
        ).catch(() => {});

        await pool.query(
          `UPDATE public.voip_calls SET call_sid = COALESCE(call_sid, $1), status = 'ringing' WHERE id = $2`,
          [sid, callRecordId]
        ).catch(() => {});
      }
    } else {
      callResults.push({
        recipient: to,
        success: false,
        error: twilioRes.data?.message || "Twilio call initiation failed",
      });
    }
  }

  const anySuccess = callResults.some((r) => r.success);
  return {
    success: anySuccess,
    callId,
    results: callResults,
    conferenceName,
  };
}

// -----------------------------------------------------------------
// 8. End VoIP Call (/api/functions/end-voip-call)
// -----------------------------------------------------------------

export async function handleEndVoipCall(
  body: any,
  userToken?: string
): Promise<{ success: boolean; message: string; callId?: string }> {
  const callId = body.callId || body.call_id;
  const requestedCallSid = body.callSid || body.call_sid;
  const reconcileOnly = body.reconcileOnly === true;

  const pool = getDbPool();
  let targetSid = requestedCallSid;

  // Resolve the authoritative Twilio Call SID from the local record when
  // the caller supplied only the Rentmaikar call ID.
  if (!targetSid && callId && pool) {
    try {
      const res = await pool.query(
        `SELECT call_sid
         FROM public.voip_calls
         WHERE id = $1
         LIMIT 1`,
        [callId]
      );

      targetSid = res.rows?.[0]?.call_sid || undefined;
    } catch (e: any) {
      console.warn("[End Call] Failed to resolve Call SID:", e.message);
    }
  }

  if (!targetSid) {
    return {
      success: false,
      message: "No authoritative Twilio Call SID is available for this call",
      callId,
    };
  }

  const terminalStatuses = new Set([
    "completed",
    "busy",
    "failed",
    "no-answer",
    "canceled",
  ]);

  const mapProviderStatus = (status: string): string => {
    if (status === "queued" || status === "ringing") return "ringing";
    if (status === "in-progress") return "in-progress";
    if (status === "completed") return "completed";
    if (status === "busy") return "busy";
    if (status === "failed") return "failed";
    if (status === "no-answer") return "no-answer";
    if (status === "canceled") return "canceled";
    return "in-progress";
  };

  // First ask Twilio for the authoritative provider state.
  let providerStatus: string;

  try {
    const lookup = await twilioRequest(`/Calls/${targetSid}.json`, {
      method: "GET",
    });

    // A missing provider call means the local record is stale. Reconcile it
    // as failed rather than falsely claiming that an active call was ended.
    if (lookup.status === 404) {
      if (pool && callId) {
        try {
          await pool.query(
            `UPDATE public.voip_calls
             SET status = 'failed',
                 ended_at = COALESCE(ended_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1`,
            [callId]
          );
        } catch (e: any) {
          console.warn(
            "[End Call] Failed to reconcile missing Twilio call:",
            e.message
          );
        }
      }

      return {
        success: true,
        message: "Twilio call no longer exists; local call record reconciled",
        callId,
      };
    }

    if (!lookup.ok) {
      return {
        success: false,
        message: `Unable to verify Twilio call state (HTTP ${lookup.status})`,
        callId,
      };
    }

    providerStatus = String(lookup.data?.status || "").toLowerCase();

    if (!providerStatus) {
      return {
        success: false,
        message: "Twilio returned no call status",
        callId,
      };
    }
  } catch (e: any) {
    console.warn("[End Call] Twilio state lookup error:", e.message);

    return {
      success: false,
      message: "Unable to verify the call with Twilio",
      callId,
    };
  }

  // If Twilio already considers the call terminal, synchronize the local
  // record and do not send another termination request.
  if (terminalStatuses.has(providerStatus)) {
    const localStatus = mapProviderStatus(providerStatus);

    if (pool && (callId || targetSid)) {
      try {
        await pool.query(
          `UPDATE public.voip_calls
           SET status = $1,
               ended_at = COALESCE(ended_at, NOW()),
               updated_at = NOW()
           WHERE ($2::uuid IS NOT NULL AND id = $2)
              OR ($3::text IS NOT NULL AND call_sid = $3)`,
          [localStatus, callId || null, targetSid || null]
        );
      } catch (e: any) {
        console.warn(
          "[End Call] Failed to synchronize terminal call state:",
          e.message
        );
      }
    }

    return {
      success: true,
      message: `Call already ended at Twilio with status: ${providerStatus}`,
      callId,
    };
  }

  // Reconciliation mode must never terminate a live provider call.
  if (reconcileOnly) {
    return {
      success: true,
      message: `Call is still active at Twilio with status: ${providerStatus}`,
      callId,
    };
  }

  // The provider confirms that the call is still live. Request termination.
  try {
    const formParams = new URLSearchParams();
    formParams.append("Status", "completed");

    const termination = await twilioRequest(`/Calls/${targetSid}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formParams.toString(),
    });

    // Never mutate local state when Twilio rejects the termination request.
    if (!termination.ok) {
      console.warn(
        `[End Call] Twilio termination rejected: HTTP ${termination.status}`
      );

      return {
        success: false,
        message: `Twilio rejected call termination (HTTP ${termination.status})`,
        callId,
      };
    }

    // Verify the provider's resulting state before declaring the local call
    // completed. This prevents a successful HTTP request from creating a
    // false "completed" state if Twilio has not actually transitioned yet.
    const confirmation = await twilioRequest(`/Calls/${targetSid}.json`, {
      method: "GET",
    });

    if (!confirmation.ok) {
      return {
        success: false,
        message: `Call termination was requested, but Twilio state could not be confirmed (HTTP ${confirmation.status})`,
        callId,
      };
    }

    const confirmedStatus = String(
      confirmation.data?.status || ""
    ).toLowerCase();

    if (!terminalStatuses.has(confirmedStatus)) {
      return {
        success: false,
        message: `Twilio has not confirmed call termination; current status: ${confirmedStatus || "unknown"}`,
        callId,
      };
    }

    const localStatus = mapProviderStatus(confirmedStatus);

    // Only now is it safe to synchronize the local database with the
    // provider-confirmed terminal state.
    if (pool && (callId || targetSid)) {
      try {
        await pool.query(
          `UPDATE public.voip_calls
           SET status = $1,
               ended_at = COALESCE(ended_at, NOW()),
               updated_at = NOW()
           WHERE ($2::uuid IS NOT NULL AND id = $2)
              OR ($3::text IS NOT NULL AND call_sid = $3)`,
          [localStatus, callId || null, targetSid || null]
        );
      } catch (e: any) {
        console.warn(
          "[End Call] Failed to update local terminal state:",
          e.message
        );

        return {
          success: false,
          message: "Twilio ended the call, but local state synchronization failed",
          callId,
        };
      }
    }

    return {
      success: true,
      message: `Call ended successfully; Twilio confirmed status: ${confirmedStatus}`,
      callId,
    };
  } catch (e: any) {
    console.warn("[End Call] Twilio REST API termination error:", e.message);

    // Critical: do NOT mark the local record completed when provider
    // termination could not be confirmed.
    return {
      success: false,
      message: "Unable to terminate the call with Twilio",
      callId,
    };
  }
}

// -----------------------------------------------------------------
// 9. TwiML App Config Verification & Sync (/api/functions/voice-twiml-config)
// -----------------------------------------------------------------

export async function handleVoiceTwimlConfig(
  body: any,
  baseUrl: string
): Promise<any> {
  const action = body.action || "verify";
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMBER_USA || "+13806003018";

  const expected = {
    voiceUrl: `${baseUrl}/api/functions/voice-twiml-dial`,
    statusCallbackUrl: `${baseUrl}/api/functions/voip-status-callback`,
    recordingCallbackUrl: `${baseUrl}/api/functions/recording-status-callback`,
    accessTokenUrl: `${baseUrl}/api/functions/voice-access-token`,
    incomingCallUrl: `${baseUrl}/api/functions/incoming-call-forward`,
  };

  const secrets = {
    hasAccountSid: Boolean(accountSid),
    hasAuthToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
    hasApiKeySid: Boolean(process.env.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY),
    hasApiKeySecret: Boolean(process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_SECRET),
    hasTwimlAppSid: Boolean(twimlAppSid),
    accountSidPrefix: accountSid ? `${accountSid.slice(0, 6)}...` : undefined,
    twimlAppSidPrefix: twimlAppSid ? `${twimlAppSid.slice(0, 6)}...` : undefined,
  };

  if (!twimlAppSid || !accountSid) {
    return {
      expected,
      secrets,
      twimlApp: null,
      matches: false,
      error: "Twilio credentials or TWILIO_TWIML_APP_SID are missing from environment",
    };
  }

  // Action: Apply configuration to Twilio TwiML App
  if (action === "apply") {
    const params = new URLSearchParams();
    params.append("VoiceUrl", expected.voiceUrl);
    params.append("VoiceMethod", "POST");
    params.append("StatusCallback", expected.statusCallbackUrl);
    params.append("StatusCallbackMethod", "POST");

    const updateRes = await twilioRequest(`/Applications/${twimlAppSid}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    return {
      action: "apply",
      success: updateRes.ok,
      expected,
      secrets,
      data: updateRes.data,
    };
  }

  // Action: Apply incoming number voice webhook
  if (action === "apply-number") {
    const phoneRes = await twilioRequest(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(twilioPhoneNumber)}`);
    const numSid = phoneRes.data?.incoming_phone_numbers?.[0]?.sid;

    if (numSid) {
      const params = new URLSearchParams();
      params.append("VoiceUrl", expected.incomingCallUrl);
      params.append("VoiceMethod", "POST");

      const updateRes = await twilioRequest(`/IncomingPhoneNumbers/${numSid}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      return {
        action: "apply-number",
        success: updateRes.ok,
        expected,
        numberSid: numSid,
        data: updateRes.data,
      };
    }
  }

  // Default: Verify configuration
  const appRes = await twilioRequest(`/Applications/${twimlAppSid}.json`);
  const appData = appRes.data || {};

  const matches =
    appRes.ok &&
    Boolean(appData.voice_url && appData.voice_url.includes("/api/functions/voice-twiml-dial"));

  return {
    expected,
    secrets,
    twimlApp: {
      sid: twimlAppSid,
      friendlyName: appData.friendly_name,
      voiceUrl: appData.voice_url,
      voiceMethod: appData.voice_method,
      statusCallback: appData.status_callback,
    },
    matches,
    outgoingNumber: twilioPhoneNumber,
    callerId: await resolveCallerId(),
  };
}

// -----------------------------------------------------------------
// 10. Incoming Call Forwarding (/api/functions/incoming-call-forward)
// -----------------------------------------------------------------

export async function handleIncomingCallForward(params: {
  form: any;
  query: any;
  baseUrl: string;
}): Promise<string> {
  const { form, query, baseUrl } = params;
  const from = String(form.From || form.from || "").trim();
  const to = String(form.To || form.to || "").trim();
  const callSid = String(form.CallSid || form.callSid || "");
  const region = String(form.Region || form.region || "USA");

  const pool = getDbPool();

  // Stage 2: In-app softphone agents did not answer
  if (query.stage === "agents") {
    const dialStatus = String(form.DialCallStatus || "").toLowerCase();
    if (dialStatus === "completed" || dialStatus === "answered") {
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    }
    // Fall back to forwarding destination or voicemail
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling RentMaikar. All agents are currently assisting other customers. Please leave a message after the tone.</Say>
  <Record timeout="10" maxLength="120" action="${xmlEscape(baseUrl)}/api/functions/voip-status-callback" method="POST"/>
  <Hangup/>
</Response>`;
  }

  // Stage 1: Register call and ring online available agents in-app
  if (callSid && pool) {
    try {
      await pool.query(
        `INSERT INTO public.voip_calls (
          call_sid, call_type, direction, status, region, started_at, created_at, updated_at
        ) VALUES ($1, 'individual', 'inbound', 'ringing', $2, NOW(), NOW(), NOW())
        ON CONFLICT (call_sid) DO UPDATE SET updated_at = NOW()`,
        [callSid, region]
      );
    } catch {}
  }

  // Query online agents from voip_agent_presence (seen in last 90 seconds)
  let onlineAgents: string[] = [];
  if (pool) {
    try {
      const presenceRes = await pool.query(
        `SELECT user_id, identity FROM public.voip_agent_presence
         WHERE status = 'available'
           AND last_seen_at >= NOW() - INTERVAL '90 seconds'
         LIMIT 5`
      );
      onlineAgents = presenceRes.rows.map((r) => r.identity || `user_${r.user_id}`);
    } catch (e: any) {
      console.warn("[Incoming Call] Presence query warning:", e.message);
    }
  }

  if (onlineAgents.length) {
    const clientTags = onlineAgents.map((id) => `<Client>${xmlEscape(id)}</Client>`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="${xmlEscape(baseUrl)}/api/functions/incoming-call-forward?stage=agents" method="POST" timeout="20">
    ${clientTags}
  </Dial>
</Response>`;
  }

  // No agents online: default voicemail / greeting
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling RentMaikar verified support. Please hold while we connect your call.</Say>
  <Dial timeout="30"><Number>+13806003018</Number></Dial>
  <Say voice="alice">No agent is available right now. Please leave a voicemail after the tone.</Say>
  <Record timeout="10" maxLength="120"/>
  <Hangup/>
</Response>`;
}

// -----------------------------------------------------------------
// 11. Voice Call Requests (/api/functions/voice-call-request)
// -----------------------------------------------------------------

export async function handleVoiceCallRequest(
  body: any,
  userToken?: string
): Promise<any> {
  const action = body.action || "create";
  const pool = getDbPool();

  let resolvedUserId: string | null = null;
  if (userToken) {
    try {
      const supabase = supabaseBackendService.getClient();
      const cleanToken = userToken.replace(/^Bearer\s+/i, "").trim();
      const { data: { user } } = await supabase.auth.getUser(cleanToken);
      resolvedUserId = user?.id || null;
    } catch {}
  }

  if (action === "create" && pool) {
    const requesterId = resolvedUserId || body.requesterId || body.userId;
    const reqRole = body.callerRole || body.userRole || "driver";
    const targetRole = body.targetRole || "admin";
    const reason = body.reason || "General support inquiry";
    const region = body.region || "USA";

    try {
      const res = await pool.query(
        `INSERT INTO public.voice_call_requests (
          requester_id, requester_role, target_role, reason, region, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
        RETURNING *`,
        [requesterId, reqRole, targetRole, reason, region]
      );
      return { success: true, request: res.rows?.[0] };
    } catch (e: any) {
      console.warn("[Voice Call Request] DB error:", e.message);
    }
  }

  if (action === "accept" && body.requestId && pool) {
    try {
      await pool.query(
        "UPDATE public.voice_call_requests SET status = 'accepted', assigned_to = $1 WHERE id = $2",
        [resolvedUserId, body.requestId]
      );
      return { success: true, status: "accepted", requestId: body.requestId };
    } catch {}
  }

  if (action === "reject" && body.requestId && pool) {
    try {
      await pool.query(
        "UPDATE public.voice_call_requests SET status = 'rejected' WHERE id = $1",
        [body.requestId]
      );
      return { success: true, status: "rejected", requestId: body.requestId };
    } catch {}
  }

  return { success: true, action };
}

// -----------------------------------------------------------------
// 12. VoIP Call Transcript Log (/api/functions/voip-call-transcript-log)
// -----------------------------------------------------------------

export async function handleVoipCallTranscriptLog(
  body: any,
  userToken?: string
): Promise<any> {
  const pool = getDbPool();
  if (!pool || !body.callId) {
    return { success: false, error: "Missing callId or DB connection" };
  }

  try {
    const res = await pool.query(
      `INSERT INTO public.voip_call_transcripts (
        call_id, segment_index, speaker, transcript_text, language_code, source, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'call_center', NOW())
      RETURNING id`,
      [
        body.callId,
        body.segmentIndex || 0,
        body.speaker || "agent",
        body.transcriptText || body.text || "",
        body.languageCode || "en-US",
      ]
    );
    return { success: true, transcriptId: res.rows?.[0]?.id };
  } catch (err: any) {
    console.warn("[Transcript Log] DB error:", err.message);
    return { success: false, error: err.message };
  }
}
