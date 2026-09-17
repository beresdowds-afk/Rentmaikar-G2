import { supabase } from "@/integrations/supabase/client";

export type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
  preferPopup?: boolean;
};

export interface SignInWithOAuthResult {
  data?: any;
  error?: Error | null;
  redirected?: boolean;
  isPopup?: boolean;
  popup?: Window | null;
  authUrl?: string;
}

export const platformAuth = {
  signInWithOAuth: async (
    provider: "google" | "apple" | "microsoft",
    opts?: SignInOptions
  ): Promise<SignInWithOAuthResult> => {
    try {
      const redirectUrl = opts?.redirect_uri || `${window.location.origin}/auth`;

      // CRITICAL: Always use skipBrowserRedirect: true so the Supabase client
      // does not attempt to redirect the current iframe directly.
      // Google OAuth endpoints strictly forbid embedding via X-Frame-Options: SAMEORIGIN / DENY.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: opts?.extraParams,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        return { error };
      }

      if (data?.url) {
        const isIframe = typeof window !== "undefined" && window.self !== window.top;
        const usePopup = isIframe || opts?.preferPopup !== false;

        if (usePopup) {
          const width = 560;
          const height = 680;
          const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
          const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

          const popup = window.open(
            data.url,
            "rentmaikar_oauth_popup",
            `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
          );

          if (!popup || popup.closed || typeof popup.closed === "undefined") {
            // Popup blocked by browser popup blocker
            if (!isIframe) {
              window.location.assign(data.url);
              return { redirected: true };
            }
            return {
              error: new Error("POPUP_BLOCKED"),
              authUrl: data.url,
            };
          }

          popup.focus?.();

          return {
            data,
            redirected: true,
            isPopup: true,
            popup,
            authUrl: data.url,
          };
        }

        window.location.assign(data.url);
        return { redirected: true };
      }

      return { data };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  },
};
