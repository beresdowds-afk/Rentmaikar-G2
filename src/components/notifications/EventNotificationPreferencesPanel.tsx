import { useState } from 'react';
import { Loader2, BellRing, Mail, Hash, Webhook, Smartphone, MessageSquare, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  EVENT_CATEGORIES,
  useEventNotificationPreferences,
} from '@/hooks/useEventNotificationPreferences';

/**
 * Lets owners and admins choose which channels (in-app, email, Slack, webhook)
 * they receive for each event category.
 */
export function EventNotificationPreferencesPanel() {
  const { prefs, loading, saving, savePreference } = useEventNotificationPreferences();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="h-5 w-5 text-primary" />
          Event notifications
        </CardTitle>
        <CardDescription>
          Pick how you want to hear about each type of activity. In-app alerts show in the
          notification bell; SMS is optional and only sent to a verified mobile number; Slack and webhook alerts need a destination URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading preferences…
          </div>
        )}

        {!loading &&
          EVENT_CATEGORIES.map((cat) => {
            const p = prefs[cat.value];
            if (!p) return null;
            const open = expanded === cat.value;
            return (
              <div key={cat.value} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[9rem] text-sm font-medium">{cat.label}</div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <BellRing className="h-3.5 w-3.5" /> In-app
                      <Switch
                        checked={p.in_app}
                        onCheckedChange={(v) => savePreference(cat.value, { in_app: v })}
                        aria-label={`In-app alerts for ${cat.label}`}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> Email
                      <Switch
                        checked={p.email}
                        onCheckedChange={(v) => savePreference(cat.value, { email: v })}
                        aria-label={`Email alerts for ${cat.label}`}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Smartphone className="h-3.5 w-3.5" /> Push
                      <Switch
                        checked={p.push}
                        onCheckedChange={(v) => savePreference(cat.value, { push: v })}
                        aria-label={`Push alerts for ${cat.label}`}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" /> SMS
                      <Switch
                        checked={p.sms}
                        onCheckedChange={(v) => savePreference(cat.value, { sms: v })}
                        aria-label={`SMS alerts for ${cat.label}`}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Hash className="h-3.5 w-3.5" /> Slack
                      <Switch
                        checked={p.slack}
                        onCheckedChange={(v) => savePreference(cat.value, { slack: v })}
                        aria-label={`Slack alerts for ${cat.label}`}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Webhook className="h-3.5 w-3.5" /> Webhook
                      <Switch
                        checked={p.webhook}
                        onCheckedChange={(v) => savePreference(cat.value, { webhook: v })}
                        aria-label={`Webhook alerts for ${cat.label}`}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setExpanded(open ? null : cat.value)}
                    >
                      {open ? 'Hide URLs' : 'Destinations'}
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`slack-${cat.value}`} className="text-xs">
                        Slack webhook URL
                      </Label>
                      <Input
                        id={`slack-${cat.value}`}
                        placeholder="https://hooks.slack.com/services/…"
                        defaultValue={p.slack_webhook_url ?? ''}
                        onBlur={(e) =>
                          savePreference(cat.value, { slack_webhook_url: e.target.value.trim() })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`hook-${cat.value}`} className="text-xs">
                        Webhook URL
                      </Label>
                      <Input
                        id={`hook-${cat.value}`}
                        placeholder="https://example.com/hooks/rentmaikar"
                        defaultValue={p.webhook_url ?? ''}
                        onBlur={(e) =>
                          savePreference(cat.value, { webhook_url: e.target.value.trim() })
                        }
                      />
                    </div>
                    {p.webhook_secret && (
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Signing secret</Label>
                        <div className="flex gap-2">
                          <Input readOnly value={p.webhook_secret} className="font-mono text-xs" />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(p.webhook_secret ?? '');
                              toast.success('Signing secret copied');
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Each POST carries <code>X-Rentmaikar-Timestamp</code> and{' '}
                          <code>X-Rentmaikar-Signature: sha256=HMAC_SHA256(secret, "{'{'}timestamp{'}'}.{'{'}raw
                          body{'}'}")</code>. Body:{' '}
                          <code>
                            {'{ id, type, category, created_at, title, message, record: { table, id, status, previous_status, operation, url } }'}
                          </code>{' '}
                          — <code>record.url</code> is the deep link to the exact record.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {saving && (
          <div className="text-xs text-muted-foreground">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Saving…
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EventNotificationPreferencesPanel;
