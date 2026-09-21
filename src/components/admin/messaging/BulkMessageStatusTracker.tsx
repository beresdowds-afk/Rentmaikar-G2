import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Search,
  Filter,
  Users,
  Mail,
  Smartphone,
  MessageSquare,
  Bell,
  Download,
  Trash2,
  RefreshCw,
  Layers,
  ArrowUpDown,
  ExternalLink,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export type MessageChannel = 'email' | 'sms' | 'whatsapp' | 'in_app';
export type MessageDeliveryStatus = 'pending' | 'sending' | 'delivered' | 'failed' | 'retrying';

export interface BulkMessageItem {
  id: string;
  batchId?: string;
  userId?: string | null;
  recipientName: string;
  contact: string; // Email, phone, or user identifier
  channel: MessageChannel;
  subject?: string;
  body: string;
  status: MessageDeliveryStatus;
  error?: string;
  errorCode?: string;
  provider?: string;
  providerMessageId?: string;
  timestamp: string;
  attempts: number;
  lastAttemptAt?: string;
}

export interface BulkMessageStatusTrackerProps {
  batchId?: string;
  initialItems?: BulkMessageItem[];
  onRetryComplete?: (results: { successful: number; failed: number }) => void;
  className?: string;
}

const STORAGE_KEY = 'rentmaikar_bulk_tracker_items';

export const BulkMessageStatusTracker: React.FC<BulkMessageStatusTrackerProps> = ({
  batchId,
  initialItems,
  onRetryComplete,
  className = '',
}) => {
  const [items, setItems] = useState<BulkMessageItem[]>(() => {
    if (initialItems && initialItems.length > 0) return initialItems;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState<{ current: number; total: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortRetryRef = useRef(false);

  // Synchronize localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 300)));
    } catch {
      // Storage unavailable
    }
  }, [items]);

  // Load recent outbound failure events from Supabase messaging_events if tracker is empty
  const fetchRecentEvents = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { data: events, error } = await supabase
        .from('messaging_events')
        .select('id, created_at, channel, provider, recipient, event_type, error_code, error_message, user_id, provider_message_id, metadata')
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && events && events.length > 0) {
        setItems((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newEntries: BulkMessageItem[] = [];

          for (const ev of events) {
            if (existingIds.has(ev.id)) continue;
            const ch = (ev.channel || 'sms').toLowerCase() as MessageChannel;
            const isFailed = !!(ev.error_code || ev.error_message || ev.event_type?.includes('fail') || ev.event_type?.includes('undeliver'));
            const isDelivered = ev.event_type?.includes('deliver') || ev.event_type === 'delivered';
            const meta = (ev.metadata as any) || {};

            newEntries.push({
              id: ev.id,
              batchId: meta.batch_id || 'recent-dispatch',
              userId: ev.user_id,
              recipientName: meta.recipient_name || ev.recipient || 'Recipient',
              contact: ev.recipient || meta.phone || meta.email || 'Unknown target',
              channel: ['email', 'sms', 'whatsapp', 'in_app'].includes(ch) ? ch : 'sms',
              subject: meta.subject || 'Admin Broadcast',
              body: meta.body || meta.message || 'Notification content',
              status: isFailed ? 'failed' : isDelivered ? 'delivered' : 'sending',
              error: ev.error_message || (isFailed ? 'Provider delivery failure' : undefined),
              errorCode: ev.error_code || undefined,
              provider: ev.provider,
              providerMessageId: ev.provider_message_id || undefined,
              timestamp: ev.created_at,
              attempts: 1,
            });
          }

          if (newEntries.length === 0) return prev;
          return [...newEntries, ...prev].slice(0, 300);
        });
      }
    } catch (e) {
      console.warn('Failed to load recent delivery events:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (items.length === 0) {
      fetchRecentEvents();
    }
  }, [fetchRecentEvents, items.length]);

  // Real-time listener for incoming dispatch updates
  useEffect(() => {
    const handleCommsUpdate = (e: Event) => {
      const custom = e as CustomEvent;
      const detail = custom.detail;
      if (!detail) return;

      if (detail.type === 'bulk_message_item' || detail.type === 'message_sent' || detail.type === 'in_app_message_delivered') {
        const newItem: BulkMessageItem = {
          id: detail.messageId || crypto.randomUUID(),
          batchId: detail.batchId || batchId || 'active-bulk',
          userId: detail.userId || null,
          recipientName: detail.recipientName || detail.recipient || 'Recipient',
          contact: detail.recipient || 'Target',
          channel: detail.channel || 'sms',
          subject: detail.subject,
          body: detail.body || 'Message content',
          status: 'delivered',
          timestamp: detail.timestamp || new Date().toISOString(),
          attempts: 1,
        };

        setItems((prev) => {
          const exists = prev.find((p) => p.id === newItem.id);
          if (exists) {
            return prev.map((p) => (p.id === newItem.id ? { ...p, status: 'delivered', error: undefined } : p));
          }
          return [newItem, ...prev].slice(0, 300);
        });
      }
    };

    window.addEventListener('comms_activity_update', handleCommsUpdate);

    // Supabase realtime channel subscription to messaging_events
    const channel = supabase
      .channel('bulk_status_messaging_events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messaging_events' },
        (payload) => {
          const row = payload.new as any;
          if (row.direction !== 'outbound') return;

          const isFailed = !!(row.error_code || row.error_message || row.event_type?.includes('fail'));
          const isDelivered = row.event_type?.includes('deliver') || row.event_type === 'delivered';

          setItems((prev) => {
            const index = prev.findIndex((i) => i.id === row.id || (row.recipient && i.contact === row.recipient));
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                status: isFailed ? 'failed' : isDelivered ? 'delivered' : updated[index].status,
                error: row.error_message || updated[index].error,
                errorCode: row.error_code || updated[index].errorCode,
                provider: row.provider || updated[index].provider,
                providerMessageId: row.provider_message_id || updated[index].providerMessageId,
              };
              return updated;
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('comms_activity_update', handleCommsUpdate);
      supabase.removeChannel(channel);
    };
  }, [batchId]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (batchId && item.batchId && item.batchId !== batchId) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (channelFilter !== 'all' && item.channel !== channelFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.recipientName.toLowerCase().includes(q);
        const matchesContact = item.contact.toLowerCase().includes(q);
        const matchesSubject = (item.subject || '').toLowerCase().includes(q);
        const matchesError = (item.error || '').toLowerCase().includes(q);
        if (!matchesName && !matchesContact && !matchesSubject && !matchesError) return false;
      }
      return true;
    });
  }, [items, batchId, statusFilter, channelFilter, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = items.length;
    const delivered = items.filter((i) => i.status === 'delivered').length;
    const failed = items.filter((i) => i.status === 'failed').length;
    const inFlight = items.filter((i) => i.status === 'sending' || i.status === 'retrying' || i.status === 'pending').length;
    const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, failed, inFlight, successRate };
  }, [items]);

  // Selection helpers
  const failedItems = useMemo(() => items.filter((i) => i.status === 'failed'), [items]);
  const selectedFailedCount = useMemo(() => {
    return failedItems.filter((i) => selectedIds.has(i.id)).length;
  }, [failedItems, selectedIds]);

  const handleSelectAllFailed = () => {
    if (selectedFailedCount === failedItems.length) {
      // Deselect all
      setSelectedIds((prev) => {
        const next = new Set(prev);
        failedItems.forEach((i) => next.delete(i.id));
        return next;
      });
    } else {
      // Select all failed
      setSelectedIds((prev) => {
        const next = new Set(prev);
        failedItems.forEach((i) => next.add(i.id));
        return next;
      });
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Execution engine: Re-trigger delivery function for an individual record
  const executeSingleDelivery = async (
    item: BulkMessageItem
  ): Promise<{ success: boolean; error?: string; messageId?: string }> => {
    const { channel, contact, subject, body, recipientName, userId } = item;

    try {
      if (channel === 'email') {
        const emailTarget = contact.trim();
        let delivered = false;
        let errMsg = '';
        let messageId = '';

        // Tier 1: Supabase edge function invoke
        try {
          const { data, error } = await supabase.functions.invoke('send-outbound-email', {
            body: {
              to: emailTarget,
              subject: subject || 'Notice from Rentmaikar Admin',
              body,
              recipientName: recipientName !== 'Recipient' ? recipientName : undefined,
            },
          });
          if (!error && (data?.ok !== false && data?.success !== false)) {
            delivered = true;
            messageId = data?.messageId || data?.id || '';
          } else {
            errMsg = data?.error || error?.message || 'Email delivery rejection';
          }
        } catch (e: any) {
          errMsg = e.message || 'Invoke error';
        }

        // Tier 2: Resilient local API fallback
        if (!delivered) {
          try {
            const res = await fetch('/api/functions/send-outbound-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: emailTarget,
                subject: subject || 'Notice from Rentmaikar Admin',
                body,
                recipientName: recipientName !== 'Recipient' ? recipientName : undefined,
              }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && (json?.ok !== false && json?.success !== false)) {
              delivered = true;
              messageId = json?.messageId || '';
              errMsg = '';
            } else {
              errMsg = json?.error || errMsg || `HTTP ${res.status}`;
            }
          } catch (fbErr: any) {
            errMsg = fbErr.message || errMsg;
          }
        }

        // Tier 3: Local send-email-reply fallback
        if (!delivered) {
          try {
            const res2 = await fetch('/api/functions/send-email-reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipientEmail: emailTarget,
                subject: subject || 'Notice from Rentmaikar Admin',
                messageContent: body,
                fromAlias: 'support',
              }),
            });
            const json2 = await res2.json().catch(() => null);
            if (res2.ok && (json2?.success || json2?.ok)) {
              delivered = true;
              messageId = json2?.messageId || '';
              errMsg = '';
            }
          } catch {
            /* secondary fallback */
          }
        }

        if (delivered) {
          return { success: true, messageId };
        }
        return { success: false, error: errMsg || 'Email delivery failed' };
      } else if (channel === 'sms' || channel === 'whatsapp') {
        const phoneTarget = contact.trim();
        const isWhatsApp = channel === 'whatsapp';
        let delivered = false;
        let errMsg = '';
        let messageId = '';

        // Tier 1: Supabase edge function invoke
        try {
          const { data, error } = await supabase.functions.invoke('send-sms-notification', {
            body: {
              phone: phoneTarget,
              message: body,
              channel: isWhatsApp ? 'whatsapp' : 'sms',
              recipientName: recipientName !== 'Recipient' ? recipientName : undefined,
            },
          });
          if (!error && (data?.success !== false && data?.ok !== false)) {
            delivered = true;
            messageId = data?.messageId || data?.id || '';
          } else {
            errMsg = data?.error || error?.message || `${channel.toUpperCase()} dispatch failed`;
          }
        } catch (e: any) {
          errMsg = e.message || 'Invoke error';
        }

        // Tier 2: Resilient local API fallback
        if (!delivered) {
          try {
            const res = await fetch('/api/functions/send-sms-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: phoneTarget,
                message: body,
                channel: isWhatsApp ? 'whatsapp' : 'sms',
                recipientName: recipientName !== 'Recipient' ? recipientName : undefined,
              }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && (json?.success !== false && json?.ok !== false)) {
              delivered = true;
              messageId = json?.messageId || '';
              errMsg = '';
            } else {
              errMsg = json?.error || errMsg || `HTTP ${res.status}`;
            }
          } catch (fbErr: any) {
            errMsg = fbErr.message || errMsg;
          }
        }

        // Tier 3: Local send-inbox-reply fallback
        if (!delivered) {
          try {
            const res2 = await fetch('/api/functions/send-inbox-reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipientPhone: phoneTarget,
                messageContent: body,
                channel: isWhatsApp ? 'whatsapp' : 'sms',
              }),
            });
            const json2 = await res2.json().catch(() => null);
            if (res2.ok && (json2?.success || json2?.ok)) {
              delivered = true;
              messageId = json2?.messageId || '';
              errMsg = '';
            }
          } catch {
            /* secondary fallback */
          }
        }

        if (delivered) {
          return { success: true, messageId };
        }
        return { success: false, error: errMsg || `${channel.toUpperCase()} delivery failed` };
      } else if (channel === 'in_app') {
        const targetUserId = userId || contact;
        let delivered = false;
        let errMsg = '';

        // Tier 1: Direct insert into in_app_messages
        if (targetUserId) {
          try {
            const { error: insertErr } = await supabase.from('in_app_messages' as never).insert({
              recipient_id: targetUserId,
              sender_name: 'Rentmaikar Admin',
              category: 'admin_broadcast',
              subject: subject || 'Notice from Rentmaikar Admin',
              body,
            } as never);
            if (!insertErr) {
              delivered = true;
            } else {
              errMsg = insertErr.message;
            }
          } catch (e: any) {
            errMsg = e.message || 'Direct insert error';
          }
        }

        // Tier 2: Resilient local API fallback
        if (!delivered) {
          try {
            const res = await fetch('/api/functions/send-in-app-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient_ids: [targetUserId],
                subject: subject || 'Notice from Rentmaikar Admin',
                body,
                category: 'admin_broadcast',
              }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && (json?.ok !== false && json?.success !== false)) {
              delivered = true;
              errMsg = '';
            }
          } catch (fbErr: any) {
            errMsg = fbErr.message || errMsg;
          }
        }

        if (delivered) {
          return { success: true };
        }
        return { success: false, error: errMsg || 'In-app delivery failed' };
      }

      return { success: false, error: 'Unsupported channel' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Unexpected dispatch exception' };
    }
  };

  // Retry an individual failed item
  const handleRetrySingle = async (item: BulkMessageItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'retrying', error: undefined } : i))
    );

    const result = await executeSingleDelivery(item);

    setItems((prev) =>
      prev.map((i) => {
        if (i.id === item.id) {
          return {
            ...i,
            status: result.success ? 'delivered' : 'failed',
            error: result.success ? undefined : result.error,
            providerMessageId: result.messageId || i.providerMessageId,
            attempts: i.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
          };
        }
        return i;
      })
    );

    if (result.success) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      toast.success(`Message successfully delivered to ${item.recipientName} via ${item.channel.toUpperCase()}`);
    } else {
      toast.error(`Retry failed for ${item.recipientName}: ${result.error}`);
    }
  };

  // RETRY SELECTED: maps over failed entries and re-triggers specific function for only those records
  const handleRetrySelected = async () => {
    const targets = failedItems.filter((i) => selectedIds.has(i.id));
    if (targets.length === 0) {
      toast.info('No failed entries selected. Check the boxes next to failed messages to retry.');
      return;
    }

    setIsRetrying(true);
    abortRetryRef.current = false;
    setRetryProgress({ current: 0, total: targets.length });

    let successfulCount = 0;
    let failedCount = 0;

    // Mark all target records as 'retrying' immediately
    setItems((prev) =>
      prev.map((i) => (selectedIds.has(i.id) && i.status === 'failed' ? { ...i, status: 'retrying' } : i))
    );

    for (let index = 0; index < targets.length; index++) {
      if (abortRetryRef.current) {
        toast.info('Retry process paused.');
        break;
      }

      const target = targets[index];
      setRetryProgress({ current: index + 1, total: targets.length });

      const outcome = await executeSingleDelivery(target);

      if (outcome.success) {
        successfulCount++;
        setItems((prev) =>
          prev.map((i) =>
            i.id === target.id
              ? {
                  ...i,
                  status: 'delivered',
                  error: undefined,
                  providerMessageId: outcome.messageId || i.providerMessageId,
                  attempts: i.attempts + 1,
                  lastAttemptAt: new Date().toISOString(),
                }
              : i
          )
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
      } else {
        failedCount++;
        setItems((prev) =>
          prev.map((i) =>
            i.id === target.id
              ? {
                  ...i,
                  status: 'failed',
                  error: outcome.error || 'Retry rejected',
                  attempts: i.attempts + 1,
                  lastAttemptAt: new Date().toISOString(),
                }
              : i
          )
        );
      }

      // Safe carrier rate limit throttle
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    setIsRetrying(false);
    setRetryProgress(null);

    if (successfulCount > 0 && failedCount === 0) {
      toast.success(`Retry complete: All ${successfulCount} selected message(s) successfully delivered!`);
    } else if (successfulCount > 0) {
      toast.warning(`Retry finished: ${successfulCount} delivered, ${failedCount} still failed.`);
    } else {
      toast.error(`Retry attempt failed for all ${failedCount} selected message(s). Check credentials & logs.`);
    }

    onRetryComplete?.({ successful: successfulCount, failed: failedCount });
  };

  const handleClearHistory = () => {
    if (confirm('Clear the local bulk tracking log? (Backend database records remain intact)')) {
      setItems([]);
      setSelectedIds(new Set());
      localStorage.removeItem(STORAGE_KEY);
      toast.success('Bulk status tracker log cleared');
    }
  };

  const handleExportAudit = () => {
    const csvHeader = 'ID,Recipient,Contact,Channel,Status,Attempts,Error,Timestamp\n';
    const csvRows = items
      .map(
        (i) =>
          `"${i.id}","${i.recipientName.replace(/"/g, '""')}","${i.contact}","${i.channel}","${i.status}","${i.attempts}","${(i.error || '').replace(/"/g, '""')}","${i.timestamp}"`
      )
      .join('\n');
    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bulk-dispatch-status-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Audit log downloaded as CSV');
  };

  const getChannelIcon = (channel: MessageChannel) => {
    switch (channel) {
      case 'email':
        return <Mail className="h-3.5 w-3.5 text-blue-500" />;
      case 'whatsapp':
        return <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />;
      case 'in_app':
        return <Bell className="h-3.5 w-3.5 text-purple-500" />;
      case 'sms':
      default:
        return <Smartphone className="h-3.5 w-3.5 text-amber-500" />;
    }
  };

  const getStatusBadge = (status: MessageDeliveryStatus) => {
    switch (status) {
      case 'delivered':
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-[11px] font-medium">
            <CheckCircle2 className="h-3 w-3" /> Delivered
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1 text-[11px] font-medium">
            <XCircle className="h-3 w-3" /> Failed
          </Badge>
        );
      case 'retrying':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1 text-[11px] font-medium animate-pulse">
            <RotateCcw className="h-3 w-3 animate-spin" /> Retrying...
          </Badge>
        );
      case 'sending':
        return (
          <Badge variant="secondary" className="gap-1 text-[11px] font-medium">
            <Clock className="h-3 w-3 animate-pulse text-blue-500" /> In-Flight
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px] font-medium">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        );
    }
  };

  return (
    <Card className={`border shadow-sm rounded-xl overflow-hidden ${className}`}>
      <CardHeader className="p-4 sm:p-5 border-b bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Bulk Message Status Tracker
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Real-time delivery state, provider diagnostic logs, and selective failed-message retry engine.
            </CardDescription>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchRecentEvents}
                    disabled={isRefreshing}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fetch recent delivery events from backend</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAudit}
              disabled={items.length === 0}
              className="h-8 gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              disabled={items.length === 0}
              className="h-8 text-muted-foreground hover:text-destructive text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-4">
          <div className="p-3 rounded-lg border bg-card text-center sm:text-left">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">Total Batch</span>
            <div className="text-xl font-bold mt-0.5">{metrics.total}</div>
            <span className="text-[10px] text-muted-foreground">All logged recipients</span>
          </div>

          <div className="p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-center sm:text-left">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold tracking-wider block">Delivered</span>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {metrics.delivered}
            </div>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
              {metrics.successRate}% delivery rate
            </span>
          </div>

          <div className="p-3 rounded-lg border bg-destructive/5 border-destructive/20 text-center sm:text-left">
            <span className="text-[10px] text-destructive uppercase font-semibold tracking-wider block">Failed</span>
            <div className="text-xl font-bold text-destructive mt-0.5">
              {metrics.failed}
            </div>
            <span className="text-[10px] text-destructive/80">
              {metrics.failed > 0 ? 'Actionable retries' : 'Clean batch'}
            </span>
          </div>

          <div className="p-3 rounded-lg border bg-blue-500/5 border-blue-500/20 text-center sm:text-left">
            <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-semibold tracking-wider block">In-Flight / Pending</span>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
              {metrics.inFlight}
            </div>
            <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80">Awaiting provider callback</span>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3 rounded-lg border bg-card flex flex-col justify-between">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">Health Score</span>
            <div className="flex items-center gap-2 mt-0.5">
              <Progress value={metrics.successRate} className="h-2 flex-1" />
              <span className="text-xs font-bold font-mono">{metrics.successRate}%</span>
            </div>
            <span className="text-[10px] text-muted-foreground truncate">
              {metrics.failed === 0 && metrics.total > 0 ? '100% operational' : `${metrics.failed} errors detected`}
            </span>
          </div>
        </div>

        {/* Dynamic Retry Progress Bar */}
        {isRetrying && retryProgress && (
          <div className="space-y-1.5 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                Retrying selected failed messages ({retryProgress.current} of {retryProgress.total})...
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  abortRetryRef.current = true;
                }}
                className="h-6 text-xs text-destructive hover:bg-destructive/10 px-2"
              >
                Abort
              </Button>
            </div>
            <Progress value={(retryProgress.current / retryProgress.total) * 100} className="h-2" />
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Filter & Action Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center flex-1 gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recipient, contact, or error..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="failed">Failed Only ({metrics.failed})</SelectItem>
                <SelectItem value="delivered">Delivered ({metrics.delivered})</SelectItem>
                <SelectItem value="sending">In-Flight ({metrics.inFlight})</SelectItem>
              </SelectContent>
            </Select>

            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[120px] h-9 text-xs">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="in_app">In-App</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action: Retry Selected button mapping over failed entries */}
          <div className="flex items-center gap-2">
            {failedItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllFailed}
                className="h-9 text-xs whitespace-nowrap"
              >
                {selectedFailedCount === failedItems.length ? 'Deselect All Failed' : `Select All Failed (${failedItems.length})`}
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={handleRetrySelected}
              disabled={isRetrying || selectedFailedCount === 0}
              className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90 shadow-sm font-semibold whitespace-nowrap"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              Retry Selected {selectedFailedCount > 0 ? `(${selectedFailedCount})` : ''}
            </Button>
          </div>
        </div>

        {/* Recipient Status Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="bg-muted/40 px-3 py-2.5 border-b text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={failedItems.length > 0 && selectedFailedCount === failedItems.length}
                onCheckedChange={handleSelectAllFailed}
                disabled={failedItems.length === 0}
                aria-label="Select all failed messages"
              />
              <span>Recipient & Contact</span>
            </div>
            <div className="flex items-center gap-6 pr-2">
              <span className="hidden sm:inline">Channel</span>
              <span>Delivery Status</span>
              <span className="w-20 text-right">Actions</span>
            </div>
          </div>

          <ScrollArea className="h-[360px]">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Users className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                <p className="text-xs text-muted-foreground">No message records match your filters.</p>
                {items.length === 0 && (
                  <Button variant="outline" size="sm" onClick={fetchRecentEvents} className="text-xs h-8 mt-2">
                    Fetch Recent Dispatches
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y text-xs">
                {filteredItems.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const isFailed = item.status === 'failed';
                  const isExpanded = expandedId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 transition-colors ${
                        isFailed ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelect(item.id)}
                            disabled={!isFailed || isRetrying}
                            aria-label={`Select ${item.recipientName}`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground truncate">
                                {item.recipientName}
                              </span>
                              {item.attempts > 1 && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                  Attempt #{item.attempts}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground text-[11px] truncate">
                              <span className="font-mono">{item.contact}</span>
                              <span>·</span>
                              <span>{format(new Date(item.timestamp), 'dd MMM, HH:mm')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
                          <div className="hidden sm:flex items-center gap-1.5 font-medium text-[11px]">
                            {getChannelIcon(item.channel)}
                            <span className="capitalize">{item.channel}</span>
                          </div>

                          <div>{getStatusBadge(item.status)}</div>

                          <div className="flex items-center gap-1.5 w-20 justify-end">
                            {isFailed && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleRetrySingle(item)}
                                      disabled={isRetrying || item.status === 'retrying'}
                                      className="h-7 w-7 p-0 text-primary border-primary/30 hover:bg-primary/10"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Retry this message now</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="h-7 w-7 p-0 text-muted-foreground"
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Diagnostic Drawer */}
                      {isExpanded && (
                        <div className="mt-2.5 pt-2.5 border-t border-border/60 text-[11px] space-y-2 bg-background/50 p-2.5 rounded-lg">
                          {item.error && (
                            <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <span className="font-semibold block">Delivery Failure Reason:</span>
                                <p className="font-mono text-[10px] break-all">{item.error}</p>
                                {item.errorCode && (
                                  <span className="text-[10px] opacity-80 block">Error Code: {item.errorCode}</span>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
                            <div>
                              <span className="block font-medium text-foreground">Message Channel:</span>
                              <span className="capitalize">{item.channel}</span>
                            </div>
                            <div>
                              <span className="block font-medium text-foreground">Provider:</span>
                              <span>{item.provider || 'Default Edge Gateway'}</span>
                            </div>
                            <div>
                              <span className="block font-medium text-foreground">Provider Msg ID:</span>
                              <span className="font-mono text-[10px] truncate block">
                                {item.providerMessageId || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="block font-medium text-foreground">Last Attempt:</span>
                              <span>
                                {item.lastAttemptAt
                                  ? format(new Date(item.lastAttemptAt), 'HH:mm:ss')
                                  : format(new Date(item.timestamp), 'HH:mm:ss')}
                              </span>
                            </div>
                          </div>

                          {item.subject && (
                            <div>
                              <span className="block font-medium text-foreground">Subject:</span>
                              <span className="italic">{item.subject}</span>
                            </div>
                          )}

                          <div>
                            <span className="block font-medium text-foreground">Message Content:</span>
                            <div className="p-2 rounded bg-muted/40 font-mono text-[10px] max-h-24 overflow-y-auto whitespace-pre-wrap">
                              {item.body}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkMessageStatusTracker;
