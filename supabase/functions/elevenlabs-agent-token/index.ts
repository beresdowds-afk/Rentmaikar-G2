import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mints a short-lived WebRTC conversation token for the ElevenLabs voice agent.
// The agent must be created in the ElevenLabs dashboard; its ID is provided
// per-request by the client (or falls back to ELEVENLABS_AGENT_ID secret).
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const authRes = await requireAuthenticatedUser(req);
  if (authRes instanceof Response) return authRes;

  try {
    const ELEVENLABS_API_KEY = (Deno.env.get("ELEVENLABS_API_KEY") ?? Deno.env.get("ELEVEN_LABS_API_KEY"));
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    let body: { agentId?: string } = {};
    try { body = await req.json(); } catch { /* body optional */ }

    const agentId = body.agentId || Deno.env.get("ELEVENLABS_AGENT_ID");
    if (!agentId) {
      return new Response(
        JSON.stringify({
          error: "No ElevenLabs agent ID provided. Pass { agentId } in the request body or set ELEVENLABS_AGENT_ID secret.",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ElevenLabs Agent] Token error ${response.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: "Failed to mint agent token", status: response.status, details: errText }),
        { status: response.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify({ token: data.token, agentId }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[ElevenLabs Agent Token] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
