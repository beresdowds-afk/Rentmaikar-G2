import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for CORS and pre-flight handling
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Body parsers
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Marketing Engine API routes
  app.use("/api/marketing", async (req, res, next) => {
    try {
      const { marketingApiRouter } = await import("./src/server/marketing/routes");
      return marketingApiRouter(req, res, next);
    } catch (err) {
      return next(err);
    }
  });

  // Sitemap route
  app.get(["/sitemap.xml", "/sitemap"], async (_req, res) => {
    try {
      const { fetchVehicleSitemapEntries, formatXmlSitemap, STATIC_SITEMAP_ROUTES } = await import(
        "./src/lib/seo/sitemapEngine"
      );
      const dynamic = await fetchVehicleSitemapEntries();
      const xml = formatXmlSitemap([...STATIC_SITEMAP_ROUTES, ...dynamic]);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (e: any) {
      console.error("Sitemap error:", e.message);
      res.status(500).send("Error generating sitemap");
    }
  });

  // Region qualification endpoint
  app.get("/api/region-qualification", async (req, res) => {
    try {
      const region = String(req.query.region || "USA");
      const { resolveRegionQualification } = await import("./src/server/geminiRegionHandler");
      const qualificationData = await resolveRegionQualification(region);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(qualificationData);
    } catch (e: any) {
      console.error("Region qualification API error:", e.message);
      res.status(500).json({ error: "Failed to resolve qualification" });
    }
  });

  // Email health checks
  app.get(["/api/email/health", "/api/email-health"], async (_req, res) => {
    try {
      const { checkEmailProviderHealth } = await import("./src/server/emailService");
      const health = await checkEmailProviderHealth();
      res.status(health.ok ? 200 : (health.status === "not_configured" ? 200 : 503)).json(health);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Email settings & review
  app.get(["/api/email/settings", "/api/email/review", "/api/email-settings"], async (_req, res) => {
    try {
      const { getPlatformEmailSettingsReview } = await import("./src/server/emailService");
      const review = await getPlatformEmailSettingsReview();
      res.json(review);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Comprehensive Domain Routing & Delivery Verification
  app.all(["/api/email/verify-domains", "/api/email/verify"], async (req, res) => {
    try {
      const { verifyPlatformEmailDomainRouting } = await import("./src/server/emailService");
      const options = req.method === "POST" ? req.body : {
        mailbox: req.query.mailbox as string,
        recipient: req.query.recipient as string,
        runLiveTest: req.query.runLiveTest === "true",
      };
      const result = await verifyPlatformEmailDomainRouting(options);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Inbound & transactional email routes
  app.post(
    [
      "/api/email/inbound",
      "/api/email/webhook",
      "/api/webhooks/resend",
      "/api/email/forward",
      "/api/email/test",
      "/api/email/test-delivery",
    ],
    async (req, res) => {
      try {
        if (req.path === "/api/email/forward") {
          const { handleInboundEmailForward } = await import("./src/server/emailService");
          const result = await handleInboundEmailForward(req.body);
          res.status(result.ok ? 200 : 400).json(result);
          return;
        }

        if (req.path === "/api/email/test" || req.path === "/api/email/test-delivery") {
          const { testEmailDelivery } = await import("./src/server/emailService");
          const result = await testEmailDelivery(req.body);
          res.status(result.ok ? 200 : 400).json(result);
          return;
        }

        const { handleInboundEmailWebhook } = await import("./src/server/emailService");
        const result = await handleInboundEmailWebhook(req.body, req.headers as Record<string, string>);
        res.status(result.ok ? 200 : 400).json(result);
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // Backend / Edge Functions dispatch router with allowlist and Supabase Edge Function forwarding
  app.all(["/api/functions/:functionName", "/functions/v1/:functionName"], async (req, res) => {
    try {
      const functionName = req.params.functionName;

      const SUPABASE_EDGE_FUNCTIONS_ALLOWLIST = new Set([
        "send-email-reply",
        "send-inbox-reply",
        "send-outbound-email",
        "send-transactional-email",
        "send-agreement-email",
        "send-price-notification",
        "send-password-reset",
        "send-verification-email",
        "send-approval-notification",
        "auth-email-hook",
        "google-sso-auth-email",
        "inbox-attachment-ocr",
        "email-health",
        "check-email-health",
        "resend-events",
        "reprocess-email-dlq",
        "handle-email-unsubscribe",
        "notify-training-review",
        "sync-auth-identity",
        "phone-otp-custom",
        "verify-phone",
        "verify-credentials",
        "referee-attestation",
        "hologram-admin",
        "hologram-sync",
        "sarekon-admin",
        "traccar-admin",
        "iot-admin",
        "get-psp-config",
        "get-paypal-config",
        "create-paypal-order",
        "capture-paypal-order",
        "initiate-paypal-payout",
        "create-paystack-transaction",
        "verify-paystack-transaction",
        "initiate-paystack-transfer",
        "create-paystack-recipient",
        "create-opay-order",
        "verify-opay-order",
        "check-payment-health",
        "billing-portal",
        "activate-subscription",
        "subscribe-to-plan",
        "persona-config",
        "persona-reconcile",
        "persona-create-inquiry",
        "persona-retry-verification",
        "persona-send-reverification",
        "notify-withdrawal",
        "send-2fa-code",
        "voice-access-token",
        "initiate-voip-call",
        "end-voip-call",
        "voice-call-request",
        "voice-twiml-config",
        "voice-twiml-dial",
        "get-recording-url",
        "create-call-in",
        "renew-call-in",
        "send-sms-notification",
        "case-send-sms",
        "reprocess-sms-dlq",
        "twilio-test-send",
        "booking-email-trigger",
        "process-email-queue",
      ]);

      if (!SUPABASE_EDGE_FUNCTIONS_ALLOWLIST.has(functionName)) {
        return res.status(404).json({
          error: "Not Found",
          message: `Function '${functionName}' is not in the authorized Edge Functions allowlist`,
        });
      }

      const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || "https://jrsydiofzceoeddjogov.supabase.co";
      const supabaseUrl = rawSupabaseUrl.replace(/\/+$/, "");
      const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_uE7DPlUSNxgQ1pfEA6nfQA_Z0VDAP4p";

      // Preserve incoming authorization header: strictly preserve user JWT, never use service role
      const clientAuth = req.headers["authorization"] || req.headers["Authorization"];
      const authHeader = clientAuth ? String(clientAuth) : (supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : "");

      const forwardHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authHeader) {
        forwardHeaders["Authorization"] = authHeader;
      }
      if (supabaseAnonKey) {
        forwardHeaders["apikey"] = supabaseAnonKey;
      }
      if (req.headers["x-client-info"]) {
        forwardHeaders["x-client-info"] = String(req.headers["x-client-info"]);
      }

      // Forward request to Supabase Edge Function: ${SUPABASE_URL}/functions/v1/${functionName}
      try {
        const edgeUrl = `${supabaseUrl}/functions/v1/${functionName}`;
        const edgeRes = await fetch(edgeUrl, {
          method: req.method || "POST",
          headers: forwardHeaders,
          body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
        });

        if (edgeRes.status !== 404) {
          const edgeData = await edgeRes.json().catch(() => null);
          return res.status(edgeRes.status).json(edgeData ?? {});
        }
      } catch (proxyErr: any) {
        console.warn(`[Server Edge Proxy] Upstream proxy to Supabase failed for '${functionName}':`, proxyErr?.message || proxyErr);
      }

      const { handleEdgeFunction } = await import("./src/server/functionsHandler");
      const response = await handleEdgeFunction(functionName, {
        body: req.body,
        headers: req.headers as Record<string, string>,
        method: req.method,
      });
      res.status(response.status).json(response.data);
    } catch (err: any) {
      console.error(`Error handling function ${req.params.functionName}:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // PWA Real-Time Platform Sync Endpoints
  app.all(["/api/pwa/sync", "/api/sync/platform"], async (req, res) => {
    try {
      const { handlePwaSync } = await import("./src/server/pwaSyncService");
      const result = await handlePwaSync({
        method: req.method,
        query: req.query,
        body: req.body,
      });
      res.status(200).json(result);
    } catch (e: any) {
      console.error("PWA Sync API error:", e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get(["/api/pwa/sync/status", "/api/sync/status"], async (_req, res) => {
    try {
      const { getPwaSyncStatus } = await import("./src/server/pwaSyncService");
      res.status(200).json(getPwaSyncStatus());
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Development vs Production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RentMaikar server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
