/**
 * Authentication and Authorization Middleware for RentMaikar Marketing APIs
 * Enforces role-based access control (RBAC) across administrative endpoints.
 * Distinguishes:
 * - admin: Full control over campaigns, cycles, credentials, webhooks, conversions, reporting
 * - admin_assistant: Operational campaign management, duplication, leads, reporting
 * - support: Read-only access to overview, reporting, leads, and provider status
 * - driver / owner / public: Strictly barred from administrative campaign operations
 */

import { Request, Response, NextFunction } from 'express';
import { getSupabase } from './supabaseClient';

export type AllowedMarketingRole = 'admin' | 'admin_assistant' | 'support' | 'owner' | 'driver' | 'public';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: AllowedMarketingRole;
}

declare global {
  namespace Express {
    interface Request {
      marketingUser?: AuthenticatedUser;
    }
  }
}

/**
 * Extracts and validates bearer token or test headers.
 */
export async function authenticateMarketingUser(req: Request): Promise<AuthenticatedUser | null> {
  // Support explicit test authorization headers when in test environment
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    const testRole = req.headers['x-test-role'] as string | undefined;
    const testUserId = req.headers['x-test-user-id'] as string | undefined;
    if (testRole) {
      return {
        id: testUserId || 'usr_test_123',
        email: 'test@rentmaikar.com',
        role: testRole as AllowedMarketingRole,
      };
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  try {
    const supabase = getSupabase(token);
    if (!supabase) return null;

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return null;
    }

    // Determine user role from user_roles
    let effectiveRole: AllowedMarketingRole = 'driver';

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!roleError && roleData?.role) {
      effectiveRole = roleData.role as AllowedMarketingRole;
    } else {
      // Check admin_assistant_permissions
      const { data: assistantData } = await supabase
        .from('admin_assistant_permissions')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (assistantData) {
        effectiveRole = 'admin_assistant';
      }
    }

    return {
      id: user.id,
      email: user.email,
      role: effectiveRole,
    };
  } catch (err: any) {
    console.warn('[MarketingAuth] Error resolving user token:', err.message);
    return null;
  }
}

/**
 * Middleware requiring specific roles.
 */
export function requireMarketingRoles(allowedRoles: AllowedMarketingRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await authenticateMarketingUser(req);

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized: Authentication required to access Marketing Engine API',
        code: 'AUTH_REQUIRED',
      });
    }

    req.marketingUser = user;

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        ok: false,
        error: `Forbidden: Insufficient privileges. Required: [${allowedRoles.join(', ')}], Current: ${user.role}`,
        code: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
}

/** Pre-configured role guards */
export const requireAdminOnly = requireMarketingRoles(['admin']);
export const requireCampaignManagers = requireMarketingRoles(['admin', 'admin_assistant']);
export const requireMarketingStaff = requireMarketingRoles(['admin', 'admin_assistant', 'support']);
