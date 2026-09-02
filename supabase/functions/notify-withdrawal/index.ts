// deno-lint-ignore-file no-explicit-any
/**
 * HTTP entrypoint for the owner-withdrawal notification service.
 *
 * Callers:
 *   - internal (cron secret / service role) — any owner, any event
 *   - the owner themselves — only their own `requested` / `pending_approval`
 *   - admin / admin_assistant — any owner, any event (approval decisions)
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { resolveCaller } from "../_shared/guard.ts";
import { notifyWithdrawalEvent } from "../_shared/withdrawal-notify.ts";

const Body = z.object({
  event: z.enum([
    "requested",
    "pending_approval",
    "approved",
    "rejected",
    "submitted",
    "completed",
    "failed",
  ]),
  ownerId: z.string().uuid().optional(),
  amount: z.number().nonnegative(),
  currency: z.string().min(1).max(8),
  provider: z.string().max(32).optional().nullable(),
  payoutId: z.string().uuid().optional().nullable(),
  authorizationId: z.string().uuid().optional().nullable(),
  destination: z.string().max(120).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const SELF_EVENTS = new Set(["requested", "pending_approval"]);

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await resolveCaller(req);
    if (!caller.internal && !caller.userId) return json({ error: "Unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const input = parsed.data;

    const isStaff = caller.roles.some((r) => r === "admin" || r === "admin_assistant");
    const ownerId = input.ownerId ?? caller.userId;
    if (!ownerId) return json({ error: "ownerId required" }, 400);

    if (!caller.internal && !isStaff) {
      if (ownerId !== caller.userId || !SELF_EVENTS.has(input.event)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await notifyWithdrawalEvent(supabase, { ...input, ownerId });
    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});
