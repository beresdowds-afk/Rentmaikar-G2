// Admin-triggered retry of failed notification deliveries.
// Resets the selected outbox rows back to `pending` (attempts = 0) and then
// invokes `dispatch-event-notifications` so the retry happens immediately.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { isCallerAdmin } from "../_shared/admin-auth.ts";

const Body = z
  .object({
    ids: z.array(z.string().uuid()).max(200).optional(),
    record_id: z.string().min(1).max(128).optional(),
    source_table: z.string().min(1).max(64).optional(),
  })
  .refine((b) => (b.ids && b.ids.length > 0) || b.record_id, {
    message: "Provide either ids or record_id",
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!(await isCallerAdmin(req))) {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: parsed.error.flatten() }, 400);
    }
    const { ids, record_id, source_table } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let query = supabase
      .from("event_notification_outbox")
      .update({
        status: "pending",
        attempts: 0,
        last_error: null,
        delivered_at: null,
      })
      .in("status", ["failed", "skipped"]);

    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    } else {
      query = query.eq("record_id", record_id!);
      if (source_table) query = query.eq("source_table", source_table);
    }

    const { data: requeued, error } = await query.select("id, channel, kind, record_id");
    if (error) throw error;

    let dispatch: unknown = null;
    if ((requeued ?? []).length > 0) {
      const res = await fetch(`${supabaseUrl}/functions/v1/dispatch-event-notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ trigger: "admin-retry" }),
      });
      dispatch = await res.json().catch(() => ({ ok: res.ok }));
    }

    return json({
      success: true,
      requeued: requeued ?? [],
      requeued_count: (requeued ?? []).length,
      dispatch,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[retry-event-notifications] failed", message);
    return json({ error: message }, 500);
  }
});
