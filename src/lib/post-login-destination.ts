import { supabase } from '@/integrations/supabase/client';
import { homeForRole, isStaffRole, type AppRole } from '@/lib/role-home';
import { routeForStage } from '@/lib/onboarding-error';
import type { RegistrationStage } from '@/hooks/useRegistrationProgress';

const REGISTRATION_STAGES: RegistrationStage[] = [
  'auth',
  'account_opened',
  'documents_submitted',
  'verification_pending',
  'approved',
];

function isRegistrationStage(stage: unknown): stage is RegistrationStage {
  return typeof stage === 'string' && REGISTRATION_STAGES.includes(stage as RegistrationStage);
}

export async function resolvePostLoginDestination(
  userId: string,
  role?: AppRole | null,
  fallbackPath = '/'
): Promise<string> {
  if (!role) return fallbackPath || '/';
  if (isStaffRole(role)) {
    return homeForRole(role, fallbackPath);
  }

  if (role !== 'driver' && role !== 'owner') {
    return homeForRole(role, fallbackPath);
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user.id !== userId) {
      return homeForRole(role, fallbackPath);
    }

    const { data, error } = await supabase.rpc('get_my_registration_progress');
    if (error) throw error;

    const progress = data as {
      authenticated?: unknown;
      role?: unknown;
      stage?: unknown;
    } | null;
    if (
      progress?.authenticated === true &&
      progress.role === role &&
      isRegistrationStage(progress.stage)
    ) {
      return routeForStage(role, progress.stage);
    }
  } catch (err) {
    console.warn('Error resolving post-login destination:', err);
  }

  return homeForRole(role, fallbackPath);
}
