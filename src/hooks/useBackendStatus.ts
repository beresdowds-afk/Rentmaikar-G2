import { useQuery } from "@tanstack/react-query";
import { getBackendHealth, getBackendDomains, type BackendHealth, type BackendDomains } from "@/lib/backend-client";
import { API_BASE_URL } from "@/lib/api-config";

export interface BackendStatus {
  baseUrl: string;
  reachable: boolean;
  health: BackendHealth | null;
  domains: BackendDomains | null;
  error: string | null;
}

/**
 * Listens to the standalone backend API (health + domain topology) so the UI can
 * show whether the separated backend is reachable before traffic is cut over.
 */
export function useBackendStatus(enabled = true) {
  return useQuery<BackendStatus>({
    queryKey: ["backend-status", API_BASE_URL],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const [health, domains] = await Promise.all([getBackendHealth(), getBackendDomains()]);
      return {
        baseUrl: API_BASE_URL,
        reachable: !!health.data && !health.error,
        health: health.data,
        domains: domains.data,
        error: health.error?.message ?? null,
      };
    },
  });
}
