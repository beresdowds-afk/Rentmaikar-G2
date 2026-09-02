import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InAppMessage {
  id: string;
  sender_name: string;
  category: string;
  subject: string | null;
  body: string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * The signed-in user's in-app inbox. Complements SMS/WhatsApp/email: staff
 * messages land here and are also pushed to the browser/PWA when the user has
 * granted notification permission.
 */
export const useInAppMessages = (limit = 100) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<InAppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await (supabase as never as typeof supabase)
      .from('in_app_messages' as never)
      .select('id, sender_name, category, subject, body, link_url, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) console.error('Failed to load in-app messages:', error);
    setMessages(((data as unknown) as InAppMessage[]) ?? []);
    setIsLoading(false);
  }, [user?.id, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates so a pushed message appears without a refresh.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`in-app-messages-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'in_app_messages', filter: `recipient_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, load]);

  const unreadCount = useMemo(() => messages.filter((m) => !m.read_at).length, [messages]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setMessages((prev) =>
      prev.map((m) => (ids.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m)),
    );
    await supabase.rpc('mark_in_app_messages_read' as never, { _ids: ids } as never);
  }, []);

  const markAllRead = useCallback(
    () => markRead(messages.filter((m) => !m.read_at).map((m) => m.id)),
    [markRead, messages],
  );

  return { messages, unreadCount, isLoading, refresh: load, markRead, markAllRead };
};
