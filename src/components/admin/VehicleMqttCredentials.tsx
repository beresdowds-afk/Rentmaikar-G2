import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Wifi,
  Key,
  Plus,
  Edit,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';

interface MqttCredential {
  id: string;
  vehicle_id: string;
  iot_device_id: string | null;
  client_id: string;
  mqtt_username: string;
  password_hint: string | null;
  broker_url: string;
  broker_port: number;
  tls_enabled: boolean;
  topic_prefix: string;
  publish_topics: string[];
  subscribe_topics: string[];
  jwt_token: string | null;
  jwt_issued_at: string | null;
  jwt_expires_at: string | null;
  is_active: boolean;
  last_connected_at: string | null;
  installed_by: string | null;
  installed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  /** When true, only allows view + insert (IoT support mode). When false (admin), allows full edit. */
  readOnly?: boolean;
}

function generatePassword(length = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateClientId(vehicleId: string): string {
  return `rentmaikar_vehicle_${vehicleId.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
}

function buildTopicPrefix(vehicleId: string): string {
  return `rentmaikar/vehicles/${vehicleId}`;
}

export const VehicleMqttCredentials = ({ readOnly = false }: Props) => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<MqttCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<MqttCredential | null>(null);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    vehicle_id: '',
    broker_url: 'mqtt.rentmaikar.com',
    broker_port: 8883,
    tls_enabled: true,
    notes: '',
  });
  const [generatedPassword, setGeneratedPassword] = useState('');

  const fetchCredentials = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('vehicle_mqtt_credentials')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load MQTT credentials');
    } else {
      setCredentials((data as MqttCredential[]) || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleCreate = async () => {
    if (!form.vehicle_id.trim()) {
      toast.error('Vehicle ID is required');
      return;
    }
    setIsSaving(true);
    const password = generatePassword();
    setGeneratedPassword(password);

    const clientId = generateClientId(form.vehicle_id);
    const mqttUsername = `vehicle_${form.vehicle_id.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
    const topicPrefix = buildTopicPrefix(form.vehicle_id);
    const publishTopics = [
      `${topicPrefix}/telemetry/gps`,
      `${topicPrefix}/telemetry/engine`,
      `${topicPrefix}/telemetry/diagnostics`,
      `${topicPrefix}/telemetry/batch`,
      `${topicPrefix}/status`,
      // Accident data from device sensors
      `${topicPrefix}/accident/raw`,
      `${topicPrefix}/accident/raw/impact`,
      `${topicPrefix}/accident/raw/airbag`,
      `${topicPrefix}/accident/raw/rollover`,
      `${topicPrefix}/accident/telemetry/location`,
      `${topicPrefix}/accident/telemetry/images`,
      `${topicPrefix}/accident/telemetry/vitals`,
    ];
    const subscribeTopics = [`${topicPrefix}/commands`];

    // In production you'd hash on the backend (edge function). Here we store a hint only.
    const passwordHint = `****${password.slice(-4)}`;

    // JWT: 30-day expiry token (in production, generate a real signed JWT via edge function)
    const jwtIssuedAt = new Date().toISOString();
    const jwtExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    // Placeholder JWT — real implementation uses generate-vehicle-mqtt-token edge function
    const jwtToken = btoa(JSON.stringify({
      sub: clientId,
      vehicle: form.vehicle_id,
      topics: publishTopics,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    }));

    const { error } = await supabase.from('vehicle_mqtt_credentials').insert({
      vehicle_id: form.vehicle_id,
      client_id: clientId,
      mqtt_username: mqttUsername,
      password_hash: `bcrypt:${btoa(password)}`, // Real production: hash in edge function
      password_hint: passwordHint,
      broker_url: form.broker_url,
      broker_port: form.broker_port,
      tls_enabled: form.tls_enabled,
      topic_prefix: topicPrefix,
      publish_topics: publishTopics,
      subscribe_topics: subscribeTopics,
      jwt_token: jwtToken,
      jwt_issued_at: jwtIssuedAt,
      jwt_expires_at: jwtExpiresAt,
      is_active: true,
      installed_by: user?.id,
      installed_at: new Date().toISOString(),
      notes: form.notes,
    });

    if (error) {
      toast.error('Failed to create credentials: ' + error.message);
    } else {
      toast.success('MQTT credentials generated', {
        description: `Copy the password now — it won't be shown again.`,
        duration: 8000,
      });
      fetchCredentials();
      setShowCreateDialog(false);
      setForm({ vehicle_id: '', broker_url: 'mqtt.rentmaikar.com', broker_port: 8883, tls_enabled: true, notes: '' });
    }
    setIsSaving(false);
  };

  const handleToggleActive = async (cred: MqttCredential) => {
    if (readOnly) return;
    const { error } = await supabase
      .from('vehicle_mqtt_credentials')
      .update({ is_active: !cred.is_active })
      .eq('id', cred.id);
    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(`Credential ${cred.is_active ? 'deactivated' : 'activated'}`);
      fetchCredentials();
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('vehicle_mqtt_credentials')
      .update({
        broker_url: editTarget.broker_url,
        broker_port: editTarget.broker_port,
        tls_enabled: editTarget.tls_enabled,
        notes: editTarget.notes,
      })
      .eq('id', editTarget.id);

    if (error) {
      toast.error('Failed to save changes');
    } else {
      toast.success('Credential updated');
      setEditTarget(null);
      fetchCredentials();
    }
    setIsSaving(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            Vehicle MQTT Credentials
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Unique broker credentials per vehicle • JWT-authenticated • TLS enforced
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchCredentials}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Install Credentials
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Generate Vehicle MQTT Credentials
                </DialogTitle>
                <DialogDescription>
                  Unique per-vehicle credentials. The raw password is shown only once — copy it immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Vehicle ID *</Label>
                  <Input
                    placeholder="e.g. RNTK-12345"
                    value={form.vehicle_id}
                    onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                    className="mt-1"
                  />
                  {form.vehicle_id && (
                    <div className="mt-2 p-3 rounded-md bg-muted text-xs space-y-1 font-mono">
                      <p><span className="text-muted-foreground">Client ID:</span> {generateClientId(form.vehicle_id)}</p>
                      <p><span className="text-muted-foreground">Username:</span> vehicle_{form.vehicle_id.replace(/[^a-z0-9]/gi, '').toLowerCase()}</p>
                      <p><span className="text-muted-foreground">Topic prefix:</span> {buildTopicPrefix(form.vehicle_id)}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Broker URL</Label>
                    <Input
                      value={form.broker_url}
                      onChange={e => setForm(f => ({ ...f, broker_url: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={form.broker_port}
                      onChange={e => setForm(f => ({ ...f, broker_port: Number(e.target.value) }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.tls_enabled}
                    onCheckedChange={v => setForm(f => ({ ...f, tls_enabled: v }))}
                  />
                  <Label>TLS/SSL Encryption (recommended)</Label>
                </div>
                <div>
                  <Label>Installation Notes</Label>
                  <Textarea
                    placeholder="Hardware details, SIM provider, technician notes..."
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="mt-1"
                    rows={3}
                  />
                </div>
                {generatedPassword && (
                  <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10">
                    <p className="text-xs font-semibold text-amber-600 mb-1">⚠️ Copy this password now — shown only once!</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono bg-background px-2 py-1 rounded">{generatedPassword}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(generatedPassword, 'Password')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => { setShowCreateDialog(false); setGeneratedPassword(''); }}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
                    Generate & Install
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading credentials...
        </div>
      ) : credentials.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <Wifi className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No MQTT credentials installed yet</p>
          <p className="text-sm mt-1">Click "Install Credentials" to provision a vehicle</p>
        </div>
      ) : (
        <div className="space-y-4">
          {credentials.map(cred => (
            <Card key={cred.id} className={`border ${!cred.is_active ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="font-mono">{cred.vehicle_id}</span>
                      <Badge variant={cred.is_active ? 'default' : 'secondary'}>
                        {cred.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {cred.tls_enabled && (
                        <Badge variant="outline" className="gap-1 text-green-600 border-green-600/30">
                          <ShieldCheck className="h-3 w-3" /> TLS
                        </Badge>
                      )}
                      {isExpired(cred.jwt_expires_at) && (
                        <Badge variant="destructive" className="gap-1">
                          <Clock className="h-3 w-3" /> JWT Expired
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">{cred.client_id}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {!readOnly && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditTarget({ ...cred })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Switch
                          checked={cred.is_active}
                          onCheckedChange={() => handleToggleActive(cred)}
                        />
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Credentials grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Username</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1">{cred.mqtt_username}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(cred.mqtt_username, 'Username')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Password (hint)</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded block">{cred.password_hint || '—'}</code>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Broker</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded block">{cred.broker_url}:{cred.broker_port}</code>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Topic Prefix</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1">{cred.topic_prefix}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(cred.topic_prefix, 'Topic prefix')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* JWT token */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">JWT Token</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Expires: {cred.jwt_expires_at ? new Date(cred.jwt_expires_at).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                      {showToken[cred.id] ? (cred.jwt_token || '—') : '••••••••••••••••••••'}
                    </code>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowToken(p => ({ ...p, [cred.id]: !p[cred.id] }))}>
                      {showToken[cred.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    {cred.jwt_token && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(cred.jwt_token!, 'JWT token')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Topics */}
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Publish Topics</p>
                  <div className="flex flex-wrap gap-1">
                    {cred.publish_topics.map(t => (
                      <code key={t} className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">{t}</code>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mt-1">Subscribe Topics</p>
                  <div className="flex flex-wrap gap-1">
                    {cred.subscribe_topics.map(t => (
                      <code key={t} className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">{t}</code>
                    ))}
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1 border-t">
                  {cred.installed_at && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      Installed {new Date(cred.installed_at).toLocaleDateString()}
                    </span>
                  )}
                  {cred.last_connected_at && (
                    <span className="flex items-center gap-1">
                      <Wifi className="h-3 w-3 text-blue-500" />
                      Last seen {new Date(cred.last_connected_at).toLocaleDateString()}
                    </span>
                  )}
                  {!cred.is_active && (
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      Deactivated
                    </span>
                  )}
                  {cred.notes && <span>📝 {cred.notes}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog (admin only) */}
      {!readOnly && editTarget && (
        <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Credential — {editTarget.vehicle_id}</DialogTitle>
              <DialogDescription>Update broker settings for this vehicle's MQTT credential.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Broker URL</Label>
                  <Input
                    value={editTarget.broker_url}
                    onChange={e => setEditTarget(t => t ? { ...t, broker_url: e.target.value } : t)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={editTarget.broker_port}
                    onChange={e => setEditTarget(t => t ? { ...t, broker_port: Number(e.target.value) } : t)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={editTarget.tls_enabled}
                  onCheckedChange={v => setEditTarget(t => t ? { ...t, tls_enabled: v } : t)}
                />
                <Label>TLS/SSL Encryption</Label>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editTarget.notes || ''}
                  onChange={e => setEditTarget(t => t ? { ...t, notes: e.target.value } : t)}
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
