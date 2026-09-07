import { Router, Request, Response } from "express";
import { bridgeManager } from "../services/bridgeManager";

export const healthRouter = Router();

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
