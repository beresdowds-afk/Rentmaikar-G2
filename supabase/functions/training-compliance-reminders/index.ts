// Deploys as `training-compliance-reminders`. Scheduled job that pushes a
// reminder to every driver whose compliance training is not fully verified,
// and to drivers whose 6-month refresh is due.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternal } from "../_shared/guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = requireInternal(req);
  if (denied) return denied;

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: drivers, error: driverErr } = await supa
      .from("user_roles")
      .select("user_id")
      .eq("role", "driver");
    if (driverErr) throw driverErr;

    const driverIds = (drivers ?? []).map((d: { user_id: string }) => d.user_id);
    if (driverIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: modules }, { data: completions }, { data: refresh }] = await Promise.all([
      supa.from("training_modules").select("id, region").eq("is_active", true),
      supa.from("training_completions").select("user_id, module_id, verification_status")
        .in("user_id", driverIds),
      supa.from("training_refresh_requirements").select("user_id, next_due_at")
        .in("user_id", driverIds),
    ]);

    const { data: profiles } = await supa
      .from("profiles").select("id, preferred_country").in("id", driverIds);
    const regionOf = new Map(
      (profiles ?? []).map((p: { id: string; preferred_country: string | null }) => [
        p.id,
        p.preferred_country ?? "US",
      ]),
    );

    const verifiedByUser = new Map<string, Set<string>>();
    for (const c of (completions ?? []) as Array<{ user_id: string; module_id: string; verification_status: string }>) {
      if (c.verification_status !== "verified") continue;
      if (!verifiedByUser.has(c.user_id)) verifiedByUser.set(c.user_id, new Set());
      verifiedByUser.get(c.user_id)!.add(c.module_id);
    }
    const dueByUser = new Map(
      (refresh ?? []).map((r: { user_id: string; next_due_at: string }) => [r.user_id, r.next_due_at]),
    );

    let notified = 0;
    for (const userId of driverIds) {
      const region = regionOf.get(userId) ?? "US";
      const required = (modules ?? []).filter(
        (m: { region: string }) => m.region === "all" || m.region === region,
      );
      if (required.length === 0) continue;

      const verified = verifiedByUser.get(userId) ?? new Set<string>();
      const outstanding = required.filter((m: { id: string }) => !verified.has(m.id)).length;
      const due = dueByUser.get(userId);
      const refreshDue = due ? new Date(due).getTime() <= Date.now() : false;

      if (outstanding === 0 && !refreshDue) continue;

      const body = refreshDue && outstanding === 0
        ? "Your 6-month compliance training refresh is due. Please complete it to stay active."
        : `${outstanding} required training module${outstanding === 1 ? "" : "s"} outstanding. Complete them to keep driving.`;

      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          user_id: userId,
          event: "training_reminder",
          title: "Compliance training required",
          body,
          data: { route: "/driver/training" },
        }),
      }).catch(() => {});
      notified++;
    }

    return new Response(JSON.stringify({ ok: true, notified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
