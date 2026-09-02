// Verifies every referee on an application through Persona, using the
// credentials the driver submitted for that referee. Creates one Persona
// inquiry per referee and stores the linkage in referee_verifications.
// Called on application submit and from the admin re-run action.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { logPipelineEvent } from "../_shared/pipeline-events.ts";

const Body = z.object({
  application_id: z.string().uuid(),
});

interface Referee {
  full_name?: string;
  name?: string;
  phone?: string;
  email?: string;
  id_type?: string;
  id_number?: string;
  birthdate?: string;
}

function normaliseReferees(app: any): Referee[] {
  const raw = app?.referees ?? app?.referee_list ?? app?.reference_contacts ?? [];
  if (Array.isArray(raw)) return raw as Referee[];
  return [];
}

async function createPersonaInquiry(apiKey: string | undefined, templateId: string | undefined, r: Referee, referenceId: string) {
  if (!apiKey || !templateId) return { inquiry_id: null as string | null, raw: null as any };
  const { personaRoleAttributes } = await import("../_shared/persona-templates.ts");
  const roleAttrs = personaRoleAttributes("referee");
  const res = await fetch("https://withpersona.com/api/v1/inquiries", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Persona-Version": "2023-01-05" },
    body: JSON.stringify({
      data: {
        attributes: {
          "inquiry-template-id": templateId,
          "reference-id": referenceId,
          tags: roleAttrs.tags,
          fields: {
            ...roleAttrs.fields,
            "name-first": (r.full_name ?? r.name ?? "").split(/\s+/)[0],
            "name-last": (r.full_name ?? r.name ?? "").split(/\s+/).slice(1).join(" "),
            "email-address": r.email,
            "phone-number": r.phone,
            "identification-number": r.id_number,
            "birthdate": r.birthdate,
          },
        },
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) return { inquiry_id: null, raw: body };
  return { inquiry_id: body?.data?.id as string, raw: body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let appId: string | null = null;
  let actorId: string | null = null;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    appId = parsed.data.application_id;
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supa.auth.getUser(jwt) : { data: { user: null } as any };
    if (!userData?.user) {
      await logPipelineEvent({ application_id: appId, event_type: "verify_referees", status: "error", message: "unauthorized" });
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    actorId = userData.user.id;
    await logPipelineEvent({ application_id: appId, event_type: "verify_referees", status: "started", actor_id: actorId });

    const { data: app, error } = await supa.from("applications").select("*").eq("id", parsed.data.application_id).maybeSingle();
    if (error || !app) {
      await logPipelineEvent({ application_id: appId, event_type: "verify_referees", status: "error", message: "application not found", actor_id: actorId });
      return new Response(JSON.stringify({ error: "application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // authorize: owner of the application or admin
    const isOwner = app.user_id === userData.user.id;
    if (!isOwner) {
      const { data: role } = await supa.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (!role) {
        await logPipelineEvent({ application_id: appId, event_type: "verify_referees", status: "error", message: "forbidden", actor_id: actorId });
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const region = (app.country ?? app.region ?? "USA") as string;
    const isNG = region.toUpperCase().startsWith("NG") || region === "Nigeria";
    const supaAdmin = supa;
    const countryCode = isNG ? "NG" : "US";
    // Universal referee template takes priority over region/env overrides.
    const { templateForRole } = await import("../_shared/persona-templates.ts");
    const universalRefereeTpl = templateForRole("referee");
    const { data: regionTpl } = await supaAdmin
      .from("persona_region_templates")
      .select("inquiry_template_id, is_active")
      .eq("country_code", countryCode)
      .eq("is_active", true)
      .maybeSingle();
    const templateId = universalRefereeTpl
      ?? regionTpl?.inquiry_template_id
      ?? (isNG ? Deno.env.get("PERSONA_TEMPLATE_ID_NG") : Deno.env.get("PERSONA_TEMPLATE_ID_US"))
      ?? Deno.env.get("PERSONA_TEMPLATE_ID")
      ?? Deno.env.get("PERSONA_MASTER_TEMPLATE_ID");
    const apiKey = Deno.env.get("PERSONA_API_KEY");

    const referees = normaliseReferees(app);
    if (referees.length === 0) {
      await logPipelineEvent({ application_id: appId, event_type: "verify_referees", status: "success", message: "no referees on application", actor_id: actorId, details: { referees: 0 } });
      return new Response(JSON.stringify({ ok: true, referees: 0, message: "no referees on application" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supa.from("applications").update({ referees_verification_status: "running" }).eq("id", app.id);

    const results: any[] = [];
    for (let i = 0; i < referees.length; i++) {
      const r = referees[i];
      const fullName = r.full_name ?? r.name ?? "";
      const { data: refRow, error: refErr } = await supa.from("referee_verifications").upsert({
        application_id: app.id,
        user_id: app.user_id,
        referee_index: i,
        full_name: fullName,
        phone: r.phone ?? null,
        email: r.email ?? null,
        id_type: r.id_type ?? null,
        id_number: r.id_number ?? null,
        status: "running",
      }, { onConflict: "application_id,referee_index" }).select().single();
      if (refErr) { results.push({ index: i, error: refErr.message }); continue; }

      const referenceId = `referee:${refRow.id}`;
      const { inquiry_id, raw } = await createPersonaInquiry(apiKey, templateId, r, referenceId);

      if (inquiry_id) {
        const { data: inq } = await supa.from("persona_inquiries").insert({
          user_id: app.user_id,
          subject_type: "referee",
          subject_ref: refRow.id,
          inquiry_id,
          template_id: templateId,
          region,
          status: "pending",
          raw_payload: raw,
        }).select().single();
        await supa.from("referee_verifications").update({ persona_inquiry_id: inq?.id ?? null }).eq("id", refRow.id);
        results.push({ index: i, status: "pending", inquiry_id });
      } else {
        await supa.from("referee_verifications").update({
          status: "pending",
          mismatch_reason: apiKey ? "Persona did not return an inquiry" : "Persona not configured",
        }).eq("id", refRow.id);
        results.push({ index: i, status: "queued", provider_configured: Boolean(apiKey && templateId) });
      }
    }

    const errors = results.filter(r => r.error).length;
    await logPipelineEvent({
      application_id: appId, event_type: "verify_referees",
      status: errors ? "error" : "success",
      message: errors ? `${errors} referee(s) failed to enqueue` : `Enqueued ${referees.length} referee inquiry/inquiries`,
      actor_id: actorId,
      details: { referees: referees.length, results },
    });

    return new Response(JSON.stringify({ ok: true, application_id: app.id, referees: referees.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await logPipelineEvent({ application_id: appId, event_type: "verify_referees", status: "error", message: String(e).slice(0, 500), actor_id: actorId });
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
