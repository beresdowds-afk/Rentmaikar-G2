import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, FlaskConical, Route, Send, PhoneCall } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';

type TestChannel = 'sms' | 'whatsapp' | 'call';

interface Routing {
  channel: TestChannel;
  to: string;
  region: string;
  sender: string;
  caller_id: string | null;
  forwarding_enabled: boolean;
  inbound_endpoint: string | null;
  master_endpoint: string;
  provider: string;
}

interface TestResponse {
  ok: boolean;
  dry_run?: boolean;
  routing?: Routing;
  result?: Record<string, unknown>;
  error?: string;
}

const DEFAULT_MESSAGE = 'RentMaikar routing test — no action needed.';

export const CommsTestConsolePanel = () => {
  const [channel, setChannel] = useState<TestChannel>('sms');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [outcome, setOutcome] = useState<TestResponse | null>(null);

  const run = async (dryRun: boolean) => {
    if (!/^\+[1-9]\d{6,14}$/.test(to.trim())) {
      toast.error('Enter the destination in full international format, e.g. +16085489220');
      return;
    }
    setBusy(dryRun ? 'preview' : 'send');
    setOutcome(null);
    try {
      const { data, error } = await supabase.functions.invoke<TestResponse>('comms-test-console', {
        body: { channel, to: to.trim(), message, dry_run: dryRun },
      });
      if (error) {
        const details =
          error instanceof FunctionsHttpError ? await error.context.text() : error.message;
        let parsed: TestResponse | null = null;
        try {
          parsed = JSON.parse(details) as TestResponse;
        } catch {
          parsed = null;
        }
        if (parsed?.routing) setRouting(parsed.routing);
        setOutcome(parsed ?? { ok: false, error: details });
        toast.error(parsed?.error ?? 'Test failed');
        return;
      }
      if (data?.routing) setRouting(data.routing);
      setOutcome(data ?? null);
      toast.success(
        dryRun
          ? 'Routing resolved'
          : channel === 'call'
            ? 'Test call placed'
            : `Test ${channel === 'whatsapp' ? 'WhatsApp message' : 'SMS'} sent`,
      );
    } finally {
      setBusy(null);
    }
  };

  const rows: { label: string; value: string }[] = routing
    ? [
        { label: 'Region', value: routing.region },
        {
          label: routing.channel === 'call' ? 'Caller ID' : 'Public sender',
          value: routing.caller_id ?? routing.sender,
        },
        { label: 'Provider', value: routing.provider === 'sent' ? 'Sent.dm' : 'Twilio (voice)' },
        { label: 'Inbound forwarding', value: routing.forwarding_enabled ? 'Enabled' : 'Disabled' },
        { label: 'Routing endpoint', value: routing.inbound_endpoint ?? 'not configured' },
        { label: 'Master endpoint', value: routing.master_endpoint },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" />
          Communications test console
        </CardTitle>
        <CardDescription>
          Send one live SMS or WhatsApp message, or place a short voice test call, and confirm the
          routing endpoint and caller ID RentMaikar would present.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as TestChannel)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sms">SMS</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="call">Voice call</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="test-to" className="text-xs">Destination number</Label>
          <Input
            id="test-to"
            value={to}
            inputMode="tel"
            placeholder="+16085489220"
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="test-message" className="text-xs">
            {channel === 'call' ? 'Spoken message' : 'Message body'}
          </Label>
          <Textarea
            id="test-message"
            rows={3}
            maxLength={480}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => run(true)} disabled={busy !== null}>
            {busy === 'preview' ? (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            ) : (
              <Route className="h-3.5 w-3.5 mr-2" />
            )}
            Resolve routing
          </Button>
          <Button size="sm" onClick={() => run(false)} disabled={busy !== null}>
            {busy === 'send' ? (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            ) : channel === 'call' ? (
              <PhoneCall className="h-3.5 w-3.5 mr-2" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-2" />
            )}
            {channel === 'call' ? 'Place test call' : 'Send test message'}
          </Button>
        </div>

        {routing && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Resolved routing</span>
              {outcome && (
                <Badge variant={outcome.ok ? 'default' : 'destructive'} className="text-[10px]">
                  {outcome.dry_run ? 'Preview only' : outcome.ok ? 'Delivered to provider' : 'Failed'}
                </Badge>
              )}
            </div>
            <dl className="grid gap-1.5 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">{r.label}</dt>
                  <dd className="text-xs font-mono text-right">{r.value}</dd>
                </div>
              ))}
            </dl>
            {outcome?.error && (
              <p className="text-xs text-destructive break-words">{outcome.error}</p>
            )}
            {outcome?.result && (
              <pre className="text-[11px] bg-muted rounded-md p-2 overflow-x-auto">
                {JSON.stringify(outcome.result, null, 2)}
              </pre>
            )}
            <p className="text-xs text-muted-foreground">
              Messaging dispatches through Sent.dm; Twilio carries voice only. Test sends are logged
              in the messaging events feed with purpose <span className="font-mono">admin_test_console</span>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
