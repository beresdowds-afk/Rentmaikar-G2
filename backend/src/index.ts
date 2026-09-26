import express, { Request, Response, NextFunction } from "express";
import http from "http";
import http2 from "http2";
import net from "net";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { healthRouter } from "./routes/health";
import { cpaasRouter } from "./routes/cpaas";
import { functionsRouter } from "./routes/functions";
import { webhooksRouter } from "./routes/webhooks";
import { portalApiRouter } from "./routes/portal";
import { bridgeRouter } from "./routes/bridge";
import { marketingRouter } from "./routes/marketing";
import { renderPortalHtml } from "./portal/portalHtml";
import { bridgeManager } from "./services/bridgeManager";
import { platformHealthService } from "./services/platformHealth";
import { generateServerSitemap } from "./services/sitemapGenerator";
import {
  RENTMAIKAR_LOGO_BUFFER,
  RENTMAIKAR_FAVICON_PNG_BUFFER,
  RENTMAIKAR_FAVICON_ICO_BUFFER,
  RENTMAIKAR_APPLE_ICON_BUFFER,
} from "./assets/logo";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

/** Canonical public backend base URL (API host). */
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || "https://staging.rentmaikar.com";

/**
 * Platform Domain Mapping:
 * - Frontend domain: rentmaikar.com
 * - Backend domain: staging.rentmaikar.com
 * - Incoming mail domain: backend.rentmaikar.com
 * - Outgoing mail domain: notify.rentmaikar.com
 */
export const DOMAIN_MAPPING = {
  frontendDomain: "rentmaikar.com",
  frontendOrigin: "https://rentmaikar.com",
  backendDomain: "staging.rentmaikar.com",
  backendUrl: PUBLIC_BACKEND_URL,
  incomingMailDomain: "backend.rentmaikar.com",
  outgoingMailDomain: "notify.rentmaikar.com",
} as const;

// 1. Security Headers configured for both API and embedded Admin Portal
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://rentmaikar.com", "https://staging.rentmaikar.com", "*"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Direct Connection Gatekeeper & Dynamic CORS Middleware
// Controls whether staging.rentmaikar.com listens to and responds to rentmaikar.com
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  const path = req.path;

  // Always allow API routes, portal management routes, bridge fallback routes, core health checks, and brand assets
  const isManagementOrBridgeRoute =
    path.startsWith("/portal") ||
    path.startsWith("/admin") ||
    path.startsWith("/api/portal") ||
    path.startsWith("/api/bridge") ||
    path.startsWith("/api/functions") ||
    path.startsWith("/api/cpaas") ||
    path.startsWith("/api/webhooks") ||
    path.startsWith("/api/marketing") ||
    path === "/api/health" ||
    path === "/api/health/diagnostics" ||
    path === "/api/domains" ||
    path === "/favicon.ico" ||
    path === "/favicon.png" ||
    path === "/apple-touch-icon.png" ||
    path === "/apple-touch-icon-precomposed.png" ||
    path === "/rentmaikar-logo.jpg" ||
    path === "/logo.jpg" ||
    path === "/logo.png" ||
    path === "/icon.svg" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/sitemap" ||
    path === "/api/sitemap" ||
    path === "/";

  const config = bridgeManager.getConfig();

  // Detect if request specifies explicit staging fallback channel
  const isStagingFallbackRequest =
    req.headers["x-rentmaikar-fallback"] === "staging" ||
    req.query.fallback === "staging";

  // Detect if request originates from the frontend (rentmaikar.com)
  const isFrontendTraffic =
    (origin && config.allowedOrigins.some((o) => origin.toLowerCase().startsWith(o.toLowerCase()))) ||
    (origin && origin.toLowerCase().includes("rentmaikar.com")) ||
    (referer && referer.toLowerCase().includes("rentmaikar.com")) ||
    req.headers["x-rentmaikar-client"] === "frontend" ||
    req.headers["x-rentmaikar-client"] === "rentmaikar.com";

  // If auto-disconnect switch is enabled and frontend call is detected from rentmaikar.com:
  // Disconnect frontend files immediately from backend files so the bridge becomes active!
  if (isFrontendTraffic && bridgeManager.isAutoDisconnectOnFrontendTrafficEnabled()) {
    if (bridgeManager.isDirectConnectionEnabled()) {
      bridgeManager.triggerAutoDisconnectOnFrontendCall({
        origin,
        referer,
        path: req.path,
        method: req.method,
        ip: (req.headers["x-forwarded-for"] as string) || req.ip,
        userAgent: req.headers["user-agent"],
      });
    }
  }

  const isDirectConnectionActive = bridgeManager.isDirectConnectionEnabled();

  // If traffic is from frontend and direct connection is disconnected:
  // Allow if it is a management route, bridge route, or explicit fallback communication via staging.rentmaikar.com
  if (isFrontendTraffic && !isDirectConnectionActive && !isManagementOrBridgeRoute && !isStagingFallbackRequest) {
    res.setHeader("X-RentMaikar-Bridge-Status", "bridge-active");
    res.setHeader("X-RentMaikar-Fallback-Active", "true");
    res.setHeader("X-RentMaikar-Direct-Connection", "disconnected");

    // Allow CORS headers so browser client can read 503 fallback routing instructions
    if (origin && bridgeManager.isOriginAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    res.status(503).json({
      error: "DirectConnectionDisconnected",
      code: "BRIDGE_ACTIVE_FALLBACK_ENGAGED",
      message: "Direct link between frontend files and backend disconnected immediately upon detecting call from rentmaikar.com. Staging fallback bridge is now ACTIVE.",
      bridge_active: true,
      direct_connection_enabled: false,
      fallback_channel: "staging_fallback",
      frontend: config.frontendDomain,
      backend: config.backendDomain,
      timestamp: new Date().toISOString(),
      fallbackAvailable: true,
      fallbackUrl: `${config.backendUrl}/api/bridge/call`,
    });
    return;
  }

  // Dynamic CORS Handling when Bridge is ENABLED or request is permissible
  if (origin && bridgeManager.isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, apikey, x-client-info, X-Requested-With, X-RentMaikar-Client, X-RentMaikar-Fallback, X-Correlation-ID, X-Client-Timestamp, X-Portal-Token, Accept"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
  } else if (!origin) {
    // Direct or server-to-server calls
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader(
    "X-RentMaikar-Bridge-Status",
    isDirectConnectionActive ? "active" : "disabled"
  );
  if (isStagingFallbackRequest) {
    res.setHeader("X-RentMaikar-Channel", "staging_fallback");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(
  express.urlencoded({
    extended: true,
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(morgan("combined"));

// Webhooks raw body capture (for /api/webhooks and all provider endpoints)
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhooksRouter);
app.use(
  express.json({
    limit: "25mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// -----------------------------------------------------------------
// 2.5 Brand Assets & Favicons (for browsers on staging.rentmaikar.com)
// -----------------------------------------------------------------

// Static asset serving if public directory exists
const publicDir = path.join(__dirname, "../public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: "1d" }));
}

// Guaranteed in-memory fallback handlers for zero-failure container resilience
app.get(["/favicon.ico"], (req: Request, res: Response) => {
  res.setHeader("Content-Type", "image/x-icon");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(RENTMAIKAR_FAVICON_ICO_BUFFER);
});

app.get(["/favicon.png"], (req: Request, res: Response) => {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(RENTMAIKAR_FAVICON_PNG_BUFFER);
});

app.get(["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"], (req: Request, res: Response) => {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(RENTMAIKAR_APPLE_ICON_BUFFER);
});

app.get(["/rentmaikar-logo.jpg", "/logo.jpg"], (req: Request, res: Response) => {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(RENTMAIKAR_LOGO_BUFFER);
});

app.get(["/logo.png"], (req: Request, res: Response) => {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(RENTMAIKAR_FAVICON_PNG_BUFFER);
});

// -----------------------------------------------------------------
// 2.7 Server-Side XML Sitemap Generator (for search engines & SEO)
// -----------------------------------------------------------------
app.get(["/sitemap.xml", "/sitemap", "/api/sitemap"], async (req: Request, res: Response) => {
  try {
    const forceFresh = req.query.fresh === "true" || req.query.fresh === "1";
    const { xml, count, cached } = await generateServerSitemap(forceFresh);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.setHeader("X-Sitemap-Entries", String(count));
    res.setHeader("X-Sitemap-Cached", String(cached));
    res.send(xml);
  } catch (err: any) {
    console.error("[Sitemap] Generation error:", err);
    res.status(500).setHeader("Content-Type", "text/plain").send("Failed to generate sitemap");
  }
});

// Root handler for staging.rentmaikar.com
app.get("/", (req: Request, res: Response) => {
  if (req.accepts("html") && !req.xhr) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(renderPortalHtml());
  }
  res.json({
    status: "ok",
    service: "RentMaikar Backend API Gateway & Microservices",
    domain: DOMAIN_MAPPING.backendDomain,
    portal: `${DOMAIN_MAPPING.backendUrl}/portal`,
    health: `${DOMAIN_MAPPING.backendUrl}/api/health`,
    bridge_active: bridgeManager.isDirectConnectionEnabled(),
  });
});

// -----------------------------------------------------------------
// 3. Dedicated Backend Admin & Platform Portal (Domiciled in Backend)
// -----------------------------------------------------------------

// Visual Portal UI (Accessible via /portal or /admin on staging.rentmaikar.com)
app.get(["/portal", "/portal/*", "/admin", "/admin/*"], (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderPortalHtml());
});

// Portal API for Auth, Bridge Toggle, Subsystem Monitoring, and Invitations
app.use("/api/portal", portalApiRouter);

// -----------------------------------------------------------------
// 4. API Endpoints
// -----------------------------------------------------------------

app.use("/api/health", healthRouter);
app.use("/api/cpaas", cpaasRouter);
app.use("/api/functions", functionsRouter);
app.use("/api/marketing", marketingRouter);

// Bridge endpoints for Call, Listen (SSE), Respond, Polling, Telemetry, and Handshake
app.use("/api/bridge", bridgeRouter);
app.post("/api/bridge/handshake", async (req: Request, res: Response) => {
  const result = await platformHealthService.testBridgeHandshake();
  res.json({
    status: "ok",
    handshake: result,
  });
});

app.get("/api/domains", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    domains: DOMAIN_MAPPING,
    bridge_active: bridgeManager.isDirectConnectionEnabled(),
  });
});

// Global 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.originalUrl} does not exist on Rentmaikar API Gateway`,
  });
});

// -----------------------------------------------------------------
// 5. Hardened Dual Protocol Server Boot (HTTP/1.1 + HTTP/2 h2c)
// Resolves "upstream connect error or disconnect/reset before headers. reset reason: protocol error"
// on Google Cloud Run and Envoy Load Balancer
// -----------------------------------------------------------------

const FORBIDDEN_H2_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "http2-settings",
]);

const h1Server = http.createServer(app);
const h2Server = http2.createServer((req, res) => {
  // Wrap res.setHeader to filter out HTTP/1 connection-specific headers that crash HTTP/2 streams
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: any) {
    if (FORBIDDEN_H2_HEADERS.has(name.toLowerCase())) {
      return this;
    }
    return origSetHeader(name, value);
  };

  const origWriteHead = res.writeHead.bind(res);
  (res as any).writeHead = function (statusCode: number, ...args: any[]) {
    if (args.length > 0) {
      const headers = typeof args[0] === "object" ? args[0] : args[1];
      if (headers && typeof headers === "object") {
        for (const key of Object.keys(headers)) {
          if (FORBIDDEN_H2_HEADERS.has(key.toLowerCase())) {
            delete headers[key];
          }
        }
      }
    }
    return origWriteHead(statusCode, ...args);
  };

  try {
    app(req as any, res as any);
  } catch (err: any) {
    console.error("[H2 Gateway Handler Error]", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  }
});

// Align keep-alive timeouts with Google Cloud Run & Cloud Load Balancer (Envoy timeout is 600s)
h1Server.keepAliveTimeout = 650000;
h1Server.headersTimeout = 660000;
h2Server.setTimeout(650000);

// Graceful client error handling avoids abrupt socket teardown before headers
h1Server.on("clientError", (err: any, socket: any) => {
  if (err.code === "ECONNRESET" || !socket.writable) return;
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

const H2_PREFACE = Buffer.from("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n");

// Dual Protocol Listener: multiplexes TCP connections to HTTP/1.1 or HTTP/2
const gatewayServer = net.createServer((socket) => {
  // Prevent socket streaming prematurely before routing
  socket.pause();

  let handled = false;
  // If no data received within 600ms (e.g. TCP health check or idle pooled socket), delegate to HTTP/1.1
  const timeoutId = setTimeout(() => {
    if (!handled && !socket.destroyed) {
      handled = true;
      h1Server.emit("connection", socket);
      socket.resume();
    }
  }, 600);

  socket.once("data", (chunk) => {
    if (handled) return;
    handled = true;
    clearTimeout(timeoutId);

    socket.unshift(chunk);
    if (chunk.length >= 24 && chunk.subarray(0, 24).equals(H2_PREFACE)) {
      h2Server.emit("connection", socket);
    } else {
      h1Server.emit("connection", socket);
    }
    socket.resume();
  });

  socket.on("error", (err: any) => {
    if (err.code === "ECONNRESET" || err.code === "EPIPE") return;
    console.warn("[Gateway Socket Error]", err.message);
  });
});

const serverPort = Number(PORT) || 8080;
gatewayServer.listen(serverPort, "0.0.0.0", () => {
  console.log(`🚀 Rentmaikar Backend API Gateway running on port ${serverPort} (0.0.0.0 dual HTTP/1.1 + HTTP/2 h2c enabled)`);
  console.log(`🌐 Public backend URL: ${PUBLIC_BACKEND_URL}`);
  console.log(`🛡️ Dedicated Backend Admin Portal: ${PUBLIC_BACKEND_URL}/portal & ${PUBLIC_BACKEND_URL}/admin`);
  console.log(
    `⚡ Direct Connection Switch: ${
      bridgeManager.isDirectConnectionEnabled() ? "ENABLED (Listening to rentmaikar.com)" : "DISABLED"
    }`
  );
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
});
