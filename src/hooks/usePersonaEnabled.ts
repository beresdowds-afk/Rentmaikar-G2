import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PERSONA_SETTING_KEY = 'persona_verification';
export const personaEnabledQueryKey = ['persona-verification-enabled'] as const;

/**
 * Platform-wide switch for Persona identity verification.
 *
 * When Persona is disabled (the default), every Persona-dependent gate
 * (marketplace, portals, dashboards, verification prompts) treats identity
 * verification as bypassed. Admins can enable or disable Persona at any time
 * via the Admin Dashboard switch.
 */
export function usePersonaEnabled() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: personaEnabledQueryKey,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from('platform_kv_settings')
          .select('value')
          .eq('key', PERSONA_SETTING_KEY)
          .maybeSingle();
        if (error) {
          console.warn('[usePersonaEnabled] Failed to fetch setting, defaulting to false:', error);
          return false;
        }
        const v = (data?.value as { enabled?: boolean } | null)?.enabled;
        // Default to false (disabled) unless explicitly enabled in platform_kv_settings
        return v === true;
      } catch (err) {
        console.warn('[usePersonaEnabled] Unexpected error fetching setting:', err);
        return false;
      }
    },
  });

  // Propagate admin changes to every open session immediately.
  useEffect(() => {
    const channel = supabase
      .channel('platform-kv:persona_verification')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_kv_settings', filter: `key=eq.${PERSONA_SETTING_KEY}` },
        () => qc.invalidateQueries({ queryKey: personaEnabledQueryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return {
    isLoading: query.isLoading,
    enabled: query.data ?? false,
    refetch: query.refetch,
  };
}

export default usePersonaEnabled;
