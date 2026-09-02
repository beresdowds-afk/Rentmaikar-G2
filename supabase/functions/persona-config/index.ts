import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  canonicalizeUserRole,
  PERSONA_TEMPLATE_IDS,
  templateForRole,
  type PersonaSubjectRole,
} from "../_shared/persona-templates.ts";

const ROLES: PersonaSubjectRole[] = [
  "driver",
  "owner",
  "referee",
  "proxy",
  "admin_assistant",
  "support_staff",
];

const UpsertBody = z.object({
  subject_role: z.string().min(1),
  template_id: z.string().trim().min(3).max(120),
  environment_id: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "unauthorized" }, 401);
  }

  // Any signed-in user can read env + effective template for their own flow.
  // Only admins can list per-role config or upsert changes.
  const { data: adminCheck } = await supa
    .rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  const isAdmin = adminCheck === true;

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const roleParam = url.searchParams.get("role");
      const envId = Deno.env.get("PERSONA_ENVIRONMENT_ID") ?? null;

      if (roleParam && !isAdmin) {
        // Non-admin: return only the effective template for the requested role.
        const canonical = canonicalizeUserRole(roleParam);
        if (!canonical) return json({ error: "invalid_role" }, 400);
        const { data } = await supa
          .from("persona_template_config")
          .select("template_id, environment_id")
          .eq("subject_role", canonical)
          .maybeSingle();
        return json({
          environment_id: data?.environment_id ?? envId,
          template_id: data?.template_id ?? templateForRole(canonical),
          subject_role: canonical,
        });
      }

      if (!isAdmin) return json({ error: "forbidden" }, 403);

      const { data, error } = await supa
        .from("persona_template_config")
        .select("subject_role, template_id, environment_id, notes, updated_by, updated_at")
        .order("subject_role");
      if (error) throw error;

      // Merge defaults so admins always see every role even before overrides exist.
      const byRole = new Map<string, any>((data ?? []).map((r: any) => [r.subject_role, r]));
      const merged = ROLES.map((role) => ({
        subject_role: role,
        template_id: byRole.get(role)?.template_id ?? PERSONA_TEMPLATE_IDS[role],
        environment_id: byRole.get(role)?.environment_id ?? null,
        notes: byRole.get(role)?.notes ?? null,
        updated_at: byRole.get(role)?.updated_at ?? null,
        is_override: byRole.has(role),
      }));

      return json({ environment_id: envId, roles: merged });
    }

    if (req.method === "POST" || req.method === "PUT") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const parsed = UpsertBody.safeParse(await req.json());
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

      const canonical = canonicalizeUserRole(parsed.data.subject_role);
      if (!canonical) return json({ error: "invalid_role" }, 400);

      const { data, error } = await supa
        .from("persona_template_config")
        .upsert(
          {
            subject_role: canonical,
            template_id: parsed.data.template_id,
            environment_id: parsed.data.environment_id ?? null,
            notes: parsed.data.notes ?? null,
            updated_by: userData.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "subject_role" },
        )
        .select()
        .single();
      if (error) throw error;
      return json({ config: data });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
