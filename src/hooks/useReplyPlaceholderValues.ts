import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PlaceholderValues } from '@/lib/reply-placeholders';

/**
 * Resolves live placeholder values (customer, vehicle, booking dates) for a
 * conversation so canned replies can be personalised before sending.
 */
export const useReplyPlaceholderValues = (conversationId?: string | null) => {
  const { data, isLoading } = useQuery({
    queryKey: ['reply-placeholder-values', conversationId],
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: async (): Promise<PlaceholderValues> => {
      const { data, error } = await supabase.rpc('get_reply_placeholder_values', {
        _conversation_id: conversationId as string,
      });
      if (error) throw error;
      return (data as PlaceholderValues) || {};
    },
  });

  return { values: data ?? {}, isLoading };
};
