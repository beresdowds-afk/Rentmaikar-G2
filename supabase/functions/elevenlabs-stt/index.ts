import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const supa = admin();
  let fileName = "";
  let fileSize = 0;
  let mimeType = "";
  let languageCode = "";

  try {
    const ELEVENLABS_API_KEY = (Deno.env.get("ELEVENLABS_API_KEY") ?? Deno.env.get("ELEVEN_LABS_API_KEY"));
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "Expected multipart/form-data with an 'audio' file" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return new Response(JSON.stringify({ error: "Missing 'audio' file field" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    fileName = (audio as File).name || "recording.wav";
    fileSize = (audio as File).size ?? 0;
    mimeType = (audio as File).type || "application/octet-stream";

    if (fileSize === 0) {
      return new Response(JSON.stringify({ error: "Audio file is empty" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (fileSize > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Audio file exceeds 25 MiB limit" }), {
        status: 413, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    languageCode = (form.get("language_code") as string) || "";
    const diarizeRaw = (form.get("diarize") as string) || "true";
    const tagEventsRaw = (form.get("tag_audio_events") as string) || "true";

    // Buffer once so we can both upload and forward
    const audioBuf = await (audio as Blob).arrayBuffer();

    // Upload input audio to storage for admin review
    const ext = (fileName.split(".").pop() || "bin").toLowerCase();
    const storagePath = `stt/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supa.storage.from(BUCKET).upload(
      storagePath,
      new Uint8Array(audioBuf),
      { contentType: mimeType, upsert: false },
    );
    if (upErr) console.error("[elevenlabs-stt] upload error:", upErr.message);

    const apiForm = new FormData();
    apiForm.append("file", new Blob([audioBuf], { type: mimeType }), fileName);
    apiForm.append("model_id", "scribe_v2");
    apiForm.append("diarize", diarizeRaw);
    apiForm.append("tag_audio_events", tagEventsRaw);
    if (languageCode) apiForm.append("language_code", languageCode);

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: apiForm,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ElevenLabs STT] Error ${response.status}: ${errText}`);
      await supa.from("elevenlabs_test_logs").insert({
        user_id: userId, kind: "stt", status: "error",
        input_file_name: fileName, input_file_size_bytes: fileSize, input_mime_type: mimeType,
        language_code: languageCode || null,
        audio_storage_path: upErr ? null : storagePath,
        duration_ms: Date.now() - startedAt,
        request_metadata: { diarize: diarizeRaw, tag_audio_events: tagEventsRaw },
        response_metadata: { http_status: response.status },
        error_message: errText.slice(0, 2000),
      });
      return new Response(JSON.stringify({ error: "Transcription failed", status: response.status, details: errText }), {
        status: response.status, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const data = await response.json();
    await supa.from("elevenlabs_test_logs").insert({
      user_id: userId, kind: "stt", status: "success",
      model_id: "scribe_v2",
      input_file_name: fileName, input_file_size_bytes: fileSize, input_mime_type: mimeType,
      transcript_text: (data?.text ?? "").slice(0, 100000),
      language_code: data?.language_code || languageCode || null,
      words: data?.words ?? null,
      audio_storage_path: upErr ? null : storagePath,
      audio_bytes: fileSize,
      duration_ms: Date.now() - startedAt,
      request_metadata: { diarize: diarizeRaw, tag_audio_events: tagEventsRaw },
      response_metadata: { http_status: 200, word_count: data?.words?.length ?? null },
    });

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[ElevenLabs STT] Error:", msg);
    try {
      await supa.from("elevenlabs_test_logs").insert({
        user_id: userId, kind: "stt", status: "error",
        input_file_name: fileName, input_file_size_bytes: fileSize, input_mime_type: mimeType,
        language_code: languageCode || null,
        duration_ms: Date.now() - startedAt,
        error_message: msg.slice(0, 2000),
      });
    } catch (_) { /* swallow */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
