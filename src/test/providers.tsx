import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Shared provider shell for jsdom tests.
 *
 * Screens under test routinely use react-query, react-helmet-async and Radix
 * tooltips. Rendering them bare throws ("No QueryClient set", "helmetInstances
 * is undefined", "`Tooltip` must be used within `TooltipProvider`"), which is a
 * harness gap rather than a product bug — so every suite wraps with this.
 */
export function TestProviders({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

/**
 * Complete-enough stub of the Supabase browser client for component tests:
 * query-builder chain, auth, realtime channels, rpc, functions and storage.
 * Suites can spread extra overrides on top.
 */
export function createSupabaseMock(overrides: Record<string, unknown> = {}) {
  const chain: any = new Proxy(
    {
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: [], error: null }),
    },
    {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        // Any other builder method returns the chain for fluent calls.
        return () => chain;
      },
    },
  );

  const channel: any = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: () => Promise.resolve("ok"),
  };

  return {
    from: () => chain,
    rpc: async () => ({ data: null, error: null }),
    channel: () => channel,
    removeChannel: () => Promise.resolve("ok"),
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
    ...overrides,
  };
}
