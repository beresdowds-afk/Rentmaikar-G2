import { Router, Request, Response } from "express";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { bridgeManager, BridgeEventPacket } from "../services/bridgeManager";
import { platformHealthService } from "../services/platformHealth";

export const bridgeRouter = Router();

/**
 * 1. CALL:
 * General-purpose RPC endpoint allowing frontend files to invoke backend
 * actions through staging.rentmaikar.com when direct contact is severed.
 */
bridgeRouter.post("/call", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const {
    action,
    payload = {},
    correlationId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    clientTimestamp,
  } = req.body || {};

  const channel = req.headers["x-rentmaikar-fallback"] === "staging" ? "staging_fallback" : "direct";

  // Check if direct connection has been disconnected by administrator switch
  if (!bridgeManager.isDirectConnectionEnabled() && channel === "direct" && action !== "toggle" && action !== "reconnect") {
    return res.status(503).json({
      status: "disconnected",
      success: false,
      error: "DIRECT_LINK_DISCONNECTED",
      message: "Direct communication between front end files and backend has been switched OFF by administrator.",
      direct_connection_enabled: false,
      staging_fallback_url: "https://staging.rentmaikar.com/api",
    });
  }

  try {
    let result: any = null;

    switch (action) {
      case "health":
      case "check_health": {
        const bridge = bridgeManager.getConfig();
        result = {
          service: "rentmaikar-backend-gateway",
          status: "healthy",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          backendUrl: bridge.backendUrl,
          directConnectionEnabled: bridge.enabled,
        };
        break;
      }

      case "domains":
      case "get_domains": {
        const bridge = bridgeManager.getConfig();
        result = {
          frontendDomain: bridge.frontendDomain,
          frontendOrigin: bridge.frontendOrigin,
          backendDomain: bridge.backendDomain,
          backendUrl: bridge.backendUrl,
          incomingMailDomain: "backend.rentmaikar.com",
          outgoingMailDomain: "notify.rentmaikar.com",
        };
        break;
      }

      case "ping": {
        result = {
          pong: true,
          serverTimestamp: new Date().toISOString(),
          clientTimestamp,
        };
        break;
      }

      case "cpaas_simulate": {
        result = {
          success: true,
          messageId: `cpaas-${Date.now()}`,
          status: "delivered_via_staging_bridge",
          recipient: payload.recipient,
        };
        break;
      }

      case "diagnostics": {
        const report = await platformHealthService.getLatestReport();
        result = report;
        break;
      }

      case "custom":
      default: {
        result = {
          acknowledged: true,
          action: action || "echo",
          echo: payload,
          note: "Processed via RentMaikar Staging Gateway bridge",
        };
        break;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Record response telemetry
    bridgeManager.logFrontendResponse({
      correlationId,
      eventType: `call_${action || "custom"}`,
      status: "success",
      clientTimestamp,
      clientOrigin: (req.headers.origin as string) || (req.headers.referer as string) || "rentmaikar.com",
      clientIp: req.ip,
      communicationChannel: channel,
      latencyMs,
      payload: { action, resultSummary: typeof result === "object" ? Object.keys(result) : "value" },
    });

    res.json({
      status: "ok",
      success: true,
      action,
      correlationId,
      channel,
      processedBy: "staging.rentmaikar.com",
      latencyMs,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      success: false,
      correlationId,
      channel,
      error: err.message || "Failed to execute backend call",
      processedBy: "staging.rentmaikar.com",
    });
  }
});

/**
 * 2. LISTEN:
 * Real-time Server-Sent Events (SSE) stream allowing frontend files to continuously
 * listen to backend state, heartbeats, and broadcast messages from staging.rentmaikar.com.
 */
bridgeRouter.get("/events", (req: Request, res: Response) => {
  // Set SSE HTTP response headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const origin = req.headers.origin as string | undefined;
  if (origin && bridgeManager.isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.flushHeaders?.();

  bridgeManager.incrementListeners();
  const config = bridgeManager.getConfig();

  // Send initial connection packet
  const connectPacket: BridgeEventPacket = {
    id: `evt-conn-${Date.now()}`,
    type: "connected",
    timestamp: new Date().toISOString(),
    source: "staging.rentmaikar.com",
    targetDomain: "rentmaikar.com",
    data: {
      message: "Connected to RentMaikar Staging Event Stream",
      backendDomain: config.backendDomain,
      backendUrl: config.backendUrl,
      directConnectionEnabled: config.enabled,
      mode: config.mode,
      activeListeners: bridgeManager.getActiveListenersCount(),
    },
  };

  res.write(`event: connected\ndata: ${JSON.stringify(connectPacket)}\n\n`);

  // Listener for dynamic bridge events emitted by backend services
  const onBridgeEvent = (packet: BridgeEventPacket) => {
    res.write(`event: ${packet.type}\ndata: ${JSON.stringify(packet)}\n\n`);
  };

  bridgeManager.on("bridge_event", onBridgeEvent);

  // Send regular heartbeat every 15 seconds to keep connection alive and verify link
  const heartbeatInterval = setInterval(() => {
    const memory = process.memoryUsage();
    const heartbeatPacket: BridgeEventPacket = {
      id: `hb-${Date.now()}`,
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      source: "staging.rentmaikar.com",
      targetDomain: "rentmaikar.com",
      data: {
        serverTimestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(memory.rss / (1024 * 1024)),
        directConnectionActive: bridgeManager.isDirectConnectionEnabled(),
        activeListeners: bridgeManager.getActiveListenersCount(),
        channel: "staging.rentmaikar.com",
      },
    };

    res.write(`event: heartbeat\ndata: ${JSON.stringify(heartbeatPacket)}\n\n`);
  }, 15000);

  // Clean up when client disconnects
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    bridgeManager.off("bridge_event", onBridgeEvent);
    bridgeManager.decrementListeners();
  });
});

/**
 * LISTEN Fallback: Polling endpoint for clients that cannot use SSE.
 */
bridgeRouter.get("/poll", (req: Request, res: Response) => {
  const since = (req.query.since as string) || "";
  const recentEvents = bridgeManager.getRecentEvents(20);
  const filtered = since
    ? recentEvents.filter((evt) => new Date(evt.timestamp).getTime() > new Date(since).getTime())
    : recentEvents;

  res.json({
    status: "ok",
    backendDomain: "staging.rentmaikar.com",
    serverTimestamp: new Date().toISOString(),
    directConnectionEnabled: bridgeManager.isDirectConnectionEnabled(),
    events: filtered,
  });
});

/**
 * 3. RESPOND:
 * Endpoint for frontend files to respond to backend queries, status transitions,
 * loss-of-contact notifications, or telemetry acknowledgments.
 */
bridgeRouter.post("/respond", (req: Request, res: Response) => {
  const {
    correlationId = `resp-${Date.now()}`,
    eventType = "client_acknowledgment",
    status = "ok",
    clientTimestamp,
    latencyMs,
    payload = {},
    error,
  } = req.body || {};

  const channel = req.headers["x-rentmaikar-fallback"] === "staging" ? "staging_fallback" : "direct";

  const record = bridgeManager.logFrontendResponse({
    correlationId,
    eventType,
    status: error ? "error" : status,
    clientTimestamp,
    clientOrigin: (req.headers.origin as string) || (req.headers.referer as string) || "rentmaikar.com",
    clientIp: req.ip,
    communicationChannel: channel,
    latencyMs,
    payload: {
      ...payload,
      error,
    },
  });

  // Broadcast acknowledgment to backend admin telemetry
  bridgeManager.broadcastEvent({
    id: `evt-frontend-ack-${Date.now()}`,
    type: "frontend_response_received",
    timestamp: new Date().toISOString(),
    source: "rentmaikar.com",
    targetDomain: "staging.rentmaikar.com",
    data: record,
  });

  res.json({
    status: "ok",
    acknowledged: true,
    correlationId,
    receivedAt: record.serverTimestamp,
    channel,
    note: "Frontend response successfully logged and acknowledged by staging.rentmaikar.com",
  });
});

/**
 * Round-trip fast Ping-Pong Probe
 */
bridgeRouter.post("/ping", (req: Request, res: Response) => {
  const clientSentAt = req.body?.clientSentAt || req.body?.clientTimestamp;
  const serverReceivedAt = Date.now();
  const config = bridgeManager.getConfig();

  res.json({
    status: "ok",
    pong: true,
    serverTimestamp: new Date().toISOString(),
    clientSentAt,
    backendHost: "staging.rentmaikar.com",
    directConnectionEnabled: config.enabled,
    mode: config.mode,
  });
});

/**
 * Get Bridge Status & Telemetry
 */
bridgeRouter.get("/status", (req: Request, res: Response) => {
  const config = bridgeManager.getConfig();
  res.json({
    status: "ok",
    direct_connection_enabled: config.enabled,
    mode: config.mode,
    frontend_domain: config.frontendDomain,
    backend_domain: config.backendDomain,
    backend_url: config.backendUrl,
    allowed_origins: config.allowedOrigins,
    active_listeners: bridgeManager.getActiveListenersCount(),
    last_toggled_at: config.lastToggledAt,
    last_toggled_by: config.lastToggledBy,
    recent_responses_count: bridgeManager.getResponseHistory().length,
  });
});

/**
 * Telemetry endpoint for recent frontend responses
 */
bridgeRouter.get("/telemetry", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    activeListeners: bridgeManager.getActiveListenersCount(),
    recentEvents: bridgeManager.getRecentEvents(15),
    responseHistory: bridgeManager.getResponseHistory(25),
  });
});

/**
 * Broadcast event from backend to all listening frontend files
 */
bridgeRouter.post("/broadcast", (req: Request, res: Response) => {
  const { type = "backend_notice", message, data = {} } = req.body || {};

  const packet: BridgeEventPacket = {
    id: `bc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type,
    timestamp: new Date().toISOString(),
    source: "staging.rentmaikar.com",
    targetDomain: "rentmaikar.com",
    data: {
      message: message || "Notice from staging.rentmaikar.com backend",
      ...data,
    },
  };

  bridgeManager.broadcastEvent(packet);

  res.json({
    status: "ok",
    broadcast: packet,
    listenersCount: bridgeManager.getActiveListenersCount(),
  });
});

/**
 * 4. DIRECT CONNECTION TOGGLE SWITCH:
 * Allows the Admin Dashboard to connect or disconnect the front end files
 * from the backend files.
 */
bridgeRouter.post("/toggle", (req: Request, res: Response) => {
  const { enabled, reason, toggledBy, mode } = req.body || {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "Field 'enabled' (boolean) is required" });
    return;
  }

  const operator = toggledBy || "Admin Dashboard Switch";
  const disconnectReason =
    reason ||
    (enabled
      ? "Reconnected direct frontend-to-backend communication"
      : "Front end files disconnected from backend files via Admin Dashboard switch");

  const updated = bridgeManager.setConnectionState(
    enabled,
    operator,
    disconnectReason,
    mode || (enabled ? "active" : "disabled")
  );

  // Broadcast toggle event to any connected listeners
  bridgeManager.broadcastEvent({
    id: `evt-toggle-${Date.now()}`,
    type: "connection_switch_toggled",
    timestamp: new Date().toISOString(),
    source: "staging.rentmaikar.com",
    targetDomain: "rentmaikar.com",
    data: {
      directConnectionEnabled: updated.enabled,
      mode: updated.mode,
      toggledBy: updated.lastToggledBy,
      reason: disconnectReason,
    },
  });

  res.json({
    status: "ok",
    message: `Frontend-to-backend direct connection is now ${enabled ? "CONNECTED" : "DISCONNECTED"}`,
    direct_connection_enabled: updated.enabled,
    mode: updated.mode,
    last_toggled_at: updated.lastToggledAt,
    last_toggled_by: updated.lastToggledBy,
  });
});

/**
 * 5. REGENERATE FRONTEND DOWNLOADABLE ZIP FILES:
 * Executes scripts/package-frontend-zip.py to regenerate all frontend archives
 * on demand.
 */
bridgeRouter.post("/package-frontend", (req: Request, res: Response) => {
  const scriptPath = path.resolve(process.cwd(), "..", "scripts", "package-frontend-zip.py");
  const localScriptPath = path.resolve(process.cwd(), "scripts", "package-frontend-zip.py");
  const pathToRun = fs.existsSync(scriptPath) ? scriptPath : localScriptPath;

  exec(`python3 "${pathToRun}"`, (error, stdout, stderr) => {
    if (error) {
      console.error("[BridgeRouter] Package script error:", error, stderr);
      res.status(500).json({
        status: "error",
        error: error.message,
        details: stderr,
      });
      return;
    }

    res.json({
      status: "ok",
      message: "Downloadable frontend zip files successfully regenerated",
      packages: {
        source: "/downloads/rentmaikar-frontend.zip",
        productionBuild: "/downloads/rentmaikar-frontend-production-build.zip",
        complete: "/downloads/rentmaikar-frontend-complete.zip",
      },
      output: stdout.trim(),
      timestamp: new Date().toISOString(),
    });
  });
});

/**
 * 6. AUTO-DISCONNECT SWITCH ON FRONTEND TRAFFIC:
 * Enables the switch to disconnect the frontend files from the backend files
 * immediately when calls are detected from the rentmaikar.com frontend,
 * making the fallback bridge active.
 */
bridgeRouter.get("/auto-disconnect", (req: Request, res: Response) => {
  const config = bridgeManager.getConfig();
  res.json({
    status: "ok",
    auto_disconnect_enabled: config.autoDisconnectOnFrontendTraffic,
    trigger_count: config.autoDisconnectTriggerCount,
    last_trigger: config.lastAutoDisconnectTrigger,
    direct_connection_enabled: config.enabled,
    bridge_active: !config.enabled,
    backend_domain: config.backendDomain,
    frontend_domain: config.frontendDomain,
  });
});

bridgeRouter.post("/auto-disconnect", (req: Request, res: Response) => {
  const { enabled, toggledBy } = req.body || {};
  if (typeof enabled !== "boolean") {
    const config = bridgeManager.getConfig();
    return res.json({
      status: "ok",
      auto_disconnect_enabled: config.autoDisconnectOnFrontendTraffic,
      trigger_count: config.autoDisconnectTriggerCount,
      last_trigger: config.lastAutoDisconnectTrigger,
      direct_connection_enabled: config.enabled,
      bridge_active: !config.enabled,
    });
  }

  const updated = bridgeManager.setAutoDisconnectOnFrontendTraffic(
    enabled,
    toggledBy || "Admin Dashboard Switch"
  );

  res.json({
    status: "ok",
    message: `Auto-disconnect on rentmaikar.com frontend calls is now ${enabled ? "ARMED/ENABLED" : "DISARMED/DISABLED"}`,
    auto_disconnect_enabled: updated.autoDisconnectOnFrontendTraffic,
    trigger_count: updated.autoDisconnectTriggerCount,
    last_trigger: updated.lastAutoDisconnectTrigger,
    direct_connection_enabled: updated.enabled,
    bridge_active: !updated.enabled,
  });
});

/**
 * 7. SIMULATE FRONTEND CALL FROM rentmaikar.com:
 * Allows administrators to trigger the auto-disconnect immediately to verify
 * that calls from rentmaikar.com sever direct contact and activate the bridge.
 */
bridgeRouter.post("/simulate-frontend-call", (req: Request, res: Response) => {
  const {
    origin = "https://rentmaikar.com",
    path = "/api/vehicles",
    method = "GET",
  } = req.body || {};

  const triggerResult = bridgeManager.triggerAutoDisconnectOnFrontendCall({
    origin,
    referer: `${origin}/`,
    path,
    method,
    ip: (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1",
    userAgent: (req.headers["user-agent"] as string) || "Mozilla/5.0 (Simulated rentmaikar.com Front End)",
  });

  res.json({
    status: "ok",
    simulated: true,
    action: "DISCONNECTED_FRONTEND_FILES",
    bridge_active: triggerResult.bridgeActive,
    direct_connection_enabled: false,
    trigger_count: triggerResult.triggerCount,
    origin,
    path,
    method,
    message: triggerResult.message,
    fallback_url: "https://staging.rentmaikar.com/api/bridge/call",
  });
});


