// Shared caller-auth check for scheduled/cron edge functions.
// Requires either:
//   - a valid `x-cron-secret` header matching CRON_SECRET, OR
//   - a Bearer token equal to SUPABASE_SERVICE_ROLE_KEY (for internal invokes).
// Returns a 401 Response when the caller is not authorized, or null when OK.
function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized: missing or invalid cron secret" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    },
  );
}

/**
 * Async variant that additionally accepts an `x-cron-secret` matching the
 * vault-stored CRON_SECRET (used by pg_cron jobs, which cannot read edge
 * function env vars). Returns a 401 Response, or null when authorized.
 */
export async function requireCronSecretAsync(req: Request): Promise<Response | null> {
  const sync = requireCronSecret(req);
  if (!sync) return null;

  const provided = req.headers.get("x-cron-secret");
  if (!provided) return sync;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return sync;

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_cron_secret`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ _secret: provided }),
    });
    if (res.ok && (await res.json()) === true) return null;
  } catch (_e) {
    // fall through to unauthorized
  }

  return unauthorized();
}

export function requireCronSecret(req: Request): Response | null {
  const configured = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const provided = req.headers.get("x-cron-secret");
  if (configured && provided && provided === configured) return null;

  const authHeader = req.headers.get("Authorization") || "";
  if (
    serviceKey &&
    authHeader.startsWith("Bearer ") &&
    authHeader.slice(7) === serviceKey
  ) {
    return null;
  }

  return new Response(
    JSON.stringify({ error: "Unauthorized: missing or invalid cron secret" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    },
  );
}
