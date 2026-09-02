import { useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TraceRow {
  id: string;
  created_at: string;
  channel: string;
  provider: string | null;
  event_type: string;
  recipient: string | null;
  error_message: string | null;
}

/**
 * Live SMS / WhatsApp test: sends a real message through the production
 * routing chain (Sent first, regional fallback), then reads back the
 * `messaging_events` trace so the admin can confirm inbox + delivery status
 * without leaving the delivery page.
 */
export default function LiveSmsTestPanel({ onSent }: { onSent?: () => void }) {
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [message, setMessage] = useState(
    'Rentmaikar test message — please ignore. Reply STOP to opt out.',
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [trace, setTrace] = useState<TraceRow[]>([]);

  const loadTrace = async (recipient: string) => {
    const { data } = await supabase
      .from('messaging_events')
      .select('id, created_at, channel, provider, event_type, recipient, error_message')
      .eq('recipient', recipient)
      .order('created_at', { ascending: false })
      .limit(10);
    setTrace((data ?? []) as TraceRow[]);
  };

  const send = async () => {
    const to = phone.replace(/\s/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(to)) {
      toast.error('Enter the number in international format, e.g. +18482035389');
      return;
    }
    setSending(true);
    setResult(null);
    setTrace([]);
    try {
      const { data, error } = await supabase.functions.invoke('send-sms-notification', {
        body: {
          phone: to,
          channel,
          notificationType: 'general',
          customMessage: message,
        },
      });
      if (error) throw error;
      setResult(data as Record<string, unknown>);
      if ((data as { success?: boolean })?.success === false) {
        toast.error((data as { error?: string })?.error ?? 'Provider rejected the message');
      } else {
        toast.success(`Test ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} dispatched`);
      }
      // Give the provider a moment to record the first lifecycle event.
      await new Promise((r) => setTimeout(r, 1500));
      await loadTrace(to);
      onSent?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Send failed';
      setResult({ error: msg });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> Live SMS / WhatsApp test
        </CardTitle>
        <CardDescription>
          Sends a real message through the live routing chain, then shows the resulting
          delivery events. Replies land in the admin inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <div className="space-y-1.5">
            <Label htmlFor="test-phone">Recipient (international format)</Label>
            <Input
              id="test-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+18482035389"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as 'sms' | 'whatsapp')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="test-body">Message</Label>
          <Textarea
            id="test-body"
            rows={3}
            value={message}
            maxLength={480}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <Button onClick={send} disabled={sending || !message.trim()}>
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send test message
        </Button>

        {result && (
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}

        {trace.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Delivery trace</p>
            {trace.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-xs"
              >
                <Badge variant={t.event_type === 'failed' ? 'destructive' : 'secondary'}>
                  {t.event_type}
                </Badge>
                <span className="text-muted-foreground">{t.channel}</span>
                <span className="text-muted-foreground">{t.provider ?? '—'}</span>
                <span className="text-muted-foreground">
                  {new Date(t.created_at).toLocaleString()}
                </span>
                {t.error_message && (
                  <span className="text-destructive">{t.error_message}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
