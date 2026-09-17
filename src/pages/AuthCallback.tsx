import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * Dedicated callback landing page for OAuth providers (Google, etc.).
 * Handles both popup-based completion (sending message to window.opener and closing)
 * and direct full-window redirect fallback.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const processAuth = async () => {
      try {
        // Retrieve established session (Supabase automatically parses hash tokens or PKCE code)
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        const isPopup = typeof window !== 'undefined' && window.opener && window.opener !== window;

        if (isPopup) {
          try {
            window.opener.postMessage(
              { type: 'OAUTH_AUTH_SUCCESS', provider: 'google', session },
              '*'
            );
            window.opener.postMessage(
              { type: 'GOOGLE_OAUTH_SUCCESS', provider: 'google', session },
              '*'
            );
          } catch {
            // cross-origin messaging fallback
          }

          setTimeout(() => {
            window.close();
          }, 350);
          return;
        }

        if (active) {
          setStatus('success');
          // Navigate to /auth where AuthContext role hydration and post-login resolution occurs
          navigate('/auth', { replace: true });
        }
      } catch (err: any) {
        if (!active) return;
        setStatus('error');
        const msg = err?.message || 'Authentication exchange failed';
        setErrorMessage(msg);

        const isPopup = typeof window !== 'undefined' && window.opener && window.opener !== window;
        if (isPopup) {
          try {
            window.opener.postMessage(
              { type: 'GOOGLE_OAUTH_ERROR', error: msg },
              '*'
            );
          } catch {
            // ignore
          }
          setTimeout(() => {
            window.close();
          }, 1200);
        } else {
          setTimeout(() => {
            navigate('/auth', { replace: true });
          }, 2500);
        }
      }
    };

    void processAuth();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md w-full p-8 rounded-xl border border-border bg-card text-center space-y-4 shadow-lg">
        {status === 'processing' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">Completing authentication...</h2>
            <p className="text-sm text-muted-foreground">Please wait while your credentials are verified.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto text-lg font-bold">
              ✓
            </div>
            <h2 className="text-xl font-semibold">Authentication Successful</h2>
            <p className="text-sm text-muted-foreground">Redirecting to your account...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="h-8 w-8 rounded-full bg-destructive/20 text-destructive flex items-center justify-center mx-auto text-lg font-bold">
              !
            </div>
            <h2 className="text-xl font-semibold">Authentication Error</h2>
            <p className="text-sm text-destructive">{errorMessage}</p>
          </>
        )}
      </div>
    </div>
  );
}
