/**
 * Rentmaikar Call Strategy Module
 * 
 * Centralized retry schedules, time-zone restrictions,
 * and multi-channel escalation logic for all outbound system calls.
 */

// ─── RETRY SCHEDULES BY PRIORITY ───

export type CallPriority = 'critical' | 'high' | 'medium' | 'low';

interface RetrySchedule {
  attempts: number;
  intervals: number[]; // minutes between retries
  nextDay: boolean;    // retry next day if exhausted today
  maxAttempts: number; // total including next-day retries
}

export const RETRY_SCHEDULES: Record<CallPriority, RetrySchedule> = {
  critical: {
    attempts: 5,
    intervals: [0, 5, 15, 30, 60],
    nextDay: true,
    maxAttempts: 10,
  },
  high: {
    attempts: 3,
    intervals: [0, 30, 120],
    nextDay: true,
    maxAttempts: 6,
  },
  medium: {
    attempts: 2,
    intervals: [0, 240],
    nextDay: true,
    maxAttempts: 4,
  },
  low: {
    attempts: 1,
    intervals: [0],
    nextDay: false,
    maxAttempts: 2,
  },
};

// ─── TIME RESTRICTIONS BY REGION ───

interface CallingWindow {
  start: number; // hour (0-23)
  end: number;   // hour (0-23)
  timezone: string;
  restrictedAction: 'voicemail_only' | 'sms_only';
}

export const TIME_RESTRICTIONS: Record<string, CallingWindow> = {
  US: {
    start: 9,
    end: 21,
    timezone: 'America/New_York',
    restrictedAction: 'voicemail_only',
  },
  NG: {
    start: 8,
    end: 20,
    timezone: 'Africa/Lagos',
    restrictedAction: 'sms_only',
  },
};

// ─── CHANNEL ESCALATION LADDER ───

export interface EscalationStep {
  attempt: number;
  channel: 'call' | 'sms' | 'whatsapp' | 'email';
  fallback: 'sms' | 'whatsapp' | 'email';
}

export const CHANNEL_ESCALATION: EscalationStep[] = [
  { attempt: 1, channel: 'call', fallback: 'sms' },
  { attempt: 2, channel: 'call', fallback: 'whatsapp' },
  { attempt: 3, channel: 'call', fallback: 'email' },
  { attempt: 4, channel: 'sms', fallback: 'whatsapp' },
  { attempt: 5, channel: 'whatsapp', fallback: 'email' },
];

// ─── CALL TYPE → PRIORITY MAPPING ───

const CALL_TYPE_PRIORITY: Record<string, CallPriority> = {
  // Critical
  'accident_detection': 'critical',
  'security_alert': 'critical',
  'vehicle_shutdown': 'critical',
  // High
  'payment_default_stage3': 'high',
  'payment_default_stage2': 'high',
  'document_expiry_5day': 'high',
  // Medium
  'payment_default_stage1': 'medium',
  'document_expiry_7day': 'medium',
  'document_expiry_15day': 'medium',
  'vehicle_return_reminder': 'medium',
  'inspection_reminder': 'medium',
  // Low
  'document_expiry_30day': 'low',
  'payout_confirmation': 'low',
  'welcome_call': 'low',
};

export function getCallPriority(callType: string): CallPriority {
  return CALL_TYPE_PRIORITY[callType] || 'medium';
}

// ─── TIMEZONE HELPERS ───

/**
 * Get the current hour in a given timezone.
 */
export function getCurrentHourInTimezone(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  });
  return parseInt(formatter.format(now), 10);
}

/**
 * Determine the region code from a phone number.
 */
export function getRegionFromPhone(phone: string): string {
  if (phone.startsWith('+234')) return 'NG';
  if (phone.startsWith('+1')) return 'US';
  return 'US'; // default
}

/**
 * Check if a call can be placed right now to this region.
 */
export function isWithinCallingHours(region: string): boolean {
  const window = TIME_RESTRICTIONS[region];
  if (!window) return true; // unknown region, allow
  const currentHour = getCurrentHourInTimezone(window.timezone);
  return currentHour >= window.start && currentHour < window.end;
}

/**
 * Get the restricted-hours fallback action for a region.
 */
export function getRestrictedAction(region: string): 'voicemail_only' | 'sms_only' {
  return TIME_RESTRICTIONS[region]?.restrictedAction || 'sms_only';
}

// ─── RETRY DECISION ENGINE ───

export interface RetryDecision {
  shouldRetry: boolean;
  retryDelayMs: number | null;
  shouldEscalateChannel: boolean;
  nextChannel: EscalationStep | null;
  shouldScheduleNextDay: boolean;
}

/**
 * Given the current attempt count and call priority, decide what to do next
 * after a failed/busy/no-answer call.
 */
export function getRetryDecision(
  attemptNumber: number,
  priority: CallPriority,
  region: string,
): RetryDecision {
  const schedule = RETRY_SCHEDULES[priority];

  // Check if we've exhausted today's attempts
  if (attemptNumber >= schedule.attempts) {
    // Check channel escalation
    const escalation = CHANNEL_ESCALATION.find(e => e.attempt === attemptNumber);
    const nextEscalation = CHANNEL_ESCALATION.find(e => e.attempt === attemptNumber + 1);

    // If we can still escalate channels
    if (nextEscalation && attemptNumber < schedule.maxAttempts) {
      return {
        shouldRetry: true,
        retryDelayMs: null, // immediate via alternate channel
        shouldEscalateChannel: true,
        nextChannel: nextEscalation,
        shouldScheduleNextDay: false,
      };
    }

    // If next-day retry is enabled and we haven't hit max
    if (schedule.nextDay && attemptNumber < schedule.maxAttempts) {
      return {
        shouldRetry: true,
        retryDelayMs: null,
        shouldEscalateChannel: false,
        nextChannel: null,
        shouldScheduleNextDay: true,
      };
    }

    // Fully exhausted
    return {
      shouldRetry: false,
      retryDelayMs: null,
      shouldEscalateChannel: false,
      nextChannel: null,
      shouldScheduleNextDay: false,
    };
  }

  // We have retries left today
  const nextInterval = schedule.intervals[attemptNumber] ?? schedule.intervals[schedule.intervals.length - 1];
  const delayMs = nextInterval * 60 * 1000;

  // Check calling hours
  if (!isWithinCallingHours(region)) {
    // Outside hours — send fallback channel, schedule next-day retry
    const currentEscalation = CHANNEL_ESCALATION.find(e => e.attempt === attemptNumber) || CHANNEL_ESCALATION[0];
    return {
      shouldRetry: true,
      retryDelayMs: null,
      shouldEscalateChannel: true,
      nextChannel: { ...currentEscalation, channel: currentEscalation.fallback } as EscalationStep,
      shouldScheduleNextDay: true,
    };
  }

  return {
    shouldRetry: true,
    retryDelayMs: delayMs,
    shouldEscalateChannel: false,
    nextChannel: null,
    shouldScheduleNextDay: false,
  };
}

/**
 * Calculate the next-day retry timestamp (start of calling window).
 */
export function getNextDayRetryTimestamp(region: string): string {
  const window = TIME_RESTRICTIONS[region] || TIME_RESTRICTIONS['US'];
  const now = new Date();
  // Set to tomorrow at the start of calling hours in UTC approximation
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Approximate: for US (ET = UTC-5), 9 AM ET = 14:00 UTC
  // For NG (WAT = UTC+1), 8 AM WAT = 07:00 UTC
  const utcOffsets: Record<string, number> = {
    'America/New_York': -5,
    'Africa/Lagos': 1,
  };
  const offset = utcOffsets[window.timezone] || 0;
  tomorrow.setUTCHours(window.start - offset, 0, 0, 0);
  return tomorrow.toISOString();
}
