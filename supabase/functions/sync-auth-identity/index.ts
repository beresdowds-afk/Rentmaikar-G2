// Syncs auth-layer identity (email / phone) into public.profiles.
//
// Direct triggers on the `auth` schema are not permitted, so this function is
// the UPDATE-side counterpart to the on_auth_user_created INSERT trigger.
// It is caller-scoped: the JWT identifies the user, and only that user's
// profile row is touched. Admins may pass { user_id } to repair another row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;
    let targetId = callerId;

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (body?.user_id && body.user_id !== callerId) {
      const { data: isAdmin } = await caller.rpc("has_role", {
        _user_id: callerId,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetId = body.user_id;
    }

    const admin = createClient(url, serviceKey);
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(targetId);
    if (authErr || !authUser.user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authEmail = authUser.user.email?.toLowerCase() ?? null;
    const authPhone = authUser.user.phone ? `+${authUser.user.phone.replace(/^\+/, "")}` : null;
    const emailConfirmed = !!authUser.user.email_confirmed_at;
    const phoneConfirmed = !!authUser.user.phone_confirmed_at;

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, email, phone, email_verified, phone_verified")
      .eq("user_id", targetId)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ synced: false, reason: "no_profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, unknown> = {};
    if (authEmail && authEmail !== (profile.email ?? "").toLowerCase()) {
      updates.email = authEmail;
      // Email changed at the auth layer -> re-verification state follows auth.
      updates.email_verified = emailConfirmed;
    } else if (emailConfirmed && !profile.email_verified) {
      updates.email_verified = true;
    }

    if (authPhone && authPhone !== profile.phone) {
      updates.phone = authPhone;
      updates.phone_verified = phoneConfirmed;
    } else if (phoneConfirmed && !profile.phone_verified) {
      updates.phone_verified = true;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ synced: false, changed: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await admin
      .from("profiles")
      .update(updates)
      .eq("user_id", targetId);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({ synced: true, changed: Object.keys(updates) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-auth-identity error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
