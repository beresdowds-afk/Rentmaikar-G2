// Live per-call STT segment logger.
// Multipart form fields:
//   audio: File (WAV/MP3/OGG) — required
//   callId: string (voip_calls.id) — required
//   segmentIndex: number
//   speaker?: string
//   language_code?: string
//   segmentStartedAt?: ISO string
//   segmentEndedAt?: ISO string
//   saveAudio?: "true" | "false" (default false) — when true, uploads audio to voip-call-recordings
// Auth: bearer JWT of a call participant (initiator/receiver/participant) OR admin.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECORDINGS_BUCKET = "voip-call-recordings";

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
  const userId = (authRes as { userId: string }).userId;

  const supa = admin();

  try {
    const ELEVENLABS_API_KEY = (Deno.env.get("ELEVENLABS_API_KEY") ?? Deno.env.get("ELEVEN_LABS_API_KEY"));
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const callId = String(form.get("callId") || "");
    if (!callId) {
      return new Response(JSON.stringify({ error: "Missing callId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return new Response(JSON.stringify({ error: "Missing 'audio' file" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Authorization: must be admin OR a participant of this call.
    const [{ data: call }, { data: isAdmin }, { data: partRow }] = await Promise.all([
      supa.from("voip_calls").select("id, initiated_by, receiver_id").eq("id", callId).maybeSingle(),
      supa.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supa.from("voip_call_participants").select("id").eq("call_id", callId).eq("user_id", userId).maybeSingle(),
    ]);

    if (!call) {
      return new Response(JSON.stringify({ error: "Call not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const isParticipant =
      isAdmin === true ||
      call.initiated_by === userId ||
      call.receiver_id === userId ||
      !!partRow;
    if (!isParticipant) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const fileName = (audio as File).name || "segment.wav";
    const fileSize = (audio as File).size ?? 0;
    const mimeType = (audio as File).type || "audio/wav";
    if (fileSize === 0) {
      return new Response(JSON.stringify({ error: "Audio segment is empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (fileSize > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Segment exceeds 25 MiB" }), {
        status: 413,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const segmentIndex = Number(form.get("segmentIndex") || 0);
    const speaker = (form.get("speaker") as string) || null;
    const languageCode = (form.get("language_code") as string) || "";
    const saveAudio = String(form.get("saveAudio") || "false").toLowerCase() === "true";
    const segmentStartedAt = (form.get("segmentStartedAt") as string) || null;
    const segmentEndedAt = (form.get("segmentEndedAt") as string) || null;

    const audioBuf = await (audio as Blob).arrayBuffer();

    // Optional: persist the raw segment audio for the voice log.
    let storagePath: string | null = null;
    if (saveAudio) {
      const ext = (fileName.split(".").pop() || "wav").toLowerCase();
      storagePath = `${callId}/${String(segmentIndex).padStart(4, "0")}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supa.storage
        .from(RECORDINGS_BUCKET)
        .upload(storagePath, new Uint8Array(audioBuf), { contentType: mimeType, upsert: false });
      if (upErr) {
        console.error("[voip-transcript-log] upload error:", upErr.message);
        storagePath = null;
      }
    }

    // Send to ElevenLabs Scribe.
    const apiForm = new FormData();
    apiForm.append("file", new Blob([audioBuf], { type: mimeType }), fileName);
    apiForm.append("model_id", "scribe_v2");
    apiForm.append("tag_audio_events", "false");
    apiForm.append("diarize", "false");
    if (languageCode) apiForm.append("language_code", languageCode);

    const started = Date.now();
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: apiForm,
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[voip-transcript-log] STT ${response.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: "Transcription failed", status: response.status, details: errText }),
        { status: response.status, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    const data = await response.json();
    const text: string = (data?.text ?? "").toString();

    // Persist transcript segment (only if there is meaningful text or an audio recording).
    if (text.trim().length > 0 || storagePath) {
      const { data: inserted, error: insErr } = await supa
        .from("voip_call_transcripts")
        .insert({
          call_id: callId,
          segment_index: segmentIndex,
          speaker,
          transcript_text: text.slice(0, 100000),
          language_code: data?.language_code || languageCode || null,
          words: data?.words ?? null,
          source: "elevenlabs_scribe_v2",
          audio_storage_path: storagePath,
          audio_bytes: fileSize,
          duration_ms: Date.now() - started,
          segment_started_at: segmentStartedAt,
          segment_ended_at: segmentEndedAt,
          created_by: userId,
        })
        .select("id")
        .single();
      if (insErr) console.error("[voip-transcript-log] insert error:", insErr.message);
      return new Response(
        JSON.stringify({
          id: inserted?.id ?? null,
          text,
          language: data?.language_code || languageCode || null,
          words: data?.words ?? null,
          audio_storage_path: storagePath,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(JSON.stringify({ text: "", skipped: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[voip-transcript-log] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
