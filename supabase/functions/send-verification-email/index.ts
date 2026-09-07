// Sends a branded email-verification link through Resend (via send-outbound-email).
// Auth: caller must present their own JWT; the link is always minted for that
// user's own email address, so it cannot be used to spam arbitrary inboxes.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  claimEmailIdempotency,
  readIdempotencyKey,
  recordEmailIdempotencyResult,
  releaseEmailIdempotency,
} from "../_shared/email-idempotency.ts";

const RESEND_COOLDOWN_SECONDS = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    let targetEmail = "";
    let userId: string | null = null;
    let userMetaName: string | null = null;

    const auth = req.headers.get("Authorization") ?? "";
    if (auth.startsWith("Bearer ")) {
      const token = auth.replace("Bearer ", "").trim();
      const { data: u } = await supa.auth.getUser(token);
      if (u?.user?.email) {
        targetEmail = u.user.email;
        userId = u.user.id;
        userMetaName = (u.user.user_metadata?.full_name as string) ?? null;
        if (u.user.email_confirmed_at) {
          return json({ ok: true, already_verified: true, verified_at: u.user.email_confirmed_at });
        }
      }
    }

    if (!targetEmail && typeof body?.email === "string") {
      const normalized = body.email.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        targetEmail = normalized;
      }
    }

    if (!targetEmail) {
      return json({ error: "Valid email address is required" }, 400);
    }

    const redirectTo = typeof body?.redirect_to === "string" && body.redirect_to.startsWith("http")
      ? body.redirect_to
      : (Deno.env.get("SITE_URL") ?? "https://rentmaikar.com");

    // Idempotency: repeated clicks carrying the same Idempotency-Key replay the
    // original outcome instead of queueing a second verification email.
    const idemKey = readIdempotencyKey(req);
    const claim = await claimEmailIdempotency(
      supa,
      "email_verification",
      idemKey,
      targetEmail,
    );
    if (!claim.fresh) {
      return json(
        claim.response ?? { ok: true, sent: false, duplicate: true, to: targetEmail },
      );
    }

    // Server-side rate limit & cooldown
    const { data: allowed } = await supa.rpc("check_auth_rate_limit", {
      _identifier: `verify:${targetEmail}`,
      _endpoint: "auth.verify_email",
      _max_requests: 3,
      _window_seconds: 900,
    });
    if (allowed === false) {
      await releaseEmailIdempotency(supa, "email_verification", claim.key);
      return json({ error: "Please wait a moment before requesting another email." }, 429);
    }

    const since = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
    const { count } = await supa
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("recipient", targetEmail)
      .eq("template", "email_verification")
      .gte("created_at", since);
    if ((count ?? 0) > 0) {
      await releaseEmailIdempotency(supa, "email_verification", claim.key);
      return json({ error: "Please wait a moment before requesting another email." }, 429);
    }

    const { data: link, error: linkErr } = await supa.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
      options: { redirectTo },
    });
    if (linkErr || !link?.properties?.action_link) {
      console.error("generateLink failed", linkErr);
      await releaseEmailIdempotency(supa, "email_verification", claim.key);
      return json({ error: "Could not create verification link" }, 500);
    }

    let profile: { full_name?: string | null; country?: string | null } | null = null;
    if (userId) {
      const { data: prof } = await supa
        .from("profiles")
        .select("full_name, country")
        .eq("user_id", userId)
        .maybeSingle();
      profile = prof;
    }

    const firstName =
      (profile?.full_name as string | null)?.trim().split(/\s+/)[0] ||
      userMetaName?.split(/\s+/)[0] ||
      "there";

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sendRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-outbound-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: "send",
          to: targetEmail,
          templateName: "email_verification",
          category: "verification",
          priority: "high",
          country: profile?.country ?? undefined,
          data: {
            firstName,
            verificationUrl: link.properties.action_link,
            expiresIn: "24 hours",
          },
        }),
      },
    );

    if (!sendRes.ok) {
      console.error("send-outbound-email failed", sendRes.status, await sendRes.text());
      await releaseEmailIdempotency(supa, "email_verification", claim.key);
      return json({ error: "Verification email could not be sent right now." }, 502);
    }

    const result = { ok: true, sent: true, provider: "resend", to: targetEmail };
    await recordEmailIdempotencyResult(supa, "email_verification", claim.key, result);
    return json(result);
  } catch (e) {
    console.error("send-verification-email error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
