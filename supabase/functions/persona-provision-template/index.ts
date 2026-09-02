// Clones the master Persona inquiry template for a region's country code.
// Admin-only. Idempotent — safe to re-run.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({
  country_code: z.string().min(2).max(4),
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
    const { data: roleRow } = await supa
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const country = parsed.data.country_code.toUpperCase();
    const apiKey = Deno.env.get("PERSONA_API_KEY");
    const masterId = Deno.env.get("PERSONA_MASTER_TEMPLATE_ID");
    const envId = Deno.env.get("PERSONA_ENVIRONMENT_ID");

    if (!apiKey || !masterId) {
      return new Response(JSON.stringify({ error: "PERSONA_API_KEY and PERSONA_MASTER_TEMPLATE_ID must be configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supa.from("persona_region_templates")
      .update({ provision_status: "provisioning", provision_error: null })
      .eq("country_code", country);

    // Persona: create an inquiry-template-version derived from master
    // https://docs.withpersona.com/reference/create-an-inquiry-template
    const res = await fetch(`${PERSONA_BASE}/inquiry-templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Persona-Version": PERSONA_VERSION,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            name: `Rentmaikar Identity – ${country}`,
            "source-inquiry-template-id": masterId,
          },
        },
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      await supa.from("persona_region_templates").update({
        provision_status: "error",
        provision_error: JSON.stringify(body).slice(0, 500),
      }).eq("country_code", country);
      return new Response(JSON.stringify({ error: "Persona error", detail: body }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newTemplateId = body?.data?.id as string;

    const { data: row, error } = await supa.from("persona_region_templates").upsert({
      country_code: country,
      inquiry_template_id: newTemplateId,
      environment_id: envId,
      source_template_id: masterId,
      auto_generated: true,
      is_active: true,
      provision_status: "ready",
      provision_error: null,
      provisioned_at: new Date().toISOString(),
    }, { onConflict: "country_code" }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, template: row }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
