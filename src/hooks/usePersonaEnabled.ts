import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PERSONA_SETTING_KEY = 'persona_verification';
export const personaEnabledQueryKey = ['persona-verification-enabled'] as const;

/**
 * Platform-wide switch for Persona identity verification.
 *
 * When an admin turns this off, every Persona-dependent gate (marketplace,
 * portals, dashboards, verification prompts) must behave as if identity
 * verification already passed. Defaults to ENABLED so a failed read can never
 * silently weaken the gate.
 */
export function usePersonaEnabled() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: personaEnabledQueryKey,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('platform_kv_settings')
        .select('value')
        .eq('key', PERSONA_SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value as { enabled?: boolean } | null)?.enabled;
      return v === undefined ? true : !!v;
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
    /** True while unknown — callers should keep the gate closed until resolved. */
    isLoading: query.isLoading,
    enabled: query.data ?? true,
    refetch: query.refetch,
  };
}

export default usePersonaEnabled;
