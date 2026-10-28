import { supabase } from '@/integrations/supabase/client';
import { homeForRole, isStaffRole, type AppRole } from '@/lib/role-home';

export async function resolvePostLoginDestination(
  userId: string,
  role?: AppRole | null,
  fallbackPath = '/'
): Promise<string> {
  if (!role) return fallbackPath || '/';
  if (isStaffRole(role)) {
    return homeForRole(role, fallbackPath);
  }

  try {
    if (role === 'driver') {
      // Check if agreement is pending
      const { data: driver } = await supabase
        .from('driver_profiles')
        .select('agreement_signed')
        .eq('user_id', userId)
        .maybeSingle();

      if (driver && !driver.agreement_signed) {
        return '/driver-agreement';
      }
    } else if (role === 'owner') {
      const { data: owner } = await supabase
        .from('owner_profiles')
        .select('agreement_signed')
        .eq('user_id', userId)
        .maybeSingle();

      if (owner && !owner.agreement_signed) {
        return '/owner-agreement';
      }
    }
  } catch (err) {
    console.warn('Error resolving post-login destination:', err);
  }

  return homeForRole(role, fallbackPath);
}
