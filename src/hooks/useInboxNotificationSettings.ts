import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const INBOX_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook_messenger', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'google_chat', label: 'Google Chat' },
  { value: 'tiktok', label: 'TikTok' },
] as const;

export const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'] as const;
export type InboxPriority = (typeof PRIORITY_ORDER)[number];

export interface InboxNotificationSetting {
  id?: string;
  channel: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  alert_email: string | null;
  min_priority: InboxPriority;
}

const defaultSetting = (channel: string): InboxNotificationSetting => ({
  channel,
  in_app_enabled: true,
  email_enabled: false,
  alert_email: null,
  min_priority: 'normal',
});

export const meetsPriority = (priority: string | null | undefined, min: string) => {
  const p = PRIORITY_ORDER.indexOf((priority || 'normal') as InboxPriority);
  const m = PRIORITY_ORDER.indexOf((min || 'normal') as InboxPriority);
  return p >= 0 && m >= 0 ? p >= m : true;
};

export const useInboxNotificationSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, InboxNotificationSetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('inbox_notification_settings')
      .select('*')
      .eq('user_id', user.id);

    const map: Record<string, InboxNotificationSetting> = {};
    INBOX_CHANNELS.forEach((c) => {
      map[c.value] = defaultSetting(c.value);
    });
    if (!error && data) {
      data.forEach((row: any) => {
        map[row.channel] = {
          id: row.id,
          channel: row.channel,
          in_app_enabled: row.in_app_enabled,
          email_enabled: row.email_enabled,
          alert_email: row.alert_email,
          min_priority: row.min_priority as InboxPriority,
        };
      });
    }
    setSettings(map);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSetting = useCallback(
    async (channel: string, patch: Partial<InboxNotificationSetting>) => {
      if (!user?.id) return;
      const next = { ...(settings[channel] || defaultSetting(channel)), ...patch };
      setSettings((prev) => ({ ...prev, [channel]: next }));
      setSaving(true);
      const { error } = await supabase.from('inbox_notification_settings').upsert(
        {
          user_id: user.id,
          channel,
          in_app_enabled: next.in_app_enabled,
          email_enabled: next.email_enabled,
          alert_email: next.alert_email || null,
          min_priority: next.min_priority,
        },
        { onConflict: 'user_id,channel' },
      );
      setSaving(false);
      if (error) {
        toast.error('Could not save notification settings');
        load();
      }
    },
    [settings, user?.id, load],
  );

  return { settings, loading, saving, saveSetting, reload: load };
};
