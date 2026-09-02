import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, tooMany } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Strict E.164: leading '+', country code starts 1-9, total 8-16 chars.
const phoneSchema = z
  .string()
  .min(8)
  .max(16)
  .regex(/^\+[1-9]\d{6,14}$/, "Phone must be normalized E.164 (e.g. +15551234567)");

const sendCodeSchema = z.object({
  action: z.literal("send_code"),
  phone: phoneSchema,
  channel: z.enum(["sms", "whatsapp", "voice"]),
});

const verifyCodeSchema = z.object({
  action: z.literal("verify_code"),
  phone: phoneSchema,
  code: z.string().length(6).regex(/^\d{6}$/, "Code must be 6 digits"),
});

const requestSchema = z.discriminatedUnion("action", [
  sendCodeSchema,
  verifyCodeSchema,
]);

const generateVerificationCode = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

/** Place a Twilio voice call reading the verification code twice. */
async function placeVoiceCall(phoneE164: string, code: string): Promise<void> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber =
    Deno.env.get("TWILIO_PHONE_NUMBER") || Deno.env.get("TWILIO_VOICE_FROM");
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Voice channel not configured (missing Twilio credentials)");
  }
  // Space digits so TTS reads them one-by-one.
  const spoken = code.split("").join(" ");
  const twiml =
    `<Response>` +
    `<Say voice="alice">Your RentMaikar verification code is: <break time="400ms"/>${spoken}. ` +
    `I will repeat that. <break time="500ms"/>${spoken}. Thank you.</Say>` +
    `</Response>`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const body = new URLSearchParams();
  body.append("To", phoneE164);
  body.append("From", fromNumber);
  body.append("Twiml", twiml);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Voice call failed [${resp.status}]: ${text}`);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const rawBody = await req.json();
    const parseResult = requestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request data",
          details: parseResult.error.errors.map((e) => e.message),
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    const body = parseResult.data;
    const cleanPhone = body.phone.replace(/\s/g, "");

    if (body.action === "send_code") {
      // Per-user send rate limit: max 3 code requests / minute.
      const rl = await checkRateLimit(
        `phone-send:${user.id}`,
        "verify-phone",
        3,
      );
      if (!rl.allowed) {
        return tooMany(rl.retry_after_seconds, {
          message: `Too many verification requests. Try again in ${rl.retry_after_seconds}s.`,
        });
      }
      // Per-phone spam guard (protects victims from dial-abuse across accounts).
      const phoneRl = await checkRateLimit(
        `phone-target:${cleanPhone}`,
        "verify-phone",
        5,
      );
      if (!phoneRl.allowed) {
        return tooMany(phoneRl.retry_after_seconds, {
          message: "This number has received too many verification attempts recently.",
        });
      }

      // Pre-flight: the number must not already belong to a different account
      // (profiles_phone_unique). Fail with a clear message instead of a raw
      // duplicate-key error, and before we spend an SMS/voice credit.
      const { data: phoneOwner } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("phone", cleanPhone)
        .neq("user_id", user.id)
        .maybeSingle();
      if (phoneOwner) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "That phone number is already linked to another account. Use a different number, or contact support if it belongs to you.",
            code: "phone_taken",
          }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const code = generateVerificationCode();
      const hashedCode = bcrypt.hashSync(code);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          phone: cleanPhone,
          phone_verification_code: hashedCode,
          phone_verification_expires_at: expiresAt.toISOString(),
          phone_verified: false,
        })
        .eq("user_id", user.id);
      if (updateError) {
        console.error("Error storing verification code:", updateError);
        if (
          updateError.code === "23505" ||
          /profiles_phone_unique/i.test(updateError.message ?? "")
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              error:
                "That phone number is already linked to another account. Use a different number, or contact support if it belongs to you.",
              code: "phone_taken",
            }),
            { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
        throw new Error("Failed to initiate verification");
      }

      if (body.channel === "voice") {
        await placeVoiceCall(cleanPhone, code);
      } else {
        const smsResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-sms-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              phone: cleanPhone,
              channel: body.channel,
              notificationType: "verification_code",
              verificationCode: code,
            }),
          },
        );
        const smsResult = await smsResponse.json();
        if (!smsResult.success) {
          console.error("Failed to send verification code:", smsResult.error);
          throw new Error("Failed to send verification code");
        }
      }

      console.log(
        `Verification code delivered to ${cleanPhone} via ${body.channel}`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Verification code delivered via ${body.channel}`,
          expiresIn: 300,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (body.action === "verify_code") {
      const verifyRl = await checkRateLimit(
        `phone-verify:${user.id}`,
        "verify-phone",
        10,
      );
      if (!verifyRl.allowed) {
        return tooMany(verifyRl.retry_after_seconds, {
          message: "Too many attempts. Please slow down.",
        });
      }

      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("phone, phone_verification_code, phone_verification_expires_at")
        .eq("user_id", user.id)
        .single();
      if (fetchError || !profile) throw new Error("Profile not found");

      if (profile.phone !== cleanPhone) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Submitted number does not match the number pending verification.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
      if (new Date(profile.phone_verification_expires_at as string) < new Date()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Verification code expired. Please request a new one.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
      if (!profile.phone_verification_code) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "No verification code found. Please request a new one.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const isValid = bcrypt.compareSync(body.code, profile.phone_verification_code);
      if (!isValid) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid verification code" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const { error: verifyError } = await supabase
        .from("profiles")
        .update({
          phone_verified: true,
          phone_verification_code: null,
          phone_verification_expires_at: null,
        })
        .eq("user_id", user.id);
      if (verifyError) throw new Error("Failed to verify phone");

      console.log(`Phone ${cleanPhone} verified for user ${user.id}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Phone number verified successfully",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error in verify-phone function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
