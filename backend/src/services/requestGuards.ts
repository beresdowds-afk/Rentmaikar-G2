import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

type WindowEntry = { count: number; resetAt: number };

function auditGuardDenial(req: Request, outcome: string): void {
  const rawCorrelationId = req.headers["x-correlation-id"] || req.headers["x-request-id"];
  const correlationId =
    typeof rawCorrelationId === "string" && rawCorrelationId.length <= 200
      ? rawCorrelationId
      : crypto.randomUUID();
  console.warn(JSON.stringify({
    type: "function_access_audit",
    actor: "unauthenticated",
    function: `${req.baseUrl}${req.path}`,
    decision: "deny",
    correlationId,
    outcome,
  }));
}

export function rateLimit(
  limit: number,
  windowMs: number,
): (req: Request, res: Response, next: NextFunction) => void {
  const entries = new Map<string, WindowEntry>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      auditGuardDenial(req, "rate_limit");
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }
    if (entries.size > 10_000) {
      for (const [entryKey, value] of entries) {
        if (value.resetAt <= now) entries.delete(entryKey);
      }
    }
    next();
  };
}

export function limitJsonPayload(
  maxBytes: number,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const serialized = JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
      auditGuardDenial(req, "payload_too_large");
      res.status(413).json({ ok: false, error: "Request payload is too large" });
      return;
    }
    next();
  };
}
