import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ProfileMandatoryField =
  | 'phone'
  | 'country'
  | 'emergency_contact_name'
  | 'emergency_contact_phone';

export type ProfileOptionalField =
  | 'driver_license'
  | 'vehicle_ownership'
  | 'payment_method';

export interface ProfileCompletionStatus {
  authenticated: boolean;
  missing_mandatory: ProfileMandatoryField[];
  missing_optional: ProfileOptionalField[];
  mandatory_complete: boolean;
  fully_complete: boolean;
  skipped_at: string | null;
}

const DEFAULT: ProfileCompletionStatus = {
  authenticated: false,
  missing_mandatory: [],
  missing_optional: [],
  mandatory_complete: false,
  fully_complete: false,
  skipped_at: null,
};

export function useProfileCompletion() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile-completion', user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async (): Promise<ProfileCompletionStatus> => {
      const { data, error } = await supabase.rpc('get_profile_completion_status');
      if (error) throw error;
      return { ...DEFAULT, ...(data as Partial<ProfileCompletionStatus>) };
    },
  });
}
