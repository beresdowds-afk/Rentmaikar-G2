// Caller-authorization guards shared by edge functions that hold a
// service-role client. Every one of these returns a `Response` to send back
// when the caller is not allowed, or `null`/context when they are.
//
//   requireInternal            – cron secret or service-role bearer only
//   requireAuthenticated       – any signed-in user (or internal caller)
//   requireAdminCaller         – admin / admin_assistant role (or internal)
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
  "Content-Type": "application/json",
};

function deny(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

/** True when the request presents the cron secret or the service-role key. */
export function isInternalCaller(req: Request): boolean {
  const cron = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-secret");
  if (cron && provided && provided === cron) return true;
  const auth = req.headers.get("Authorization") ?? "";
  return !!serviceKey && auth.startsWith("Bearer ") && auth.slice(7) === serviceKey;
}

/** Internal-only endpoints (scheduled jobs, service-to-service fan-out). */
export function requireInternal(req: Request): Response | null {
  return isInternalCaller(req) ? null : deny(401, "Unauthorized");
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export interface Caller {
  userId: string | null;
  internal: boolean;
  roles: string[];
}

/** Resolve the caller identity without asserting anything about it. */
export async function resolveCaller(req: Request): Promise<Caller> {
  if (isInternalCaller(req)) return { userId: null, internal: true, roles: [] };
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { userId: null, internal: false, roles: [] };
  const admin = serviceClient();
  const { data, error } = await admin.auth.getUser(auth.slice(7));
  if (error || !data?.user) return { userId: null, internal: false, roles: [] };
  const { data: roleRows } = await admin
    .from("user_roles").select("role").eq("user_id", data.user.id);
  return {
    userId: data.user.id,
    internal: false,
    roles: (roleRows ?? []).map((r: { role: string }) => r.role),
  };
}

/** Any signed-in user, or an internal caller. */
export async function requireAuthenticated(
  req: Request,
): Promise<Caller | Response> {
  const caller = await resolveCaller(req);
  if (caller.internal || caller.userId) return caller;
  return deny(401, "Unauthorized");
}

/** Admin or admin assistant, or an internal caller. */
export async function requireAdminCaller(
  req: Request,
  allowAssistant = true,
): Promise<Caller | Response> {
  const caller = await resolveCaller(req);
  if (caller.internal) return caller;
  if (!caller.userId) return deny(401, "Unauthorized");
  const allowed = allowAssistant ? ["admin", "admin_assistant"] : ["admin"];
  if (caller.roles.some((r) => allowed.includes(r))) return caller;
  return deny(403, "Forbidden");
}
