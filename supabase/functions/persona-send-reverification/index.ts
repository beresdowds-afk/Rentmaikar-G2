// Admin-triggered re-verification: creates a fresh Persona inquiry and emails/SMS the hosted link.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

import {
  buildReferenceId,
  canonicalizeUserRole,
  personaRoleAttributes,
  templateForRole,
  userRoleTagForRole,
  type PersonaSubjectRole,
} from "../_shared/persona-templates.ts";

const Body = z.object({
  user_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
  channel: z.enum(["email", "sms", "both"]).default("both"),
  subject_role: z.enum(["driver", "referee", "owner", "support_staff", "admin_assistant", "proxy"]).optional(),
});

const PERSONA_BASE = "https://withpersona.com/api/v1";
const PERSONA_VERSION = "2023-01-05";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Allowed: an admin acting on any user, OR the user acting on themselves.
    const isSelf = parsed.data.user_id === userData.user.id;
    if (!isSelf) {
      const { data: roleRow } = await supa
        .from("user_roles").select("role")
        .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: profile } = await supa
      .from("profiles")
      .select("user_id, email, phone, full_name, country")
      .eq("user_id", parsed.data.user_id)
      .maybeSingle();
    if (!profile) {
      return new Response(JSON.stringify({ error: "user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const country = (profile.country ?? "US").toUpperCase().startsWith("NG") ? "NG" : "US";
    const { data: tmpl } = await supa
      .from("persona_region_templates")
      .select("inquiry_template_id, environment_id")
      .eq("country_code", country).eq("is_active", true).maybeSingle();

    // Server-side role validation: reject unknown values up front.
    if (parsed.data.subject_role && !canonicalizeUserRole(parsed.data.subject_role)) {
      return new Response(JSON.stringify({
        error: "invalid_user_role",
        detail: `Unrecognized subject_role: ${parsed.data.subject_role}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Infer subject_role from user_roles when not explicitly provided so Persona
    // still receives a workflow tag.
    let subjectRole: PersonaSubjectRole | null =
      canonicalizeUserRole(parsed.data.subject_role);
    if (!subjectRole) {
      const { data: roles } = await supa
        .from("user_roles").select("role").eq("user_id", profile.user_id);
      const set = new Set((roles ?? []).map((r: any) => String(r.role)));
      if (set.has("admin_assistant")) subjectRole = "admin_assistant";
      else if (set.has("support_staff")) subjectRole = "support_staff";
      else if (set.has("owner")) subjectRole = "owner";
      else if (set.has("driver")) subjectRole = "driver";
    }
    const roleAttrs = personaRoleAttributes(subjectRole);
    const userRoleTag = userRoleTagForRole(subjectRole);
    const referenceId = subjectRole
      ? buildReferenceId(subjectRole, profile.user_id, { adminReverify: true })
      : `admin-reverify:user:${profile.user_id}`;

    const templateId = templateForRole(subjectRole)
      ?? tmpl?.inquiry_template_id
      ?? Deno.env.get(country === "NG" ? "PERSONA_TEMPLATE_ID_NG" : "PERSONA_TEMPLATE_ID_US")
      ?? Deno.env.get("PERSONA_TEMPLATE_ID");
    const envId = tmpl?.environment_id ?? Deno.env.get("PERSONA_ENVIRONMENT_ID");
    const apiKey = Deno.env.get("PERSONA_API_KEY");
    if (!apiKey || !templateId) {
      return new Response(JSON.stringify({ error: "Persona not configured for region" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${PERSONA_BASE}/inquiries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Persona-Version": PERSONA_VERSION,
      },
      body: JSON.stringify({
        data: { attributes: {
          "inquiry-template-id": templateId,
          "reference-id": referenceId,
          tags: roleAttrs.tags,
          fields: {
            ...roleAttrs.fields,
            "email-address": profile.email,
            "phone-number": profile.phone,
          },
        }},
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Persona error", detail: body }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inquiryId = body?.data?.id as string;
    const hostedUrl = `https://withpersona.com/verify?inquiry-id=${inquiryId}${envId ? `&environment-id=${envId}` : ""}`;

    await supa.from("persona_inquiries").insert({
      user_id: profile.user_id,
      subject_type: "self",
      region: country,
      inquiry_id: inquiryId,
      template_id: templateId,
      status: "pending",
      raw_payload: { source: "admin_reverification", user_role: userRoleTag, subject_role: subjectRole ?? null, reference_id: referenceId, reason: parsed.data.reason, response: body },
    });

    const reason = parsed.data.reason?.trim() ?? "We need to re-verify your identity to keep your account active.";
    const shortMsg = `${reason}\nComplete verification: ${hostedUrl}`;

    const results: Record<string, unknown> = { inquiry_id: inquiryId, hosted_url: hostedUrl };

    if ((parsed.data.channel === "email" || parsed.data.channel === "both") && profile.email) {
      const r = await supa.functions.invoke("send-email-notification", {
        body: {
          to: profile.email,
          subject: "Identity re-verification required",
          html: `<p>Hi ${profile.full_name ?? ""},</p><p>${reason}</p><p><a href="${hostedUrl}">Verify your identity</a></p>`,
        },
      }).catch((e) => ({ error: String(e) }));
      results.email = r;
    }
    if ((parsed.data.channel === "sms" || parsed.data.channel === "both") && profile.phone) {
      const r = await supa.functions.invoke("send-sms-notification", {
        body: { to: profile.phone, message: shortMsg, region: country },
      }).catch((e) => ({ error: String(e) }));
      results.sms = r;
    }

    await supa.from("admin_audit_log").insert({
      admin_id: userData.user.id,
      action: "persona_reverification_requested",
      target_table: "profiles",
      target_id: profile.user_id,
      details: { inquiry_id: inquiryId, reason: parsed.data.reason, channel: parsed.data.channel },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
