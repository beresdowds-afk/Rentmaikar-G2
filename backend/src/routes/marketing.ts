import { Router, Request, Response } from "express";

export const marketingRouter = Router();

/**
 * GET /api/marketing/health
 * Returns status of core marketing engine services
 */
marketingRouter.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    module: "marketing_engine_core",
    phase: 2,
    liveProvidersActive: false, // In Phase 2, providers remain disconnected until approved
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/marketing/events
 * Ingests canonical marketing events from backend operations or webhooks
 */
marketingRouter.post("/events", async (req: Request, res: Response) => {
  try {
    const { event_name, event_id, properties, user_data, session_id } = req.body || {};

    if (!event_name) {
      return res.status(400).json({ success: false, error: "event_name is required" });
    }

    const canonicalEventId = event_id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return res.status(200).json({
      success: true,
      eventId: canonicalEventId,
      received: true,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to process event" });
  }
});

/**
 * POST /api/marketing/webhooks/:platform
 * Safe webhook ingestion endpoint with platform validation
 */
marketingRouter.post("/webhooks/:platform", async (req: Request, res: Response) => {
  const { platform } = req.params;
  const allowedPlatforms = ["meta", "google", "tiktok", "linkedin", "manychat", "sentdm", "twilio", "resend"];

  if (!allowedPlatforms.includes(platform)) {
    return res.status(404).json({ success: false, error: `Platform '${platform}' is not supported` });
  }

  // Idempotent webhook acknowledgement
  return res.status(200).json({
    received: true,
    platform,
    timestamp: new Date().toISOString(),
  });
});
