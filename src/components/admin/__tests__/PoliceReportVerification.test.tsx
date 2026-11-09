import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, updateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/file-upload-api', () => ({ getUploadedFileUrl: vi.fn() }));

import { PoliceReportVerification } from '../PoliceReportVerification';

const report = {
  id: 'report-1',
  user_id: 'driver-1',
  document_type: 'police_report',
  document_category: 'identification',
  file_path: 'report.pdf',
  file_name: 'report.pdf',
  status: 'pending',
  rejection_reason: null,
  expiry_date: null,
  created_at: '2026-01-01T00:00:00Z',
  verified_at: null,
  verified_by: null,
};

describe('police report manual review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_documents') {
        return {
          select: () => ({
            eq: () => ({ order: vi.fn().mockResolvedValue({ data: [report], error: null }) }),
          }),
          update: updateMock,
        };
      }
      const query = {
        eq: () => query,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return { select: () => query };
    });
  });

  it('requires an explicit manual POSSAP confirmation before approving', async () => {
    render(<PoliceReportVerification />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const verify = screen.getByRole('button', { name: 'Verify' });
    expect(verify).toBeDisabled();
    expect(screen.getByRole('link', { name: /official POSSAP portal/i })).toHaveAttribute(
      'href',
      'https://possap.gov.ng/',
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /I checked the POSSAP/i }));
    expect(verify).toBeEnabled();
    fireEvent.click(verify);
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'verified',
      verified_by: 'admin',
      rejection_reason: null,
    })));
  });

  it('allows rejection without confirming POSSAP and resets confirmation on reopening', async () => {
    render(<PoliceReportVerification />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /I checked the POSSAP/i }));
    fireEvent.change(screen.getByLabelText('Rejection Reason (if rejecting)'), {
      target: { value: 'Details do not match' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected',
      rejection_reason: 'Details do not match',
    })));
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });
});
