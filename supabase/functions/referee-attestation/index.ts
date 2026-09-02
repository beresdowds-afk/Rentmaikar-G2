// Public endpoint. GET: returns minimal context for the attestation page from a token.
// POST: records the referee's attested response and, on negative, notifies admins
// and admin assistants for manual review. verify_jwt is off; auth is by opaque token.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const PostBody = z.object({
  token: z.string().min(20),
  response: z.enum(["positive", "negative"]),
  comments: z.string().max(2000).optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token") ?? "";
      if (!token) return json(400, { error: "missing token" });
      const { data: r } = await supa.from("referee_verifications")
        .select("id, full_name, attestation_status, application_id")
        .eq("attestation_token", token).maybeSingle();
      if (!r) return json(404, { error: "invalid or expired link" });
      const { data: app } = await supa.from("applications")
        .select("full_name, first_name, last_name").eq("id", r.application_id).maybeSingle();
      const driver_name = (app as any)?.full_name
        ?? [(app as any)?.first_name, (app as any)?.last_name].filter(Boolean).join(" ")
        ?? "the driver";
      return json(200, {
        ok: true,
        referee_name: r.full_name,
        driver_name,
        already_submitted: r.attestation_status === "attested_positive" || r.attestation_status === "attested_negative",
      });
    }

    if (req.method !== "POST") return json(405, { error: "method not allowed" });

    const parsed = PostBody.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { token, response, comments } = parsed.data;

    const { data: r } = await supa.from("referee_verifications")
      .select("*").eq("attestation_token", token).maybeSingle();
    if (!r) return json(404, { error: "invalid or expired link" });
    if (r.attestation_status === "attested_positive" || r.attestation_status === "attested_negative") {
      return json(409, { error: "already submitted" });
    }

    const newStatus = response === "positive" ? "attested_positive" : "attested_negative";
    await supa.from("referee_verifications").update({
      attestation_status: newStatus,
      attestation_response: response,
      attestation_comments: comments ?? null,
      attested_at: new Date().toISOString(),
    }).eq("id", r.id);

    if (response === "negative") {
      // Flag the application for manual review
      await supa.from("applications").update({
        referees_verification_status: "action_required",
      }).eq("id", r.application_id);

      // Notify the driver (inbox)
      await supa.from("inbox_messages").insert({
        user_id: r.user_id, direction: "inbound", channel: "system",
        subject: "Referee attestation flagged",
        body: `Referee #${r.referee_index + 1} (${r.full_name}) returned a negative attestation. An administrator will review your application and may request updates to your referee list.`,
        status: "unread",
      }).then(() => {}, () => {});

      // Notify all admins & admin assistants
      const { data: admins } = await supa.from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "admin_assistant"] as any);

      if (admins?.length) {
        const rows = admins.map((a: any) => ({
          user_id: a.user_id, direction: "inbound", channel: "system",
          subject: "Manual review: negative referee attestation",
          body: `Referee ${r.full_name} returned a NEGATIVE attestation for application ${r.application_id}. Please review and decide whether to reject the registration or request updated referees.\n\nComments: ${comments ?? "(none provided)"}`,
          status: "unread",
        }));
        await supa.from("inbox_messages").insert(rows).then(() => {}, () => {});
      }
    }

    return json(200, { ok: true, status: newStatus });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
