import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Bell, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Frequency = 'realtime' | 'daily_digest' | 'off';

/**
 * Lets the user choose how often they get emailed about Persona identity
 * verification status changes. In-app inbox + realtime toasts always fire —
 * this only controls the outbound email cadence.
 */
export function PersonaNotificationPreference() {
  const { user } = useAuth();
  const [value, setValue] = useState<Frequency>('realtime');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('persona_notification_frequency')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const v = (data as { persona_notification_frequency?: Frequency } | null)?.persona_notification_frequency;
      if (v) setValue(v);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const update = async (next: Frequency) => {
    if (!user || next === value) return;
    setSaving(true);
    setValue(next);
    const { error } = await supabase
      .from('profiles')
      .update({ persona_notification_frequency: next })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Could not save notification preference');
      return;
    }
    toast.success('Notification preference updated');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Verification email notifications
        </CardTitle>
        <CardDescription>
          Choose how often we email you about identity verification status changes.
          In-app notifications always appear regardless of this setting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <RadioGroup value={value} onValueChange={(v) => update(v as Frequency)} disabled={saving}>
            <div className="flex items-start gap-3">
              <RadioGroupItem id="pnf-realtime" value="realtime" />
              <div>
                <Label htmlFor="pnf-realtime" className="font-medium">Real-time (recommended)</Label>
                <p className="text-xs text-muted-foreground">Email me on every status change.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem id="pnf-digest" value="daily_digest" />
              <div>
                <Label htmlFor="pnf-digest" className="font-medium">Daily digest</Label>
                <p className="text-xs text-muted-foreground">Send one summary email per day with all status changes.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem id="pnf-off" value="off" />
              <div>
                <Label htmlFor="pnf-off" className="font-medium">Off</Label>
                <p className="text-xs text-muted-foreground">In-app notifications only, no verification emails.</p>
              </div>
            </div>
          </RadioGroup>
        )}
      </CardContent>
    </Card>
  );
}

export default PersonaNotificationPreference;
