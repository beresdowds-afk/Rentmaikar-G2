import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PendingApprovalItem {
  id: string;
  type: 'Driver' | 'Owner';
  name: string;
  email: string;
  location: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'needs_info';
}

/** Real registration applications awaiting review. */
export function usePendingApprovals() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-pending-approvals'],
    staleTime: 30_000,
    queryFn: async (): Promise<PendingApprovalItem[]> => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, application_type, status, first_name, last_name, email, city, country, created_at')
        .in('status', ['pending', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        type: row.application_type === 'owner' ? 'Owner' : 'Driver',
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email,
        email: row.email,
        location: [row.city, row.country].filter(Boolean).join(', '),
        status: row.status as PendingApprovalItem['status'],
      }));
    },
  });

  return {
    approvals: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['admin-pending-approvals'] }),
  };
}
