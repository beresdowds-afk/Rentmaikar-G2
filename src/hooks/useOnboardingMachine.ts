import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface OnboardingMachineState {
  authenticated: boolean;
  role: 'driver' | 'owner' | null;
  next_step: string;
  next_href: string;
  completed: string[];
  steps: string[];
  labels: Record<string, string>;
  hrefs: Record<string, string>;
  percent: number;
  last_visited_step: string | null;
  two_factor_enabled: boolean;
  application_status: string | null;
}

const DEFAULT: OnboardingMachineState = {
  authenticated: false,
  role: null,
  next_step: 'sign_in',
  next_href: '/auth',
  completed: [],
  steps: [],
  labels: {},
  hrefs: {},
  percent: 0,
  last_visited_step: null,
  two_factor_enabled: false,
  application_status: null,
};

/**
 * Single source of truth for onboarding flow. Wraps the
 * `get_onboarding_next_step` RPC and refetches on auth state changes AND on
 * realtime changes to the underlying profile/application/user_role rows so
 * the Resume CTA always reflects true server state.
 */
export function useOnboardingMachine() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Refetch on auth events.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      qc.invalidateQueries({ queryKey: ['onboarding-machine'] });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  // Realtime: profile / application / role updates for this user invalidate
  // the machine so the checklist recomputes the next incomplete step live.
  useEffect(() => {
    if (!user?.id) return;
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ['onboarding-machine', user.id] });

    const channel = supabase
      .channel(`onboarding-machine:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications', filter: `user_id=eq.${user.id}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${user.id}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'two_factor_settings', filter: `user_id=eq.${user.id}` },
        invalidate,
      )
      .subscribe();

    // Refetch when the tab becomes visible again — cheap safety net for
    // events missed during suspend / cold-boot.
    const onVis = () => {
      if (document.visibilityState === 'visible') invalidate();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [qc, user?.id]);

  return useQuery({
    queryKey: ['onboarding-machine', user?.id ?? null],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OnboardingMachineState> => {
      const { data, error } = await (supabase.rpc as any)('get_onboarding_next_step');
      if (error) throw error;
      return { ...DEFAULT, ...(data as Partial<OnboardingMachineState>) };
    },
  });
}

export async function setOnboardingLastVisited(step: string) {
  try {
    await (supabase.rpc as any)('set_onboarding_last_visited', { _step: step });
  } catch {
    /* best-effort */
  }
}
