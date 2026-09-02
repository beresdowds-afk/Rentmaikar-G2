import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BellRing, CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const CONFIG_KEY = 'provider_alert_config';

export interface ProviderAlertConfig {
  enabled: boolean;
  window_hours: number;
  min_sample: number;
  error_rate_threshold: number;
  critical_rate_threshold: number;
  webhook_failure_threshold: number;
  cooldown_minutes: number;
  email_enabled: boolean;
  email_recipients: string[];
  slack_webhook_url: string | null;
  webhook_url: string | null;
}

const DEFAULTS: ProviderAlertConfig = {
  enabled: true,
  window_hours: 1,
  min_sample: 20,
  error_rate_threshold: 0.2,
  critical_rate_threshold: 0.4,
  webhook_failure_threshold: 5,
  cooldown_minutes: 60,
  email_enabled: true,
  email_recipients: [],
  slack_webhook_url: null,
  webhook_url: null,
};

const clampWindow = (n: number) => Math.min(6, Math.max(1, Math.round(n) || 1));

export const ProviderAlertSettings = () => {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ProviderAlertConfig | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['provider-alert-config'],
    queryFn: async (): Promise<ProviderAlertConfig> => {
      const { data } = await supabase
        .from('platform_kv_settings')
        .select('value')
        .eq('key', CONFIG_KEY)
        .maybeSingle();
      return { ...DEFAULTS, ...((data?.value as Partial<ProviderAlertConfig>) ?? {}) };
    },
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['provider-health-alerts'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('provider_health_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (next: ProviderAlertConfig) => {
      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert({ key: CONFIG_KEY, value: next as never }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Alert settings saved');
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['provider-alert-config'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('provider_health_alerts')
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: session.user?.id ?? null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['provider-health-alerts'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const value = draft ?? config ?? DEFAULTS;
  const patch = (p: Partial<ProviderAlertConfig>) => setDraft({ ...value, ...p });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          Automatic Provider Alerts
        </CardTitle>
        <CardDescription>
          Raise admin alerts (in-app, email, Slack, webhook) when Twilio, Termii or Resend
          delivery/bounce error rates spike, or when webhook callbacks start failing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Monitoring enabled</p>
                <p className="text-xs text-muted-foreground">
                  Checks run hourly against the selected lookback window.
                </p>
              </div>
              <Switch checked={value.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="window">Lookback window (1–6 hours)</Label>
                <Input
                  id="window"
                  type="number"
                  min={1}
                  max={6}
                  value={value.window_hours}
                  onChange={(e) => patch({ window_hours: clampWindow(Number(e.target.value)) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minsample">Minimum messages before alerting</Label>
                <Input
                  id="minsample"
                  type="number"
                  min={1}
                  value={value.min_sample}
                  onChange={(e) => patch({ min_sample: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="warn">Warning error rate (%)</Label>
                <Input
                  id="warn"
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(value.error_rate_threshold * 100)}
                  onChange={(e) =>
                    patch({ error_rate_threshold: Math.min(1, Math.max(0.01, Number(e.target.value) / 100)) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crit">Critical error rate (%)</Label>
                <Input
                  id="crit"
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(value.critical_rate_threshold * 100)}
                  onChange={(e) =>
                    patch({ critical_rate_threshold: Math.min(1, Math.max(0.01, Number(e.target.value) / 100)) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hookfail">Webhook failures before alerting</Label>
                <Input
                  id="hookfail"
                  type="number"
                  min={1}
                  value={value.webhook_failure_threshold}
                  onChange={(e) =>
                    patch({ webhook_failure_threshold: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cooldown">Cooldown between repeats (minutes)</Label>
                <Input
                  id="cooldown"
                  type="number"
                  min={5}
                  value={value.cooldown_minutes}
                  onChange={(e) => patch({ cooldown_minutes: Math.max(5, Number(e.target.value) || 5) })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Email admins</p>
                  <p className="text-xs text-muted-foreground">
                    Leave recipients empty to notify every admin account.
                  </p>
                </div>
                <Switch
                  checked={value.email_enabled}
                  onCheckedChange={(v) => patch({ email_enabled: v })}
                />
              </div>
              <Input
                placeholder="ops@rentmaikar.com, alerts@rentmaikar.com"
                value={value.email_recipients.join(', ')}
                onChange={(e) =>
                  patch({
                    email_recipients: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <div className="space-y-1.5">
                <Label htmlFor="slack">Slack incoming webhook URL</Label>
                <Input
                  id="slack"
                  placeholder="https://hooks.slack.com/services/..."
                  value={value.slack_webhook_url ?? ''}
                  onChange={(e) => patch({ slack_webhook_url: e.target.value.trim() || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hook">Custom webhook URL (JSON POST)</Label>
                <Input
                  id="hook"
                  placeholder="https://example.com/hooks/rentmaikar-alerts"
                  value={value.webhook_url ?? ''}
                  onChange={(e) => patch({ webhook_url: e.target.value.trim() || null })}
                />
              </div>
            </div>

            <Button
              onClick={() => save.mutate(value)}
              disabled={!draft || save.isPending}
              size="sm"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save alert settings
            </Button>

            <div>
              <div className="flex items-center gap-2 mb-2">
                {alerts?.length ? (
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
                <span className="text-sm font-medium">
                  {alerts?.length ? `Raised alerts (${alerts.length})` : 'No provider alerts raised'}
                </span>
              </div>
              {alertsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                !!alerts?.length && (
                  <ScrollArea className="h-56 rounded-md border border-border">
                    <div className="divide-y divide-border">
                      {alerts.map((a) => (
                        <div key={a.id} className="p-2.5 text-xs space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={a.severity === 'critical' ? 'destructive' : 'outline'}
                              className="text-[10px] uppercase"
                            >
                              {a.severity}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">{a.provider}</Badge>
                            <span className="text-muted-foreground ml-auto">
                              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-foreground break-words">{a.message}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              Sent via: {(a.notified_channels ?? []).join(', ') || 'none'}
                            </span>
                            {a.acknowledged_at ? (
                              <Badge variant="outline" className="text-[10px]">Acknowledged</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px] ml-auto"
                                onClick={() => acknowledge.mutate(a.id)}
                              >
                                Acknowledge
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ProviderAlertSettings;
