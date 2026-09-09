import { InboxConversation } from '@/hooks/useUnifiedInbox';

/** Response-time targets (minutes) per priority. */
export const SLA_TARGET_MINUTES: Record<string, number> = {
  urgent: 30,
  high: 120,
  normal: 480,
  low: 1440,
};

export type SlaState = 'met' | 'ok' | 'warning' | 'overdue';

export interface SlaInfo {
  /** Minutes the thread has been waiting on a response. */
  elapsedMinutes: number;
  targetMinutes: number;
  /** Negative when the target has already passed. */
  remainingMinutes: number;
  state: SlaState;
  label: string;
  /** True when the thread is closed/resolved (clock stopped). */
  stopped: boolean;
}

export const formatDuration = (minutes: number): string => {
  const mins = Math.max(0, Math.round(Math.abs(minutes)));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
};

/**
 * Computes SLA state for a conversation.
 * The clock runs from the last inbound activity while the thread is open/pending,
 * and stops once the thread is resolved or closed.
 */
export const getSlaInfo = (
  conversation: Pick<
    InboxConversation,
    'status' | 'priority' | 'last_message_at' | 'created_at'
  > & { updated_at?: string | null },
  now: number = Date.now(),
): SlaInfo => {
  const targetMinutes =
    SLA_TARGET_MINUTES[conversation.priority as string] ?? SLA_TARGET_MINUTES.normal;

  const stopped = conversation.status === 'resolved' || conversation.status === 'closed';
  const startedAt = new Date(
    conversation.last_message_at || conversation.created_at,
  ).getTime();
  const endedAt = stopped
    ? new Date(conversation.updated_at ?? conversation.last_message_at).getTime()
    : now;

  const elapsedMinutes = Math.max(0, (endedAt - startedAt) / 60000);
  const remainingMinutes = targetMinutes - elapsedMinutes;

  let state: SlaState;
  if (stopped) {
    state = 'met';
  } else if (remainingMinutes <= 0) {
    state = 'overdue';
  } else if (remainingMinutes <= targetMinutes * 0.25) {
    state = 'warning';
  } else {
    state = 'ok';
  }

  const label = stopped
    ? `Closed in ${formatDuration(elapsedMinutes)}`
    : state === 'overdue'
      ? `Overdue by ${formatDuration(-remainingMinutes)}`
      : `${formatDuration(remainingMinutes)} left`;

  return { elapsedMinutes, targetMinutes, remainingMinutes, state, label, stopped };
};

export const slaBadgeClasses: Record<SlaState, string> = {
  met: 'bg-muted text-muted-foreground border-muted',
  ok: 'bg-green-500/10 text-green-600 border-green-500/20',
  warning: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  overdue: 'bg-destructive/10 text-destructive border-destructive/30',
};

export const isOverdue = (conversation: Parameters<typeof getSlaInfo>[0], now?: number) =>
  getSlaInfo(conversation, now).state === 'overdue';
