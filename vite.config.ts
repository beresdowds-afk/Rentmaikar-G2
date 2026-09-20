import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// vite-plugin-pwa intentionally removed: the app-shell service worker was
// serving stale landing-page HTML. public/sw.js is now a kill-switch worker
// that evicts the old registration on first visit. push-sw.js (web push) is
// unrelated and kept as-is.
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    // Never let a proxy/CDN or browser hold onto the app shell — stale HTML was
    // serving an outdated landing page in preview.
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  },

  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      (process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.includes("bwvocmhcledbwqlpcswp"))
        ? process.env.VITE_SUPABASE_URL
        : (process.env.SUPABASE_PROJECT_URL || "https://jrsydiofzceoeddjogov.supabase.co")
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      (process.env.VITE_SUPABASE_PROJECT_ID && process.env.VITE_SUPABASE_PROJECT_ID !== "bwvocmhcledbwqlpcswp")
        ? process.env.VITE_SUPABASE_PROJECT_ID
        : "jrsydiofzceoeddjogov"
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_uE7DPlUSNxgQ1pfEA6nfQA_Z0VDAP4p"
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_uE7DPlUSNxgQ1pfEA6nfQA_Z0VDAP4p"
    ),
    "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(
      (process.env.VITE_GOOGLE_CLIENT_ID && process.env.VITE_GOOGLE_CLIENT_ID.includes(".apps.googleusercontent.com"))
        ? process.env.VITE_GOOGLE_CLIENT_ID
        : (process.env.GCP_CLIENT_ID && process.env.GCP_CLIENT_ID.includes(".apps.googleusercontent.com"))
          ? process.env.GCP_CLIENT_ID
          : "713824918751-edb6n7rsemun54nm07aitlql9mnhdlij.apps.googleusercontent.com"
    ),
    "import.meta.env.VITE_GCP_CLIENT_ID": JSON.stringify(
      (process.env.GCP_CLIENT_ID && process.env.GCP_CLIENT_ID.includes(".apps.googleusercontent.com"))
        ? process.env.GCP_CLIENT_ID
        : "713824918751-edb6n7rsemun54nm07aitlql9mnhdlij.apps.googleusercontent.com"
    ),
    "import.meta.env.VITE_GCP_PROJECT_ID": JSON.stringify(
      process.env.VITE_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || "probable-dream-477110-t5"
    ),
  },

  plugins: [
    react(),
    {
      name: "server-side-sitemap-generator",
      configureServer(server: any) {
        server.middlewares.use(async (req: any, res: any, next: any) => {
          if (req.url === "/sitemap.xml" || req.url === "/sitemap") {
            try {
              const { fetchVehicleSitemapEntries, formatXmlSitemap, STATIC_SITEMAP_ROUTES } = await import("./src/lib/seo/sitemapEngine");
              const dynamic = await fetchVehicleSitemapEntries();
              const xml = formatXmlSitemap([...STATIC_SITEMAP_ROUTES, ...dynamic]);
              res.setHeader("Content-Type", "application/xml; charset=utf-8");
              res.setHeader("Cache-Control", "public, max-age=3600");
              res.end(xml);
              return;
            } catch (e) {
              console.error("Vite sitemap middleware error:", e);
            }
          }

          if (req.url?.startsWith("/api/region-qualification")) {
            try {
              const urlObj = new URL(req.url, "http://localhost:3000");
              const region = urlObj.searchParams.get("region") || "USA";
              const { resolveRegionQualification } = await import("./src/server/geminiRegionHandler");
              const qualificationData = await resolveRegionQualification(region);

              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.setHeader("Cache-Control", "public, max-age=3600");
              res.end(JSON.stringify(qualificationData));
              return;
            } catch (e) {
              console.error("Vite region-qualification API error:", e);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Failed to resolve qualification" }));
              return;
            }
          }

          if (req.url === "/api/email/health" || req.url === "/api/email-health") {
            try {
              const { checkEmailProviderHealth } = await import("./src/server/emailService");
              const health = await checkEmailProviderHealth();
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.statusCode = health.ok ? 200 : (health.status === "not_configured" ? 200 : 503);
              res.end(JSON.stringify(health));
              return;
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: e.message }));
              return;
            }
          }

          if (req.url === "/api/email/settings" || req.url === "/api/email/review" || req.url === "/api/email-settings") {
            try {
              const { getPlatformEmailSettingsReview } = await import("./src/server/emailService");
              const review = await getPlatformEmailSettingsReview();
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.statusCode = 200;
              res.end(JSON.stringify(review));
              return;
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: e.message }));
              return;
            }
          }

          if (
            req.url === "/api/email/inbound" ||
            req.url === "/api/email/webhook" ||
            req.url === "/api/webhooks/resend" ||
            req.url === "/api/email/forward" ||
            req.url === "/api/email/test" ||
            req.url === "/api/email/test-delivery"
          ) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }

            const chunks: any[] = [];
            req.on("data", (chunk: any) => chunks.push(chunk));
            req.on("end", async () => {
              let body: any = {};
              try {
                const raw = Buffer.concat(chunks).toString("utf8");
                if (raw) body = JSON.parse(raw);
              } catch {
                // ignore
              }

              try {
                if (req.url === "/api/email/forward") {
                  const { handleInboundEmailForward } = await import("./src/server/emailService");
                  const result = await handleInboundEmailForward(body);
                  res.setHeader("Content-Type", "application/json");
                  res.statusCode = result.ok ? 200 : 400;
                  res.end(JSON.stringify(result));
                  return;
                }

                if (req.url === "/api/email/test" || req.url === "/api/email/test-delivery") {
                  const { testEmailDelivery } = await import("./src/server/emailService");
                  const result = await testEmailDelivery(body);
                  res.setHeader("Content-Type", "application/json");
                  res.statusCode = result.ok ? 200 : 400;
                  res.end(JSON.stringify(result));
                  return;
                }

                // Inbound webhook
                const { handleInboundEmailWebhook } = await import("./src/server/emailService");
                const result = await handleInboundEmailWebhook(body, req.headers as Record<string, string>);
                res.setHeader("Content-Type", "application/json");
                res.statusCode = result.ok ? 200 : 400;
                res.end(JSON.stringify(result));
                return;
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: false, error: err.message }));
                return;
              }
            });
            return;
          }

          if (req.url?.startsWith("/api/functions/") || req.url?.startsWith("/functions/v1/")) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }

            try {
              const functionName = req.url.replace(/^\/(?:api\/functions|functions\/v1)\//, "").split("?")[0];

              // Controlled allowlist of functions to execute/route via Supabase Edge Functions
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
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                  error: "Not Found",
                  message: `Function '${functionName}' is not in the authorized Edge Functions allowlist`,
                }));
                return;
              }

              const chunks: any[] = [];
              req.on("data", (chunk: any) => chunks.push(chunk));
              req.on("end", async () => {
                let body: any = {};
                try {
                  const raw = Buffer.concat(chunks).toString("utf8");
                  if (raw) body = JSON.parse(raw);
                } catch {
                  // ignore non-json
                }

                const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || "https://jrsydiofzceoeddjogov.supabase.co";
                const supabaseUrl = rawSupabaseUrl.replace(/\/+$/, "");
                const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_uE7DPlUSNxgQ1pfEA6nfQA_Z0VDAP4p";

                // Extract incoming authorization header: strictly preserve original user JWT
                const clientAuth = req.headers["authorization"] || req.headers["Authorization"];
                const authHeader = clientAuth ? String(clientAuth) : (supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : "");

                // Forwarding headers — STRICTLY omit and avoid SUPABASE_SERVICE_ROLE_KEY
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
                    body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(body) : undefined,
                  });

                  // If Supabase returned a response (even 4xx/5xx from function execution logic)
                  if (edgeRes.status !== 404) {
                    const edgeData = await edgeRes.json().catch(() => null);
                    res.statusCode = edgeRes.status;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify(edgeData ?? {}));
                    return;
                  }
                } catch (proxyErr: any) {
                  console.warn(`[Vite Edge Proxy] Upstream proxy to Supabase failed for '${functionName}':`, proxyErr?.message || proxyErr);
                }

                // If remote Edge Function is not yet deployed (404) or network unavailable, fall back to local handlers
                try {
                  const { handleEdgeFunction } = await import("./src/server/functionsHandler");
                  const response = await handleEdgeFunction(functionName, {
                    body,
                    headers: req.headers as Record<string, string>,
                    method: req.method,
                  });
                  res.statusCode = response.status;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(response.data));
                } catch (localErr: any) {
                  res.statusCode = 500;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: localErr.message || "Failed to execute function" }));
                }
              });
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
              return;
            }
          }

          next();
        });
      },
    },
    visualizer({
      filename: "dist/stats.html",
      title: "RentMaikar Bundle Analysis & Dependency Report",
      gzipSize: true,
      brotliSize: true,
      open: false,
      template: "treemap",
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: (chunkInfo) => {
          const sanitized = chunkInfo.name.replace(/error/gi, "handler");
          return `assets/${sanitized}-[hash].js`;
        },
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Heavy mapping libraries
            if (id.includes("leaflet") || id.includes("react-leaflet")) {
              return "vendor-leaflet";
            }
            // Heavy charting libraries
            if (id.includes("recharts") || id.includes("d3")) {
              return "vendor-charts";
            }
            // Heavy document generation / PDF / Canvas
            if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("jszip")) {
              return "vendor-export";
            }
            // Radix UI component library suite
            if (id.includes("@radix-ui")) {
              return "vendor-radix";
            }
            // Supabase client SDK
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            // Core React ecosystem
            if (id.includes("react-router-dom") || id.includes("@tanstack/react-query")) {
              return "vendor-framework";
            }
          }
        },
      },
    },
  },
}));
