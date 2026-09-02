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
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: u, error: uErr } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user?.email) return json({ error: "Unauthenticated" }, 401);
    const user = u.user;

    if (user.email_confirmed_at) {
      return json({ ok: true, already_verified: true, verified_at: user.email_confirmed_at });
    }

    const body = await req.json().catch(() => ({}));
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
      user.email,
    );
    if (!claim.fresh) {
      return json(
        claim.response ?? { ok: true, sent: false, duplicate: true, to: user.email },
      );
    }

    // Simple per-user cooldown using the existing email log.
    const since = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
    const { count } = await supa
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("recipient", user.email)
      .eq("template", "email_verification")
      .gte("created_at", since);
    if ((count ?? 0) > 0) {
      await releaseEmailIdempotency(supa, "email_verification", claim.key);
      return json({ error: "Please wait a moment before requesting another email." }, 429);
    }

    const { data: link, error: linkErr } = await supa.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: { redirectTo },
    });
    if (linkErr || !link?.properties?.action_link) {
      console.error("generateLink failed", linkErr);
      await releaseEmailIdempotency(supa, "email_verification", claim.key);
      return json({ error: "Could not create verification link" }, 500);
    }

    const { data: profile } = await supa
      .from("profiles")
      .select("full_name, country")
      .eq("user_id", user.id)
      .maybeSingle();

    const firstName =
      (profile?.full_name as string | null)?.trim().split(/\s+/)[0] ||
      (user.user_metadata?.full_name as string | undefined)?.split(/\s+/)[0] ||
      "there";

    const send = await supa.functions.invoke("send-outbound-email", {
      body: {
        action: "send",
        to: user.email,
        templateName: "email_verification",
        category: "verification",
        priority: "high",
        country: profile?.country ?? undefined,
        data: {
          firstName,
          verificationUrl: link.properties.action_link,
          expiresIn: "24 hours",
        },
      },
    });

    if (send.error) {
      console.error("send-outbound-email failed", send.error);
      await releaseEmailIdempotency(supa, "email_verification", claim.key);
      return json({ error: "Verification email could not be sent right now." }, 502);
    }

    const result = { ok: true, sent: true, provider: "resend", to: user.email };
    await recordEmailIdempotencyResult(supa, "email_verification", claim.key, result);
    return json(result);
  } catch (e) {
    console.error("send-verification-email error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
