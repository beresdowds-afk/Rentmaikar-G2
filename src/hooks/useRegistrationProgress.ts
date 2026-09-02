import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type RegistrationStage =
  | 'auth'
  | 'account_opened'
  | 'documents_submitted'
  | 'verification_pending'
  | 'approved';

export type AccessLevel = 'view_only' | 'full';

export interface RegistrationProgress {
  authenticated: boolean;
  stage: RegistrationStage;
  access_level: AccessLevel;
  role: 'driver' | 'owner' | null;
  email_verified: boolean;
  identity_verification_status: string | null;
  identity_verified_at: string | null;
  documents_uploaded: number;
  referees_verified: number;
  application_status: string | null;
}

const DEFAULT: RegistrationProgress = {
  authenticated: false,
  stage: 'auth',
  access_level: 'view_only',
  role: null,
  email_verified: false,
  identity_verification_status: null,
  identity_verified_at: null,
  documents_uploaded: 0,
  referees_verified: 0,
  application_status: null,
};

export function useRegistrationProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['registration-progress', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<RegistrationProgress> => {
      const { data, error } = await supabase.rpc('get_my_registration_progress');
      if (error) throw error;
      return { ...DEFAULT, ...(data as Partial<RegistrationProgress>) };
    },
  });
}

export async function advanceRegistrationStage(target: RegistrationStage) {
  const { data, error } = await supabase.rpc('advance_registration_stage', {
    _target: target,
  });
  if (error) throw error;
  return data as RegistrationStage;
}
