import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Server, Save, PlugZap, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const KV_KEY = 'emqx_management_config';

type DeploymentType = 'serverless' | 'dedicated' | 'self_hosted';

interface EndpointConfig {
  management_host: string;
  management_port: string;
  api_base_path: string;
  api_url: string;
  mqtt_host: string;
  mqtt_port: string;
  management_enabled: boolean;
  deployment_type: DeploymentType;
}

const EMPTY: EndpointConfig = {
  management_host: '',
  management_port: '8443',
  api_base_path: '/api/v5',
  api_url: '',
  mqtt_host: '',
  mqtt_port: '8883',
  management_enabled: true,
  deployment_type: 'serverless',
};

const buildUrl = (c: EndpointConfig) => {
  if (c.api_url.trim()) return c.api_url.trim().replace(/\/$/, '');
  if (!c.management_host.trim()) return '';
  const host = c.management_host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const path = c.api_base_path.startsWith('/') ? c.api_base_path : `/${c.api_base_path}`;
  return `https://${host}${c.management_port ? `:${c.management_port}` : ''}${path}`;
};

interface ProbeState {
  ok: boolean;
  reason?: string;
  hint?: string;
  detail?: string;
}

export function EmqxEndpointSettings() {
  const [cfg, setCfg] = useState<EndpointConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<ProbeState | null>(null);
  const [effective, setEffective] = useState<Record<string, unknown> | null>(null);

  const set = <K extends keyof EndpointConfig>(k: K, v: EndpointConfig[K]) =>
    setCfg((prev) => ({ ...prev, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_kv_settings')
      .select('value')
      .eq('key', KV_KEY)
      .maybeSingle();
    const v = (data?.value ?? null) as Partial<Record<keyof EndpointConfig, unknown>> | null;
    if (v) {
      setCfg({
        management_host: String(v.management_host ?? ''),
        management_port: v.management_port != null ? String(v.management_port) : '8443',
        api_base_path: String(v.api_base_path ?? '/api/v5'),
        api_url: String(v.api_url ?? ''),
        mqtt_host: String(v.mqtt_host ?? ''),
        mqtt_port: v.mqtt_port != null ? String(v.mqtt_port) : '8883',
        management_enabled: v.management_enabled !== false,
        deployment_type: (v.deployment_type as DeploymentType) ?? 'serverless',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        management_host: cfg.management_host.trim() || null,
        management_port: cfg.management_port ? Number(cfg.management_port) : null,
        api_base_path: cfg.api_base_path.trim() || '/api/v5',
        api_url: buildUrl(cfg) || null,
        mqtt_host: cfg.mqtt_host.trim() || null,
        mqtt_port: cfg.mqtt_port ? Number(cfg.mqtt_port) : null,
        management_enabled: cfg.management_enabled,
        deployment_type: cfg.deployment_type,
      };
      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert({ key: KV_KEY, value: payload }, { onConflict: 'key' });
      if (error) throw error;
      toast.success('EMQX endpoint settings saved — functions pick them up on the next call');
      setProbe(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setProbe(null);
    try {
      const { data, error } = await supabase.functions.invoke('emqx-monitoring', {
        body: { action: 'stats' },
      });
      if (error) throw new Error(error.message);
      setEffective((data?.config as Record<string, unknown>) ?? null);
      if (data?.unavailable) {
        setProbe({ ok: false, reason: data.reason, hint: data.hint });
      } else if (data?.success) {
        setProbe({ ok: true, detail: 'Management API reachable — live broker metrics available.' });
      } else {
        setProbe({ ok: false, reason: 'unknown_response', hint: 'The monitoring endpoint returned an unexpected payload.' });
      }
    } catch (e) {
      setProbe({ ok: false, reason: 'request_failed', hint: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const preview = buildUrl(cfg);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          EMQX management &amp; monitoring endpoints
        </CardTitle>
        <CardDescription>
          Point monitoring at the deployment-specific management host. Serverless deployments do not
          expose <code>/api/v5</code> on the public console host — use the deployment API host (usually port 8443).
          The API key &amp; secret are managed separately in the credential rotation panel below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="font-medium">Management API polling</Label>
                <p className="text-sm text-muted-foreground">
                  Turn off if your plan has no management API. Dashboards degrade gracefully; device
                  telemetry over MQTT keeps working.
                </p>
              </div>
              <Switch
                checked={cfg.management_enabled}
                onCheckedChange={(v) => set('management_enabled', v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emqx-deployment">Deployment type</Label>
                <Select
                  value={cfg.deployment_type}
                  onValueChange={(v) => set('deployment_type', v as DeploymentType)}
                >
                  <SelectTrigger id="emqx-deployment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="serverless">Serverless</SelectItem>
                    <SelectItem value="dedicated">Dedicated / Professional</SelectItem>
                    <SelectItem value="self_hosted">Self-hosted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emqx-mgmt-host">Management host</Label>
                <Input
                  id="emqx-mgmt-host"
                  placeholder="xxxxxxx.ala.eu-central-1.emqxsl.com"
                  value={cfg.management_host}
                  onChange={(e) => set('management_host', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emqx-mgmt-port">Management port</Label>
                <Input
                  id="emqx-mgmt-port"
                  inputMode="numeric"
                  placeholder="8443"
                  value={cfg.management_port}
                  onChange={(e) => set('management_port', e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emqx-base-path">API base path</Label>
                <Input
                  id="emqx-base-path"
                  placeholder="/api/v5"
                  value={cfg.api_base_path}
                  onChange={(e) => set('api_base_path', e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emqx-api-url">Full API URL override (optional)</Label>
                <Input
                  id="emqx-api-url"
                  placeholder="https://host:8443/api/v5"
                  value={cfg.api_url}
                  onChange={(e) => set('api_url', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Effective URL: <span className="font-mono">{preview || '— not configured —'}</span>
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emqx-mqtt-host">MQTT broker host</Label>
                <Input
                  id="emqx-mqtt-host"
                  placeholder="xxxxxxx.ala.eu-central-1.emqxsl.com"
                  value={cfg.mqtt_host}
                  onChange={(e) => set('mqtt_host', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emqx-mqtt-port">MQTT port</Label>
                <Input
                  id="emqx-mqtt-port"
                  inputMode="numeric"
                  placeholder="8883"
                  value={cfg.mqtt_port}
                  onChange={(e) => set('mqtt_port', e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>

            {probe && (
              <Alert variant={probe.ok ? 'default' : 'destructive'}>
                {probe.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle>
                  {probe.ok ? 'Management API reachable' : `Unavailable — ${probe.reason}`}
                </AlertTitle>
                <AlertDescription>{probe.hint || probe.detail}</AlertDescription>
              </Alert>
            )}

            {effective && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">source: {String(effective.config_source)}</Badge>
                <Badge variant="outline">credentials: {String(effective.credentials_source ?? 'none')}</Badge>
                <Badge variant="outline">url: {String(effective.api_url)}</Badge>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save endpoints
              </Button>
              <Button variant="outline" onClick={test} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Test connection
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default EmqxEndpointSettings;
