import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { resolveGovIdPolicy } from "../_shared/government-id.ts";
import {
  canonicalizeUserRole,
  buildReferenceId,
  personaRoleAttributes,
  templateForRole,
  resolveTemplateForRoleWithDb,
  userRoleTagForRole,
} from "../_shared/persona-templates.ts";

const Body = z.object({ attempt_id: z.string().uuid() });

const PERSONA_BASE = "https://withpersona.com/api/v1";
const PERSONA_VERSION = "2023-01-05";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const { data: isAdmin } = await supa.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) return json({ error: "forbidden" }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

    const { data: attempt, error: attErr } = await supa
      .from("persona_verification_attempts")
      .select("*")
      .eq("id", parsed.data.attempt_id)
      .maybeSingle();
    if (attErr || !attempt) return json({ error: "attempt_not_found" }, 404);

    const canonicalRole = canonicalizeUserRole(attempt.subject_role ?? "") ?? null;
    const region = (attempt.region ?? "US").toUpperCase();

    const { data: rules } = await supa
      .from("persona_id_class_rules")
      .select("country_code, subject_role, accepted_classes, requires_drivers_license, is_active");
    const policy = resolveGovIdPolicy(canonicalRole, region, (rules ?? []) as any);

    const apiKey = Deno.env.get("PERSONA_API_KEY");
    const envId = Deno.env.get("PERSONA_ENVIRONMENT_ID") ?? null;
    let templateId: string | null = null;
    if (canonicalRole) {
      const cfg = await resolveTemplateForRoleWithDb(supa, canonicalRole);
      templateId = cfg.template_id ?? templateForRole(canonicalRole);
    }

    // Always record the retry attempt, even when the provider is not configured.
    const insertRetry = async (patch: Record<string, unknown>) => {
      const { data } = await supa.from("persona_verification_attempts").insert({
        user_id: attempt.user_id,
        subject_role: attempt.subject_role,
        subject_type: attempt.subject_type,
        region,
        template_id: templateId,
        offered_id_classes: policy.options,
        retried_from: attempt.id,
        status: "retry_requested",
        ...patch,
      }).select().single();
      await supa.from("persona_verification_attempts")
        .update({ result: "retry_requested_by_admin" })
        .eq("id", attempt.id);
      return data;
    };

    if (!apiKey || !templateId) {
      const row = await insertRetry({});
      return json({ attempt: row, provider_configured: false });
    }

    const roleAttrs = personaRoleAttributes(canonicalRole);
    const referenceId = canonicalRole
      ? buildReferenceId(canonicalRole, attempt.user_id)
      : `retry:${attempt.user_id}`;

    const res = await fetch(`${PERSONA_BASE}/inquiries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Persona-Version": PERSONA_VERSION,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            "inquiry-template-id": templateId,
            "reference-id": referenceId,
            tags: [...roleAttrs.tags, "verification:government_id", "persona:retry"],
            fields: {
              ...roleAttrs.fields,
              "verification-scope": "government_id",
              "accepted-id-classes": policy.options.map((o) => o.code).join(","),
              "selected-country-code": region,
            },
          },
        },
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      await insertRetry({ status: "failed", error_code: "persona_error", error_detail: JSON.stringify(body).slice(0, 400) });
      return json({ error: "persona_error", detail: body }, 502);
    }
    const inquiryId = body?.data?.id as string;

    const row = await insertRetry({ inquiry_id: inquiryId, status: "started" });

    await supa.from("persona_inquiries").insert({
      user_id: attempt.user_id,
      subject_type: attempt.subject_type ?? "self",
      region,
      inquiry_id: inquiryId,
      template_id: templateId,
      status: "pending",
      raw_payload: {
        user_role: userRoleTagForRole(canonicalRole),
        subject_role: canonicalRole,
        retry_of_attempt: attempt.id,
      },
    });

    // Best-effort in-app notification for the user.
    try {
      await supa.functions.invoke("send-push-notification", {
        body: {
          user_id: attempt.user_id,
          title: "Identity verification retry",
          body: "Your identity verification has been reset. Please complete it again.",
        },
      });
    } catch (_e) { /* non-fatal */ }

    return json({
      attempt: row,
      inquiry_id: inquiryId,
      hosted_url: `https://withpersona.com/verify?inquiry-id=${inquiryId}${envId ? `&environment-id=${envId}` : ""}`,
      provider_configured: true,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
