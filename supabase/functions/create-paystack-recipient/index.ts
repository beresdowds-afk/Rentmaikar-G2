// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  bankCode: z.string().min(3),
  accountNumber: z.string().min(6),
  currency: z.enum(["NGN", "GHS", "ZAR", "KES", "XOF", "EGP"]),
  countryCode: z.string().length(2),
  makeDefault: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return json({ error: "Paystack not configured" }, 503);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const owner = u?.user;
    if (!owner) return json({ error: "Unauthenticated" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    // Resolve bank details
    const resolveResp = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${b.accountNumber}&bank_code=${b.bankCode}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const resolve = await resolveResp.json();
    if (!resolveResp.ok || !resolve?.status) {
      return json({ error: resolve?.message ?? "Could not resolve account" }, 400);
    }
    const accountName = resolve.data.account_name as string;

    // Create transfer recipient
    const recResp = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "nuban", name: accountName,
        account_number: b.accountNumber, bank_code: b.bankCode, currency: b.currency,
      }),
    });
    const rec = await recResp.json();
    if (!recResp.ok || !rec?.status) return json({ error: rec?.message ?? "recipient create failed" }, 502);

    if (b.makeDefault) {
      await supabase.from("owner_payout_accounts")
        .update({ is_default: false }).eq("owner_id", owner.id);
    }

    const { data: row, error } = await supabase.from("owner_payout_accounts").insert({
      owner_id: owner.id,
      country_code: b.countryCode.toUpperCase(),
      provider: "paystack",
      bank_code: b.bankCode,
      account_number: b.accountNumber,
      account_name: accountName,
      recipient_code: rec.data.recipient_code,
      currency: b.currency,
      is_verified: true,
      is_default: b.makeDefault ?? false,
    }).select("*").maybeSingle();
    if (error) return json({ error: error.message }, 400);

    return json({ account: row });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
