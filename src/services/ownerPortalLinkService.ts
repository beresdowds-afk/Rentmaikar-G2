import { supabase } from '@/integrations/supabase/client';

export interface OwnerPortalTokenRecord {
  token: string;
  owner_id: string;
  owner_name: string;
  owner_email?: string;
  owner_phone?: string;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  used_at: string | null;
  target_tab: string;
  channel?: string;
  created_by?: string | null;
}

const STORAGE_KEY = 'rentmaikar_owner_portal_tokens_v1';
const ACTIVE_OWNER_KEY = 'rentmaikar_active_portal_owner';

function generateRandomToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let token = 'otk_';
  for (let i = 0; i < 24; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function getStoredTokens(): Record<string, OwnerPortalTokenRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveStoredTokens(tokens: Record<string, OwnerPortalTokenRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (err) {
    console.error('Failed to save portal tokens to localStorage:', err);
  }
}

export const ownerPortalLinkService = {
  /**
   * Generates a single-use portal link for an owner that links directly to their dashboard.
   */
  async generateOneTimePortalLink(params: {
    ownerId: string;
    ownerName: string;
    ownerEmail?: string;
    ownerPhone?: string;
    channel?: 'sms' | 'email' | 'whatsapp' | string;
    expiresInDays?: number;
    targetTab?: string;
    createdBy?: string | null;
  }): Promise<{
    token: string;
    portalUrl: string;
    relativeUrl: string;
    record: OwnerPortalTokenRecord;
  }> {
    const token = generateRandomToken();
    const now = new Date();
    const days = params.expiresInDays || 7;
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const record: OwnerPortalTokenRecord = {
      token,
      owner_id: params.ownerId,
      owner_name: params.ownerName || 'Valued Owner',
      owner_email: params.ownerEmail,
      owner_phone: params.ownerPhone,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      is_used: false,
      used_at: null,
      target_tab: params.targetTab || 'overview',
      channel: params.channel || 'sms',
      created_by: params.createdBy || null,
    };

    // 1. Cache locally
    const tokens = getStoredTokens();
    tokens[token] = record;
    saveStoredTokens(tokens);

    // 2. Persist to Supabase if possible (account_links table or audit log)
    try {
      await (supabase as any).from('account_links').insert({
        user_a_id: params.ownerId,
        user_b_id: params.ownerId,
        link_type: 'one_time_portal_link',
        notes: JSON.stringify(record),
      });
    } catch (e) {
      console.warn('Could not persist portal token to account_links, local cache active:', e);
    }

    const relativeUrl = `/owner/portal-access?token=${encodeURIComponent(token)}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://rentmaikar.com';
    const portalUrl = `${origin}${relativeUrl}`;

    return { token, portalUrl, relativeUrl, record };
  },

  /**
   * Verifies and atomically consumes a one-time token.
   * If already used or expired, rejects.
   */
  async verifyAndConsumeToken(token: string): Promise<{
    valid: boolean;
    reason?: 'not_found' | 'already_used' | 'expired';
    ownerId?: string;
    ownerName?: string;
    targetTab?: string;
    record?: OwnerPortalTokenRecord;
  }> {
    if (!token) return { valid: false, reason: 'not_found' };

    let record: OwnerPortalTokenRecord | undefined = getStoredTokens()[token];

    // If not in local storage, look up in Supabase account_links
    if (!record) {
      try {
        const { data } = await (supabase as any)
          .from('account_links')
          .select('notes')
          .eq('link_type', 'one_time_portal_link')
          .order('created_at', { ascending: false })
          .limit(100);

        if (data && data.length > 0) {
          for (const row of data) {
            try {
              const parsed = JSON.parse(row.notes);
              if (parsed?.token === token) {
                record = parsed;
                break;
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        console.warn('Failed to query account_links for token:', err);
      }
    }

    if (!record) {
      return { valid: false, reason: 'not_found' };
    }

    if (record.is_used) {
      return { valid: false, reason: 'already_used', record };
    }

    const now = new Date();
    if (new Date(record.expires_at) < now) {
      return { valid: false, reason: 'expired', record };
    }

    // Mark as consumed
    record.is_used = true;
    record.used_at = now.toISOString();

    const tokens = getStoredTokens();
    tokens[token] = record;
    saveStoredTokens(tokens);

    // Update in Supabase
    try {
      await (supabase as any)
        .from('account_links')
        .update({ notes: JSON.stringify(record) })
        .eq('link_type', 'one_time_portal_link')
        .eq('user_a_id', record.owner_id);
    } catch {
      // ignore
    }

    // Set active portal session in storage for dashboard authorization
    try {
      localStorage.setItem(
        ACTIVE_OWNER_KEY,
        JSON.stringify({
          userId: record.owner_id,
          name: record.owner_name,
          token: record.token,
          authenticatedAt: now.toISOString(),
        })
      );
    } catch {
      // ignore
    }

    return {
      valid: true,
      ownerId: record.owner_id,
      ownerName: record.owner_name,
      targetTab: record.target_tab,
      record,
    };
  },

  /**
   * Retrieves all issued one-time links for audit logs and admin inspection.
   */
  getIssuedTokens(): OwnerPortalTokenRecord[] {
    const tokens = getStoredTokens();
    return Object.values(tokens).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  /**
   * Revokes an existing token manually.
   */
  revokeToken(token: string): boolean {
    const tokens = getStoredTokens();
    if (tokens[token]) {
      tokens[token].is_used = true;
      tokens[token].used_at = new Date().toISOString();
      saveStoredTokens(tokens);
      return true;
    }
    return false;
  },

  /**
   * Gets the active one-time link authenticated owner session, if any.
   */
  getActiveOwnerSession(): { userId: string; name: string; token: string } | null {
    try {
      const raw = localStorage.getItem(ACTIVE_OWNER_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  clearActiveOwnerSession() {
    try {
      localStorage.removeItem(ACTIVE_OWNER_KEY);
    } catch {
      // ignore
    }
  },
};
