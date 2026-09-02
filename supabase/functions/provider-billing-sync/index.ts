// Pulls third-party billing data (Hologram today; Traccar/EMQX/others recorded
// as scheduled subscription charges from their billing account config) into
// public.provider_billing_events so provider costs can be reconciled against
// platform revenue independently of the providers' own dashboards.
//
// Invoked by admins from the Provider Billing panel and by pg_cron daily.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { hologram, normalizeDevice } from "../_shared/hologram-client.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface BillingAccount {
  id: string;
  provider: string;
  display_name: string;
  billing_currency: string;
  sync_enabled: boolean;
  is_active: boolean;
  config: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Auth: cron secret / service role, or an authenticated admin.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace("Bearer ", "").trim();
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronOk = (cronSecret && req.headers.get("x-cron-secret") === cronSecret) || bearer === serviceKey;

  let actor: string | null = null;
  if (!cronOk) {
    const { data: userData } = await admin.auth.getUser(bearer);
    const uid = userData?.user?.id;
    if (!uid) return json(401, { error: "Unauthorized" });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
    const allowed = (roles ?? []).some((r: { role: string }) =>
      ["admin", "admin_assistant", "iot_support"].includes(r.role)
    );
    if (!allowed) return json(403, { error: "Admin access required" });
    actor = uid;
  }

  const body = await req.json().catch(() => ({}));
  const action = String((body as { action?: string })?.action ?? "sync");

  try {
    if (action === "record_event") {
      const e = (body as { event?: Record<string, unknown> }).event ?? {};
      if (!e.provider || e.amount === undefined) {
        return json(400, { error: "provider and amount are required" });
      }
      const { data, error } = await admin
        .from("provider_billing_events")
        .insert({
          provider: e.provider,
          event_type: e.event_type ?? "invoice",
          description: e.description ?? null,
          amount: Number(e.amount),
          currency: e.currency ?? "USD",
          period_start: e.period_start ?? null,
          period_end: e.period_end ?? null,
          occurred_at: e.occurred_at ?? new Date().toISOString(),
          source: "manual",
          created_by: actor,
          raw: e.raw ?? {},
        })
        .select("id")
        .single();
      if (error) throw error;
      return json(200, { ok: true, id: data.id });
    }

    // ---- sync ----
    const { data: accountsRaw } = await admin
      .from("provider_billing_accounts")
      .select("*")
      .eq("is_active", true);
    const accounts = (accountsRaw ?? []) as unknown as BillingAccount[];

    const results: Record<string, { inserted: number; status: string; detail?: string }> = {};

    for (const account of accounts) {
      if (!account.sync_enabled) {
        results[account.provider] = { inserted: 0, status: "skipped", detail: "sync disabled" };
        continue;
      }

      let inserted = 0;
      let status = "success";
      let detail: string | undefined;

      try {
        if (account.provider === "hologram") {
          await hologram.ensureReady();
          if (!hologram.isConfigured()) {
            status = "skipped";
            detail = "hologram not configured";
          } else {
            const sims = await hologram.listAllSims(1000);
            if (!sims.ok) {
              status = "error";
              detail = `hologram ${"error" in sims ? sims.error : sims.reason}`;
            } else {
              const list = Array.isArray(sims.data) ? sims.data : [];
              const month = new Date();
              const periodStart = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
              const rows = list.map((raw) => {
                const sim = normalizeDevice(raw);
                const id = sim.device_id ?? "";
                const dataUsed = Number((raw as { datausage?: number }).datausage ?? 0);
                const monthlyFee = Number(
                  (account.config?.monthly_fee_per_sim as number) ?? 0,
                );
                return {
                  provider: "hologram",
                  external_id: `hologram:sim:${id}:${periodStart.slice(0, 7)}`,
                  event_type: "usage",
                  description: `SIM ${sim.iccid ?? id} monthly connectivity`,
                  quantity: dataUsed,
                  unit: "bytes",
                  amount: monthlyFee,
                  currency: account.billing_currency,
                  period_start: periodStart,
                  period_end: new Date().toISOString(),
                  sim_id: id || null,
                  source: "sync",
                  raw: raw,
                };
              });
              if (rows.length) {
                const { error, count } = await admin
                  .from("provider_billing_events")
                  .upsert(rows, { onConflict: "provider,external_id", count: "exact" });
                if (error) throw error;
                inserted = count ?? rows.length;
              }
            }
          }
        } else {
          // Providers without a billing API: post the configured recurring
          // subscription charge once per period so costs stay reconcilable.
          const fee = Number((account.config?.monthly_fee as number) ?? 0);
          if (fee > 0) {
            const now = new Date();
            const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const { error } = await admin.from("provider_billing_events").upsert(
              [
                {
                  provider: account.provider,
                  external_id: `${account.provider}:subscription:${periodStart.slice(0, 7)}`,
                  event_type: "subscription",
                  description: `${account.display_name} monthly subscription`,
                  amount: fee,
                  currency: account.billing_currency,
                  period_start: periodStart,
                  period_end: now.toISOString(),
                  source: "sync",
                  raw: { from: "billing_account_config" },
                },
              ],
              { onConflict: "provider,external_id" },
            );
            if (error) throw error;
            inserted = 1;
          } else {
            status = "skipped";
            detail = "no monthly_fee configured";
          }
        }
      } catch (err) {
        status = "error";
        detail = err instanceof Error ? err.message : String(err);
      }

      await admin
        .from("provider_billing_accounts")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: status,
          last_sync_detail: detail ?? null,
        })
        .eq("id", account.id);

      results[account.provider] = { inserted, status, detail };
    }

    return json(200, { ok: true, results });
  } catch (err) {
    console.error("provider-billing-sync failed", err);
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
