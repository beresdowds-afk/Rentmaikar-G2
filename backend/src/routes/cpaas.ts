import { Router, Request, Response } from "express";
import { sentBackendClient } from "../services/sentClient";

export const cpaasRouter = Router();

/**
 * POST /api/cpaas/send
 * Dispatches unified messages via Sent.dm v3, Twilio, or Termii
 */
cpaasRouter.post("/send", async (req: Request, res: Response) => {
  try {
    const { to, channel = "sms", text, template, sender_id, provider = "auto" } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Missing required 'to' recipient number." });
    }

    const recipients = Array.isArray(to) ? to : [to];

    // Dispatch via Sent.dm OpenAPI v3 gateway
    const result = await sentBackendClient.sendMessage({
      to: recipients,
      channel,
      text,
      template,
      sender_id,
      metadata: { source: "backend_api_gateway" },
    });

    return res.status(200).json({
      success: true,
      provider: "sent",
      data: result,
    });
  } catch (error: any) {
    console.error("[Backend CPaaS Error]", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to dispatch message",
    });
  }
});
