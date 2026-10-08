import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { postLedgerEntry } from "../_shared/wallet-ledger.ts";
import { transitionState } from "../_shared/withdrawal-authorization.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  const cronDenied =
    await requireCronSecretAsync(req);

  if (cronDenied) return cronDenied;

  try {
    /*
     * Only payout records already authorized for scheduled processing
     * are eligible here.
     *
     * Do NOT turn owner_earnings directly into a payout without the
     * existing withdrawal authorization/risk process.
     */
    const { data: payouts, error } = await supabase
      .from("owner_payouts")
      .select(`
        *,
        owner_payout_accounts(*)
      `)
      .in("status", ["authorized", "pending"])
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", {
        ascending: true,
      })
      .limit(200);

    if (error) {
      throw new Error(
        `Failed to load scheduled payouts: ${error.message}`,
      );
    }

    const results = {
      attempted: 0,
      submitted: 0,
      failed: 0,
      skipped: 0,
      payouts: [] as unknown[],
    };

    for (const payout of payouts || []) {
      results.attempted++;

      const account =
        payout.owner_payout_accounts;

      if (!account) {
        results.skipped++;

        results.payouts.push({
          payout_id: payout.id,
          status: "skipped",
          reason: "payout account not found",
        });

        continue;
      }

      if (
        payout.provider !== account.provider
      ) {
        results.skipped++;

        results.payouts.push({
          payout_id: payout.id,
          status: "skipped",
          reason: "provider mismatch",
        });

        continue;
      }

      /*
       * PayPal.
       */
      if (payout.provider === "paypal") {
        if (!account.paypal_email) {
          results.skipped++;

          results.payouts.push({
            payout_id: payout.id,
            status: "skipped",
            reason: "PayPal email missing",
          });

          continue;
        }

        /*
         * The actual PayPal disbursement should be executed by the
         * authoritative PayPal payout service.
         *
         * Do not mark the payout completed here.
         */
        try {
          const response = await fetch(
            `${Deno.env.get("BACKEND_URL")}/api/functions/initiate-paypal-payout`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                "X-Cron-Secret":
                  Deno.env.get("CRON_SECRET") || "",
                "X-Idempotency-Key":
                  `weekly-payout:${payout.id}`,
              },
              body: JSON.stringify({
                owner_id: payout.owner_id,
                amount: Number(payout.amount),
                currency: payout.currency,
                payout_account_id:
                  payout.payout_account_id,
                authorization_id:
                  payout.authorization_id,
                note:
                  "Rentmaikar weekly owner payout",
              }),
            },
          );

          const body =
            await response.json().catch(
              () => ({}),
            );

          if (!response.ok) {
            throw new Error(
              body?.error ||
              `PayPal payout orchestration failed [${response.status}]`,
            );
          }

          results.submitted++;

          results.payouts.push({
            payout_id: payout.id,
            provider: "paypal",
            status:
              body?.payout?.status ||
              "submitted",
          });
        } catch (err) {
          results.failed++;

          results.payouts.push({
            payout_id: payout.id,
            provider: "paypal",
            status: "failed",
            error:
              err instanceof Error
                ? err.message
                : "PayPal payout failed",
          });
        }

        continue;
      }

      /*
       * Paystack.
       */
      if (payout.provider === "paystack") {
        if (!account.recipient_code) {
          results.skipped++;

          results.payouts.push({
            payout_id: payout.id,
            status: "skipped",
            reason:
              "Paystack recipient code missing",
          });

          continue;
        }

        try {
          const response = await fetch(
            `${Deno.env.get("BACKEND_URL")}/api/functions/initiate-paystack-transfer`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                "X-Cron-Secret":
                  Deno.env.get("CRON_SECRET") || "",
                "X-Idempotency-Key":
                  `weekly-payout:${payout.id}`,
              },
              body: JSON.stringify({
                owner_id: payout.owner_id,
                amount: Number(payout.amount),
                currency: payout.currency,
                payout_account_id:
                  payout.payout_account_id,
                authorization_id:
                  payout.authorization_id,
                note:
                  "Rentmaikar weekly owner payout",
              }),
            },
          );

          const body =
            await response.json().catch(
              () => ({}),
            );

          if (!response.ok) {
            throw new Error(
              body?.error ||
              `Paystack payout orchestration failed [${response.status}]`,
            );
          }

          results.submitted++;

          results.payouts.push({
            payout_id: payout.id,
            provider: "paystack",
            status:
              body?.payout?.status ||
              "submitted",
          });
        } catch (err) {
          results.failed++;

          results.payouts.push({
            payout_id: payout.id,
            provider: "paystack",
            status: "failed",
            error:
              err instanceof Error
                ? err.message
                : "Paystack payout failed",
          });
        }

        continue;
      }

      /*
       * No provider = no disbursement.
       */
      results.skipped++;

      results.payouts.push({
        payout_id: payout.id,
        status: "skipped",
        reason: `Unsupported provider: ${payout.provider}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp:
          new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  } catch (error) {
    console.error(
      "[process-owner-payouts]",
      error,
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Weekly payout orchestration failed",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  }
});
