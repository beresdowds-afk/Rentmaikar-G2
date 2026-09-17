import { platformAuth, SignInOptions, SignInWithOAuthResult } from "@/lib/auth/oauth";

export type { SignInOptions, SignInWithOAuthResult };

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions
    ): Promise<SignInWithOAuthResult> => {
      const targetProvider = provider === "lovable" ? "google" : provider;
      return platformAuth.signInWithOAuth(targetProvider, opts);
    },
  },
};



