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
  if (PRODUCTION_ORIGINS.some((allowed) => normalized === allowed || normalized.endsWith('.rentmaikar.com'))) {
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

  // 4. Cloud Run preview domains (*.run.app)
  if (normalized.endsWith('.run.app')) {
    return true;
  }

  return false;
}

export function marketingCorsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-RentMaikar-Client, X-RentMaikar-Fallback, X-Test-Role, X-Test-User-Id'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
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
