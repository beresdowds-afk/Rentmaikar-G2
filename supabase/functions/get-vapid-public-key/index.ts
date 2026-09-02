import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? null;
  return new Response(JSON.stringify({ publicKey, configured: Boolean(publicKey) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
