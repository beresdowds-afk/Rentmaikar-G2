// Shared helper: log an event to public.application_pipeline_events so the
// admin panel can show live status + last error per application.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type PipelineEventType =
  | "notify_referees"
  | "verify_referees"
  | "auto_submit_for_review";

export type PipelineStatus = "started" | "success" | "error";

export async function logPipelineEvent(params: {
  application_id: string | null | undefined;
  event_type: PipelineEventType;
  status: PipelineStatus;
  message?: string;
  details?: Record<string, unknown>;
  actor_id?: string | null;
}): Promise<void> {
  if (!params.application_id) return;
  try {
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    await supa.from("application_pipeline_events").insert({
      application_id: params.application_id,
      event_type: params.event_type,
      status: params.status,
      message: params.message ?? null,
      details: params.details ?? {},
      actor_id: params.actor_id ?? null,
    });
  } catch (_e) {
    // logging is best-effort; never break the caller.
  }
}
