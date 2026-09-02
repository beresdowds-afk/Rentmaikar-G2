import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  canonicalizeUserRole,
  buildReferenceId,
  personaRoleAttributes,
  templateForRole,
  resolveTemplateForRoleWithDb,
  userRoleTagForRole,
  type PersonaSubjectRole,
} from "../_shared/persona-templates.ts";
import {
  governmentIdPersonaAttributes,
  resolveGovIdPolicy,
} from "../_shared/government-id.ts";



const Body = z.object({
  subject_type: z.enum(["self", "referee", "proxy"]),
  subject_role: z.enum(["driver", "referee", "owner", "support_staff", "admin_assistant", "proxy"]).optional(),
  subject_ref: z.string().max(200).optional(),
  region: z.string().max(40).optional(),
  fields: z.object({
    name_first: z.string().max(80).optional(),
    name_last: z.string().max(80).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    id_number: z.string().max(64).optional(),
    id_type: z.string().max(40).optional(),
    birthdate: z.string().max(20).optional(),
  }).partial().optional(),
  chosen_id_class: z.string().max(20).optional(),
  correlation_id: z.string().max(80).optional(),
  drivers_license_document_id: z.string().uuid().optional(),
});


const PERSONA_BASE = "https://withpersona.com/api/v1";
const PERSONA_VERSION = "2023-01-05";

function normalizeCountry(r?: string): string {
  const rr = (r ?? "").toUpperCase().trim();
  if (rr.startsWith("NG") || rr === "NIGERIA") return "NG";
  if (rr.startsWith("US") || rr === "USA" || rr === "UNITED STATES") return "US";
  return rr || "US";
}

async function resolveTemplate(
  supa: any,
  country: string,
  subjectRole?: PersonaSubjectRole,
): Promise<{ template_id: string | null; env_id: string | null }> {
  const envId = Deno.env.get("PERSONA_ENVIRONMENT_ID") ?? null;

  // 1. DB-managed per-role template (admin-editable via persona_template_config)
  if (subjectRole) {
    const dbCfg = await resolveTemplateForRoleWithDb(supa, subjectRole);
    if (dbCfg.template_id) {
      return { template_id: dbCfg.template_id, env_id: dbCfg.environment_id ?? envId };
    }
  }

  // 2. Compiled-in per-role default
  const roleTpl = templateForRole(subjectRole ?? null);
  if (roleTpl) return { template_id: roleTpl, env_id: envId };

  // 3. DB region template
  const { data } = await supa
    .from("persona_region_templates")
    .select("inquiry_template_id, environment_id, is_active")
    .eq("country_code", country)
    .eq("is_active", true)
    .maybeSingle();
  if (data?.inquiry_template_id) {
    return { template_id: data.inquiry_template_id, env_id: data.environment_id ?? envId };
  }

  // 4. Env fallbacks
  const envKey = country === "NG" ? "PERSONA_TEMPLATE_ID_NG" : "PERSONA_TEMPLATE_ID_US";
  return {
    template_id: Deno.env.get(envKey)
      ?? Deno.env.get("PERSONA_TEMPLATE_ID")
      ?? Deno.env.get("PERSONA_MASTER_TEMPLATE_ID")
      ?? null,
    env_id: envId,
  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("PERSONA_API_KEY");
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
    const country = normalizeCountry(parsed.data.region);

    // Server-side role validation: reject unknown values before touching Persona.
    const canonicalRole = parsed.data.subject_role
      ? canonicalizeUserRole(parsed.data.subject_role)
      : null;
    if (parsed.data.subject_role && !canonicalRole) {
      return new Response(JSON.stringify({
        error: "invalid_user_role",
        detail: `Unrecognized subject_role: ${parsed.data.subject_role}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Government-ID-only policy: drivers must have a driver's licence on file
    // before an inquiry is opened. Every other role verifies with any valid
    // government ID accepted in their region.
    // Admin-configurable accepted ID classes (public.persona_id_class_rules)
    const { data: idRules } = await supa
      .from("persona_id_class_rules")
      .select("country_code, subject_role, accepted_classes, requires_drivers_license, is_active");
    const idPolicy = resolveGovIdPolicy(canonicalRole, country, (idRules ?? []) as any);

    if (idPolicy.requiresDriversLicence) {
      let dlQuery = supa
        .from("user_documents")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("document_type", "drivers_license")
        .limit(1);
      if (parsed.data.drivers_license_document_id) {
        dlQuery = dlQuery.eq("id", parsed.data.drivers_license_document_id);
      }
      const { data: dlDoc } = await dlQuery.maybeSingle();
      if (!dlDoc) {
        return new Response(JSON.stringify({
          error: "drivers_license_required",
          detail: "Drivers must upload a valid driver's licence before identity verification.",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { template_id, env_id } = await resolveTemplate(supa, country, canonicalRole ?? undefined);


    if (!apiKey || !template_id) {
      const { data, error } = await supa.from("persona_inquiries").insert({
        user_id: userData.user.id,
        subject_type: parsed.data.subject_type,
        subject_ref: parsed.data.subject_ref ?? null,
        region: country,
        status: "created",
        raw_payload: { user_role: userRoleTagForRole(canonicalRole), subject_role: canonicalRole },
      }).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ inquiry: data, provider_configured: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roleAttrs = personaRoleAttributes(canonicalRole);
    const baseGovIdAttrs = governmentIdPersonaAttributes(canonicalRole, country);
    const govIdAttrs = {
      tags: baseGovIdAttrs.tags,
      fields: {
        ...baseGovIdAttrs.fields,
        "accepted-id-classes": idPolicy.options.map((o) => o.code).join(","),
        "government-id-requirement": idPolicy.requiresDriversLicence
          ? "drivers_license"
          : "any_government_id",
        ...(parsed.data.chosen_id_class ? { "selected-id-class": parsed.data.chosen_id_class } : {}),
      },
    };

    const userRoleTag = userRoleTagForRole(canonicalRole);
    const subjectRefValue = parsed.data.subject_ref ?? userData.user.id;
    const referenceId = canonicalRole
      ? buildReferenceId(canonicalRole, subjectRefValue)
      : `${parsed.data.subject_type}:${subjectRefValue}`;

    // Create inquiry
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
            "inquiry-template-id": template_id,
            "reference-id": referenceId,
            tags: [...roleAttrs.tags, ...govIdAttrs.tags],
            fields: {
              ...roleAttrs.fields,
              ...govIdAttrs.fields,

              "name-first": parsed.data.fields?.name_first,
              "name-last": parsed.data.fields?.name_last,
              "email-address": parsed.data.fields?.email,
              "phone-number": parsed.data.fields?.phone,
              "identification-number": parsed.data.fields?.id_number,
              "birthdate": parsed.data.fields?.birthdate,
            },
          },
        },
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Persona error", detail: body }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inquiryId = body?.data?.id as string;

    // Generate a session token for embedded resume
    let sessionToken: string | null = null;
    try {
      const st = await fetch(`${PERSONA_BASE}/inquiries/${inquiryId}/resume`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Persona-Version": PERSONA_VERSION,
        },
      });
      const stBody = await st.json();
      sessionToken = stBody?.meta?.["session-token"] ?? stBody?.data?.attributes?.["session-token"] ?? null;
    } catch (_e) { /* non-fatal */ }

    const { data: row, error } = await supa.from("persona_inquiries").insert({
      user_id: userData.user.id,
      subject_type: parsed.data.subject_type,
      subject_ref: parsed.data.subject_ref ?? null,
      region: country,
      inquiry_id: inquiryId,
      template_id: template_id,
      status: "pending",
      raw_payload: { user_role: userRoleTag, subject_role: canonicalRole ?? null, reference_id: referenceId, government_id: govIdAttrs.fields, response: body },
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({
      inquiry: row,
      inquiry_id: inquiryId,
      session_token: sessionToken,
      template_id,
      environment_id: env_id,
      hosted_url: `https://withpersona.com/verify?inquiry-id=${inquiryId}${env_id ? `&environment-id=${env_id}` : ""}`,
      provider_configured: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
