import type { CallRegion } from './voip';

export type ReceiverStatus = 'available' | 'busy' | 'in_call' | 'wrap_up' | 'offline';

export interface AdminReceiver {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  status: ReceiverStatus;
  availableSince: string; // ISO string when status became available
  lastCallEndedAt?: string | null;
  totalCallsHandled: number;
  currentCallId?: string | null;
  assignedQueuedCallId?: string | null;
  regionSpecialty: 'All' | 'USA' | 'Nigeria';
  isCurrentUser: boolean;
  notes?: string;
}

export type RoutingStrategy = 'longest_idle' | 'round_robin' | 'fewest_calls';

export interface RouterConfig {
  autoRoutingEnabled: boolean;
  routingStrategy: RoutingStrategy;
  ringTimeoutSeconds: number; // default 20s
  soundOnAssignment: boolean;
  matchRegionFirst: boolean;
}

export type RouterAction = 'routed' | 'accepted' | 'timed_out' | 'rejected' | 're_routed';

export interface RouterLogEntry {
  id: string;
  timestamp: string;
  callId: string;
  callerName: string;
  callerPhone?: string;
  callerRegion: CallRegion;
  receiverId: string;
  receiverName: string;
  action: RouterAction;
  details?: string;
}

export interface RouterStats {
  totalRoutedToday: number;
  activeRingingCount: number;
  availableReceiversCount: number;
  busyReceiversCount: number;
  offlineReceiversCount: number;
  averageRoutingTimeSeconds: number;
}
