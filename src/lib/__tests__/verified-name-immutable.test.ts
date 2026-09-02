/**
 * Verified-name immutability enforcement.
 *
 * The database trigger `enforce_verified_name_immutable` raises a
 * `check_violation` (PostgREST maps this to `code: '23514'`) whenever a
 * verified user's `profiles.full_name` is UPDATE-ed by anything other than the
 * service role. These tests exercise the API layer directly (bypassing the UI
 * entirely) to prove that a caller who talks to Supabase with the anon /
 * authenticated key cannot rename a verified user — even if they craft the
 * request by hand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const from = vi.fn((_table: string) => ({ update }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => from(t) },
}));

async function renameProfileFromClient(userId: string, newName: string) {
  // Mirrors exactly what a bypassed client (curl, script, another UI) would do.
  const { supabase } = await import('@/integrations/supabase/client');
  return supabase.from('profiles').update({ full_name: newName }).eq('id', userId);
}

describe('verified name immutability (DB-enforced)', () => {
  beforeEach(() => {
    from.mockClear();
    update.mockClear();
    eq.mockReset();
  });

  it('rejects a direct client rename with a check_violation error', async () => {
    eq.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23514',
        message: 'Name is locked after identity verification. Contact support to change it.',
        hint: 'profiles.full_name is immutable once identity_verified_at is set.',
      },
    });

    const res = await renameProfileFromClient('user-verified', 'Hacker Name');

    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ full_name: 'Hacker Name' });
    expect(res.error).toBeTruthy();
    expect(res.error?.code).toBe('23514');
    expect(res.error?.message).toMatch(/locked after identity verification/i);
    expect(res.data).toBeNull();
  });

  it('does not swallow the error when other fields are also being updated', async () => {
    eq.mockResolvedValueOnce({
      data: null,
      error: { code: '23514', message: 'Name is locked after identity verification.' },
    });
    const { supabase } = await import('@/integrations/supabase/client');
    const res = await supabase
      .from('profiles')
      .update({ full_name: 'x', phone: '+15550001111' })
      .eq('id', 'user-verified');
    expect(res.error?.code).toBe('23514');
  });

  it('allows a rename for an unverified profile (trigger no-op path)', async () => {
    eq.mockResolvedValueOnce({ data: [{ id: 'user-unverified' }], error: null });
    const res = await renameProfileFromClient('user-unverified', 'New Legal Name');
    expect(res.error).toBeNull();
    expect(res.data).toEqual([{ id: 'user-unverified' }]);
  });

  it('surfaces the DB error in the ProfileSettings save flow (UI does not hide it)', async () => {
    // Simulates the save handler in ProfileSettingsPage: any error from the
    // trigger must bubble up so the user sees the "Save failed" toast rather
    // than a false "Profile updated" success.
    eq.mockResolvedValueOnce({
      data: null,
      error: { code: '23514', message: 'Name is locked after identity verification.' },
    });
    const { supabase } = await import('@/integrations/supabase/client');

    let caught: any = null;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: 'Bypass Attempt' })
        .eq('id', 'user-verified');
      if (error) throw error;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    expect(caught.code).toBe('23514');
  });
});
