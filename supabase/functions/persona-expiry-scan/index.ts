// Daily: for user documents expiring in <=14 days, queue Persona re-verification.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 14);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const { data: docs } = await supa
      .from("user_documents")
      .select("user_id, document_type, expires_at, expiry_date")
      .in("document_type", ["drivers_license", "nin", "bvn", "vehicle_registration", "vin"])
      .or(`expires_at.lte.${cutoffStr},expiry_date.lte.${cutoffStr}`)
      .gte("expires_at", today);

    const uniqueUsers = new Set<string>((docs ?? []).map((d: any) => d.user_id));
    const results: any[] = [];
    for (const uid of uniqueUsers) {
      // Skip if a fresh pending inquiry already exists in last 7 days
      const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recent } = await supa
        .from("persona_inquiries")
        .select("id, status")
        .eq("user_id", uid)
        .in("status", ["pending", "approved"])
        .gte("created_at", sinceIso)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const r = await supa.functions.invoke("persona-send-reverification", {
        body: { user_id: uid, reason: "One or more of your identity documents expires within 14 days.", channel: "both" },
        headers: { "x-cron-secret": cronSecret ?? "" },
      }).catch((e) => ({ error: String(e) }));
      results.push({ user_id: uid, r });
    }

    return new Response(JSON.stringify({ ok: true, scanned: uniqueUsers.size, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
