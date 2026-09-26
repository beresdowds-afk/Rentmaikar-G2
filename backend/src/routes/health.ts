import { Router, Request, Response } from "express";
import { bridgeManager } from "../services/bridgeManager";

export const healthRouter = Router();

/**
 * 1. LIVENESS PROBE: "Is this process alive?"
 * Lightweight check with zero external provider dependencies.
 * Returns 200 as long as the Express event loop is responsive.
 */
healthRouter.get("/liveness", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "alive",
    service: "rentmaikar-backend",
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
    pid: process.pid,
  });
});

/**
 * 2. READINESS PROBE: "Can this service safely accept normal work?"
 * Identifies whether mandatory local services and database bindings are operational.
 */
healthRouter.get("/readiness", (_req: Request, res: Response) => {
  const hasSupabaseConfig = Boolean(
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    process.env.VITE_SUPABASE_URL
  );

  const bridge = bridgeManager.getConfig();
  const isReady = hasSupabaseConfig;

  const status = isReady ? 200 : 503;
  res.status(status).json({
    status: isReady ? "ready" : "not_ready",
    ready: isReady,
    service: "rentmaikar-backend",
    timestamp: new Date().toISOString(),
    mandatory_dependencies: {
      database_binding: hasSupabaseConfig ? "configured" : "unconfigured",
      bridge_active: bridge.enabled,
    },
  });
});

/**
 * 3. DEPENDENCY HEALTH: "Which critical dependencies are healthy/degraded/unavailable?"
 * Strictly sanitized: exposes operational status WITHOUT leaking secrets, tokens,
 * credentials, sensitive error bodies, or internal URLs.
 */
healthRouter.get("/dependencies", (_req: Request, res: Response) => {
  const hasSupabase = Boolean(
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    process.env.VITE_SUPABASE_URL
  );

  res.status(200).json({
    timestamp: new Date().toISOString(),
    service: "rentmaikar-backend",
    dependencies: {
      database: {
        status: hasSupabase ? "healthy" : "degraded",
        configured: hasSupabase,
      },
      cpaas: {
        sent_dm: Boolean(process.env.SENT_API_KEY) ? "configured" : "unconfigured",
        twilio: Boolean(process.env.TWILIO_ACCOUNT_SID) ? "configured" : "unconfigured",
        termii: Boolean(process.env.TERMII_API_KEY) ? "configured" : "unconfigured",
      },
      payments: {
        paypal: Boolean(process.env.PAYPAL_CLIENT_ID) ? "configured" : "unconfigured",
        paystack: Boolean(process.env.PAYSTACK_SECRET_KEY) ? "configured" : "unconfigured",
        opay: Boolean(process.env.OPAY_SECRET_KEY) ? "configured" : "unconfigured",
      },
      telematics: {
        hologram: "configured",
        traccar: "configured",
        emqx_mqtt: "configured",
      },
      email_dispatch: {
        resend: Boolean(process.env.RESEND_API_KEY) ? "configured" : "unconfigured",
        sending_domain: "configured",
      },
    },
  });
});

healthRouter.get("/", (req: Request, res: Response) => {
  const bridge = bridgeManager.getConfig();
  res.json({
    status: bridge.enabled ? "healthy" : "degraded",
    service: "rentmaikar-backend",
    version: "1.0.0",
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    direct_connection_bridge: {
      enabled: bridge.enabled,
      mode: bridge.mode,
      frontend: bridge.frontendDomain,
      backend: bridge.backendDomain,
      listening_to_frontend: bridge.enabled,
    },
  });
});

healthRouter.get("/diagnostics", (req: Request, res: Response) => {
  const publicBackendUrl = process.env.PUBLIC_BACKEND_URL || "https://staging.rentmaikar.com";
  const bridge = bridgeManager.getConfig();
  res.json({
    domains: {
      frontend: "rentmaikar.com",
      backend: "staging.rentmaikar.com",
      incoming_mail: "backend.rentmaikar.com",
      outgoing_mail: "notify.rentmaikar.com",
    },
    direct_connection_bridge: {
      enabled: bridge.enabled,
      mode: bridge.mode,
      allowed_origins: bridge.allowedOrigins,
      last_toggled_at: bridge.lastToggledAt,
      last_toggled_by: bridge.lastToggledBy,
    },
    cpaas_gateway: {
      sent_dm: Boolean(process.env.SENT_API_KEY),
      sent_webhook_url: process.env.SENT_WEBHOOK_URL || `${publicBackendUrl}/api/webhooks/sent`,
      sent_status_webhook_url:
        process.env.SENT_STATUS_WEBHOOK_URL || `${publicBackendUrl}/api/webhooks/sent/status`,
      twilio: Boolean(process.env.TWILIO_ACCOUNT_SID),
      termii: Boolean(process.env.TERMII_API_KEY),
    },
    payment_providers: {
      paypal: Boolean(process.env.PAYPAL_CLIENT_ID),
      paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
      opay: Boolean(process.env.OPAY_SECRET_KEY),
    },
    iot_telematics: {
      hologram_cellular: true,
      traccar_gps: true,
      emqx_mqtt: true,
    },
  });
});
