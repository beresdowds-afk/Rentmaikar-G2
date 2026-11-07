/**
 * Durable server-side OAuth state management.
 * State tokens are random, hashed at rest, short-lived, provider/user-bound,
 * and consumed by a conditional database update so only one callback wins.
 */

import crypto from 'crypto';
import { getSupabase } from './supabaseClient';

const STATE_TTL_MS = 10 * 60 * 1000;
type OAuthProvider = 'google' | 'linkedin';

export interface OAuthStateRecord {
  state: string;
  provider: OAuthProvider;
  adminId: string;
  tenantId: string | null;
  connectionId: string | null;
  expiresAt: number;
  isUsed: boolean;
  createdAt: number;
}

export interface ValidateStateResult {
  valid: boolean;
  error?: 'missing_state' | 'invalid_state' | 'expired_state' | 'already_used' | 'wrong_provider';
  record?: OAuthStateRecord;
}

function stateDigest(state: string): string {
  return crypto.createHash('sha256').update(state, 'utf8').digest('hex');
}

function isOAuthProvider(provider: string): provider is OAuthProvider {
  return provider === 'google' || provider === 'linkedin';
}

export async function createOAuthState(
  provider: string,
  adminId: string,
  tenantId?: string | null,
  connectionId?: string | null
): Promise<string> {
  const normalizedProvider = String(provider || '').toLowerCase();
  if (!isOAuthProvider(normalizedProvider)) throw new Error('Unsupported OAuth provider');
  if (!adminId || typeof adminId !== 'string' || adminId.length > 200) {
    throw new Error('Authenticated admin identity is required for OAuth state');
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const supabase = getSupabase();
  const { error } = await supabase.from('marketing_oauth_states').insert({
    state_hash: stateDigest(state),
    provider: normalizedProvider,
    initiating_user_id: adminId,
    tenant_id: tenantId || null,
    connection_id: connectionId || null,
    expires_at: new Date(now + STATE_TTL_MS).toISOString(),
  });
  if (error) {
    // Never use process memory as a fallback for security state.
    throw new Error('Unable to persist OAuth state');
  }
  return state;
}

/** Atomically validates and consumes state; mismatched providers never consume it. */
export async function validateAndConsumeOAuthState(
  stateToken: string | undefined | null,
  expectedProvider: string,
  expectedAdminId?: string,
  expectedTenantId?: string | null,
  expectedConnectionId?: string | null
): Promise<ValidateStateResult> {
  if (!stateToken || typeof stateToken !== 'string' || stateToken.length > 256) {
    return { valid: false, error: 'missing_state' };
  }
  const provider = String(expectedProvider || '').toLowerCase();
  if (!isOAuthProvider(provider)) return { valid: false, error: 'wrong_provider' };

  const supabase = getSupabase();
  const digest = stateDigest(stateToken);
  const { data: existing, error: lookupError } = await supabase
    .from('marketing_oauth_states')
    .select('provider, initiating_user_id, tenant_id, connection_id, expires_at, consumed_at, created_at')
    .eq('state_hash', digest)
    .maybeSingle();
  if (lookupError) throw new Error('Unable to validate OAuth state');
  if (!existing) return { valid: false, error: 'invalid_state' };
  if (existing.provider !== provider) return { valid: false, error: 'wrong_provider' };
  if (expectedAdminId && existing.initiating_user_id !== expectedAdminId) {
    return { valid: false, error: 'invalid_state' };
  }
  if (expectedTenantId !== undefined && (existing.tenant_id || null) !== (expectedTenantId || null)) {
    return { valid: false, error: 'invalid_state' };
  }
  if (expectedConnectionId !== undefined && (existing.connection_id || null) !== (expectedConnectionId || null)) {
    return { valid: false, error: 'invalid_state' };
  }
  if (existing.consumed_at) return { valid: false, error: 'already_used' };

  const now = Date.now();
  const expiresAt = new Date(existing.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { valid: false, error: 'expired_state' };
  }

  const { data: consumed, error: consumeError } = await supabase
    .from('marketing_oauth_states')
    .update({ consumed_at: new Date(now).toISOString() })
    .eq('state_hash', digest)
    .eq('provider', provider)
    .is('consumed_at', null)
    .gt('expires_at', new Date(now).toISOString())
    .select('state_hash')
    .maybeSingle();
  if (consumeError) throw new Error('Unable to consume OAuth state');
  if (!consumed) {
    const { data: current, error: currentError } = await supabase
      .from('marketing_oauth_states')
      .select('consumed_at, expires_at')
      .eq('state_hash', digest)
      .maybeSingle();
    if (currentError) throw new Error('Unable to validate OAuth state');
    if (current?.consumed_at) return { valid: false, error: 'already_used' };
    if (!current || new Date(current.expires_at).getTime() <= Date.now()) {
      return { valid: false, error: 'expired_state' };
    }
    return { valid: false, error: 'invalid_state' };
  }

  return {
    valid: true,
    record: {
      state: stateToken,
      provider,
      adminId: existing.initiating_user_id,
      tenantId: existing.tenant_id,
      connectionId: existing.connection_id,
      expiresAt,
      isUsed: true,
      createdAt: new Date(existing.created_at).getTime(),
    },
  };
}

/** Persists OAuth tokens server-side in the existing credentials table. */
export async function saveProviderCredentials(params: {
  platform: 'google' | 'linkedin' | 'meta' | 'tiktok';
  accountId: string;
  accountName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  scope?: string;
}): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const expiresAt = params.expiresInSeconds
      ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
      : null;
    const { error } = await supabase.from('marketing_provider_credentials').upsert(
      {
        platform: params.platform,
        account_id: params.accountId,
        account_name: params.accountName || `${params.platform.toUpperCase()} Account`,
        access_token: params.accessToken || null,
        refresh_token: params.refreshToken || null,
        token_expires_at: expiresAt,
        scope: params.scope || null,
        status: 'connected',
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'platform,account_id' }
    );
    if (error) {
      console.warn('[OAuthState] Provider credential persistence failed');
      return false;
    }
    return true;
  } catch {
    console.warn('[OAuthState] Provider credential persistence failed');
    return false;
  }
}
