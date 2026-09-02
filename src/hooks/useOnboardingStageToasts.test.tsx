import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

const progressMock = vi.fn();
vi.mock('@/hooks/useRegistrationProgress', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useRegistrationProgress')>(
    '@/hooks/useRegistrationProgress',
  );
  return { ...actual, useRegistrationProgress: () => progressMock() };
});

import { useOnboardingStageToasts } from './useOnboardingStageToasts';

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  progressMock.mockReset();
  localStorage.clear();
});

describe('useOnboardingStageToasts', () => {
  it('fires a congratulatory toast when the stage advances', () => {
    localStorage.setItem('rentmaikar_last_seen_stage', 'account_opened');
    progressMock.mockReturnValue({
      data: {
        authenticated: true,
        stage: 'documents_submitted',
        access_level: 'view_only',
        role: 'driver',
        email_verified: true,
        identity_verification_status: null,
        identity_verified_at: null,
        documents_uploaded: 3,
        referees_verified: 0,
        application_status: null,
      },
    });
    renderHook(() => useOnboardingStageToasts());
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess.mock.calls[0][0]).toMatch(/Documents received/);
  });

  it('fires a failure-advice toast when the application is rejected', () => {
    progressMock.mockReturnValue({
      data: {
        authenticated: true,
        stage: 'verification_pending',
        access_level: 'view_only',
        role: 'driver',
        email_verified: true,
        identity_verification_status: 'document blurry - illegible',
        identity_verified_at: null,
        documents_uploaded: 3,
        referees_verified: 0,
        application_status: 'rejected',
      },
    });
    renderHook(() => useOnboardingStageToasts());
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toMatch(/quality/i);
  });

  it('does not re-fire the toast on the same stage', () => {
    localStorage.setItem('rentmaikar_last_seen_stage', 'approved');
    progressMock.mockReturnValue({
      data: {
        authenticated: true,
        stage: 'approved',
        access_level: 'full',
        role: 'driver',
        email_verified: true,
        identity_verification_status: null,
        identity_verified_at: null,
        documents_uploaded: 3,
        referees_verified: 2,
        application_status: 'approved',
      },
    });
    renderHook(() => useOnboardingStageToasts());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
