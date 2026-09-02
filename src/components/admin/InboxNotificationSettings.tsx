import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell } from 'lucide-react';
import {
  INBOX_CHANNELS,
  PRIORITY_ORDER,
  useInboxNotificationSettings,
  type InboxPriority,
} from '@/hooks/useInboxNotificationSettings';

export const InboxNotificationSettings = () => {
  const { settings, loading, saveSetting } = useInboxNotificationSettings();
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Inbox notification settings
        </CardTitle>
        <CardDescription>
          Choose which channels trigger in-app or email alerts, and the minimum priority required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        ) : (
          INBOX_CHANNELS.map((channel) => {
            const s = settings[channel.value];
            if (!s) return null;
            return (
              <div
                key={channel.value}
                className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-32 font-medium text-sm">{channel.label}</div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`inapp-${channel.value}`}
                      checked={s.in_app_enabled}
                      onCheckedChange={(v) => saveSetting(channel.value, { in_app_enabled: v })}
                    />
                    <Label htmlFor={`inapp-${channel.value}`} className="text-sm">
                      In-app
                    </Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      id={`email-${channel.value}`}
                      checked={s.email_enabled}
                      onCheckedChange={(v) => saveSetting(channel.value, { email_enabled: v })}
                    />
                    <Label htmlFor={`email-${channel.value}`} className="text-sm">
                      Email
                    </Label>
                  </div>

                  {s.email_enabled && (
                    <Input
                      className="h-8 w-56"
                      type="email"
                      placeholder="Alert email (defaults to yours)"
                      value={emailDrafts[channel.value] ?? s.alert_email ?? ''}
                      onChange={(e) =>
                        setEmailDrafts((prev) => ({ ...prev, [channel.value]: e.target.value }))
                      }
                      onBlur={(e) => saveSetting(channel.value, { alert_email: e.target.value.trim() || null })}
                    />
                  )}

                  <Select
                    value={s.min_priority}
                    onValueChange={(v) => saveSetting(channel.value, { min_priority: v as InboxPriority })}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_ORDER.map((p) => (
                        <SelectItem key={p} value={p}>
                          Min: {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default InboxNotificationSettings;
