import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePersonaEnabled } from '@/hooks/usePersonaEnabled';
import { toast } from 'sonner';



export type PersonaStatus =
  | 'created'
  | 'pending'
  | 'submitted'
  | 'needs_review'
  | 'approved'
  | 'declined'
  | 'expired'
  | string;

export interface PersonaTimelineEntry {
  inquiry_id: string | null;
  status: PersonaStatus;
  mismatch_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
}

export interface IdentityVerification {
  authenticated: boolean;
  is_verified: boolean;
  profile_status: PersonaStatus | null;
  profile_verified_at: string | null;
  profile_inquiry_id: string | null;
  latest_inquiry: (PersonaTimelineEntry & { region: string | null; template_id: string | null }) | null;
  timeline: PersonaTimelineEntry[];
}

const DEFAULT: IdentityVerification = {
  authenticated: false,
  is_verified: false,
  profile_status: null,
  profile_verified_at: null,
  profile_inquiry_id: null,
  latest_inquiry: null,
  timeline: [],
};

/**
 * Reads the signed-in user's Persona identity verification status and
 * subscribes to real-time updates on `persona_inquiries` + `profiles` so
 * gates unlock the moment the webhook records a verified state.
 */
export function useIdentityVerification() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const persona = usePersonaEnabled();

  const lastStatusRef = useRef<PersonaStatus | null>(null);

  const query = useQuery({
    queryKey: ['identity-verification', user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async (): Promise<IdentityVerification> => {
      const { data, error } = await supabase.rpc('get_my_identity_verification');
      if (error) throw error;
      return { ...DEFAULT, ...(data as Partial<IdentityVerification>) };
    },
  });

  // Toast on status transitions so users don't need to refresh.
  useEffect(() => {
    const status = query.data?.profile_status ?? query.data?.latest_inquiry?.status ?? null;
    if (!status) return;
    const prev = lastStatusRef.current;
    lastStatusRef.current = status;
    if (prev === null || prev === status) return;

    const copy: Record<string, { title: string; description: string; type: 'success' | 'error' | 'info' | 'warning' }> = {
      submitted: { title: 'Verification submitted', description: 'We received your identity verification.', type: 'info' },
      pending: { title: 'Verification in progress', description: 'Your submission is being processed.', type: 'info' },
      needs_review: { title: 'Verification needs your attention', description: 'Open your verification page for details.', type: 'warning' },
      approved: { title: '🎉 Identity verified', description: 'Marketplace features are now unlocked.', type: 'success' },
      declined: { title: 'Verification could not be completed', description: 'You can restart the flow from your verification page.', type: 'error' },
      expired: { title: 'Verification session expired', description: 'Please start a new verification session.', type: 'warning' },
    };
    const c = copy[status];
    if (!c) return;
    const fn = c.type === 'success' ? toast.success : c.type === 'error' ? toast.error : c.type === 'warning' ? toast.warning : toast.info;
    fn(c.title, { description: c.description, duration: 8000 });
  }, [query.data?.profile_status, query.data?.latest_inquiry?.status]);

  useEffect(() => {
    if (!user) return;
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ['identity-verification', user.id] });

    const channel = supabase
      .channel(`identity-verification:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'persona_inquiries', filter: `user_id=eq.${user.id}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  // Platform switch: when an admin disables Persona, every gate reading this
  // hook must behave as if verification already passed.
  if (!persona.isLoading && !persona.enabled && !!user) {
    return {
      ...query,
      isLoading: false,
      data: { ...DEFAULT, ...(query.data ?? {}), authenticated: true, is_verified: true },
    } as typeof query;
  }

  if (persona.isLoading) {
    return { ...query, isLoading: true } as typeof query;
  }

  return query;

}

