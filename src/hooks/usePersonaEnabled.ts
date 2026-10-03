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
export interface PersonaVerificationConfig {
  enabled: boolean;
  background_check_enabled?: boolean;
  identity_verification_enabled?: boolean;
  [key: string]: unknown;
}

export function usePersonaEnabled() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: personaEnabledQueryKey,
    staleTime: 60_000,
    queryFn: async (): Promise<{ enabled: boolean; backgroundChecksEnabled: boolean; identityEnabled: boolean }> => {
      try {
        if (typeof supabase?.from !== 'function') {
          return { enabled: false, backgroundChecksEnabled: false, identityEnabled: false };
        }
        const { data, error } = await supabase
          .from('platform_kv_settings')
          .select('value')
          .eq('key', PERSONA_SETTING_KEY)
          .maybeSingle();
        if (error) {
          console.warn('[usePersonaEnabled] Failed to fetch setting, defaulting to false:', error);
          return { enabled: false, backgroundChecksEnabled: false, identityEnabled: false };
        }
        const val = data?.value as PersonaVerificationConfig | null;
        const masterEnabled = val?.enabled === true;
        const bgEnabled = val?.background_check_enabled !== undefined 
          ? val.background_check_enabled === true 
          : masterEnabled;
        const idEnabled = val?.identity_verification_enabled !== undefined
          ? val.identity_verification_enabled === true
          : masterEnabled;

        return {
          enabled: masterEnabled,
          backgroundChecksEnabled: bgEnabled,
          identityEnabled: idEnabled,
        };
      } catch (err) {
        console.warn('[usePersonaEnabled] Unexpected error fetching setting:', err);
        return { enabled: false, backgroundChecksEnabled: false, identityEnabled: false };
      }
    },
  });

  // Propagate admin changes to every open session immediately.
  useEffect(() => {
    if (typeof supabase?.channel !== 'function') {
      return;
    }
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

  const enabled = query.data?.enabled ?? false;
  const backgroundChecksEnabled = query.data?.backgroundChecksEnabled ?? false;
  const identityEnabled = query.data?.identityEnabled ?? false;

  return {
    isLoading: query.isLoading,
    enabled,
    backgroundChecksEnabled,
    identityEnabled,
    refetch: query.refetch,
  };
}

export default usePersonaEnabled;
