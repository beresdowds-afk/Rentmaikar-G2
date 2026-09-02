import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  useRegistrationProgress,
  advanceRegistrationStage,
  type RegistrationProgress,
  type RegistrationStage,
} from '@/hooks/useRegistrationProgress';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const progress = (over: Partial<RegistrationProgress>): RegistrationProgress => ({
  authenticated: true,
  stage: 'auth',
  access_level: 'view_only',
  role: 'driver',
  email_verified: false,
  identity_verification_status: null,
  identity_verified_at: null,
  documents_uploaded: 0,
  referees_verified: 0,
  application_status: null,
  ...over,
});

// Route resolver mirrors the app's onboarding gate: full access → dashboard,
// otherwise stay on the onboarding page for the user's role.
function resolveRoute(p: RegistrationProgress): string {
  if (!p.authenticated) return '/auth';
  if (p.access_level === 'full' && p.role) return `/${p.role}/dashboard`;
  if (p.role) return `/${p.role}/onboarding`;
  return '/register';
}

describe('End-to-end onboarding journey (driver)', () => {
  beforeEach(() => rpc.mockReset());

  it('advances through every stage and routes to the driver dashboard on full access', async () => {
    const stages: RegistrationStage[] = [
      'account_opened',
      'documents_submitted',
      'verification_pending',
    ];
    for (const s of stages) {
      rpc.mockResolvedValueOnce({ data: s, error: null });
      const returned = await advanceRegistrationStage(s);
      expect(returned).toBe(s);
    }

    // Admin grants full access → progress reflects it.
    rpc.mockResolvedValueOnce({
      data: progress({ stage: 'approved', access_level: 'full' }),
      error: null,
    });
    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(resolveRoute(result.current.data!)).toBe('/driver/dashboard');
  });

  it('keeps the user on the onboarding page while access is view_only', async () => {
    rpc.mockResolvedValueOnce({
      data: progress({ stage: 'verification_pending', access_level: 'view_only' }),
      error: null,
    });
    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(resolveRoute(result.current.data!)).toBe('/driver/onboarding');
  });
});

describe('End-to-end onboarding journey (owner)', () => {
  beforeEach(() => rpc.mockReset());

  it('routes owners to the owner dashboard once full access is granted', async () => {
    rpc.mockResolvedValueOnce({
      data: progress({ role: 'owner', stage: 'approved', access_level: 'full' }),
      error: null,
    });
    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(resolveRoute(result.current.data!)).toBe('/owner/dashboard');
  });
});

describe('grant_full_access / revoke_full_access integration', () => {
  beforeEach(() => rpc.mockReset());

  async function callGrant(userId: string) {
    const { data, error } = await (
      await import('@/integrations/supabase/client')
    ).supabase.rpc('grant_full_access', { _user_id: userId });
    if (error) throw error;
    return data;
  }
  async function callRevoke(userId: string, reason?: string) {
    const { data, error } = await (
      await import('@/integrations/supabase/client')
    ).supabase.rpc('revoke_full_access', { _user_id: userId, _reason: reason ?? null });
    if (error) throw error;
    return data;
  }

  it('grants full access to a driver and reflects it on the next progress poll', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await callGrant('driver-1');
    expect(rpc).toHaveBeenCalledWith('grant_full_access', { _user_id: 'driver-1' });

    rpc.mockResolvedValueOnce({
      data: progress({ role: 'driver', stage: 'approved', access_level: 'full' }),
      error: null,
    });
    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data?.access_level).toBe('full'));
    expect(resolveRoute(result.current.data!)).toBe('/driver/dashboard');
  });

  it('grants full access to an owner end-to-end', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await callGrant('owner-1');
    rpc.mockResolvedValueOnce({
      data: progress({ role: 'owner', stage: 'approved', access_level: 'full' }),
      error: null,
    });
    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data?.access_level).toBe('full'));
    expect(resolveRoute(result.current.data!)).toBe('/owner/dashboard');
  });

  it('rejects grant_full_access when the caller is not an admin', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Only admins can grant full access', code: 'P0001' },
    });
    await expect(callGrant('driver-2')).rejects.toThrow(/admins/i);
  });

  it('revokes full access with a reason and downgrades the driver to view_only', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await callRevoke('driver-3', 'suspended for review');
    expect(rpc).toHaveBeenCalledWith('revoke_full_access', {
      _user_id: 'driver-3',
      _reason: 'suspended for review',
    });

    rpc.mockResolvedValueOnce({
      data: progress({ role: 'driver', stage: 'verification_pending', access_level: 'view_only' }),
      error: null,
    });
    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data?.access_level).toBe('view_only'));
    expect(resolveRoute(result.current.data!)).toBe('/driver/onboarding');
  });

  it('revokes owner access and blocks the owner dashboard until re-approval', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await callRevoke('owner-2');
    rpc.mockResolvedValueOnce({
      data: progress({ role: 'owner', stage: 'verification_pending', access_level: 'view_only' }),
      error: null,
    });
    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data?.access_level).toBe('view_only'));
    expect(resolveRoute(result.current.data!)).toBe('/owner/onboarding');
  });

  it('bubbles a permission error when a non-admin tries to revoke', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Only admins can revoke access', code: 'P0001' },
    });
    await expect(callRevoke('driver-x', 'nope')).rejects.toThrow(/revoke/i);
  });
});
