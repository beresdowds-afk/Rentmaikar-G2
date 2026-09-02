import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, AlarmClock } from 'lucide-react';
import { getSlaInfo, slaBadgeClasses, formatDuration } from '@/lib/inbox-sla';
import type { InboxConversation } from '@/hooks/useUnifiedInbox';

/** Re-renders every `intervalMs` so SLA timers tick live. */
export const useNowTick = (intervalMs = 30000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

export const InboxSlaBadge = ({
  conversation,
  now,
  showElapsed = false,
}: {
  conversation: InboxConversation;
  now?: number;
  showElapsed?: boolean;
}) => {
  const tick = useNowTick();
  const sla = getSlaInfo(conversation, now ?? tick);
  const Icon = sla.state === 'overdue' ? AlarmClock : Clock;

  return (
    <Badge
      variant="outline"
      className={`text-xs ${slaBadgeClasses[sla.state]}`}
      title={`Target ${formatDuration(sla.targetMinutes)} · open ${formatDuration(sla.elapsedMinutes)}`}
    >
      <Icon className={`h-3 w-3 mr-1 ${sla.state === 'overdue' ? 'animate-pulse' : ''}`} />
      {showElapsed ? `${formatDuration(sla.elapsedMinutes)} open · ${sla.label}` : sla.label}
    </Badge>
  );
};
