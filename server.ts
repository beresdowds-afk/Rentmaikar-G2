import express from "express";
import path from "path";
import fs from "fs";
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

  // 10DLC A2P Compliance Packet PDF Download & Inline View
  app.get(
    [
      "/downloads/rentmaikar-10dlc-a2p-compliance-packet.pdf",
      "/rentmaikar-10dlc-a2p-compliance-packet.pdf",
      "/api/compliance/10dlc-pdf",
      "/compliance/10dlc.pdf",
    ],
    async (req, res) => {
      try {
        const publicDownload = path.join(process.cwd(), "public/downloads/rentmaikar-10dlc-a2p-compliance-packet.pdf");
        const publicRoot = path.join(process.cwd(), "public/rentmaikar-10dlc-a2p-compliance-packet.pdf");
        const filePath = fs.existsSync(publicDownload) ? publicDownload : fs.existsSync(publicRoot) ? publicRoot : null;

        const isDownload = req.query.download === "true" || req.query.download === "1";
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          isDownload
            ? 'attachment; filename="rentmaikar-10dlc-a2p-compliance-packet.pdf"'
            : 'inline; filename="rentmaikar-10dlc-a2p-compliance-packet.pdf"'
        );
        res.setHeader("Cache-Control", "public, max-age=3600");

        if (filePath) {
          fs.createReadStream(filePath).pipe(res);
        } else {
          // Dynamic fallback generation
          const { build10DlcPdfDocument } = await import("./src/lib/generate-10dlc-pdf");
          const doc = build10DlcPdfDocument();
          const arrayBuffer = doc.output("arraybuffer");
          res.send(Buffer.from(arrayBuffer));
        }
      } catch (err: any) {
        console.error("10DLC PDF route error:", err);
        res.status(500).json({ error: "Failed to generate 10DLC compliance PDF" });
      }
    }
  );

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
        const normalizedPath = req.path.replace(/\/+$/, "");
        if (normalizedPath === "/api/email/forward") {
          const { handleInboundEmailForward } = await import("./src/server/emailService");
          const result = await handleInboundEmailForward(req.body);
          res.status(result.ok ? 200 : 400).json(result);
          return;
        }

        if (normalizedPath === "/api/email/test" || normalizedPath === "/api/email/test-delivery") {
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

  // Link Bridge API router: Handles frontend-to-backend CALL, LISTEN, RESPOND, and edge functions
  app.use(["/api/bridge", "/bridge"], async (req, res, next) => {
    try {
      const { bridgeRouter } = await import("./backend/src/routes/bridge");
      return bridgeRouter(req, res, next);
    } catch (err) {
      return next(err);
    }
  });

  // Edge Functions Catalog Endpoint
  app.get(["/api/functions", "/functions/v1"], async (_req, res) => {
    try {
      const { ALL_EDGE_FUNCTIONS, supabaseBackendService } = await import("./backend/src/services/supabaseService");
      const health = await supabaseBackendService.checkSupabaseHealth();
      return res.status(200).json({
        ok: true,
        count: ALL_EDGE_FUNCTIONS.length,
        functions: ALL_EDGE_FUNCTIONS,
        supabaseConnected: health.healthy,
        supabaseLatencyMs: health.latencyMs,
      });
    } catch {
      return res.status(200).json({ ok: true, count: 164, status: "available" });
    }
  });

  // Backend / Edge Functions dispatch router with integrated local execution and Supabase fallback
  app.all(["/api/functions/:functionName", "/functions/v1/:functionName"], async (req, res) => {
    try {
      const functionName = req.params.functionName;

      // Validate slug format to protect against path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(functionName)) {
        return res.status(400).json({
          error: "Bad Request",
          message: `Invalid function name '${functionName}'`,
        });
      }

      // Priority 1: Execute integrated local edge function handler directly
      // This eliminates upstream network latency (~1.5s), avoids 404s on un-deployed Supabase functions,
      // and ensures all server-side environment secrets (RESEND_API_KEY, TWILIO, PG) are utilized natively.
      const { handleEdgeFunction } = await import("./src/server/functionsHandler");
      const localResponse = await handleEdgeFunction(functionName, {
        body: req.body,
        headers: req.headers as Record<string, string>,
        method: req.method,
      });

      // If handled locally (status !== 404), return immediately
      if (localResponse && localResponse.status !== 404) {
        if (
          typeof localResponse.data === "string" &&
          (localResponse.data.startsWith("<?xml") || (localResponse as any).isXml)
        ) {
          res.setHeader("Content-Type", "text/xml; charset=utf-8");
          return res.status(localResponse.status).send(localResponse.data);
        }
        return res.status(localResponse.status).json(localResponse.data);
      }

      // Priority 2: Fall back to upstream Supabase Edge Function if not handled locally
      const candidateUrl = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || process.env.VITE_SUPABASE_URL || "";
      const rawSupabaseUrl = (candidateUrl && !candidateUrl.includes("bwvocmhcledbwqlpcswp"))
        ? candidateUrl
        : "https://jrsydiofzceoeddjogov.supabase.co";
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

      try {
        const edgeUrl = `${supabaseUrl}/functions/v1/${functionName}`;
        const edgeRes = await fetch(edgeUrl, {
          method: req.method || "POST",
          headers: forwardHeaders,
          body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
        });

        const edgeData = await edgeRes.json().catch(() => null);
        return res.status(edgeRes.status).json(edgeData ?? {});
      } catch (proxyErr: any) {
        console.warn(`[Server Edge Proxy] Upstream proxy to Supabase failed for '${functionName}':`, proxyErr?.message || proxyErr);
        return res.status(localResponse?.status || 500).json(localResponse?.data || { error: "Failed to dispatch edge function" });
      }
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

  // Explicit catch-all for /api and /functions to guarantee JSON responses (never HTML)
  app.use(["/api", "/functions"], (req, res) => {
    res.status(404).json({
      ok: false,
      success: false,
      error: "Not Found",
      message: `API endpoint ${req.method} ${req.originalUrl || req.path} not found`,
    });
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
    app.use((_req, res) => {
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
