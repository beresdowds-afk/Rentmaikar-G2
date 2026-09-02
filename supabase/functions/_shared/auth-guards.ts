// Shared auth guards for edge functions.
//
// requireServiceRole: reject callers that do not present a Bearer token
// equal to SUPABASE_SERVICE_ROLE_KEY. Use this on internal-only endpoints
// that should only be invoked from other edge functions or trusted backend
// code. Returns a 401 Response when unauthorized, or null when OK.
//
// requireAuthenticatedUser: verify the request's Bearer token corresponds
// to a signed-in user via supabase.auth.getUser(). Returns { userId } on
// success, or a 401 Response otherwise.
//
// requireRole: on top of requireAuthenticatedUser, verify the user has the
// given role in public.user_roles. Returns { userId } on success, or a
// 401/403 Response otherwise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

export function requireServiceRole(req: Request): Response | null {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  if (
    serviceKey &&
    authHeader.startsWith("Bearer ") &&
    authHeader.slice(7) === serviceKey
  ) {
    return null;
  }
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: corsHeaders },
  );
}

export async function requireAuthenticatedUser(
  req: Request,
): Promise<{ userId: string; token: string } | Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: corsHeaders },
    );
  }
  const token = authHeader.slice(7);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: corsHeaders },
    );
  }
  return { userId: data.user.id, token };
}

export async function requireRole(
  req: Request,
  roles: string[],
): Promise<{ userId: string; token: string } | Response> {
  const auth = await requireAuthenticatedUser(req);
  if (auth instanceof Response) return auth;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId)
    .in("role", roles);
  if (error || !data || data.length === 0) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: corsHeaders },
    );
  }
  return auth;
}

/**
 * Allow either an internal service-role caller (other edge functions, crons)
 * OR a signed-in user holding one of `roles`. Outbound messaging endpoints are
 * invoked both ways: by background jobs with the service key, and directly from
 * the admin Messaging Center with the staff member's JWT.
 */
export async function requireServiceRoleOrRole(
  req: Request,
  roles: string[],
): Promise<{ userId: string | null; token: string | null } | Response> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  if (
    serviceKey &&
    authHeader.startsWith("Bearer ") &&
    authHeader.slice(7) === serviceKey
  ) {
    return { userId: null, token: null };
  }
  return await requireRole(req, roles);
}
