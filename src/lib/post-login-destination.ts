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
    // driver_profiles / owner_profiles are not in the generated Supabase types;
    // query through an untyped handle (errors are caught below).
    const db = supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { agreement_signed?: boolean } | null }>;
          };
        };
      };
    };
    if (role === 'driver') {
      // Check if agreement is pending
      const { data: driver } = await db
        .from('driver_profiles')
        .select('agreement_signed')
        .eq('user_id', userId)
        .maybeSingle();

      if (driver && !driver.agreement_signed) {
        return '/driver-agreement';
      }
    } else if (role === 'owner') {
      const { data: owner } = await db
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
