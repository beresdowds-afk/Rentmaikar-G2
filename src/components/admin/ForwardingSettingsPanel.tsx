import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PhoneForwarded, MessageSquare, Mail, Phone, PowerOff, Send, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const FORWARDING_CONFIG_KEY = 'forwarding_config';
export const OUTBOUND_CONFIG_KEY = 'outbound_channel_config';
export const MASTER_ENDPOINT_KEY = 'master_communications_endpoint';
export const LOOP_POLICY_KEY = 'comms_loop_policy';

export interface ForwardingConfig {
  call: boolean;
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
}

interface InboundConfig extends ForwardingConfig {
  /** When on, a channel disabled inbound is also paused outbound. */
  link_outbound?: boolean;
}

interface MasterEndpoint {
  voice: string;
  sms: string;
  whatsapp: string;
}

interface LoopPolicy {
  enabled: boolean;
  max_hops: number;
}

const LOOP_DEFAULTS: LoopPolicy = { enabled: true, max_hops: 3 };

const MASTER_DEFAULTS: MasterEndpoint = {
  voice: '+2349163072576',
  sms: '+2349163072576',
  whatsapp: '+2349163072576',
};

/** Customer-facing aliases — these are never termination points. */
const PUBLIC_NUMBERS: { number: string; role: string; provider: string; published: boolean }[] = [
  { number: '+1 608 384 3932', role: 'USA contact — voice & SMS', provider: 'Twilio (voice) / Sent (SMS)', published: true },
  { number: '+1 380 600 3018', role: 'USA dial-out only — never publish', provider: 'Twilio', published: false },
  { number: '+1 608 548 9220', role: 'USA messaging & WhatsApp', provider: 'Sent.dm', published: true },
  { number: '+234 916 307 2576', role: 'Master Communications Endpoint', provider: 'Sent.dm / Twilio voice', published: true },
];

type ChannelKey = keyof ForwardingConfig;
type RegionKey = 'USA' | 'Nigeria';
type OutboundConfig = Record<RegionKey, ForwardingConfig>;

const DEFAULTS: ForwardingConfig = { call: false, sms: false, whatsapp: false, email: false };
const ALL_ON: ForwardingConfig = { call: true, sms: true, whatsapp: true, email: true };
const OUTBOUND_DEFAULTS: OutboundConfig = { USA: { ...ALL_ON }, Nigeria: { ...ALL_ON } };
const REGIONS: RegionKey[] = ['USA', 'Nigeria'];


const CHANNELS: { key: ChannelKey; label: string; description: string; outboundDescription: string; Icon: typeof Phone }[] = [
  {
    key: 'call',
    label: 'Calls',
    description: 'Inbound calls are bridged to the regional support number, with voicemail fallback.',
    outboundDescription: 'Outgoing VoIP/PSTN calls and IVR campaigns (Twilio).',
    Icon: PhoneForwarded,
  },
  {
    key: 'sms',
    label: 'SMS',
    description: 'Copies of inbound SMS messages are sent to the regional SMS contact.',
    outboundDescription: 'Outgoing SMS notifications and inbox replies (Twilio / Termii).',
    Icon: Phone,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Copies of inbound WhatsApp messages are sent to the regional WhatsApp contact.',
    outboundDescription: 'Outgoing WhatsApp notifications and inbox replies.',
    Icon: MessageSquare,
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Inbound emails are forwarded to the regional support mailbox with reply-to preserved.',
    outboundDescription: 'Outgoing transactional email and inbox replies (Resend).',
    Icon: Mail,
  },
];

export const ForwardingSettingsPanel = () => {
  const [config, setConfig] = useState<InboundConfig>(DEFAULTS);
  const [outbound, setOutbound] = useState<OutboundConfig>(OUTBOUND_DEFAULTS);
  const [master, setMaster] = useState<MasterEndpoint>(MASTER_DEFAULTS);
  const [loopPolicy, setLoopPolicy] = useState<LoopPolicy>(LOOP_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('platform_kv_settings')
        .select('key, value')
        .in('key', [FORWARDING_CONFIG_KEY, OUTBOUND_CONFIG_KEY, MASTER_ENDPOINT_KEY, LOOP_POLICY_KEY]);
      if (error) {
        toast.error('Could not load channel settings');
      } else {
        const rows = (data ?? []) as { key: string; value: unknown }[];
        const inb = rows.find((r) => r.key === FORWARDING_CONFIG_KEY)?.value as Partial<InboundConfig> | undefined;
        const out = rows.find((r) => r.key === OUTBOUND_CONFIG_KEY)?.value as Partial<Record<RegionKey, Partial<ForwardingConfig>>> | undefined;
        const end = rows.find((r) => r.key === MASTER_ENDPOINT_KEY)?.value as Partial<MasterEndpoint> | string | undefined;
        setConfig({ ...DEFAULTS, ...(inb ?? {}) });
        setOutbound({
          USA: { ...ALL_ON, ...(out?.USA ?? {}) },
          Nigeria: { ...ALL_ON, ...(out?.Nigeria ?? {}) },
        });
        if (typeof end === 'string') {
          setMaster({ voice: end, sms: end, whatsapp: end });
        } else if (end) {
          setMaster({ ...MASTER_DEFAULTS, ...end });
        }
        const loop = rows.find((r) => r.key === LOOP_POLICY_KEY)?.value as Partial<LoopPolicy> | undefined;
        if (loop) setLoopPolicy({ ...LOOP_DEFAULTS, ...loop });
      }
      setLoading(false);
    };
    load();
  }, []);


  const persist = async (key: string, value: unknown) => {
    const { error } = await supabase
      .from('platform_kv_settings')
      .upsert({ key, value: value as never }, { onConflict: 'key' });
    return error;
  };

  const toggleLink = async (value: boolean) => {
    const next = { ...config, link_outbound: value };
    setSavingKey('link');
    const error = await persist(FORWARDING_CONFIG_KEY, next);
    setSavingKey(null);
    if (error) {
      toast.error('Failed to update channel sync');
      return;
    }
    setConfig(next);
    toast.success(value ? 'Outbound now follows the inbound toggles' : 'Outbound switches are independent again');
  };

  const toggleInbound = async (key: ChannelKey, value: boolean) => {
    const next = { ...config, [key]: value };
    setSavingKey(`in-${key}`);
    const error = await persist(FORWARDING_CONFIG_KEY, next);
    setSavingKey(null);
    if (error) {
      toast.error('Failed to update forwarding');
      return;
    }
    setConfig(next);
    toast.success(`Inbound ${key} forwarding ${value ? 'enabled' : 'disabled'}`);
  };

  const toggleOutbound = async (region: RegionKey, key: ChannelKey, value: boolean) => {
    const next: OutboundConfig = { ...outbound, [region]: { ...outbound[region], [key]: value } };
    setSavingKey(`out-${region}-${key}`);
    const error = await persist(OUTBOUND_CONFIG_KEY, next);
    setSavingKey(null);
    if (error) {
      toast.error('Failed to update outbound channel');
      return;
    }
    setOutbound(next);
    toast.success(`${region} outbound ${key} ${value ? 'resumed' : 'paused'}`);
  };

  const pauseAll = async (region: RegionKey) => {
    const next: OutboundConfig = { ...outbound, [region]: { call: false, sms: false, whatsapp: false, email: false } };
    setSavingKey(`out-${region}-all`);
    const error = await persist(OUTBOUND_CONFIG_KEY, next);
    setSavingKey(null);
    if (error) {
      toast.error('Failed to pause channels');
      return;
    }
    setOutbound(next);
    toast.success(`All outbound channels paused for ${region}`);
  };

  const saveMaster = async () => {
    const normalise = (v: string) => {
      const digits = v.replace(/[^\d+]/g, '');
      return digits.startsWith('+') ? digits : `+${digits}`;
    };
    const next: MasterEndpoint = {
      voice: normalise(master.voice),
      sms: normalise(master.sms),
      whatsapp: normalise(master.whatsapp),
    };
    if (Object.values(next).some((n) => n.length < 8)) {
      toast.error('Enter each endpoint in full international format');
      return;
    }
    setSavingKey('master');
    const error = await persist(MASTER_ENDPOINT_KEY, next);
    setSavingKey(null);
    if (error) {
      toast.error('Failed to save the master endpoint');
      return;
    }
    setMaster(next);
    toast.success('Master Communications Endpoint updated');
  };

  const saveLoopPolicy = async (next: LoopPolicy) => {
    const hops = Math.min(Math.max(Math.floor(next.max_hops || 0), 1), 10);
    const value: LoopPolicy = { enabled: next.enabled, max_hops: hops };
    setSavingKey('loop');
    const error = await persist(LOOP_POLICY_KEY, value);
    setSavingKey(null);
    if (error) {
      toast.error('Failed to save the loop policy');
      return;
    }
    setLoopPolicy(value);
    toast.success(`Loop policy saved — max ${hops} hop${hops === 1 ? '' : 's'}`);
  };

  const pausedCount = REGIONS.reduce(
    (acc, r) => acc + CHANNELS.filter((c) => outbound[r][c.key] === false).length,
    0,
  );


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PhoneForwarded className="h-4 w-4 text-primary" />
          Channel Control
          {pausedCount > 0 && (
            <Badge variant="destructive">{pausedCount} outbound paused</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Route inbound customer communications, and pause outbound providers per channel and region — no redeploy needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="inbound">
            <TabsList className="mb-4">
              <TabsTrigger value="inbound">Inbound forwarding</TabsTrigger>
              <TabsTrigger value="outbound">Outbound kill-switches</TabsTrigger>
              <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            </TabsList>


            <TabsContent value="inbound" className="space-y-3">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                <div>
                  <span className="font-medium text-sm">Keep outbound in sync with inbound</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When on, any channel switched off here is also paused for outgoing sends in both regions, so a channel
                    is never one-way. Outbound switches still apply on top.
                  </p>
                </div>
                <Switch
                  checked={!!config.link_outbound}
                  disabled={savingKey === 'link'}
                  onCheckedChange={toggleLink}
                />
              </div>

              {CHANNELS.map(({ key, label, description, Icon }) => (
                <div key={key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{label} forwarding</span>
                        <Badge variant={config[key] ? 'default' : 'secondary'}>
                          {config[key] ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={config[key]}
                    disabled={savingKey === `in-${key}`}
                    onCheckedChange={(v) => toggleInbound(key, v)}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Call forwarding requires the inbound voice webhook of the platform number to point at the
                <span className="font-mono"> incoming-call-forward </span> endpoint.
              </p>
            </TabsContent>

            <TabsContent value="outbound" className="space-y-5">
              {REGIONS.map((region) => (
                <div key={region} className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{region}</span>
                      <Badge variant="outline">
                        {CHANNELS.filter((c) => outbound[region][c.key] !== false).length}/4 live
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => pauseAll(region)}
                      disabled={savingKey === `out-${region}-all`}
                      className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      <PowerOff className="h-3 w-3" /> Pause all
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {CHANNELS.map(({ key, label, outboundDescription, Icon }) => {
                      const on = outbound[region][key] !== false;
                      return (
                        <div key={key} className="flex items-start justify-between gap-3 rounded-md border border-border/70 p-2.5">
                          <div className="flex items-start gap-2">
                            <Icon className={`h-4 w-4 mt-0.5 ${on ? 'text-primary' : 'text-muted-foreground'}`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{label}</span>
                                <Badge variant={on ? 'default' : 'destructive'} className="text-[10px]">
                                  {on ? 'Live' : 'Paused'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{outboundDescription}</p>
                            </div>
                          </div>
                          <Switch
                            checked={on}
                            disabled={savingKey === `out-${region}-${key}` || savingKey === `out-${region}-all`}
                            onCheckedChange={(v) => toggleOutbound(region, key, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Pausing a channel stops all outgoing sends for that region immediately — notifications, inbox replies and
                IVR calls return a "paused" result instead of hitting the provider. Verification codes follow the same
                switch, so re-enable SMS before users can sign in by OTP in that region.
              </p>
            </TabsContent>

            <TabsContent value="endpoints" className="space-y-5">
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Master Communications Endpoint</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Public numbers are customer-facing aliases only. Providers hand every inbound conversation to the
                  RentMaikar router, which stores the customer's original number and dispatches its own outbound leg to
                  these endpoints. Nothing is carrier-forwarded.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['voice', 'sms', 'whatsapp'] as const).map((ch) => (
                    <div key={ch} className="space-y-1.5">
                      <Label htmlFor={`master-${ch}`} className="text-xs capitalize">{ch}</Label>
                      <Input
                        id={`master-${ch}`}
                        value={master[ch]}
                        inputMode="tel"
                        placeholder="+2349163072576"
                        onChange={(e) => setMaster({ ...master, [ch]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <Button size="sm" onClick={saveMaster} disabled={savingKey === 'master'}>
                  {savingKey === 'master' && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                  Save endpoints
                </Button>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-sm">Alias loop protection</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Every relayed message carries an end-to-end correlation ID and hop counter. When a relay lands back
                      on one of our aliases the trace is recognised, the hop count increases, and the message is dropped
                      once the ceiling is reached.
                    </p>
                  </div>
                  <Switch
                    checked={loopPolicy.enabled}
                    disabled={savingKey === 'loop'}
                    onCheckedChange={(v) => saveLoopPolicy({ ...loopPolicy, enabled: v })}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="loop-max-hops" className="text-xs">Maximum hops</Label>
                    <Input
                      id="loop-max-hops"
                      type="number"
                      min={1}
                      max={10}
                      className="w-28"
                      value={loopPolicy.max_hops}
                      onChange={(e) => setLoopPolicy({ ...loopPolicy, max_hops: Number(e.target.value) })}
                    />
                  </div>
                  <Button size="sm" onClick={() => saveLoopPolicy(loopPolicy)} disabled={savingKey === 'loop'}>
                    {savingKey === 'loop' && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                    Save policy
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2">
                <span className="font-medium text-sm">Public number registry</span>
                {PUBLIC_NUMBERS.map((n) => (
                  <div key={n.number} className="flex items-start justify-between gap-3 rounded-md border border-border/70 p-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono">{n.number}</span>
                        <Badge variant={n.published ? 'default' : 'destructive'} className="text-[10px]">
                          {n.published ? 'Published' : 'Internal only'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.role}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{n.provider}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Twilio carries voice only. SMS and WhatsApp route through Sent.dm (Termii for Nigeria).
                </p>
              </div>
            </TabsContent>
          </Tabs>

        )}
      </CardContent>
    </Card>
  );
};

export default ForwardingSettingsPanel;
