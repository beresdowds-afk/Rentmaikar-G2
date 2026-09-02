import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REGION_VOICES: Record<string, string> = {
  US: "aVwphcJSEW1eYLC622Ru",
  NG: "aVwphcJSEW1eYLC622Ru",
  default: "aVwphcJSEW1eYLC622Ru",
};

const MODEL_ID = "eleven_multilingual_v2";
const BUCKET = "elevenlabs-test-audio";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authRes = await requireAuthenticatedUser(req);
  if (authRes instanceof Response) return authRes;
  const userId = (authRes as { userId: string }).userId ?? null;

  const startedAt = Date.now();
  let inputText = "";
  let region = "US";
  let voiceId = "";
  const supa = admin();

  try {
    const ELEVENLABS_API_KEY = (Deno.env.get("ELEVENLABS_API_KEY") ?? Deno.env.get("ELEVEN_LABS_API_KEY"));
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    const body = await req.json();
    inputText = String(body?.text ?? "");
    region = body?.region || "US";
    const overrideVoice = body?.voiceId;

    if (!inputText.trim()) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const safeText = inputText.slice(0, 5000);
    voiceId = overrideVoice || REGION_VOICES[region] || REGION_VOICES.default;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: safeText,
          model_id: MODEL_ID,
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 0.95 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      await supa.from("elevenlabs_test_logs").insert({
        user_id: userId, kind: "tts", status: "error",
        region, voice_id: voiceId, model_id: MODEL_ID, input_text: safeText,
        duration_ms: Date.now() - startedAt,
        request_metadata: { chars: safeText.length },
        response_metadata: { http_status: response.status },
        error_message: errText.slice(0, 2000),
      });
      throw new Error(`ElevenLabs API error [${response.status}]: ${errText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const bytes = audioBuffer.byteLength;

    // Upload to storage for admin review
    const storagePath = `tts/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.mp3`;
    const { error: upErr } = await supa.storage.from(BUCKET).upload(storagePath, new Uint8Array(audioBuffer), {
      contentType: "audio/mpeg", upsert: false,
    });
    if (upErr) console.error("[elevenlabs-tts] upload error:", upErr.message);

    await supa.from("elevenlabs_test_logs").insert({
      user_id: userId, kind: "tts", status: "success",
      region, voice_id: voiceId, model_id: MODEL_ID, input_text: safeText,
      audio_storage_path: upErr ? null : storagePath,
      audio_bytes: bytes,
      duration_ms: Date.now() - startedAt,
      request_metadata: { chars: safeText.length, output_format: "mp3_44100_128" },
      response_metadata: { http_status: 200, content_type: "audio/mpeg" },
    });

    return new Response(audioBuffer, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[ElevenLabs TTS] Error:", msg);
    try {
      await supa.from("elevenlabs_test_logs").insert({
        user_id: userId, kind: "tts", status: "error",
        region, voice_id: voiceId, input_text: inputText.slice(0, 5000),
        duration_ms: Date.now() - startedAt,
        error_message: msg.slice(0, 2000),
      });
    } catch (_) { /* swallow */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
