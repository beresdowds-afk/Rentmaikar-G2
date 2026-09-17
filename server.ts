import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Backend / Edge Functions dispatch router
  app.all(["/api/functions/:functionName", "/functions/v1/:functionName"], async (req, res) => {
    try {
      const functionName = req.params.functionName;
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
