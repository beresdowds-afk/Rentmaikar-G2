import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const EVENT_CATEGORIES = [
  { value: 'applications', label: 'Applications & registration' },
  { value: 'onboarding', label: 'Onboarding & access' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'payments', label: 'Payments' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'legal_agreements', label: 'Legal agreements' },
  { value: 'rent_to_own', label: 'Rent to own' },
  { value: 'negotiations', label: 'Price negotiations' },
  { value: 'bookings', label: 'Booking requests' },
  { value: 'vehicle_listings', label: 'Vehicle listings & reviews' },
  { value: 'payouts', label: 'Payouts' },
  { value: 'withdrawals', label: 'Withdrawals' },
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number]['value'];

export interface EventNotificationPreference {
  category: string;
  in_app: boolean;
  email: boolean;
  push: boolean;
  sms: boolean;
  slack: boolean;
  webhook: boolean;
  slack_webhook_url: string | null;
  webhook_url: string | null;
  webhook_secret?: string | null;
}

const defaults = (category: string): EventNotificationPreference => ({
  category,
  in_app: true,
  email: true,
  push: true,
  sms: false,
  slack: false,
  webhook: false,
  slack_webhook_url: null,
  webhook_url: null,
  webhook_secret: null,
});

/** Per-event-category channel preferences (in-app, email, push, Slack, webhook). */
export function useEventNotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, EventNotificationPreference>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('event_notification_preferences')
      .select('*')
      .eq('user_id', user.id);

    const map: Record<string, EventNotificationPreference> = {};
    EVENT_CATEGORIES.forEach((c) => {
      map[c.value] = defaults(c.value);
    });
    if (!error && data) {
      data.forEach((row) => {
        map[row.category] = {
          category: row.category,
          in_app: row.in_app,
          email: row.email,
          push: (row as { push?: boolean }).push ?? true,
          sms: (row as { sms?: boolean }).sms ?? false,
          slack: row.slack,
          webhook: row.webhook,
          slack_webhook_url: row.slack_webhook_url,
          webhook_url: row.webhook_url,
          webhook_secret: (row as { webhook_secret?: string | null }).webhook_secret ?? null,
        };
      });
    }
    setPrefs(map);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const savePreference = useCallback(
    async (category: string, patch: Partial<EventNotificationPreference>) => {
      if (!user?.id) return;
      const next = { ...(prefs[category] ?? defaults(category)), ...patch };
      setPrefs((prev) => ({ ...prev, [category]: next }));
      setSaving(true);
      const { error } = await supabase.from('event_notification_preferences').upsert(
        {
          user_id: user.id,
          category,
          in_app: next.in_app,
          email: next.email,
          push: next.push,
          sms: next.sms,
          slack: next.slack,
          webhook: next.webhook,
          slack_webhook_url: next.slack_webhook_url || null,
          webhook_url: next.webhook_url || null,
        },
        { onConflict: 'user_id,category' },
      );
      setSaving(false);
      if (error) {
        toast.error('Could not save notification preferences');
        load();
      }
    },
    [prefs, user?.id, load],
  );

  return { prefs, loading, saving, savePreference, reload: load };
}
