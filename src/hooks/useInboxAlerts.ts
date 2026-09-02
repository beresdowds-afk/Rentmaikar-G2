import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { meetsPriority, useInboxNotificationSettings } from '@/hooks/useInboxNotificationSettings';

/**
 * Fires in-app alerts for inbound inbox messages according to the
 * per-channel notification settings of the current staff user.
 */
export const useInboxAlerts = () => {
  const { settings } = useInboxNotificationSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const channel = supabase
      .channel('inbox-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages' },
        async (payload) => {
          const message: any = payload.new;
          if (message?.direction && message.direction !== 'inbound') return;

          const { data: conversation } = await supabase
            .from('inbox_conversations')
            .select('id, channel, priority, subject, user_email, user_phone')
            .eq('id', message.conversation_id)
            .maybeSingle();

          if (!conversation) return;
          const setting = settingsRef.current[conversation.channel as string];
          if (!setting?.in_app_enabled) return;
          if (!meetsPriority((conversation as any).priority, setting.min_priority)) return;

          toast.message(`New ${conversation.channel} message`, {
            description:
              (conversation as any).subject ||
              (conversation as any).user_email ||
              (conversation as any).user_phone ||
              'Open the unified inbox to reply',
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
};
