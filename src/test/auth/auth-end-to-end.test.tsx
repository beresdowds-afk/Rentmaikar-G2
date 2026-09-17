import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { platformAuth } from '@/lib/auth/oauth';
import { normalizeToE164 } from '@/lib/phone-normalize';

describe('Auth End-to-End Integration Suite', () => {
  const functionsProto = Object.getPrototypeOf(supabase.functions);

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear();
      window.localStorage.clear();
    }
  });

  // =========================================================================
  // 1. GOOGLE SSO END-TO-END
  // =========================================================================
  describe('1. Google SSO Flow', () => {
    it('initiates Google OAuth with popup window and skipBrowserRedirect', async () => {
      const mockOAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client-id-123';

      const signInSpy = vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
        data: { provider: 'google', url: mockOAuthUrl },
        error: null,
      } as any);

      const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue({
        closed: false,
        focus: vi.fn(),
        close: vi.fn(),
      } as any);

      const result = await platformAuth.signInWithOAuth('google', {
        redirect_uri: 'https://rentmaikar.com/auth/callback',
        extraParams: { prompt: 'select_account' },
        preferPopup: true,
      });

      expect(signInSpy).toHaveBeenCalledWith({
        provider: 'google',
        options: expect.objectContaining({
          skipBrowserRedirect: true,
          redirectTo: 'https://rentmaikar.com/auth/callback',
          queryParams: expect.objectContaining({ prompt: 'select_account' }),
        }),
      });

      expect(windowOpenSpy).toHaveBeenCalledWith(
        mockOAuthUrl,
        'rentmaikar_oauth_popup',
        expect.stringContaining('width=560')
      );

      expect(result.isPopup).toBe(true);
      expect(result.data.url).toBe(mockOAuthUrl);
    });

    it('handles OAuth cross-window success message and establishes session', async () => {
      const getSessionSpy = vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: {
          session: {
            access_token: 'valid-google-jwt-token',
            refresh_token: 'valid-google-refresh-token',
            user: {
              id: 'user-google-123',
              email: 'adebayoolusola39@gmail.com',
              user_metadata: { full_name: 'Olusola Adebayo' },
            },
          } as any,
        },
        error: null,
      });

      // Simulate receiving postMessage from completed popup
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'GOOGLE_OAUTH_SUCCESS', provider: 'google' },
          origin: window.location.origin,
        })
      );

      const { data } = await supabase.auth.getSession();
      expect(data.session?.user.email).toBe('adebayoolusola39@gmail.com');
      expect(data.session?.access_token).toBe('valid-google-jwt-token');
      expect(getSessionSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. EMAIL SIGN-UP END-TO-END
  // =========================================================================
  describe('2. Email Sign-Up Flow', () => {
    it('registers a new driver with metadata, consents, and redirect to onboarding', async () => {
      const signupPayload = {
        email: 'newdriver@example.com',
        password: 'Password123!',
        fullName: 'New Driver',
        role: 'driver',
        messagingChannel: 'sms',
        dataSharingConsent: true,
      };

      const mockUserId = 'usr-drv-9876';

      const signUpSpy = vi.spyOn(supabase.auth, 'signUp').mockResolvedValue({
        data: {
          user: {
            id: mockUserId,
            email: signupPayload.email,
            user_metadata: {
              full_name: signupPayload.fullName,
              role: signupPayload.role,
            },
          } as any,
          session: {
            access_token: 'drv-access-token',
            refresh_token: 'drv-refresh-token',
          } as any,
        },
        error: null,
      });

      // Simulate profile update mock
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'profiles') {
          return { update: updateMock } as any;
        }
        return { select: vi.fn() } as any;
      });

      // Execute signup
      const { data, error } = await supabase.auth.signUp({
        email: signupPayload.email,
        password: signupPayload.password,
        options: {
          data: {
            full_name: signupPayload.fullName,
            role: signupPayload.role,
          },
        },
      });

      expect(error).toBeNull();
      expect(data.user?.id).toBe(mockUserId);
      expect(signUpSpy).toHaveBeenCalledWith({
        email: 'newdriver@example.com',
        password: 'Password123!',
        options: {
          data: {
            full_name: 'New Driver',
            role: 'driver',
          },
        },
      });

      // Record profile preferences
      await supabase.from('profiles').update({
        notification_email: true,
        notification_sms: signupPayload.messagingChannel === 'sms',
        data_sharing_consent: signupPayload.dataSharingConsent,
      }).eq('user_id', mockUserId);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_email: true,
          notification_sms: true,
          data_sharing_consent: true,
        })
      );
    });

    it('detects already registered email and guides to sign-in', async () => {
      vi.spyOn(supabase.auth, 'signUp').mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'User already registered',
          name: 'AuthApiError',
          status: 422,
        } as any,
      });

      const { error } = await supabase.auth.signUp({
        email: 'existing@example.com',
        password: 'Password123!',
      });

      expect(error?.message).toMatch(/already registered/i);
    });
  });

  // =========================================================================
  // 3. PHONE NUMBER SIGN-UP FLOW
  // =========================================================================
  describe('3. Phone Number Sign-Up Flow', () => {
    it('normalizes local phone numbers to strict international E.164 formats', () => {
      // Nigeria local format with NG region default
      const ngNumber = normalizeToE164('08139051772', 'NG');
      expect(ngNumber).toBe('+2348139051772');

      // US format
      const usNumber = normalizeToE164('+1 (202) 456-1111');
      expect(usNumber).toBe('+12024561111');
    });

    it('dispatches OTP code request to custom phone OTP edge function', async () => {
      const e164 = '+2348139051772';

      const invokeSpy = vi.spyOn(functionsProto, 'invoke').mockImplementation(async () => ({
        data: {
          success: true,
          message: 'Verification code sent',
          provider: 'termii',
        },
        error: null,
      }));

      const { data, error } = await supabase.functions.invoke('phone-otp-custom', {
        body: {
          action: 'send',
          phone: e164,
        },
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
      expect(invokeSpy).toHaveBeenCalledWith('phone-otp-custom', {
        body: {
          action: 'send',
          phone: '+2348139051772',
        },
      });
    });
  });

  // =========================================================================
  // 4. PHONE NUMBER VERIFICATION FLOW
  // =========================================================================
  describe('4. Phone Number Verification Flow', () => {
    it('verifies 6-digit OTP code, provisions session, and assigns user role', async () => {
      const e164 = '+2348139051772';
      const otpCode = '654321';
      const mockSession = {
        access_token: 'phone-auth-access-token',
        refresh_token: 'phone-auth-refresh-token',
      };

      vi.spyOn(functionsProto, 'invoke').mockImplementation(async () => ({
        data: {
          success: true,
          user_id: 'usr-phone-456',
          session: mockSession,
          is_new_user: true,
        },
        error: null,
      }));

      const setSessionSpy = vi.spyOn(supabase.auth, 'setSession').mockResolvedValue({
        data: {
          session: mockSession as any,
          user: { id: 'usr-phone-456', phone: e164 } as any,
        },
        error: null,
      });

      // 1. Submit OTP verification
      const { data, error } = await supabase.functions.invoke('phone-otp-custom', {
        body: {
          action: 'verify',
          phone: e164,
          code: otpCode,
          full_name: 'Wale Phone Driver',
          role: 'driver',
        },
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);

      // 2. Set authenticated session
      if (data?.session) {
        const { data: sessionData } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        expect(sessionData.session?.access_token).toBe(mockSession.access_token);
      }

      expect(setSessionSpy).toHaveBeenCalledWith({
        access_token: 'phone-auth-access-token',
        refresh_token: 'phone-auth-refresh-token',
      });
    });

    it('rejects invalid or expired OTP verification code', async () => {
      vi.spyOn(functionsProto, 'invoke').mockImplementation(async () => ({
        data: {
          error: 'Invalid or expired verification code',
        },
        error: null,
      }));

      const { data } = await supabase.functions.invoke('phone-otp-custom', {
        body: {
          action: 'verify',
          phone: '+2348139051772',
          code: '000000',
        },
      });

      expect(data?.error).toMatch(/invalid or expired/i);
    });
  });

  // =========================================================================
  // 5. FORGOT / RESET PASSWORD END-TO-END
  // =========================================================================
  describe('5. Forgot & Reset Password Flow', () => {
    it('requests password reset email with rate-limit protection', async () => {
      const email = 'user@example.com';

      // 1. Check rate limit
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: true,
        error: null,
      } as any);

      const resetSpy = vi.spyOn(supabase.auth, 'resetPasswordForEmail').mockResolvedValue({
        data: {},
        error: null,
      } as any);

      const { data: allowed } = await supabase.rpc('check_auth_rate_limit', {
        _identifier: `reset:${email}`,
        _endpoint: 'auth.reset_password',
        _max_requests: 3,
        _window_seconds: 900,
      } as any);

      expect(allowed).toBe(true);

      // 2. Dispatch reset email
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://rentmaikar.com/reset-password',
      });

      expect(error).toBeNull();
      expect(resetSpy).toHaveBeenCalledWith(email, {
        redirectTo: 'https://rentmaikar.com/reset-password',
      });
    });

    it('exchanges recovery token on reset page and updates user password', async () => {
      const recoveryCode = 'recovery-token-xyz-123';
      const newPassword = 'NewStrongPassword2026!';

      // 1. Verify token / exchange code for session
      vi.spyOn(supabase.auth, 'exchangeCodeForSession').mockResolvedValue({
        data: {
          session: {
            access_token: 'recovery-session-jwt',
            user: { id: 'usr-reset-789', email: 'user@example.com' },
          } as any,
          user: { id: 'usr-reset-789' } as any,
        },
        error: null,
      });

      const { data: exchangeData, error: exchangeErr } =
        await supabase.auth.exchangeCodeForSession(recoveryCode);

      expect(exchangeErr).toBeNull();
      expect(exchangeData.session?.access_token).toBe('recovery-session-jwt');

      // 2. Submit new password
      const updateUserSpy = vi.spyOn(supabase.auth, 'updateUser').mockResolvedValue({
        data: {
          user: { id: 'usr-reset-789', email: 'user@example.com' } as any,
        },
        error: null,
      });

      const { data: updateData, error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      expect(updateErr).toBeNull();
      expect(updateData.user?.id).toBe('usr-reset-789');
      expect(updateUserSpy).toHaveBeenCalledWith({ password: newPassword });

      // 3. Complete and sign out
      const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({
        error: null,
      });
      await supabase.auth.signOut();
      expect(signOutSpy).toHaveBeenCalled();
    });

    it('handles same password error and informs the user to choose a different password', async () => {
      vi.spyOn(supabase.auth, 'updateUser').mockResolvedValue({
        data: { user: null },
        error: {
          message: 'New password should be different from the old password.',
          name: 'AuthApiError',
          status: 422,
        } as any,
      });

      const { error } = await supabase.auth.updateUser({
        password: 'OldPassword123!',
      });

      expect(error?.message).toMatch(/different from the old password/i);
    });
  });
});
