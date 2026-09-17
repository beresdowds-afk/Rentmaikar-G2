import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Phone,
  MessageSquare,
  Mail,
  Smartphone,
  Search,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  User,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneForDisplay } from '@/types/voip';
import { useCommunicationsHub } from './CommunicationsHubContext';

type HistoryFilter = 'all' | 'calls' | 'messages' | 'email';

interface UnifiedHistoryItem {
  id: string;
  type: 'call' | 'message';
  channel: string;
  recipientName: string;
  contact: string;
  preview: string;
  timestamp: string;
  status?: string;
  direction?: string;
  duration?: number;
  unread?: boolean;
}

export const HubConversationHistory: React.FC = () => {
  const { openWithRecipient } = useCommunicationsHub();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<UnifiedHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const historyList: UnifiedHistoryItem[] = [];

      // 1. Fetch recent inbox conversations
      const { data: convs } = await supabase
        .from('inbox_conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(20);

      (convs || []).forEach((c) => {
        historyList.push({
          id: `conv_${c.id}`,
          type: 'message',
          channel: c.channel || 'sms',
          recipientName: c.user_name || 'Customer / Driver',
          contact: c.user_phone || c.user_email || '',
          preview: c.subject || 'Direct message thread',
          timestamp: c.last_message_at || c.created_at,
          status: c.status,
          unread: c.unread_count ? c.unread_count > 0 : false,
        });
      });

      // 2. Fetch recent voip calls
      const { data: calls } = await supabase
        .from('voip_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      (calls || []).forEach((call) => {
        historyList.push({
          id: `call_${call.id}`,
          type: 'call',
          channel: 'voip',
          recipientName: call.direction === 'inbound' ? 'Inbound Caller' : 'Outbound Dial',
          contact: call.region || 'VoIP',
          preview: `Call ${call.status || 'completed'} (${call.duration_seconds || 0}s)`,
          timestamp: call.created_at,
          status: call.status,
          direction: call.direction,
          duration: call.duration_seconds,
        });
      });

      // Sort combined chronologically
      historyList.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setItems(historyList);
    } catch (err) {
      console.error('Error fetching communications history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredItems = items.filter((item) => {
    if (filter === 'calls' && item.type !== 'call') return false;
    if (filter === 'messages' && (item.type !== 'message' || item.channel === 'email')) return false;
    if (filter === 'email' && item.channel !== 'email') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.recipientName.toLowerCase().includes(q) ||
        item.contact.toLowerCase().includes(q) ||
        item.preview.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleItemClick = (item: UnifiedHistoryItem) => {
    if (item.type === 'call') {
      openWithRecipient({
        name: item.recipientName,
        phone: item.contact.startsWith('+') ? item.contact : undefined,
        defaultAction: 'call',
      });
    } else {
      openWithRecipient({
        name: item.recipientName,
        phone: item.channel !== 'email' ? item.contact : undefined,
        email: item.channel === 'email' ? item.contact : undefined,
        defaultAction: 'message',
        defaultChannel: item.channel as any,
      });
    }
  };

  const getChannelIcon = (item: UnifiedHistoryItem) => {
    if (item.type === 'call') {
      return <Phone className="h-3.5 w-3.5 text-emerald-600" />;
    }
    if (item.channel === 'email') {
      return <Mail className="h-3.5 w-3.5 text-blue-600" />;
    }
    if (item.channel === 'whatsapp') {
      return <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />;
    }
    return <Smartphone className="h-3.5 w-3.5 text-amber-600" />;
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Top Filter Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`text-[11px] px-2 py-1 rounded font-medium transition ${
              filter === 'all'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('calls')}
            className={`text-[11px] px-2 py-1 rounded font-medium transition ${
              filter === 'calls'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Calls
          </button>
          <button
            type="button"
            onClick={() => setFilter('messages')}
            className={`text-[11px] px-2 py-1 rounded font-medium transition ${
              filter === 'messages'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            SMS/WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setFilter('email')}
            className={`text-[11px] px-2 py-1 rounded font-medium transition ${
              filter === 'email'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Email
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={fetchHistory}
          disabled={isLoading}
          className="h-7 w-7 p-0"
          title="Refresh communications history"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter history by contact or preview..."
          className="h-8 pl-8 text-xs bg-background"
        />
      </div>

      {/* Items Stream */}
      <div className="divide-y divide-border/60 border border-border/80 rounded-xl overflow-hidden bg-card max-h-[340px] overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {isLoading ? 'Loading communications history...' : 'No communication records found.'}
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => handleItemClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleItemClick(item);
                }
              }}
              className="p-3 hover:bg-muted/50 transition cursor-pointer text-left space-y-1 block w-full focus:outline-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 truncate max-w-[210px]">
                  {getChannelIcon(item)}
                  <span className="text-xs font-semibold text-foreground truncate">
                    {item.recipientName}
                  </span>
                  {item.contact && (
                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                      ({item.contact})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.unread && (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <p className="truncate text-[11px] pr-2 max-w-[270px]">{item.preview}</p>
                <div className="flex items-center gap-1 text-[10px] text-primary shrink-0 font-medium">
                  <span>Open</span>
                  <ArrowUpRight className="h-3 w-3" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
