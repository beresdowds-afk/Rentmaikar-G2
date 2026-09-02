import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type AppRole =
  | "admin"
  | "admin_assistant"
  | "owner"
  | "driver"
  | "legal_support"
  | "iot_support"
  | "vehicle_support";

interface CreateUserBody {
  email: string;
  full_name: string;
  role: AppRole;
  phone?: string;
}

function generateTempPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 24) + "!Aa1";
}

// Normalize to E.164 (+ followed by 8–15 digits).
function normalizePhone(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = "+" + trimmed.replace(/[^\d]/g, "");
  return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Role check — service role bypasses has_role() so query directly.
    const { data: callerRoles, error: callerRoleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (callerRoleErr) {
      console.error("caller role lookup failed:", callerRoleErr);
      return jsonResponse({ error: "Role check failed" }, 500);
    }
    if (!(callerRoles || []).some((r) => r.role === "admin")) {
      return jsonResponse({ error: "Admins only" }, 403);
    }

    const body = (await req.json()) as CreateUserBody;
    const { email, full_name, role } = body;
    if (!email || !full_name || !role) {
      return jsonResponse({ error: "email, full_name and role are required" }, 400);
    }

    // Drivers and owners must self-register to complete identity verification.
    if (role === "driver" || role === "owner") {
      return jsonResponse({
        error:
          "Drivers and owners must self-register through the public signup so they complete identity verification themselves.",
      }, 400);
    }

    let normalizedPhone: string | null = null;
    if (body.phone && body.phone.trim()) {
      normalizedPhone = normalizePhone(body.phone);
      if (!normalizedPhone) {
        return jsonResponse({
          error: "Invalid phone number. Use international format, e.g. +15551234567.",
        }, 400);
      }
    }

    const tempPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      phone: normalizedPhone || undefined,
      user_metadata: { full_name },
    });

    if (createErr || !created?.user) {
      console.error("createUser failed:", createErr);
      return jsonResponse({ error: createErr?.message || "Failed to create user" }, 400);
    }

    const newUserId = created.user.id;

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: newUserId, role });
    if (roleErr) {
      console.error("Role insert failed:", roleErr);
      // Roll back the auth user so this call is idempotent-safe.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return jsonResponse({ error: `Role insert failed: ${roleErr.message}` }, 500);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          user_id: newUserId,
          email,
          full_name,
          phone: normalizedPhone,
          is_active: true,
        },
        { onConflict: "user_id" },
      );
    if (profileError) {
      console.error("Profile upsert failed:", profileError);
      // Non-fatal — the profile row is normally created by the auth trigger.
    }

    const siteUrl =
      req.headers.get("origin") ||
      Deno.env.get("SITE_URL") ||
      "https://rentmaikar.com";

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl}/reset-password` },
    });
    if (linkErr) console.error("generateLink failed:", linkErr);
    const resetLink = linkData?.properties?.action_link || `${siteUrl}/auth`;

    // Single branded email via our template — do NOT also call
    // resetPasswordForEmail (that would trigger the auth-email-hook and
    // deliver a second, redundant reset email).
    let emailSent = false;
    let emailError: string | null = null;

    try {
      const { error: sendErr } = await admin.functions.invoke("send-outbound-email", {
        body: {
          action: "send",
          to: email,
          templateName: "password_reset",
          category: "auth",
          priority: "high",
          data: {
            firstName: String(full_name || "there").split(" ")[0],
            resetUrl: resetLink,
            expiresIn: "24 hours",
            note: `An administrator created your Rentmaikar ${role.replace("_", " ")} account. Please sign in as soon as possible and set your password using this link.`,
          },
        },
      });
      if (sendErr) throw sendErr;
      emailSent = true;
    } catch (e) {
      emailError = (e as Error)?.message || "welcome email failed";
      console.error("welcome email failed:", e);
    }

    let smsSent = false;
    let smsError: string | null = null;
    if (normalizedPhone) {
      try {
        const { error: smsErr } = await admin.functions.invoke(
          "send-sms-notification",
          {
            body: {
              phone: normalizedPhone,
              channel: "sms",
              notificationType: "general",
              name: full_name,
              customMessage: `Welcome to Rentmaikar, ${full_name}! Your ${role.replace("_", " ")} account was created by an administrator. Sign in at ${siteUrl}/auth and use "Forgot password" to set your own password.`,
            },
          },
        );
        if (smsErr) throw smsErr;
        smsSent = true;
      } catch (e) {
        smsError = (e as Error)?.message || "sms failed";
        console.error("welcome SMS failed:", e);
      }
    }

    const instructions = [
      `1. Ask ${full_name} to open ${siteUrl}/auth and click "Forgot password".`,
      `2. They will receive a reset link at ${email}${normalizedPhone ? ` and an SMS at ${normalizedPhone}` : ""}.`,
      `3. Once they set a new password, they can sign in as ${role.replace("_", " ")}.`,
    ].join("\n");

    const { error: auditError } = await admin.from("role_audit_log").insert({
      actor_id: userData.user.id,
      target_user_id: newUserId,
      action: "created",
      new_role: role,
      notes: JSON.stringify({
        summary: `Created by administrator ${userData.user.email || userData.user.id}. Pending password reset.`,
        email,
        phone: normalizedPhone,
        email_sent: emailSent,
        sms_sent: smsSent,
        email_error: emailError,
        sms_error: smsError,
      }),
    });
    if (auditError) console.error("audit log insert failed:", auditError);

    return jsonResponse({
      success: true,
      user_id: newUserId,
      email,
      phone: normalizedPhone,
      email_sent: emailSent,
      sms_sent: smsSent,
      email_error: emailError,
      sms_error: smsError,
      message: `User created. Password-reset email ${emailSent ? "sent" : "FAILED"}${normalizedPhone ? `; SMS ${smsSent ? "sent" : "FAILED"}.` : "; no phone provided so no SMS was sent."}`,
      instructions,
    });
  } catch (err) {
    console.error("admin-create-user error:", err);
    return jsonResponse({
      success: false,
      error: (err as Error)?.message || "Unknown error",
    }, 500);
  }
});
