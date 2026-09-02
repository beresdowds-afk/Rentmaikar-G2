import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface DailyPlanEligibility {
  isEligible: boolean;
  isForbidden: boolean;
  forbiddenReason?: string;
  forbiddenAt?: Date;
  isLoading: boolean;
  error?: string;
}

export function useDailyPlanEligibility(): DailyPlanEligibility {
  const { user } = useAuth();
  const [state, setState] = useState<DailyPlanEligibility>({
    isEligible: true,
    isForbidden: false,
    isLoading: true,
  });

  useEffect(() => {
    async function checkEligibility() {
      if (!user?.id) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('daily_plan_forbidden, daily_plan_forbidden_at, daily_plan_forbidden_reason')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('[DailyPlanEligibility] Error fetching profile:', error);
          setState({
            isEligible: true, // Default to eligible on error
            isForbidden: false,
            isLoading: false,
            error: error.message,
          });
          return;
        }

        setState({
          isEligible: !profile?.daily_plan_forbidden,
          isForbidden: profile?.daily_plan_forbidden || false,
          forbiddenReason: profile?.daily_plan_forbidden_reason || undefined,
          forbiddenAt: profile?.daily_plan_forbidden_at 
            ? new Date(profile.daily_plan_forbidden_at) 
            : undefined,
          isLoading: false,
        });
      } catch (error) {
        console.error('[DailyPlanEligibility] Unexpected error:', error);
        setState({
          isEligible: true,
          isForbidden: false,
          isLoading: false,
          error: 'Failed to check eligibility',
        });
      }
    }

    checkEligibility();
  }, [user?.id]);

  return state;
}
