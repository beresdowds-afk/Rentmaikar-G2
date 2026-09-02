import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Phone, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Channel = 'sms' | 'whatsapp';

const CHANNELS: { key: Channel; label: string; description: string; icon: typeof Phone }[] = [
  {
    key: 'sms',
    label: 'SMS text messages',
    description: 'Payment reminders, rental updates and support replies by text.',
    icon: Phone,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp messages',
    description: 'The same updates delivered through WhatsApp.',
    icon: MessageSquare,
  },
];

export function MessagingPreferencesPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Channel | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState<Record<Channel, boolean>>({
    sms: false,
    whatsapp: false,
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_messaging_preferences');
    if (error) {
      toast({
        title: 'Could not load preferences',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      const rows = (data ?? []) as { phone: string; channel: string; opted_out: boolean }[];
      setPhone(rows[0]?.phone ?? null);
      setOptedOut({
        sms: rows.find((r) => r.channel === 'sms')?.opted_out ?? false,
        whatsapp: rows.find((r) => r.channel === 'whatsapp')?.opted_out ?? false,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const [pending, setPending] = useState<{ channel: Channel; enabled: boolean } | null>(null);

  const applyToggle = async (channel: Channel, enabled: boolean) => {
    const previous = optedOut[channel];
    setOptedOut((s) => ({ ...s, [channel]: !enabled }));
    setSaving(channel);
    const { error } = await supabase.rpc('set_my_messaging_preference', {
      _channel: channel,
      _opted_out: !enabled,
    });
    setSaving(null);
    if (error) {
      setOptedOut((s) => ({ ...s, [channel]: previous }));
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: enabled ? 'Messages turned on' : 'Messages turned off',
      description: enabled
        ? `You will receive ${channel === 'sms' ? 'SMS' : 'WhatsApp'} messages again.`
        : `We will stop sending ${channel === 'sms' ? 'SMS' : 'WhatsApp'} messages.`,
    });
    void load();
  };

  const toggle = (channel: Channel, enabled: boolean) => setPending({ channel, enabled });

  const pendingLabel = pending
    ? CHANNELS.find((c) => c.key === pending.channel)?.label ?? pending.channel
    : '';


  return (
    <Card>
      <CardHeader>
        <CardTitle>Messaging preferences</CardTitle>
        <CardDescription>
          Choose how we contact you. Email notifications are required for account, payment and legal
          notices and cannot be switched off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your preferences…
          </div>
        ) : !phone ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Add a phone number in{' '}
              <Link to="/settings/profile" className="underline">
                Profile Settings
              </Link>{' '}
              to manage SMS and WhatsApp preferences.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Applies to
              <Badge variant="secondary" className="font-mono">
                {phone}
              </Badge>
            </div>

            {CHANNELS.map(({ key, label, description, icon: Icon }) => (
              <div
                key={key}
                className="flex items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <Label
                    htmlFor={`channel-${key}`}
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                  {optedOut[key] && (
                    <p className="text-xs text-destructive">
                      You are opted out. Reply START on {key === 'sms' ? 'SMS' : 'WhatsApp'} or turn
                      this back on to resume.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {saving === key && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Switch
                    id={`channel-${key}`}
                    checked={!optedOut[key]}
                    disabled={saving !== null}
                    onCheckedChange={(checked) => toggle(key, checked)}
                    aria-label={`Receive ${label}`}
                  />
                </div>
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              You can also text STOP to opt out or START to opt back in at any time. If you change
              your phone number, these choices move with you to the new number.
            </p>
          </>
        )}
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.enabled ? `Turn on ${pendingLabel}?` : `Turn off ${pendingLabel}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.enabled
                ? `We will start sending ${pendingLabel.toLowerCase()} to ${phone ?? 'your phone number'} again, including payment reminders and rental updates.`
                : `We will stop sending ${pendingLabel.toLowerCase()} to ${phone ?? 'your phone number'}. You may miss payment reminders and rental updates. Essential emails will still be sent.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) void applyToggle(pending.channel, pending.enabled);
                setPending(null);
              }}
            >
              {pending?.enabled ? 'Turn on' : 'Turn off'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default MessagingPreferencesPanel;
