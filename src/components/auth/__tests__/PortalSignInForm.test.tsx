import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  check2FAStatus: vi.fn(),
  rememberReturnTo: vi.fn(),
  signOut: vi.fn(),
  roles: [] as Array<{ role: string }>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mocks.signIn,
    check2FAStatus: mocks.check2FAStatus,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: mocks.roles, error: null }),
      }),
    }),
    auth: { signOut: mocks.signOut },
  },
}));

vi.mock('@/lib/return-to', () => ({
  rememberReturnTo: mocks.rememberReturnTo,
}));

import PortalSignInForm from '@/components/auth/PortalSignInForm';

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderForm() {
  render(
    <MemoryRouter initialEntries={['/admin/sign-in']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <PortalSignInForm
                allowedRoles={['admin', 'admin_assistant']}
                title="Admin console"
                description="Staff sign-in"
                destination="/admin"
                destinationByRole={{ admin_assistant: '/admin-assistant' }}
              />
              <CurrentPath />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitSignIn() {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'staff@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-horse-battery-staple' },
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
}

describe('PortalSignInForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue({ error: null, userId: 'staff-1' });
    mocks.check2FAStatus.mockResolvedValue({ requires_2fa: false });
    mocks.roles = [{ role: 'admin_assistant' }];
  });

  it('sends an admin assistant to the assistant dashboard', async () => {
    renderForm();
    await submitSignIn();

    await waitFor(() => {
      expect(screen.getByTestId('current-path').textContent).toBe('/admin-assistant');
    });
  });

  it('preserves the role-specific destination through the 2FA challenge', async () => {
    mocks.check2FAStatus.mockResolvedValue({ requires_2fa: true });
    renderForm();
    await submitSignIn();

    await waitFor(() => {
      expect(mocks.rememberReturnTo).toHaveBeenCalledWith('/admin-assistant');
      expect(screen.getByTestId('current-path').textContent).toBe('/auth');
    });
  });

  it('keeps admins on the admin dashboard', async () => {
    mocks.roles = [{ role: 'admin' }];
    renderForm();
    await submitSignIn();

    await waitFor(() => {
      expect(screen.getByTestId('current-path').textContent).toBe('/admin');
    });
  });
});
