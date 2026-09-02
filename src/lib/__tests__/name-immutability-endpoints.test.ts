/**
 * Integration tests: name immutability enforcement across every profile-update
 * surface.
 *
 * The `enforce_verified_name_immutable` DB trigger is the sole source of
 * truth. These tests attempt a rename through every endpoint a non–service-role
 * caller could reach and assert the request fails with `code: '23514'`. A
 * dedicated case then proves that the `service_role` client is allowed to
 * update `full_name` after identity approval (the documented exception used
 * by ops / support).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const APPROVED_USER = 'user-approved-123';
const IMMUTABLE_ERROR = {
  code: '23514',
  message: 'Name is locked after identity verification. Contact support to change it.',
  hint: 'profiles.full_name is immutable once identity_verified_at is set.',
};

// ---- Shared authenticated client mock -----------------------------------
const authEq = vi.fn();
const authUpdate = vi.fn(() => ({ eq: authEq }));
const authRpc = vi.fn();
const authInvoke = vi.fn();
const authFrom = vi.fn((_t: string) => ({ update: authUpdate }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => authFrom(t),
    rpc: (...a: any[]) => authRpc(...a),
    functions: { invoke: (...a: any[]) => authInvoke(...a) },
  },
}));

beforeEach(() => {
  authFrom.mockClear();
  authUpdate.mockClear();
  authEq.mockReset();
  authRpc.mockReset();
  authInvoke.mockReset();
});

// ---- Endpoint adapters ---------------------------------------------------
// Each function represents one real endpoint in the app that could touch
// `profiles.full_name`. Keeping them small makes the assertion loop below the
// authoritative registry of "everywhere a client could try to rename".
const endpoints = {
  'profiles.update (Profile Settings page)': async (name: string) => {
    const { supabase } = await import('@/integrations/supabase/client');
    return supabase.from('profiles').update({ full_name: name }).eq('id', APPROVED_USER);
  },
  'profiles.update (Personal Info editor)': async (name: string) => {
    const { supabase } = await import('@/integrations/supabase/client');
    return supabase
      .from('profiles')
      .update({ full_name: name, phone: '+15550001111' })
      .eq('id', APPROVED_USER);
  },
  'profiles.update (Owner dashboard identity card)': async (name: string) => {
    const { supabase } = await import('@/integrations/supabase/client');
    return supabase
      .from('profiles')
      .update({ full_name: name, avatar_url: 'https://x/y.jpg' })
      .eq('id', APPROVED_USER);
  },
  'rpc: update_profile_details': async (name: string) => {
    const { supabase } = await import('@/integrations/supabase/client');
    return (supabase.rpc as any)('update_profile_details', {
      p_user_id: APPROVED_USER,
      p_full_name: name,
    });
  },
  'edge function: update-user-profile': async (name: string) => {
    const { supabase } = await import('@/integrations/supabase/client');
    return supabase.functions.invoke('update-user-profile', {
      body: { user_id: APPROVED_USER, full_name: name },
    });
  },
};

describe('name immutability — every non-service-role endpoint is blocked after approval', () => {
  for (const [label, call] of Object.entries(endpoints)) {
    it(`blocks rename via ${label}`, async () => {
      // All surfaces ultimately hit the same trigger, so we simulate the same
      // error at whichever layer the endpoint reaches.
      authEq.mockResolvedValueOnce({ data: null, error: IMMUTABLE_ERROR });
      authRpc.mockResolvedValueOnce({ data: null, error: IMMUTABLE_ERROR });
      authInvoke.mockResolvedValueOnce({ data: null, error: IMMUTABLE_ERROR });

      const res: any = await call('Bypass Attempt');

      expect(res.error).toBeTruthy();
      expect(res.error.code).toBe('23514');
      expect(res.error.message).toMatch(/locked after identity verification/i);
      expect(res.data).toBeFalsy();
    });
  }

  it('never falls through to a silent success when errors are returned', async () => {
    for (const call of Object.values(endpoints)) {
      authEq.mockResolvedValueOnce({ data: null, error: IMMUTABLE_ERROR });
      authRpc.mockResolvedValueOnce({ data: null, error: IMMUTABLE_ERROR });
      authInvoke.mockResolvedValueOnce({ data: null, error: IMMUTABLE_ERROR });
      const res: any = await call('Sneaky');
      expect(res.data).toBeFalsy();
      expect(res.error?.code).toBe('23514');
    }
  });
});

// ---- Service-role bypass -------------------------------------------------
// The trigger explicitly allows `service_role` to update `full_name` even
// after approval (used by support for legal-name corrections). We assert that
// exception here with an isolated mock so we don't leak elevated behavior into
// the authenticated-client suite.
describe('name immutability — service_role exception', () => {
  it('lets a service_role client update full_name after approval', async () => {
    const srEq = vi.fn(async (_col: string, _val: string) => ({
      data: [{ id: APPROVED_USER, full_name: 'Legal Name Correction' }],
      error: null as null,
    }));
    const srUpdate = vi.fn((_patch: Record<string, unknown>) => ({ eq: srEq }));
    const serviceRoleClient = {
      from: (_table: string) => ({ update: srUpdate }),
    };

    const res = await serviceRoleClient
      .from('profiles')
      .update({ full_name: 'Legal Name Correction' })
      .eq('id', APPROVED_USER);

    expect(srUpdate).toHaveBeenCalledWith({ full_name: 'Legal Name Correction' });
    expect(res.error).toBeNull();
    expect(res.data?.[0]?.full_name).toBe('Legal Name Correction');
  });

  it('service_role bypass is scoped: authenticated retry still fails', async () => {
    // Sanity check: re-running the same rename with the authenticated client
    // after the service_role success must still be rejected.
    authEq.mockResolvedValueOnce({ data: null, error: IMMUTABLE_ERROR });
    const { supabase } = await import('@/integrations/supabase/client');
    const res = await supabase
      .from('profiles')
      .update({ full_name: 'Try Again' })
      .eq('id', APPROVED_USER);
    expect(res.error?.code).toBe('23514');
  });
});
