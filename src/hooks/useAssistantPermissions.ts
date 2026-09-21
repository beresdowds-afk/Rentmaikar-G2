import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { PermissionKey } from '@/components/admin/AdminAssistantManagement';
import {
  assistantCanAccessTab,
  forbiddenTabsForAssistant,
} from '@/lib/admin-tab-permissions';
import { assistantExcludedTabs } from '@/lib/admin-tab-registry';

export interface AssistantPermissionsResult {
  loading: boolean;
  /** True when the user has the full `admin` role (bypasses gating). */
  isFullAdmin: boolean;
  /** True when the user is an admin_assistant. */
  isAssistant: boolean;
  /** Raw permission flags. Null when user is not an assistant. */
  perms: Partial<Record<PermissionKey, boolean>> | null;
  /** Tabs the current user is NOT allowed to see. Empty for full admins. */
  forbiddenTabs: string[];
  /** Convenience access check. */
  canAccessTab: (tab: string) => boolean;
}

/**
 * Loads the current user's role + admin_assistant_permissions row and returns
 * a hook-friendly view for use in the admin dashboards. Full admins bypass
 * all gating; assistants get filtered to only their granted tabs; anyone else
 * is treated as having no admin access.
 */
export function useAssistantPermissions(): AssistantPermissionsResult {
  const { user, userRole } = useAuth();

  const normalizedEmail = user?.email?.trim().toLowerCase();
  const isDeclaredFullAdmin =
    userRole === 'admin' ||
    (normalizedEmail &&
      ['adebayoolusola39@gmail.com', 'beresdowds@gmail.com', 'beresanddowds@gmail.com'].includes(normalizedEmail));

  const { data, isLoading } = useQuery({
    queryKey: ['assistant-permissions', user?.id ?? null, userRole],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const [roleRes, permRes] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user!.id),
        supabase
          .from('admin_assistant_permissions')
          .select('*')
          .eq('user_id', user!.id)
          .maybeSingle(),
      ]);
      const roles = (roleRes.data ?? []).map((r: any) => r.role as string);
      return {
        isFullAdmin: roles.includes('admin') || isDeclaredFullAdmin,
        isAssistant: roles.includes('admin_assistant') || userRole === 'admin_assistant',
        perms: (permRes.data as any) ?? null,
      };
    },
  });

  const isFullAdmin = !!data?.isFullAdmin || !!isDeclaredFullAdmin;
  const isAssistant = !isFullAdmin && (!!data?.isAssistant || userRole === 'admin_assistant');
  const perms = (data?.perms ?? null) as Partial<Record<PermissionKey, boolean>> | null;

  const forbiddenTabs = isFullAdmin
    ? []
    : Array.from(
        new Set([
          ...forbiddenTabsForAssistant(perms),
          ...assistantExcludedTabs(),
        ]),
      );

  return {
    loading: isLoading,
    isFullAdmin,
    isAssistant,
    perms,
    forbiddenTabs,
    canAccessTab: (tab: string) =>
      isFullAdmin ? true : assistantCanAccessTab(tab, perms),
  };
}
