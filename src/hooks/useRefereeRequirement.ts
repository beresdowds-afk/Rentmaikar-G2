import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const REFEREE_REQUIREMENT_KEY = 'driver_referee_requirement';
export const refereeRequirementQueryKey = ['driver-referee-requirement'] as const;

/**
 * Platform-wide switch controlling whether referees are mandatory during
 * driver registration.
 *
 * Defaults to OFF so drivers can register freely; referees are still collected
 * later (see `RefereePickupGate`) before a vehicle pickup location is revealed.
 * Driver's licence, phone verification and email verification remain mandatory
 * regardless of this setting.
 */
export function useRefereeRequirement() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: refereeRequirementQueryKey,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('platform_kv_settings')
        .select('value')
        .eq('key', REFEREE_REQUIREMENT_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value as { enabled?: boolean } | null)?.enabled;
      return v === undefined ? false : !!v;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('platform-kv:driver_referee_requirement')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'platform_kv_settings',
          filter: `key=eq.${REFEREE_REQUIREMENT_KEY}`,
        },
        () => qc.invalidateQueries({ queryKey: refereeRequirementQueryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return {
    isLoading: query.isLoading,
    /** True when referees must be supplied at registration. */
    required: query.data ?? false,
    refetch: query.refetch,
  };
}

export default useRefereeRequirement;
