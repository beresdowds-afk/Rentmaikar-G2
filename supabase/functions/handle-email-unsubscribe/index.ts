import { corsHeaders } from "../_shared/cors.ts";
import { delegateToBackendEmail } from "../_shared/backend-email-client.ts";

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  let token: string | null = url.searchParams.get("token");
  let email: string | null = url.searchParams.get("email");

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formText = await req.text();
      const params = new URLSearchParams(formText);
      if (!params.get("List-Unsubscribe")) {
        token = params.get("token") || token;
      }
      email = params.get("email") || email;
    } else {
      try {
        const body = await req.json();
        token = body?.token || token;
        email = body?.email || email;
      } catch {
        // Keep query parameters
      }
    }
  }

  if (!token && !email) {
    return jsonResponse({ error: "Token or email is required" }, 400);
  }

  const delegated = await delegateToBackendEmail(
    "handle-email-unsubscribe",
    {
      token,
      email,
      action: req.method === "GET" ? "validate" : "unsubscribe",
    },
    { allowUnauthenticatedPublic: true },
  );

  return jsonResponse(delegated.data, delegated.status || 200);
});
