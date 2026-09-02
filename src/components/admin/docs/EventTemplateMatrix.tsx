import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Workflow } from 'lucide-react';
import { EVENT_TEMPLATE_MAP, type EventChannel } from '@/lib/event-template-map';
import { MESSAGE_USE_CASES } from '@/lib/message-use-cases';

const channelLabels: Record<EventChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  push: 'Push',
};

const useCaseLabel = (id: string) =>
  MESSAGE_USE_CASES.find((u) => u.id === id)?.label ?? id;

/**
 * Read-only matrix of platform events and the messaging template each channel
 * uses. Mirrors the runtime map consumed by dispatch-event-notifications.
 */
export const EventTemplateMatrix = () => {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EVENT_TEMPLATE_MAP;
    return EVENT_TEMPLATE_MAP.filter((m) =>
      `${m.kind} ${m.status ?? ''} ${m.label} ${m.useCaseId} ${m.audience}`
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <Workflow className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">Event → Template Mapping</h2>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        Every platform event routed through the notification outbox, with the canned-message use
        case and per-channel copy it triggers. Email always goes out; one messaging channel
        (WhatsApp preferred, SMS fallback) is added where declared.
      </p>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by event, status, audience or use case…"
        className="mb-4 max-w-md"
        aria-label="Filter event template mappings"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 font-semibold">Event</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Audience</th>
              <th className="text-left p-3 font-semibold">Canned use case</th>
              <th className="text-left p-3 font-semibold">Channels</th>
              <th className="text-left p-3 font-semibold">SMS template key</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={`${m.kind}-${m.status ?? 'default'}`} className="border-b border-border/50 align-top">
                <td className="p-3">
                  <div className="font-medium">{m.label}</div>
                  <code className="text-xs text-muted-foreground">{m.kind}</code>
                </td>
                <td className="p-3">
                  <Badge variant={m.status ? 'secondary' : 'outline'}>{m.status ?? 'any'}</Badge>
                </td>
                <td className="p-3 capitalize">{m.audience}</td>
                <td className="p-3">{useCaseLabel(m.useCaseId)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {m.channels.map((c) => (
                      <Badge key={c} variant="outline">
                        {channelLabels[c]}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  <code className="text-xs bg-muted px-1 rounded">{m.smsNotificationType}</code>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No events match that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default EventTemplateMatrix;
