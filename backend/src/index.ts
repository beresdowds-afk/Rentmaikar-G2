import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { healthRouter } from "./routes/health";
import { cpaasRouter } from "./routes/cpaas";
import { webhooksRouter } from "./routes/webhooks";
import { portalApiRouter } from "./routes/portal";
import { bridgeRouter } from "./routes/bridge";
import { renderPortalHtml } from "./portal/portalHtml";
import { bridgeManager } from "./services/bridgeManager";
import { platformHealthService } from "./services/platformHealth";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

  // Always allow portal management routes, bridge fallback routes, and core health checks
  const isManagementOrBridgeRoute =
    path.startsWith("/portal") ||
    path.startsWith("/admin") ||
    path.startsWith("/api/portal") ||
    path.startsWith("/api/bridge") ||
    path === "/api/health" ||
    path === "/api/health/diagnostics" ||
    path === "/api/domains";

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
      "Content-Type, Authorization, X-Requested-With, X-RentMaikar-Client, X-RentMaikar-Fallback, X-Correlation-ID, X-Client-Timestamp, X-Portal-Token, Accept"
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

app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// Webhooks need the raw body to verify signatures, so mount before express.json()
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhooksRouter);
app.use(express.json());

// -----------------------------------------------------------------
// 3. Dedicated Backend Admin & Platform Portal (Domiciled in Backend)
// -----------------------------------------------------------------

// Visual Portal UI
app.get(["/portal", "/portal/*", "/admin"], (req: Request, res: Response) => {
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

// Server boot
app.listen(PORT, () => {
  console.log(`🚀 Rentmaikar Backend API Gateway running on port ${PORT}`);
  console.log(`🌐 Public backend URL: ${PUBLIC_BACKEND_URL}`);
  console.log(`🛡️ Dedicated Backend Admin Portal: ${PUBLIC_BACKEND_URL}/portal`);
  console.log(
    `⚡ Direct Connection Switch: ${
      bridgeManager.isDirectConnectionEnabled() ? "ENABLED (Listening to rentmaikar.com)" : "DISABLED"
    }`
  );
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
});
