import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, Mail, MessageSquare, Save, Smartphone } from "lucide-react";
import { toast } from "sonner";

export type ProxyPrefs = {
  channels: { email: boolean; sms: boolean; whatsapp: boolean };
  events: Record<string, boolean>;
};

const DEFAULT_PREFS: ProxyPrefs = {
  channels: { email: true, sms: false, whatsapp: false },
  events: {
    consent_reminder: true,
    identity_result: true,
    admin_review: true,
    card_activated: true,
    charge_receipt: true,
    charge_failed: true,
    expiry_warning: true,
    revoked: true,
  },
};

const EVENT_LABELS: Record<string, { label: string; hint?: string }> = {
  consent_reminder: { label: "Consent reminders", hint: "Nudges to complete verification/consent" },
  identity_result: { label: "Identity verification result" },
  admin_review: { label: "Admin approval decisions" },
  card_activated: { label: "Card activation confirmation" },
  charge_receipt: { label: "Successful charge receipts", hint: "Sent after each payment" },
  charge_failed: { label: "Failed charge alerts" },
  expiry_warning: { label: "Consent expiring soon" },
  revoked: { label: "Consent revoked / disabled" },
};

interface Props {
  proxyId: string;
  initial?: ProxyPrefs | null;
  consentToken?: string; // when the proxy edits via their public link
  phoneAvailable?: boolean;
  disabled?: boolean;
  title?: string;
  description?: string;
  onSaved?: (prefs: ProxyPrefs) => void;
}

export function ProxyNotificationPrefs({
  proxyId, initial, consentToken, phoneAvailable = true,
  disabled, title, description, onSaved,
}: Props) {
  const [prefs, setPrefs] = useState<ProxyPrefs>(() => mergeDefaults(initial));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setPrefs(mergeDefaults(initial)); setDirty(false); }, [initial]);

  const setChannel = (k: keyof ProxyPrefs["channels"], v: boolean) => {
    setPrefs((p) => ({ ...p, channels: { ...p.channels, [k]: v } }));
    setDirty(true);
  };
  const setEvent = (k: string, v: boolean) => {
    setPrefs((p) => ({ ...p, events: { ...p.events, [k]: v } }));
    setDirty(true);
  };

  const save = async () => {
    if (!prefs.channels.email && !prefs.channels.sms && !prefs.channels.whatsapp) {
      return toast.error("Keep at least one channel enabled so you can be reached");
    }
    setSaving(true);
    const { error } = await supabase.rpc("update_proxy_notification_prefs" as any, {
      _proxy_id: proxyId,
      _prefs: prefs as any,
      _token: consentToken ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Notification preferences saved");
    setDirty(false);
    onSaved?.(prefs);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" /> {title ?? "Notification preferences"}
        </CardTitle>
        <CardDescription>
          {description ?? "Choose which channels reach you and which alerts you want to receive."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-sm font-medium mb-2">Channels</p>
          <div className="space-y-2">
            <ChannelRow icon={<Mail className="h-4 w-4" />} label="Email"
              checked={prefs.channels.email} onChange={(v) => setChannel("email", v)} disabled={disabled} />
            <ChannelRow icon={<Smartphone className="h-4 w-4" />} label="SMS"
              checked={prefs.channels.sms} onChange={(v) => setChannel("sms", v)}
              disabled={disabled || !phoneAvailable}
              hint={!phoneAvailable ? "Add a phone number to enable" : undefined} />
            <ChannelRow icon={<MessageSquare className="h-4 w-4" />} label="WhatsApp"
              checked={prefs.channels.whatsapp} onChange={(v) => setChannel("whatsapp", v)}
              disabled={disabled || !phoneAvailable}
              hint={!phoneAvailable ? "Add a phone number to enable" : undefined} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Alert types</p>
            <Badge variant="outline" className="text-[10px]">
              {Object.values(prefs.events).filter(Boolean).length}/{Object.keys(EVENT_LABELS).length} on
            </Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(EVENT_LABELS).map(([key, meta]) => (
              <label key={key} className="flex items-start gap-2 rounded-md border p-2 cursor-pointer">
                <Switch checked={prefs.events[key] ?? true}
                  onCheckedChange={(v) => setEvent(key, v)} disabled={disabled} />
                <div className="text-xs">
                  <div className="font-medium">{meta.label}</div>
                  {meta.hint && <div className="text-muted-foreground">{meta.hint}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || disabled || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelRow({ icon, label, checked, onChange, disabled, hint }: {
  icon: React.ReactNode; label: string; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <div className="flex items-center gap-2 text-sm">
        {icon}<span>{label}</span>
        {hint && <span className="text-xs text-muted-foreground">— {hint}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function mergeDefaults(p?: ProxyPrefs | null): ProxyPrefs {
  const src = p ?? ({} as any);
  return {
    channels: { ...DEFAULT_PREFS.channels, ...(src.channels ?? {}) },
    events: { ...DEFAULT_PREFS.events, ...(src.events ?? {}) },
  };
}
