// Custom phone OTP sign-up / sign-in.
// SMS is delivered via Termii for Nigerian numbers (+234) and Twilio elsewhere.
// The verify step returns a one-time `token_hash` the browser exchanges for a
// real Supabase session — no password is created or overwritten.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaSent } from "../_shared/sent-client.ts";
import { twilioMessagingEnabled } from "../_shared/twilio-messaging-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const PHONE_EMAIL_DOMAIN = "phone.rentmaikar.com";

async function sha256(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function syntheticEmail(phone: string) {
  return `phone${phone.replace(/\D/g, "")}@${PHONE_EMAIL_DOMAIN}`;
}

async function sendViaTermii(to: string, body: string) {
  const apiKey = Deno.env.get("TERMII_API_KEY");
  const sender = Deno.env.get("TERMII_SENDER_ID") ?? "Rentmaikar";
  if (!apiKey) throw new Error("Termii is not configured (missing TERMII_API_KEY)");
  const res = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: to.replace(/^\+/, ""),
      from: sender,
      sms: body,
      type: "plain",
      channel: "generic",
      api_key: apiKey,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Termii error [${res.status}]: ${text}`);
  // Termii reports some failures inside a 200 body.
  try {
    const parsed = JSON.parse(text);
    if (parsed?.code && parsed.code !== "ok" && parsed?.message_id === undefined) {
      throw new Error(`Termii error: ${parsed.message ?? parsed.code}`);
    }
  } catch (_) { /* non-JSON success body */ }
}

async function sendViaTwilio(to: string, body: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const twilioKey = Deno.env.get("TWILIO_API_KEY");
  const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER") ?? Deno.env.get("TWILIO_FROM");
  if (!lovableKey || !twilioKey || (!from && !messagingServiceSid)) {
    throw new Error(
      "SMS is not configured (missing TWILIO_API_KEY, TWILIO_PHONE_NUMBER/TWILIO_MESSAGING_SERVICE_SID, or LOVABLE_API_KEY)",
    );
  }
  const params = new URLSearchParams({ To: to, Body: body });
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", from!);

  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Twilio request failed [${res.status}]: ${errBody}`);
    throw new Error(`Could not send the SMS (provider status ${res.status})`);
  }
}

async function sendSms(to: string, body: string) {
  if (to.startsWith("+234") && Deno.env.get("TERMII_API_KEY")) {
    await sendViaTermii(to, body);
    return "termii";
  }
  // Twilio is approved for VoIP voice only — SMS goes via Sent.dm.
  // (The legacy sendViaTwilio path stays below for when/if messaging approval lands.)
  if (twilioMessagingEnabled()) {
    await sendViaTwilio(to, body);
    return "twilio";
  }
  const sent = await sendViaSent({
    to,
    channel: "sms",
    text: body,
    metadata: { notification_type: "phone_otp" },
  });
  if (!sent.ok) {
    throw new Error(`Could not send the SMS (Sent.dm: ${sent.error ?? "unavailable"})`);
  }
  return "sent";
}

/** Resolve an existing auth user for this phone, via profiles first then auth. */
async function findUserIdByPhone(admin: any, phone: string): Promise<string | null> {
  const bare = phone.replace(/^\+/, "");
  const { data: profileRow } = await admin
    .from("profiles")
    .select("user_id")
    .in("phone", [phone, bare])
    .limit(1)
    .maybeSingle();
  if (profileRow?.user_id) return profileRow.user_id;

  // Fall back to a paginated scan of auth users (phone stored without '+').
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users ?? [];
    const hit = users.find((u: any) => u.phone === bare || u.phone === phone);
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, phone, code, full_name, role } = await req.json();
    if (!phone || typeof phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(phone)) {
      return jsonRes({ error: "Phone must be in international format, e.g. +2348012345678" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Resolve the caller when the request is made from a signed-in session.
    // Used by the "add a phone number to my existing account" flow.
    const authedUserId = async (): Promise<string | null> => {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) return null;
      const { data, error } = await admin.auth.getUser(jwt);
      if (error) return null;
      return data?.user?.id ?? null;
    };

    if (action === "link_send" || action === "link_verify") {
      const callerId = await authedUserId();
      if (!callerId) return jsonRes({ error: "You must be signed in to add a phone number." }, 401);

      // The number must not already belong to a different account.
      const ownerId = await findUserIdByPhone(admin, phone);
      if (ownerId && ownerId !== callerId) {
        return jsonRes(
          { error: "That phone number is already linked to another account." },
          409,
        );
      }

      if (action === "link_verify") {
        if (!code || typeof code !== "string") return jsonRes({ error: "Missing code" }, 400);
        const code_hash = await sha256(code);
        const { data: rows, error: readErr } = await admin
          .from("phone_otp_codes")
          .select("*")
          .eq("phone", phone)
          .is("consumed_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1);
        if (readErr) throw readErr;
        const row = rows?.[0];
        if (!row) return jsonRes({ error: "That code has expired. Please request a new one." }, 400);
        if ((row.attempts ?? 0) >= 5) {
          return jsonRes({ error: "Too many incorrect attempts. Request a new code." }, 429);
        }
        if (row.code_hash !== code_hash) {
          await admin.from("phone_otp_codes")
            .update({ attempts: (row.attempts ?? 0) + 1 }).eq("id", row.id);
          return jsonRes({ error: "Incorrect code" }, 400);
        }
        await admin.from("phone_otp_codes")
          .update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

        // Attach the verified number to the EXISTING account — no new user,
        // no new profile, no session change.
        const { error: updErr } = await admin.auth.admin.updateUserById(callerId, {
          phone,
          phone_confirm: true,
        } as any);
        if (updErr) throw updErr;

        const { error: profErr } = await admin
          .from("profiles")
          .update({ phone, phone_verified: true })
          .eq("user_id", callerId);
        if (profErr) console.error("profile phone link failed:", profErr.message);

        return jsonRes({ success: true, linked: true, user_id: callerId });
      }
      // link_send falls through to the shared send path below.
    }

    if (action === "send" || action === "link_send") {

      // Rate limit: max 3 in the last 10 minutes per phone.
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count } = await admin
        .from("phone_otp_codes")
        .select("*", { count: "exact", head: true })
        .eq("phone", phone)
        .gte("created_at", since);
      if ((count ?? 0) >= 3) {
        return jsonRes({ error: "Too many code requests. Please wait a few minutes." }, 429);
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const code_hash = await sha256(otp);
      const expires_at = new Date(Date.now() + 5 * 60_000).toISOString();

      const { error: insertErr } = await admin.from("phone_otp_codes").insert({
        phone, code_hash, channel: "sms", expires_at,
      });
      if (insertErr) throw insertErr;

      const via = await sendSms(
        phone,
        `Your Rentmaikar verification code is ${otp}. It expires in 5 minutes.`,
      );
      return jsonRes({ success: true, provider: via });
    }

    if (action === "verify") {
      if (!code || typeof code !== "string") return jsonRes({ error: "Missing code" }, 400);

      const code_hash = await sha256(code);
      const { data: rows, error: readErr } = await admin
        .from("phone_otp_codes")
        .select("*")
        .eq("phone", phone)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (readErr) throw readErr;
      const row = rows?.[0];
      if (!row) return jsonRes({ error: "That code has expired. Please request a new one." }, 400);
      if ((row.attempts ?? 0) >= 5) {
        return jsonRes({ error: "Too many incorrect attempts. Request a new code." }, 429);
      }
      if (row.code_hash !== code_hash) {
        await admin.from("phone_otp_codes")
          .update({ attempts: (row.attempts ?? 0) + 1 }).eq("id", row.id);
        return jsonRes({ error: "Incorrect code" }, 400);
      }
      await admin.from("phone_otp_codes")
        .update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

      let userId = await findUserIdByPhone(admin, phone);
      let isNew = false;

      if (!userId) {
        isNew = true;
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          phone,
          phone_confirm: true,
          email: syntheticEmail(phone),
          email_confirm: true,
          user_metadata: { full_name: full_name ?? null, signup_method: "phone_otp" },
        });
        if (createErr) throw createErr;
        userId = created.user?.id ?? null;
      }
      if (!userId) return jsonRes({ error: "Could not resolve the account for this number" }, 500);

      // Make sure the account carries a confirmed phone and an email we can
      // mint a session link against (phone-only accounts get a synthetic one).
      const { data: fetched } = await admin.auth.admin.getUserById(userId);
      let signInEmail = fetched?.user?.email ?? null;
      const patch: Record<string, unknown> = {};
      if (!signInEmail) {
        signInEmail = syntheticEmail(phone);
        patch.email = signInEmail;
        patch.email_confirm = true;
      }
      if (!fetched?.user?.phone_confirmed_at) {
        patch.phone = phone;
        patch.phone_confirm = true;
      }
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, patch as any);
        if (updErr) throw updErr;
      }

      // Profile / role / wallet provisioning (idempotent).
      const requestedRole = ["driver", "owner"].includes(role) ? role : "driver";
      const { error: provErr } = await admin.rpc("provision_user_account", {
        _user_id: userId,
        _role: requestedRole,
        _email: signInEmail,
      });
      if (provErr) console.error("provision_user_account failed:", provErr.message);

      const profilePatch: Record<string, unknown> = { phone, phone_verified: true };
      if (isNew && full_name) profilePatch.full_name = full_name;
      const { error: profErr } = await admin
        .from("profiles").update(profilePatch).eq("user_id", userId);
      if (profErr) console.error("profile phone update failed:", profErr.message);

      // Mint a one-time token the browser exchanges for a session. This never
      // touches the user's password and works for existing email accounts too.
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: signInEmail!,
      });
      if (linkErr || !link?.properties?.hashed_token) {
        console.error("generateLink failed:", linkErr?.message);
        return jsonRes({ error: "Verified, but the session could not be created. Please try again." }, 500);
      }

      return jsonRes({
        success: true,
        user_id: userId,
        is_new_user: isNew,
        token_hash: link.properties.hashed_token,
      });
    }

    return jsonRes({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("phone-otp-custom error:", e?.message ?? e);
    return jsonRes({ error: e?.message ?? String(e) }, 500);
  }
});
