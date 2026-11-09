import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STAFF_ROLES = [
  "admin", "admin_assistant", "legal_support", "iot_support",
  "vehicle_support", "insurance_support",
] as const;

interface CreateUserBody {
  email: string;
  full_name: string;
  role: string;
  phone?: string;
  support_assignment?: {
    support_type: string;
    assigned_city: string;
    assigned_region: string;
  };
}

const SUPPORT_ROLES: Record<string, string> = {
  legal: "legal_support",
  iot_installation: "iot_support",
  iot_maintenance: "iot_support",
  vehicle_recall: "vehicle_support",
  vehicle_maintenance: "vehicle_support",
};

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
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const { role } = body;
    if (!email || !full_name || !role) {
      return jsonResponse({ error: "email, full_name and role are required" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "A valid email address is required" }, 400);
    }
    if (!STAFF_ROLES.some((allowed) => allowed === role)) {
      return jsonResponse({ error: "Only approved administrative and support roles can be created here." }, 400);
    }
    const assignment = body.support_assignment;
    if (assignment && (
      SUPPORT_ROLES[assignment.support_type] !== role ||
      typeof assignment.assigned_city !== "string" || !assignment.assigned_city.trim() ||
      typeof assignment.assigned_region !== "string" || !assignment.assigned_region.trim()
    )) {
      return jsonResponse({ error: "A valid support type, city and region matching the role are required." }, 400);
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
      email_confirm: false,
      phone: normalizedPhone || undefined,
      user_metadata: { full_name },
      app_metadata: { admin_staff_creation: true },
    });

    if (createErr || !created?.user) {
      console.error("createUser failed:", createErr);
      return jsonResponse({ error: createErr?.message || "Failed to create user" }, 400);
    }

    const newUserId = created.user.id;

    if (created.user.email_confirmed_at) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(newUserId);
      if (rollbackError) console.error("Failed to roll back prematurely confirmed staff account:", rollbackError);
      return jsonResponse({
        error: rollbackError
          ? `Email was confirmed without verification; account ${newUserId} requires manual cleanup.`
          : "Email was confirmed without verification. Check the authentication provider configuration.",
      }, 500);
    }

    const { data: seededRoles, error: seededRoleError } = await admin
      .from("user_roles").select("role").eq("user_id", newUserId);
    if (seededRoleError || seededRoles?.length) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(newUserId);
      if (rollbackError) console.error("Failed to roll back incorrectly seeded staff account:", rollbackError);
      return jsonResponse({
        error: rollbackError
          ? `Staff role verification failed; account ${newUserId} requires manual cleanup.`
          : "Staff role verification failed. Ensure the staff account migration is deployed.",
      }, 500);
    }

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: newUserId, role });
    if (roleErr) {
      console.error("Role insert failed:", roleErr);
      const { error: rollbackError } = await admin.auth.admin.deleteUser(newUserId);
      if (rollbackError) {
        console.error("Failed to roll back user after role insert failure:", rollbackError);
        return jsonResponse({ error: `Role insert failed; account ${newUserId} requires manual cleanup.` }, 500);
      }
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

    if (assignment) {
      const { error: assignmentError } = await admin.from("support_staff").insert({
        user_id: newUserId,
        support_type: assignment.support_type,
        assigned_city: assignment.assigned_city.trim(),
        assigned_region: assignment.assigned_region.trim(),
        phone: normalizedPhone,
        is_active: true,
      });
      if (assignmentError) {
        console.error("Support assignment failed:", assignmentError);
        const { error: rollbackError } = await admin.auth.admin.deleteUser(newUserId);
        if (rollbackError) {
          console.error("Failed to roll back user after support assignment failure:", rollbackError);
          return jsonResponse({ error: `Support assignment failed; account ${newUserId} requires manual cleanup.` }, 500);
        }
        return jsonResponse({ error: `Support assignment failed: ${assignmentError.message}` }, 500);
      }
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "https://rentmaikar.com").replace(/\/+$/, "");

    // Confirmation proves mailbox ownership before the initial password is set.
    let emailSent = false;
    let emailError: string | null = null;

    try {
      const { error: sendErr } = await userClient.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${siteUrl}/reset-password` },
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
              customMessage: `Welcome to Rentmaikar, ${full_name}! Your ${role.replace("_", " ")} account was created by an administrator. Verify the email sent to ${email} to set your password.`,
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
      `1. Ask ${full_name} to open the verification email sent to ${email}.`,
      `2. Follow its link to verify the email and set a password.`,
      `3. Sign in as ${role.replace("_", " ")} after verification.`,
    ].join("\n");

    const { error: auditError } = await admin.from("role_audit_log").insert({
      actor_id: userData.user.id,
      target_user_id: newUserId,
      action: "created",
      new_role: role,
      notes: JSON.stringify({
        summary: `Created by administrator ${userData.user.email || userData.user.id}. Pending email verification.`,
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
      message: `User created. Verification email ${emailSent ? "requested" : "FAILED"}${normalizedPhone ? `; SMS ${smsSent ? "sent" : "FAILED"}.` : "; no phone provided so no SMS was sent."}`,
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
