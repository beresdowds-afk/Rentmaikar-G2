import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TrainingStatus {
  authenticated: boolean;
  total_modules: number;
  verified: number;
  pending_review: number;
  rejected: number;
  is_complete: boolean;
  next_due_at: string | null;
}

const DEFAULT: TrainingStatus = {
  authenticated: false,
  total_modules: 0,
  verified: 0,
  pending_review: 0,
  rejected: 0,
  is_complete: false,
  next_due_at: null,
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/**
 * Live compliance-training status for the signed-in user.
 *
 * Subscribes to the user's own rows in `training_completions` and
 * `training_refresh_requirements` so the dashboard banner clears the moment an
 * admin verifies the last outstanding module, and notifies the user whenever a
 * new refresh due date is scheduled.
 */
export function useTrainingStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['training-status', user?.id] as const;

  const query = useQuery({
    queryKey,
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<TrainingStatus> => {
      const { data, error } = await supabase.rpc('get_my_training_status');
      if (error) throw error;
      return { ...DEFAULT, ...((data ?? {}) as Partial<TrainingStatus>) };
    },
  });

  // Track the last announced refresh date so we only notify on real changes.
  const announcedDueRef = useRef<string | null>(null);
  const wasCompleteRef = useRef<boolean | null>(null);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const filter = `user_id=eq.${userId}`;
    const channel = supabase
      .channel(`training-status-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_completions', filter },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_refresh_requirements', filter },
        (payload) => {
          queryClient.invalidateQueries({ queryKey });

          const nextDue = (payload.new as { next_due_at?: string } | null)?.next_due_at;
          const prevDue = (payload.old as { next_due_at?: string } | null)?.next_due_at;
          if (!nextDue || nextDue === prevDue) return;
          if (announcedDueRef.current === nextDue) return;
          announcedDueRef.current = nextDue;

          toast.success('Training refresh scheduled', {
            description: `Your next compliance training refresh is due on ${formatDate(nextDue)}.`,
            duration: 8000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Announce completion (and the refresh date that comes with it) when the
  // final module flips to verified.
  const data = query.data;
  useEffect(() => {
    if (!data?.authenticated) return;
    const wasComplete = wasCompleteRef.current;
    wasCompleteRef.current = data.is_complete;

    if (wasComplete === null || wasComplete === data.is_complete) return;
    if (!data.is_complete) return;

    toast.success('Compliance training verified', {
      description: data.next_due_at
        ? `All modules are verified. Your next refresh is due on ${formatDate(data.next_due_at)}.`
        : 'All modules are verified. You are fully compliant.',
      duration: 8000,
    });
    if (data.next_due_at) announcedDueRef.current = data.next_due_at;
  }, [data?.authenticated, data?.is_complete, data?.next_due_at]);

  return query;
}
