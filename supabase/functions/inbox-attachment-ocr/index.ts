// Extracts text (OCR) from inbox image/PDF attachments using Lovable AI.
// Admin / admin_assistant only. Results are cached in inbox_attachment_ocr.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MAX_BYTES = 15 * 1024 * 1024;
const MODEL = "google/gemini-3.6-flash";

interface AttachmentInput {
  key: string;
  name: string;
  contentType: string;
  bucket: string | null;
  path: string | null;
  url: string | null;
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const isImage = (a: AttachmentInput) =>
  (a.contentType || "").toLowerCase().startsWith("image/") ||
  /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || "");

const isPdf = (a: AttachmentInput) =>
  (a.contentType || "").toLowerCase() === "application/pdf" || /\.pdf$/i.test(a.name || "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) return json({ error: "AI is not configured" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.slice(7);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(url, service);

    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    const { data: isAssistant } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin_assistant",
    });
    if (!isAdmin && !isAssistant) return json({ error: "Forbidden" }, 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const attachments = Array.isArray(body.attachments)
      ? (body.attachments as AttachmentInput[]).slice(0, 5)
      : [];
    const force = body.force === true;

    if (!messageId) return json({ error: "messageId is required" }, 400);
    if (attachments.length === 0) return json({ error: "attachments are required" }, 400);

    const results: Array<Record<string, unknown>> = [];

    for (const attachment of attachments) {
      const key = attachment.key || attachment.path || attachment.url || attachment.name;
      if (!key) continue;

      if (!isImage(attachment) && !isPdf(attachment)) {
        results.push({ key, status: "failed", error: "Only images and PDFs support OCR" });
        continue;
      }

      if (!force) {
        const { data: existing } = await admin
          .from("inbox_attachment_ocr")
          .select("id,status,extracted_text")
          .eq("message_id", messageId)
          .eq("attachment_key", key)
          .maybeSingle();
        if (existing && existing.status === "completed") {
          results.push({ key, status: "completed", cached: true });
          continue;
        }
      }

      await admin.from("inbox_attachment_ocr").upsert(
        {
          message_id: messageId,
          conversation_id: conversationId,
          attachment_key: key,
          filename: attachment.name || "attachment",
          content_type: attachment.contentType || null,
          status: "processing",
          error: null,
          requested_by: userData.user.id,
        },
        { onConflict: "message_id,attachment_key" },
      );

      const fail = async (message: string) => {
        await admin
          .from("inbox_attachment_ocr")
          .update({ status: "failed", error: message.slice(0, 500), processed_at: new Date().toISOString() })
          .eq("message_id", messageId)
          .eq("attachment_key", key);
        results.push({ key, status: "failed", error: message });
      };

      try {
        // Resolve bytes
        let bytes: Uint8Array | null = null;
        let mime = attachment.contentType || (isPdf(attachment) ? "application/pdf" : "image/jpeg");

        if (attachment.bucket && attachment.path) {
          const { data: file, error: dlErr } = await admin.storage
            .from(attachment.bucket)
            .download(attachment.path);
          if (dlErr || !file) throw new Error(dlErr?.message || "Could not download attachment");
          if (file.size > MAX_BYTES) throw new Error("File too large for OCR (max 15MB)");
          bytes = new Uint8Array(await file.arrayBuffer());
          if (file.type) mime = file.type;
        } else if (attachment.url) {
          const res = await fetch(attachment.url);
          if (!res.ok) throw new Error(`Could not fetch attachment (${res.status})`);
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength > MAX_BYTES) throw new Error("File too large for OCR (max 15MB)");
          bytes = buf;
          mime = res.headers.get("content-type") || mime;
        } else {
          throw new Error("Attachment has no readable location");
        }

        const dataUrl = `data:${mime};base64,${toBase64(bytes)}`;
        const contentBlock = isPdf(attachment)
          ? { type: "file", file: { filename: attachment.name || "document.pdf", file_data: dataUrl } }
          : { type: "image_url", image_url: { url: dataUrl } };

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content:
                  "You are an OCR engine. Transcribe every piece of visible text from the provided file, preserving reading order and line breaks. Return only the transcribed text, with no commentary. If there is no text, return exactly: [no text detected]",
              },
              { role: "user", content: [{ type: "text", text: "Extract all text from this file." }, contentBlock] },
            ],
          }),
        });

        if (aiRes.status === 429) throw new Error("AI rate limit reached, try again shortly");
        if (aiRes.status === 402) throw new Error("AI credits exhausted");
        if (!aiRes.ok) throw new Error(`AI error ${aiRes.status}: ${(await aiRes.text()).slice(0, 200)}`);

        const payload = await aiRes.json();
        const text: string = payload?.choices?.[0]?.message?.content ?? "";
        const clean = text.trim() === "[no text detected]" ? "" : text.trim();

        await admin
          .from("inbox_attachment_ocr")
          .update({
            status: "completed",
            extracted_text: clean,
            char_count: clean.length,
            error: null,
            processed_at: new Date().toISOString(),
          })
          .eq("message_id", messageId)
          .eq("attachment_key", key);

        results.push({ key, status: "completed", charCount: clean.length });
      } catch (e) {
        await fail(e instanceof Error ? e.message : "OCR failed");
      }
    }

    return json({ results });
  } catch (e) {
    console.error("inbox-attachment-ocr error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
