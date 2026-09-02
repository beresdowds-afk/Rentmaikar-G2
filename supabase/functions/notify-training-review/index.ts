// Deploys as `notify-training-review`. Called by admins after reviewing a
// compliance training completion; pushes the outcome to the driver's devices
// and records an in-app notification trail.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod@3.23.8";
import { requireAdminCaller } from "../_shared/guard.ts";

const Body = z.object({
  user_id: z.string().uuid(),
  approved: z.boolean(),
  module_title: z.string().min(1).max(200),
  training_complete: z.boolean().optional().default(false),
  notes: z.string().max(1000).nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireAdminCaller(req);
  if (denied) return denied;

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { user_id, approved, module_title, training_complete, notes } = parsed.data;

    const title = approved
      ? training_complete
        ? "Compliance training complete"
        : "Training module verified"
      : "Training module needs to be retaken";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // When the last module clears, tell the driver when the next refresh is due.
    let nextDueAt: string | null = null;
    if (approved && training_complete) {
      const { data: refresh } = await supa
        .from("training_refresh_requirements")
        .select("next_due_at")
        .eq("user_id", user_id)
        .maybeSingle();
      nextDueAt = (refresh as { next_due_at?: string } | null)?.next_due_at ?? null;
    }
    const dueLabel = nextDueAt
      ? new Date(nextDueAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      : null;

    const body = approved
      ? training_complete
        ? `All required modules are verified. Your training is now up to date.${
          dueLabel ? ` Next refresh due ${dueLabel}.` : ""
        }`
        : `"${module_title}" was verified by the compliance team.`
      : `"${module_title}" was rejected${notes ? `: ${notes}` : ""}. Please retake it.`;


    const pushRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          user_id,
          event: "training_review",
          title,
          body,
          data: {
            route: "/driver/training",
            approved: String(approved),
            ...(nextDueAt ? { next_due_at: nextDueAt } : {}),
          },
        }),
      },
    ).then((r) => r.json()).catch(() => ({ ok: false }));

    await supa.from("unified_message_log").insert({
      channel: "push",
      direction: "outbound",
      to_identifier: user_id,
      subject: title,
      body,
      metadata: {
        event: "training_review",
        approved,
        training_complete,
        next_due_at: nextDueAt,
      },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true, push: pushRes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
