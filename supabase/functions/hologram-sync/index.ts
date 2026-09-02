// Scheduled Hologram SIM refresh.
// Pulls the org SIM inventory from Hologram, upserts new SIMs, refreshes state
// and usage for known SIMs, and records every run (success or failure) in
// iot_sync_activity_log + iot_sync_state so admins can see it in the dashboard.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bytesToMb, hologram, monthlyUsageBytes, normalizeDevice } from "../_shared/hologram-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const log = async (
    event: string,
    level: "info" | "warn" | "error",
    message: string,
    details: Record<string, unknown> = {},
  ) => {
    await supabase.from("iot_sync_activity_log").insert({
      provider: "hologram", event, level, message, details,
    } as never);
  };

  // Cron-only endpoint (service role or CRON_SECRET). Admin UI calls it with
  // the service key through hologram-admin, never directly from the browser.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(cronSecret && provided === cronSecret) && bearer !== serviceKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  const startedAt = new Date().toISOString();
  await supabase.from("iot_sync_state").upsert(
    { provider: "hologram", state: "running", last_sync_at: startedAt },
    { onConflict: "provider" },
  );

  try {
    await hologram.ensureReady();

    if (!hologram.isConfigured()) {
      await log("sync_skipped", "warn", "Hologram credentials are not configured");
      await supabase.from("iot_sync_state").upsert(
        { provider: "hologram", state: "skipped", last_sync_at: startedAt, last_error: "not_configured", last_error_at: startedAt },
        { onConflict: "provider" },
      );
      return json({ ok: true, skipped: true, reason: "hologram_not_configured" });
    }

    let imported = 0;
    let updated = 0;
    const errors: Array<{ sim: string; error: string }> = [];

    // 1) Pull the org inventory so newly provisioned SIMs appear automatically.
    //    /devices is cursor paged (`continues` + `startafter`).
    const inventory = await hologram.listAllSims(1000);
    if (!inventory.ok) {
      const detail = "reason" in inventory ? inventory.reason : "provider_error";
      const message = "error" in inventory ? inventory.error : String(detail);
      await log("inventory_fetch_failed", "error", `Could not list SIMs from Hologram (${message})`, inventory as never);
      errors.push({ sim: "*", error: message });
    } else {
      const rows = Array.isArray(inventory.data) ? inventory.data : [];
      for (const raw of rows) {
        const s = normalizeDevice(raw);
        const providerSimId = s.device_id ?? "";
        const iccid = s.iccid ?? providerSimId;
        if (!iccid) continue;
        const { error } = await supabase.from("iot_sim_cards").upsert({
          iccid,
          provider: "hologram",
          provider_sim_id: providerSimId,
          msisdn: s.msisdn,
          imsi: s.imsi,
          status: s.state ?? "unknown",
          plan_name: s.plan_id ? String(s.plan_id) : null,
          metadata: raw as never,
        } as never, { onConflict: "iccid" });
        if (error) errors.push({ sim: iccid, error: error.message });
        else imported++;
      }
    }

    // 2) Refresh state + usage for every tracked SIM.
    const { data: sims } = await supabase
      .from("iot_sim_cards")
      .select("id, provider_sim_id, iccid")
      .eq("provider", "hologram")
      .not("provider_sim_id", "is", null)
      .limit(500);

    for (const sim of sims || []) {
      const simId = sim.provider_sim_id as string;
      const info = await hologram.getSim(simId);
      if (!info.ok) {
        errors.push({
          sim: sim.iccid as string,
          error: "error" in info ? info.error : ("reason" in info ? String(info.reason) : "provider_error"),
        });
        continue;
      }
      const norm = normalizeDevice(info.data);
      const usage = norm.link_id ? await hologram.getSimUsage(simId, norm.link_id) : null;
      const dataMb = usage?.ok ? bytesToMb(monthlyUsageBytes(usage.data)) : null;
      const { error } = await supabase.from("iot_sim_cards").update({
        status: norm.state ?? undefined,
        msisdn: norm.msisdn ?? undefined,
        imsi: norm.imsi ?? undefined,
        data_usage_mb: dataMb ?? undefined,
        data_limit_mb: norm.overage_limit && norm.overage_limit > 0
          ? Math.round(norm.overage_limit / 1_000_000)
          : undefined,
        last_session_at: new Date().toISOString(),
        metadata: info.data as never,
      }).eq("id", sim.id);
      if (error) errors.push({ sim: sim.iccid as string, error: error.message });
      else updated++;
    }

    const finishedAt = new Date().toISOString();
    const hasErrors = errors.length > 0;

    await log(
      "sync_completed",
      hasErrors ? "warn" : "info",
      `Refreshed ${updated} SIM(s), upserted ${imported} from inventory${hasErrors ? `, ${errors.length} error(s)` : ""}`,
      { imported, updated, errors: errors.slice(0, 25) },
    );

    await supabase.from("iot_sync_state").upsert({
      provider: "hologram",
      state: hasErrors ? "degraded" : "idle",
      last_sync_at: finishedAt,
      last_success_at: finishedAt,
      devices_synced: updated,
      last_error: hasErrors ? errors[0].error : null,
      last_error_at: hasErrors ? finishedAt : null,
      extra: { imported, errors: errors.length },
    } as never, { onConflict: "provider" });

    return json({ ok: true, imported, updated, errors });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("hologram-sync failed", e);
    await log("sync_failed", "error", msg);
    await supabase.from("iot_sync_state").upsert({
      provider: "hologram",
      state: "error",
      last_sync_at: new Date().toISOString(),
      last_error: msg,
      last_error_at: new Date().toISOString(),
    } as never, { onConflict: "provider" });
    return json({ ok: false, error: msg }, 500);
  }
});
