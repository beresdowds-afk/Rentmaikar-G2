import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/*
 * Weekly bulk payout worker.
 *
 * Selection is explicit and durable: only rows classified
 * workflow_type = 'weekly_bulk' that an administrator approved
 * (weekly_approved_at) and that are due, still pending, never submitted to a
 * provider and not flagged for reconciliation are processed. Ordinary
 * self-withdrawals (workflow_type = 'self_withdrawal') are never selected, and
 * the cron secret authenticates the worker only - it is not business approval.
 *
 * This worker never creates payouts or reserves funds. For each selected row
 * it calls the backend `process-owner-payouts` endpoint, which atomically
 * claims the row (claim_weekly_owner_payout) before the single provider call.
 * Re-running after a crash is safe: claimed/submitted rows are not selected
 * again and ambiguous ones wait for reconciliation.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronDenied = await requireCronSecretAsync(req);
  if (cronDenied) return cronDenied;

  try {
    const backendUrl = Deno.env.get("BACKEND_URL");
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!backendUrl || !cronSecret) throw new Error("Worker backend is not configured");

    const { data: payouts, error } = await supabase
      .from("owner_payouts")
      .select("id, provider, payout_account_id, owner_payout_accounts(provider)")
      .eq("workflow_type", "weekly_bulk")
      .eq("status", "pending")
      .not("weekly_approved_at", "is", null)
      .eq("provider_attempts", 0)
      .eq("reconciliation_required", false)
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(200);

    if (error) throw new Error(`Failed to load scheduled payouts: ${error.message}`);

    const results = { attempted: 0, submitted: 0, failed: 0, skipped: 0, payouts: [] as unknown[] };

    for (const payout of payouts ?? []) {
      results.attempted++;
      const account = (payout as any).owner_payout_accounts;
      if (!account || account.provider !== payout.provider) {
        results.skipped++;
        results.payouts.push({
          payout_id: payout.id,
          status: "skipped",
          reason: account ? "provider mismatch" : "payout account not found",
        });
        continue;
      }

      try {
        const response = await fetch(`${backendUrl}/api/functions/process-owner-payouts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Cron-Secret": cronSecret,
            "X-Idempotency-Key": `weekly-payout:${payout.id}`,
          },
          body: JSON.stringify({ payout_id: payout.id, note: "Rentmaikar weekly owner payout" }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Payout execution failed [${response.status}]`);
        }
        results.submitted++;
        results.payouts.push({
          payout_id: payout.id,
          provider: payout.provider,
          status: body?.payout?.status ?? body?.status ?? "submitted",
        });
      } catch (err) {
        results.failed++;
        results.payouts.push({
          payout_id: payout.id,
          provider: payout.provider,
          status: "failed",
          error: err instanceof Error ? err.message : "Payout execution failed",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results, timestamp: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[process-owner-payouts]", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Weekly payout orchestration failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
