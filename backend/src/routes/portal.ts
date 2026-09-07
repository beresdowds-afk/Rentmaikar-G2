import { Router, Request, Response, NextFunction } from "express";
import { portalAuthService, PortalRole } from "../services/portalAuth";
import { bridgeManager } from "../services/bridgeManager";
import { platformHealthService } from "../services/platformHealth";

export const portalApiRouter = Router();

/**
 * Middleware: Extract and verify session token from Authorization header or Cookie
 */
export function requirePortalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || (req.headers["x-portal-token"] as string) || "";
  let token = "";

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (authHeader.startsWith("rm_portal.")) {
    token = authHeader.trim();
  }

  // Also check cookie if available
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/rm_portal_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication required for Backend Portal. Please sign in or redeem an invite.",
    });
    return;
  }

  const session = portalAuthService.verifySessionToken(token);
  if (!session) {
    res.status(401).json({
      error: "SESSION_EXPIRED",
      message: "Session token invalid or expired. Please sign in again.",
    });
    return;
  }

  // Attach session to request
  (req as any).portalSession = session;
  next();
}

/**
 * Middleware: Ensure caller has Admin privileges
 */
export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).portalSession;
  if (!session || session.role !== "admin") {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Administrative privileges required to perform this action.",
    });
    return;
  }
  next();
}

// -------------------------------------------------------------
// Public Authentication Routes
// -------------------------------------------------------------

portalApiRouter.post("/auth/login", (req: Request, res: Response) => {
  const { email, password, masterKey } = req.body || {};
  const result = portalAuthService.login(masterKey || email, password);

  if (!result.success) {
    res.status(401).json({ error: "LOGIN_FAILED", message: result.error });
    return;
  }

  res.json({
    status: "ok",
    token: result.token,
    user: result.user,
    message: `Welcome to RentMaikar Backend Portal, ${result.user?.name}`,
  });
});

portalApiRouter.get("/auth/session", requirePortalAuth, (req: Request, res: Response) => {
  const session = (req as any).portalSession;
  res.json({
    status: "ok",
    session,
  });
});

portalApiRouter.get("/auth/invitation-info", (req: Request, res: Response) => {
  const token = (req.query.token as string) || "";
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const invites = portalAuthService.listInvitations();
  const invite = invites.find((i) => i.token === token);

  if (!invite) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  if (invite.isUsed) {
    res.status(400).json({ error: "Invitation has already been used" });
    return;
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: "Invitation has expired" });
    return;
  }

  res.json({
    status: "ok",
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    note: invite.note,
  });
});

portalApiRouter.post("/auth/accept-invite", (req: Request, res: Response) => {
  const { token, name, password } = req.body || {};
  if (!token) {
    res.status(400).json({ error: "Invitation token is required" });
    return;
  }

  const result = portalAuthService.acceptInvitation({ token, name, password });
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    status: "ok",
    token: result.token,
    user: result.user,
    message: "Invitation accepted. Account is now active.",
  });
});

// -------------------------------------------------------------
// Direct Connection Bridge Routes
// -------------------------------------------------------------

portalApiRouter.get("/bridge", requirePortalAuth, (req: Request, res: Response) => {
  const config = bridgeManager.getConfig();
  res.json({
    status: "ok",
    bridge: config,
  });
});

portalApiRouter.post("/bridge/toggle", requirePortalAuth, requireAdminRole, (req: Request, res: Response) => {
  const session = (req as any).portalSession;
  const { enabled, reason, mode } = req.body || {};

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "Field 'enabled' (boolean) is required" });
    return;
  }

  const updated = bridgeManager.setConnectionState(
    enabled,
    `${session.name} (${session.email})`,
    reason,
    mode
  );

  res.json({
    status: "ok",
    message: `Direct connection bridge successfully ${enabled ? "ENABLED" : "DISABLED"}`,
    bridge: updated,
  });
});

portalApiRouter.post("/bridge/test", requirePortalAuth, async (req: Request, res: Response) => {
  const handshake = await platformHealthService.testBridgeHandshake();
  res.json({
    status: "ok",
    handshake,
  });
});

portalApiRouter.post("/bridge/origins", requirePortalAuth, requireAdminRole, (req: Request, res: Response) => {
  const session = (req as any).portalSession;
  const { origins } = req.body || {};

  if (!Array.isArray(origins)) {
    res.status(400).json({ error: "'origins' must be an array of origin strings" });
    return;
  }

  const updated = bridgeManager.updateAllowedOrigins(origins, `${session.name} (${session.email})`);
  res.json({
    status: "ok",
    message: "Allowed origins updated",
    bridge: updated,
  });
});

portalApiRouter.get("/bridge/auto-disconnect", requirePortalAuth, (req: Request, res: Response) => {
  const config = bridgeManager.getConfig();
  res.json({
    status: "ok",
    auto_disconnect_enabled: config.autoDisconnectOnFrontendTraffic,
    trigger_count: config.autoDisconnectTriggerCount,
    last_trigger: config.lastAutoDisconnectTrigger,
    direct_connection_enabled: config.enabled,
    bridge_active: !config.enabled,
  });
});

portalApiRouter.post("/bridge/auto-disconnect", requirePortalAuth, requireAdminRole, (req: Request, res: Response) => {
  const session = (req as any).portalSession;
  const { enabled } = req.body || {};

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "Field 'enabled' (boolean) is required" });
    return;
  }

  const updated = bridgeManager.setAutoDisconnectOnFrontendTraffic(
    enabled,
    `${session.name} (${session.email})`
  );

  res.json({
    status: "ok",
    message: `Auto-disconnect on frontend calls is now ${enabled ? "ARMED/ENABLED" : "DISARMED/DISABLED"}`,
    auto_disconnect_enabled: updated.autoDisconnectOnFrontendTraffic,
    trigger_count: updated.autoDisconnectTriggerCount,
    last_trigger: updated.lastAutoDisconnectTrigger,
    direct_connection_enabled: updated.enabled,
    bridge_active: !updated.enabled,
  });
});

portalApiRouter.post("/bridge/simulate-call", requirePortalAuth, (req: Request, res: Response) => {
  const session = (req as any).portalSession;
  const { origin = "https://rentmaikar.com", path = "/api/vehicles", method = "GET" } = req.body || {};

  const triggerResult = bridgeManager.triggerAutoDisconnectOnFrontendCall({
    origin,
    referer: `${origin}/`,
    path,
    method,
    ip: (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1",
    userAgent: `Simulated Frontend Call triggered by ${session.name}`,
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

// -------------------------------------------------------------
// Platform Health Monitoring & Reporting
// -------------------------------------------------------------

portalApiRouter.get("/health", requirePortalAuth, async (req: Request, res: Response) => {
  const forceFresh = req.query.fresh === "true";
  const report = forceFresh
    ? await platformHealthService.runHealthCheck()
    : await platformHealthService.getLatestReport();

  res.json({
    status: "ok",
    report,
  });
});

portalApiRouter.get("/health/history", requirePortalAuth, (req: Request, res: Response) => {
  const history = platformHealthService.getHistory();
  res.json({
    status: "ok",
    history,
  });
});

portalApiRouter.get("/health/export", requirePortalAuth, async (req: Request, res: Response) => {
  const report = await platformHealthService.getLatestReport();
  const format = (req.query.format as string) || "json";

  if (format === "markdown" || format === "txt") {
    let md = `# RentMaikar Platform Health Report\n`;
    md += `**Report ID:** ${report.id}\n`;
    md += `**Generated At:** ${report.timestamp}\n`;
    md += `**Overall Score:** ${report.overallScore}/100 (${report.overallStatus.toUpperCase()})\n\n`;
    md += `## Frontend-Backend Direct Connection Bridge\n`;
    md += `- **Switch State:** ${report.directConnectionState.enabled ? "ENABLED (Listening & Responding)" : "DISABLED (Blocked)"}\n`;
    md += `- **Frontend Origin:** ${report.directConnectionState.frontendOrigin}\n`;
    md += `- **Backend URL:** ${report.directConnectionState.backendUrl}\n`;
    md += `- **Allowed Origins:** ${report.directConnectionState.allowedOrigins.join(", ")}\n\n`;
    md += `## Server Metrics\n`;
    md += `- **Uptime:** ${report.serverMetrics.uptimeHuman}\n`;
    md += `- **Node.js:** ${report.serverMetrics.nodeVersion}\n`;
    md += `- **Platform:** ${report.serverMetrics.platform} (${report.serverMetrics.arch})\n`;
    md += `- **Memory (RSS / Heap):** ${report.serverMetrics.memory.rssMb}MB / ${report.serverMetrics.memory.heapUsedMb}MB\n\n`;
    md += `## Subsystems Breakdown\n`;
    for (const sub of report.subsystems) {
      md += `### ${sub.name}\n`;
      md += `- Status: **${sub.status.toUpperCase()}**\n`;
      if (sub.latencyMs !== undefined) md += `- Latency: ${sub.latencyMs}ms\n`;
      if (sub.error) md += `- Issue: ${sub.error}\n`;
      md += `- Details: \`${JSON.stringify(sub.details)}\`\n\n`;
    }

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="rentmaikar-health-${Date.now()}.md"`);
    res.send(md);
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="rentmaikar-health-${Date.now()}.json"`);
  res.send(JSON.stringify(report, null, 2));
});

// -------------------------------------------------------------
// User & Invitation Management (Admin Only)
// -------------------------------------------------------------

portalApiRouter.get("/users", requirePortalAuth, requireAdminRole, (req: Request, res: Response) => {
  const users = portalAuthService.listUsers();
  const invitations = portalAuthService.listInvitations();

  res.json({
    status: "ok",
    users,
    invitations,
  });
});

portalApiRouter.post("/users/invite", requirePortalAuth, requireAdminRole, (req: Request, res: Response) => {
  const session = (req as any).portalSession;
  const { email, role, expiresInHours, note } = req.body || {};

  const result = portalAuthService.createInvitation({
    email,
    role: (role as PortalRole) || "invited_user",
    invitedBy: `${session.name} (${session.email})`,
    expiresInHours: Number(expiresInHours) || 168,
    note,
  });

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const backendUrl = bridgeManager.getConfig().backendUrl;
  const inviteLink = `${backendUrl}/portal?invite=${result.invitation?.token}`;

  res.json({
    status: "ok",
    invitation: result.invitation,
    inviteLink,
    message: `Invitation generated for ${email}. Share the link or token with the user.`,
  });
});

portalApiRouter.delete("/users/invite/:token", requirePortalAuth, requireAdminRole, (req: Request, res: Response) => {
  const token = req.params.token;
  const revoked = portalAuthService.revokeInvitation(token);

  if (!revoked) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  res.json({
    status: "ok",
    message: "Invitation revoked",
  });
});

portalApiRouter.patch("/users/:id/status", requirePortalAuth, requireAdminRole, (req: Request, res: Response) => {
  const userId = req.params.id;
  const { isActive } = req.body || {};

  try {
    const updated = portalAuthService.setUserActive(userId, Boolean(isActive));
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      status: "ok",
      message: `User status set to ${isActive ? "active" : "inactive"}`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
