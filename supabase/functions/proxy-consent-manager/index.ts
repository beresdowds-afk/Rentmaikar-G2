// Driver-facing proxy billing manager.
// Actions: create, resend, mark_identity (admin), tokenize_card (proxy)
// Security: rate-limit per identifier+action, idempotency table, masked card storage
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, tooMany } from "../_shared/rate-limit.ts";

const CreateBody = z.object({
  action: z.literal("create"),
  proxy_full_name: z.string().trim().min(2).max(120),
  proxy_email: z.string().trim().email().max(200),
  proxy_phone: z.string().trim().min(6).max(30).optional(),
  proxy_relationship: z.string().trim().max(80).optional(),
  region: z.enum(["US", "NG"]).default("US"),
  channels: z.array(z.enum(["email", "sms", "whatsapp"])).min(1).default(["email"]),
  use_type: z.enum(["one_time", "recurring"]).default("recurring"),
  validity_starts_at: z.string().datetime().optional(),
  validity_expires_at: z.string().datetime().optional(),
  max_uses: z.number().int().min(1).max(365).optional(),
});
const ResendBody = z.object({
  action: z.literal("resend"),
  proxy_account_id: z.string().uuid(),
  channels: z.array(z.enum(["email", "sms", "whatsapp"])).min(1),
});
const IdentityBody = z.object({
  action: z.literal("mark_identity"),
  proxy_account_id: z.string().uuid(),
  status: z.enum(["submitted", "verified", "failed"]),
  persona_inquiry_id: z.string().optional(),
});
const CardBody = z.object({
  action: z.literal("tokenize_card"),
  token: z.string().min(20),
  provider: z.enum(["paystack", "paypal", "opay"]),
  card_token: z.string().min(4).max(500),
  card_last4: z.string().regex(/^\d{4}$/),
  card_brand: z.string().max(30).optional(),
  card_exp_month: z.number().int().min(1).max(12).optional(),
  card_exp_year: z.number().int().min(2024).max(2100).optional(),
});
const Body = z.union([CreateBody, ResendBody, IdentityBody, CardBody]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json(400, { error: parsed.error.flatten() });
  const p = parsed.data;

  const authHeader = req.headers.get("authorization") ?? "";
  let userId: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    const jwt = authHeader.slice(7);
    const { data } = await service.auth.getUser(jwt);
    userId = data.user?.id ?? null;
  }

  const ipHdr = req.headers.get("x-forwarded-for") ?? "";
  const clientIp = ipHdr.split(",")[0].trim() || "unknown";
  const idempotencyKey = req.headers.get("x-idempotency-key") ?? "";

  // Rate limit — action-aware, keyed by user or IP
  const rlIdentifier = userId ?? `ip:${clientIp}`;
  const rlLimits: Record<string, number> = { create: 5, resend: 5, mark_identity: 30, tokenize_card: 10 };
  const rl = await checkRateLimit(rlIdentifier, `proxy-consent-manager:${p.action}`, rlLimits[p.action] ?? 10);
  if (!rl.allowed) return tooMany(rl.retry_after_seconds);

  // Idempotency short-circuit for state-changing actions
  if (idempotencyKey && ["create", "tokenize_card"].includes(p.action)) {
    const { data: prev } = await service.from("proxy_action_idempotency")
      .select("response").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (prev?.response) return json(200, prev.response as any);
  }

  const APP_URL = Deno.env.get("APP_URL") ?? "https://rentmaikar.lovable.app";

  try {
    if (p.action === "create") {
      if (!userId) return json(401, { error: "not authenticated" });
      const { data, error } = await service.from("driver_proxy_billing_accounts").insert({
        driver_id: userId,
        proxy_full_name: p.proxy_full_name,
        proxy_email: p.proxy_email.toLowerCase(),
        proxy_phone: p.proxy_phone,
        proxy_relationship: p.proxy_relationship,
        region: p.region,
        status: "pending",
        consent_channels: p.channels,
        use_type: p.use_type,
        validity_starts_at: p.validity_starts_at,
        validity_expires_at: p.validity_expires_at,
        max_uses: p.use_type === "one_time" ? 1 : p.max_uses,
      }).select("*").single();
      if (error) return json(400, { error: error.message });
      await sendConsentInvites(service, data, p.channels, APP_URL);
      await service.from("driver_proxy_billing_accounts")
        .update({ status: "awaiting_consent", consent_status: "sent", consent_sent_at: new Date().toISOString() })
        .eq("id", data.id);

      const resp = { ok: true, proxy_account_id: data.id, consent_link: `${APP_URL}/proxy/consent?token=${data.consent_token}` };
      if (idempotencyKey) {
        await service.from("proxy_action_idempotency").insert({
          idempotency_key: idempotencyKey, proxy_account_id: data.id, action: "create",
          actor_id: userId, response: resp,
        }).then(() => {}, () => {});
      }
      return json(200, resp);
    }

    if (p.action === "resend") {
      if (!userId) return json(401, { error: "not authenticated" });
      const { data: row } = await service.from("driver_proxy_billing_accounts")
        .select("*").eq("id", p.proxy_account_id).maybeSingle();
      if (!row || row.driver_id !== userId) return json(404, { error: "not found" });
      if (["revoked", "active", "expired", "used"].includes(row.status)) return json(409, { error: "cannot resend for this status" });
      // throttled retry: min 60s between resends
      if (row.consent_sent_at && Date.now() - new Date(row.consent_sent_at).getTime() < 60_000) {
        return json(429, { error: "throttled", retry_after_seconds: 60 });
      }
      await sendConsentInvites(service, row, p.channels, APP_URL);
      await service.from("driver_proxy_billing_accounts")
        .update({ consent_sent_at: new Date().toISOString(), consent_channels: p.channels })
        .eq("id", row.id);
      await service.from("proxy_billing_audit_log").insert({
        proxy_account_id: row.id, driver_id: row.driver_id, actor_id: userId, actor_role: "driver",
        action: "consent_resent", details: { channels: p.channels }, ip_address: clientIp,
        user_agent: req.headers.get("user-agent"), idempotency_key: idempotencyKey || null,
      });
      return json(200, { ok: true });
    }

    if (p.action === "mark_identity") {
      if (!userId) return json(401, { error: "not authenticated" });
      const { data: isAdmin } = await service.rpc("is_admin");
      if (!isAdmin) return json(403, { error: "admin only" });
      const patch: Record<string, unknown> = { identity_status: p.status };
      if (p.status === "verified") patch.identity_verified_at = new Date().toISOString();
      if (p.persona_inquiry_id) patch.persona_inquiry_id = p.persona_inquiry_id;
      const { error } = await service.from("driver_proxy_billing_accounts").update(patch).eq("id", p.proxy_account_id);
      if (error) return json(400, { error: error.message });
      await service.from("proxy_billing_audit_log").insert({
        proxy_account_id: p.proxy_account_id, actor_id: userId, actor_role: "admin",
        action: "identity_marked", details: { status: p.status },
      });
      return json(200, { ok: true });
    }

    if (p.action === "tokenize_card") {
      const { data: row } = await service.from("driver_proxy_billing_accounts")
        .select("*").eq("consent_token", p.token).maybeSingle();
      if (!row) return json(404, { error: "invalid token" });
      if (row.consent_status !== "signed") return json(409, { error: "consent not signed" });
      if (["revoked", "expired", "used", "disabled"].includes(row.status)) return json(409, { error: "not active" });

      // Masked storage: store fingerprint hash + provider token; NEVER a raw PAN.
      const fingerprint = await sha256Hex(`${p.provider}:${p.card_token}:${p.card_last4}`);
      const nextStatus = row.admin_review_status === "approved" ? "active" : "awaiting_review";
      const { error } = await service.from("driver_proxy_billing_accounts").update({
        card_provider: p.provider, card_token: p.card_token, card_last4: p.card_last4,
        card_brand: p.card_brand, card_exp_month: p.card_exp_month, card_exp_year: p.card_exp_year,
        card_fingerprint: fingerprint, status: nextStatus,
      }).eq("id", row.id);
      if (error) return json(400, { error: error.message });

      await service.from("proxy_billing_audit_log").insert({
        proxy_account_id: row.id, driver_id: row.driver_id, actor_id: null, actor_role: "proxy",
        action: "card_tokenized",
        details: { provider: p.provider, last4: p.card_last4, brand: p.card_brand, fingerprint },
        previous_state: { status: row.status, card_last4: row.card_last4 },
        new_state: { status: nextStatus, card_last4: p.card_last4 },
        ip_address: clientIp, user_agent: req.headers.get("user-agent"),
        idempotency_key: idempotencyKey || null,
      });

      const resp = { ok: true, next_status: nextStatus };
      if (idempotencyKey) {
        await service.from("proxy_action_idempotency").insert({
          idempotency_key: idempotencyKey, proxy_account_id: row.id, action: "tokenize_card",
          actor_id: null, response: resp,
        }).then(() => {}, () => {});
      }
      return json(200, resp);
    }

    return json(400, { error: "unknown action" });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});

async function sendConsentInvites(supa: any, row: any, channels: string[], appUrl: string) {
  const link = `${appUrl}/proxy/consent?token=${row.consent_token}`;
  const subject = "Proxy billing consent requested";
  const message = `${row.proxy_full_name}, a driver on Rentmaikar has listed you as their proxy card holder. Please verify your identity and sign the consent form: ${link}\n\nIf you didn't expect this, ignore this message. Link expires in 14 days.`;

  // Honor proxy preferences once they've been set. On brand-new invites, prefs
  // default to whatever the driver ticked so the initial reachout still lands.
  const prefs = row.notification_prefs ?? {};
  const prefChannels = prefs.channels ?? {};
  const events = prefs.events ?? {};
  const eventAllowed = events.consent_reminder !== false; // default on

  const effective = channels.filter((c) => {
    // If prefs.channels has an explicit false, respect it.
    if (prefChannels[c] === false) return false;
    return eventAllowed;
  });

  const jobs: Promise<any>[] = [];
  if (effective.includes("email")) {
    jobs.push(supa.functions.invoke("send-transactional-email", {
      body: { templateName: "generic-notice", recipientEmail: row.proxy_email,
        idempotencyKey: `proxy-consent-${row.id}-${Date.now()}`,
        templateData: { subject, body: message, ctaLabel: "Review request", ctaUrl: link } },
    }).catch(() => null));
  }
  if (effective.includes("sms") && row.proxy_phone) {
    jobs.push(supa.functions.invoke("send-sms", { body: { to: row.proxy_phone, message } }).catch(() => null));
  }
  if (effective.includes("whatsapp") && row.proxy_phone) {
    jobs.push(supa.functions.invoke("send-whatsapp", { body: { to: row.proxy_phone, message } }).catch(() => null));
  }
  await Promise.all(jobs);
}

