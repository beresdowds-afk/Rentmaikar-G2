import { verifySvixSignature } from "../_shared/svix-verify.ts";
import { delegateToBackendEmail } from "../_shared/backend-email-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, svix-id, svix-timestamp, svix-signature, webhook-id, webhook-timestamp, webhook-signature",
  "Content-Type": "application/json",
};

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secrets = [
    Deno.env.get("RESEND_WEBHOOK_SIGNING_SECRET"),
    Deno.env.get("RESEND_WEBHOOK_SECRET"),
  ].filter((s): s is string => Boolean(s && s.trim()));

  if (secrets.length === 0) {
    console.error("RESEND_WEBHOOK_SIGNING_SECRET / RESEND_WEBHOOK_SECRET not configured — rejecting event");
    return false;
  }
  for (const secret of secrets) {
    if (await verifySvixSignature(req, rawBody, secret)) {
      return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rawBody = await req.text();
  if (!(await verifySignature(req, rawBody))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const svixId = req.headers.get("svix-id") || req.headers.get("webhook-id");
  const delegated = await delegateToBackendEmail("resend-events", event, {
    idempotencyKey: svixId,
    correlationId: svixId,
  });

  if (!delegated.ok) {
    return new Response(
      JSON.stringify({ error: delegated.data?.error || "processing failed" }),
      { status: delegated.status >= 400 ? delegated.status : 502, headers: corsHeaders },
    );
  }

  return new Response(JSON.stringify(delegated.data), {
    status: 200,
    headers: corsHeaders,
  });
});
