import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", opts?: SignInOptions) => {
      try {
        const redirectUrl = opts?.redirect_uri || `${window.location.origin}/auth`;
        const providerName = (provider === "lovable" ? "google" : provider) as "google" | "apple";

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: providerName,
          options: {
            redirectTo: redirectUrl,
            queryParams: opts?.extraParams,
          },
        });

        if (error) {
          return { error };
        }

        if (data?.url) {
          const isIframe = window.self !== window.top;
          if (isIframe) {
            try {
              if (window.top) {
                window.top.location.href = data.url;
                return { redirected: true };
              }
            } catch {
              window.open(data.url, '_top');
              return { redirected: true };
            }
          }
          window.location.href = data.url;
          return { redirected: true };
        }

        return { data };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
  },
};

