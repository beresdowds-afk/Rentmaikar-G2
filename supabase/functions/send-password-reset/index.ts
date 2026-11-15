// Self-service password reset delegating exclusively to rentmaikar-backend (Resend).
// Never falls back to Supabase's built-in mailer.
// Always responds `{ ok: true }` on public caller flows to prevent account enumeration.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  claimEmailIdempotency,
  readIdempotencyKey,
} from "../_shared/email-idempotency.ts";
import { delegateToBackendEmail } from "../_shared/backend-email-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Content-Type": "application/json",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAllowedOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "rentmaikar.com" ||
      host.endsWith(".rentmaikar.com") ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ok = () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return ok();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const idemKey = readIdempotencyKey(req);
    const claim = await claimEmailIdempotency(
      admin,
      "password_reset",
      idemKey,
      email,
    );
    if (!claim.fresh) return ok();

    const { data: allowed } = await admin.rpc("check_auth_rate_limit", {
      _identifier: `reset:${email}`,
      _endpoint: "auth.reset_password.server",
      _max_requests: 3,
      _window_seconds: 900,
    });
    if (allowed === false) return ok();

    const candidateOrigin = typeof body?.redirectOrigin === "string" ? body.redirectOrigin.trim() : "";
    const headerOrigin = (req.headers.get("origin") || "").trim();
    const siteUrl =
      (candidateOrigin && isAllowedOrigin(candidateOrigin) ? candidateOrigin : null) ??
      (headerOrigin && isAllowedOrigin(headerOrigin) ? headerOrigin : null) ??
      Deno.env.get("SITE_URL") ??
      "https://rentmaikar.com";

    const delegated = await delegateToBackendEmail(
      "send-password-reset",
      {
        email,
        redirectOrigin: siteUrl,
      },
      {
        idempotencyKey: idemKey,
        allowUnauthenticatedPublic: true,
      },
    );

    if (!delegated.ok) {
      console.error("[send-password-reset] Backend Resend dispatch failed:", delegated.status, delegated.data);
    }

    return ok();
  } catch (e) {
    console.error("send-password-reset error:", (e as Error)?.message ?? e);
    return ok();
  }
});
