import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, tooMany } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sendCodeSchema = z.object({
  action: z.literal("send_code"),
  user_id: z.string().uuid(),
  phone: z.string().min(7).max(16),
  channel: z.enum(["sms", "whatsapp"]),
});

const verifyCodeSchema = z.object({
  action: z.literal("verify_code"),
  user_id: z.string().uuid(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

const setupSchema = z.object({
  action: z.literal("setup"),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Phone must be normalized E.164"),
  channel: z.enum(["sms", "whatsapp"]),
});

const statusSchema = z.object({
  action: z.literal("status"),
  user_id: z.string().uuid().optional(),
});

const generateCode = (): string => Math.floor(100000 + Math.random() * 900000).toString();

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.json();
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // For "setup" action, require auth header
    if (rawBody.action === "setup") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Not authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid authentication" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const parsed = setupSchema.parse(rawBody);

      // Rate limit setup attempts to prevent spam / dialing abuse.
      const rl = await checkRateLimit(`2fa-setup:${user.id}`, "send-2fa-code", 5);
      if (!rl.allowed) {
        return tooMany(rl.retry_after_seconds, {
          message: "Too many 2FA setup attempts. Please wait and try again.",
        });
      }

      // Require the phone number to be verified against the user's profile
      // before it can be enabled for 2FA / dialing.
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, phone_verified")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile || profile.phone !== parsed.phone || !profile.phone_verified) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Phone number must be verified before enabling 2FA. Please complete SMS/voice verification first.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      // Update or create 2FA settings
      const { error: upsertError } = await supabase
        .from("two_factor_settings")
        .upsert({
          user_id: user.id,
          phone_number: parsed.phone,
          preferred_channel: parsed.channel,
          is_enabled: true,
          enabled_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (upsertError) throw new Error("Failed to save 2FA settings");

      // Log audit
      await supabase.from("two_factor_audit_log").insert({
        user_id: user.id,
        action: "2fa_enabled",
        channel: parsed.channel,
        phone_number: parsed.phone,
        ip_address: ipAddress,
        user_agent: userAgent,
        success: true,
      });

      return new Response(
        JSON.stringify({ success: true, message: "2FA enabled successfully" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // For "status" action — check 2FA requirement (no auth needed, used during login)
    if (rawBody.action === "status") {
      const parsed = statusSchema.parse(rawBody);
      if (!parsed.user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: settings } = await supabase
        .from("two_factor_settings")
        .select("is_enabled, is_mandatory, phone_number, preferred_channel")
        .eq("user_id", parsed.user_id)
        .maybeSingle();

      // Also check the user's role to determine mandatory status
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", parsed.user_id)
        .maybeSingle();

      const role = roleData?.role;
      const isMandatory = role === "admin" || role === "owner";

      return new Response(
        JSON.stringify({
          success: true,
          requires_2fa: settings?.is_enabled || isMandatory,
          is_setup: settings?.is_enabled || false,
          is_mandatory: isMandatory,
          has_phone: !!settings?.phone_number,
          preferred_channel: settings?.preferred_channel || "sms",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // For "send_code" — send OTP during login (no auth header, user not yet fully authenticated)
    if (rawBody.action === "send_code") {
      const parsed = sendCodeSchema.parse(rawBody);

      // Get user's 2FA settings
      const { data: settings } = await supabase
        .from("two_factor_settings")
        .select("phone_number, preferred_channel, is_enabled")
        .eq("user_id", parsed.user_id)
        .maybeSingle();

      const phone = parsed.phone || settings?.phone_number;
      if (!phone) {
        return new Response(
          JSON.stringify({ success: false, error: "No phone number configured for 2FA" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Generate and hash code
      const code = generateCode();
      const hashedCode = await bcrypt.hash(code);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Store hashed code in profiles (reuse existing columns)
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          phone_verification_code: hashedCode,
          phone_verification_expires_at: expiresAt.toISOString(),
        })
        .eq("user_id", parsed.user_id);

      if (updateError) throw new Error("Failed to store 2FA code");

      // Send via SMS/WhatsApp
      const channel = parsed.channel || settings?.preferred_channel || "sms";
      const smsResponse = await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          phone,
          channel,
          notificationType: "verification_code",
          verificationCode: code,
        }),
      });

      const smsResult = await smsResponse.json();
      if (!smsResult.success) throw new Error("Failed to send 2FA code");

      // Log audit
      await supabase.from("two_factor_audit_log").insert({
        user_id: parsed.user_id,
        action: "2fa_code_sent",
        channel,
        phone_number: phone,
        ip_address: ipAddress,
        user_agent: userAgent,
        success: true,
      });

      return new Response(
        JSON.stringify({ success: true, message: `2FA code sent via ${channel}`, expiresIn: 300 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // For "verify_code" — verify OTP during login
    if (rawBody.action === "verify_code") {
      const parsed = verifyCodeSchema.parse(rawBody);

      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("phone_verification_code, phone_verification_expires_at")
        .eq("user_id", parsed.user_id)
        .single();

      if (fetchError || !profile) {
        return new Response(
          JSON.stringify({ success: false, error: "Profile not found" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!profile.phone_verification_code) {
        await supabase.from("two_factor_audit_log").insert({
          user_id: parsed.user_id, action: "2fa_verify_failed",
          ip_address: ipAddress, user_agent: userAgent,
          success: false, failure_reason: "No code found",
        });
        return new Response(
          JSON.stringify({ success: false, error: "No 2FA code found. Please request a new one." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (new Date(profile.phone_verification_expires_at) < new Date()) {
        await supabase.from("two_factor_audit_log").insert({
          user_id: parsed.user_id, action: "2fa_verify_failed",
          ip_address: ipAddress, user_agent: userAgent,
          success: false, failure_reason: "Code expired",
        });
        return new Response(
          JSON.stringify({ success: false, error: "Code expired. Please request a new one." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const isValid = await bcrypt.compare(parsed.code, profile.phone_verification_code);

      if (!isValid) {
        await supabase.from("two_factor_audit_log").insert({
          user_id: parsed.user_id, action: "2fa_verify_failed",
          ip_address: ipAddress, user_agent: userAgent,
          success: false, failure_reason: "Invalid code",
        });
        return new Response(
          JSON.stringify({ success: false, error: "Invalid verification code" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Clear code
      await supabase.from("profiles").update({
        phone_verification_code: null,
        phone_verification_expires_at: null,
      }).eq("user_id", parsed.user_id);

      // Log success
      await supabase.from("two_factor_audit_log").insert({
        user_id: parsed.user_id, action: "2fa_verified",
        ip_address: ipAddress, user_agent: userAgent,
        success: true,
      });

      return new Response(
        JSON.stringify({ success: true, message: "2FA verified successfully" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-2fa-code:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
