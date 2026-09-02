import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

// Mock auth context
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user-1' }, isLoading: false }),
}));

// Mock supabase client
const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import { useRegistrationProgress, advanceRegistrationStage } from '@/hooks/useRegistrationProgress';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useRegistrationProgress', () => {
  beforeEach(() => rpc.mockReset());

  it('returns default shape when the RPC responds with a partial payload', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        authenticated: true,
        stage: 'documents_submitted',
        access_level: 'view_only',
        role: 'driver',
        email_verified: true,
        documents_uploaded: 2,
        referees_verified: 0,
      },
      error: null,
    });

    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());

    expect(rpc).toHaveBeenCalledWith('get_my_registration_progress');
    expect(result.current.data).toMatchObject({
      authenticated: true,
      stage: 'documents_submitted',
      role: 'driver',
      documents_uploaded: 2,
      // Defaults filled in for missing keys
      identity_verification_status: null,
      application_status: null,
    });
  });

  it('bubbles Postgres errors so the UI can show actionable messages', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'column "driver_user_id" does not exist', code: '42703' },
    });

    const { result } = renderHook(() => useRegistrationProgress(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('driver_user_id');
  });
});

describe('advanceRegistrationStage', () => {
  beforeEach(() => rpc.mockReset());

  it('sends the target stage to the correct RPC', async () => {
    rpc.mockResolvedValueOnce({ data: 'documents_submitted', error: null });
    const stage = await advanceRegistrationStage('documents_submitted');
    expect(rpc).toHaveBeenCalledWith('advance_registration_stage', { _target: 'documents_submitted' });
    expect(stage).toBe('documents_submitted');
  });

  it('throws when the server rejects an invalid transition', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Only admins can grant approval', code: 'P0001' },
    });
    await expect(advanceRegistrationStage('approved')).rejects.toThrow(/admins/i);
  });
});
