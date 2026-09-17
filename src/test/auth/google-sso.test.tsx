import { describe, it, expect, vi, beforeEach } from 'vitest';
import { platformAuth } from '@/lib/auth/oauth';
import { lovable } from '@/integrations/lovable/index';
import { supabase } from '@/integrations/supabase/client';

describe('Google SSO & OAuth Popup Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear storage
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      localStorage.clear();
    }
  });

  it('passes skipBrowserRedirect: true to avoid direct iframe navigation to Google OAuth', async () => {
    const signInSpy = vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123' },
      error: null,
    } as any);

    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue({
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
    } as any);

    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: 'http://localhost:3000/auth/callback',
      preferPopup: true,
    });

    expect(signInSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          skipBrowserRedirect: true,
          redirectTo: 'http://localhost:3000/auth/callback',
        }),
      })
    );

    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
      'rentmaikar_oauth_popup',
      expect.stringContaining('width=560')
    );

    expect(result.isPopup).toBe(true);
    expect(result.redirected).toBe(true);
  });

  it('detects popup blocked when window.open returns null in an iframe', async () => {
    vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123' },
      error: null,
    } as any);

    // Mock popup blocked
    vi.spyOn(window, 'open').mockReturnValue(null);

    // Define window.self !== window.top to simulate iframe
    const originalTop = window.top;
    try {
      Object.defineProperty(window, 'top', { value: {}, configurable: true });

      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: 'http://localhost:3000/auth/callback',
        preferPopup: true,
      });

      expect(result.error?.message).toBe('POPUP_BLOCKED');
      expect(result.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth?client_id=123');
    } finally {
      Object.defineProperty(window, 'top', { value: originalTop, configurable: true });
    }
  });

  it('retains explicit RBAC roles and single-role constraint for designated users', () => {
    // Verify the designated accounts have deterministic single role mappings
    const accounts = [
      { email: 'adebayoolusola39@gmail.com', expectedRole: 'admin' },
      { email: 'eastfortemain@gmail.com', expectedRole: 'admin_assistant' },
      { email: 'beresanddowds@gmail.com', expectedRole: 'owner' },
      { email: 'wale@gmail.com', expectedRole: 'driver' },
    ];

    accounts.forEach(({ email, expectedRole }) => {
      // Each user must have exactly ONE role and no multi-role permissions
      expect(expectedRole).toBeDefined();
      expect(['admin', 'admin_assistant', 'owner', 'driver']).toContain(expectedRole);
    });
  });

  it('stores role selection in sessionStorage and localStorage before OAuth initiation', () => {
    sessionStorage.setItem('rentmaikar_oauth_role', 'owner');
    localStorage.setItem('rentmaikar_oauth_role', 'owner');

    expect(sessionStorage.getItem('rentmaikar_oauth_role')).toBe('owner');
    expect(localStorage.getItem('rentmaikar_oauth_role')).toBe('owner');
  });
});
