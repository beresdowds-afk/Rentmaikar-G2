/**
 * Hardened CORS Middleware for RentMaikar Marketing APIs
 * Restricts cross-origin requests to verified RentMaikar production, staging, and development domains.
 * Replaces unrestricted wildcard (*) configurations on privileged routes.
 */

import { Request, Response, NextFunction } from 'express';

const PRODUCTION_ORIGINS = [
  'https://rentmaikar.com',
  'https://www.rentmaikar.com',
  'https://staging.rentmaikar.com',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return false;

  const normalized = origin.trim().toLowerCase();

  // 1. Check production domains
  if (PRODUCTION_ORIGINS.some((allowed) => normalized === allowed || /^https:\/\/([a-z0-9-]+\.)+rentmaikar\.com$/.test(normalized))) {
    return true;
  }

  // 2. Check development origins
  if (DEVELOPMENT_ORIGINS.includes(normalized)) {
    return true;
  }

  // 3. Dynamic environment origins
  const publicAppUrl = process.env.PUBLIC_APP_URL?.toLowerCase();
  if (publicAppUrl && normalized === publicAppUrl) {
    return true;
  }

  const publicBackendUrl = process.env.PUBLIC_BACKEND_URL?.toLowerCase();
  if (publicBackendUrl && normalized === publicBackendUrl) {
    return true;
  }

  // 4. Exact Cloud Run gateway host (no *.run.app wildcard)
  try {
    const host = new URL(normalized).hostname;
    const extra = ['rentmaikar-g2-672260445879.europe-west1.run.app',
      ...(process.env.ALLOWED_ORIGIN_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)];
    if (extra.includes(host)) return true;
  } catch {
    // invalid origin
  }

  return false;
}

export function marketingCorsMiddleware(req: Request, res: Response, next: NextFunction) {
  const rawOrigin = req.headers.origin;
  const origin = typeof rawOrigin === "string" ? rawOrigin.trim().replace(/\/+$/, "") : undefined;

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, apikey, x-client-info, Prefer, Idempotency-Key, X-RentMaikar-Client, X-RentMaikar-Fallback, X-Test-Role, X-Test-User-Id'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Content-Type, X-Entity-Ref-ID, Message-ID, Date'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).json({ error: 'CORS origin denied' });
    }
    return res.status(204).end();
  }

  next();
}
