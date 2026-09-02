import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  Clock,
  Search,
  Filter,
  Volume2,
  VolumeX,
  Sparkles,
  ArrowUpRight,
  User,
  CheckCircle2,
  RefreshCw,
  Zap,
  Globe,
  Radio,
  MessageSquare,
  AlertCircle,
  Headphones,
  GitBranch,
  ArrowRight,
} from 'lucide-react';
import type { CallQueueItem, CallQueueStats, CallRegion } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';

interface CallQueueListProps {
  queueItems: CallQueueItem[];
  queueStats: CallQueueStats;
  isLoading: boolean;
  onAnswerCall: (item: CallQueueItem) => Promise<any>;
  onDismissCall: (item: CallQueueItem, reason?: string) => Promise<any>;
  onEscalateCall: (item: CallQueueItem) => Promise<any>;
  onSimulateCall: (opts?: any) => Promise<any>;
  onClearSimulated?: () => void;
  onRefresh?: () => void;
  audioAlertsEnabled: boolean;
  onToggleAudioAlerts: () => void;
  onRouteToNextAvailable?: (item?: CallQueueItem) => void;
  onOpenRouter?: () => void;
  nextInLineReceiverName?: string;
  autoRoutingEnabled?: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const CallQueueList = ({
  queueItems,
  queueStats,
  isLoading,
  onAnswerCall,
  onDismissCall,
  onEscalateCall,
  onSimulateCall,
  onClearSimulated,
  onRefresh,
  audioAlertsEnabled,
  onToggleAudioAlerts,
  onRouteToNextAvailable,
  onOpenRouter,
  nextInLineReceiverName,
  autoRoutingEnabled = true,
}: CallQueueListProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<'ALL' | CallRegion>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | CallQueueItem['source']>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'urgent' | 'high' | 'normal'>('ALL');
  const [isAnsweringId, setIsAnsweringId] = useState<string | null>(null);

  // Live ticking timer for wait durations
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter queue items
  const filteredItems = useMemo(() => {
    return queueItems.filter((item) => {
      // Region filter
      if (regionFilter !== 'ALL' && item.region !== regionFilter) return false;

      // Source filter
      if (sourceFilter !== 'ALL' && item.source !== sourceFilter) return false;

      // Priority filter
      if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.callerName.toLowerCase().includes(q);
        const matchesPhone = item.callerPhone?.toLowerCase().includes(q);
        const matchesReason = item.reason?.toLowerCase().includes(q);
        const matchesRole = item.callerRole?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesReason && !matchesRole) {
          return false;
        }
      }

      return true;
    });
  }, [queueItems, regionFilter, sourceFilter, priorityFilter, searchQuery]);

  const handleAnswer = async (item: CallQueueItem) => {
    setIsAnsweringId(item.id);
    try {
      await onAnswerCall(item);
    } finally {
      setIsAnsweringId(null);
    }
  };

  const hasSimulated = queueItems.some((i) => i.id.startsWith('sim-'));

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className={`border transition-colors ${queueStats.totalWaiting > 0 ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Waiting in Queue
            </CardTitle>
            <PhoneIncoming className={`h-4 w-4 ${queueStats.totalWaiting > 0 ? 'text-amber-500 animate-pulse' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-bold font-mono text-foreground">
                {queueStats.totalWaiting}
              </span>
              {queueStats.urgentCount > 0 && (
                <Badge variant="destructive" className="text-[11px] px-1.5 py-0">
                  {queueStats.urgentCount} Urgent
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {queueStats.totalWaiting === 0 ? 'All callers answered' : 'Awaiting admin connection'}
            </p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Longest Wait Time
            </CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold font-mono text-foreground">
              {formatDuration(queueStats.longestWaitSeconds)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Target response SLA: &lt; 02:00
            </p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Avg Wait Time
            </CardTitle>
            <Zap className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold font-mono text-foreground">
              {formatDuration(queueStats.averageWaitSeconds)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {queueStats.totalWaiting} queued caller{queueStats.totalWaiting === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Regional Inbound
            </CardTitle>
            <Globe className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 pt-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span>🇺🇸</span>
                <span className="font-mono text-base">{queueStats.usaCount}</span>
                <span className="text-xs text-muted-foreground">USA</span>
              </div>
              <span className="text-border">|</span>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span>🇳🇬</span>
                <span className="font-mono text-base">{queueStats.nigeriaCount}</span>
                <span className="text-xs text-muted-foreground">Nigeria</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active telephony routes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* FIFO Call Router Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/30 bg-primary/5 text-foreground">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">FIFO Call Router</span>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 px-1.5 font-medium ${
                  autoRoutingEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground'
                }`}
              >
                {autoRoutingEnabled ? 'Auto FIFO Dispatching Active' : 'Manual Dispatching'}
              </Badge>
              {nextInLineReceiverName && (
                <span className="text-xs text-muted-foreground">
                  • Next Receiver in line: <strong className="text-foreground">{nextInLineReceiverName}</strong>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Callers are routed sequentially on a first-in first-out basis to the admin who has been available/idle longest.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onRouteToNextAvailable && queueStats.totalWaiting > 0 && (
            <Button
              size="sm"
              onClick={() => onRouteToNextAvailable()}
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-xs"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Route FIFO #1
            </Button>
          )}

          {onOpenRouter && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenRouter}
              className="h-8 text-xs gap-1.5"
            >
              <GitBranch className="h-3.5 w-3.5 text-primary" />
              Configure Router Pool
            </Button>
          )}
        </div>
      </div>

      {/* Main Queue Container */}
      <div className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
        {/* Header & Controls Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                Incoming Call Queue
              </h3>
              {queueStats.totalWaiting > 0 && (
                <Badge variant="destructive" className="font-mono animate-pulse">
                  {queueStats.totalWaiting} WAITING
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live inbound voice calls, driver roadside requests, and owner callback inquiries awaiting answer.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleAudioAlerts}
              className="h-8 gap-1.5 text-xs"
              title={audioAlertsEnabled ? 'Disable incoming ring tone' : 'Enable incoming ring tone'}
            >
              {audioAlertsEnabled ? (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Ringtone On</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Ringtone Off</span>
                </>
              )}
            </Button>

            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="h-8 gap-1.5 text-xs"
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}

            {/* Simulate Call Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Simulate Inbound</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-semibold">Simulate Incoming Call</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    onSimulateCall({
                      region: 'USA',
                      callerRole: 'driver',
                      priority: 'urgent',
                      reason: 'Driver reporting tire puncture on highway',
                    })
                  }
                  className="text-xs cursor-pointer"
                >
                  <span className="mr-2">🇺🇸</span> Urgent USA Driver
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onSimulateCall({
                      region: 'Nigeria',
                      callerRole: 'owner',
                      priority: 'high',
                      reason: 'Fleet owner inquiring on weekly revenue audit',
                    })
                  }
                  className="text-xs cursor-pointer"
                >
                  <span className="mr-2">🇳🇬</span> High-Priority Nigeria Owner
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onSimulateCall({
                      region: 'USA',
                      callerRole: 'customer',
                      priority: 'normal',
                      reason: 'Customer requesting trip pickup point update',
                    })
                  }
                  className="text-xs cursor-pointer"
                >
                  <span className="mr-2">🇺🇸</span> Standard USA Customer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onSimulateCall({
                      region: 'Nigeria',
                      callerRole: 'driver',
                      priority: 'urgent',
                      reason: 'Driver requesting instant fuel voucher code',
                    })
                  }
                  className="text-xs cursor-pointer"
                >
                  <span className="mr-2">🇳🇬</span> Urgent Lagos Driver
                </DropdownMenuItem>
                {hasSimulated && onClearSimulated && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onClearSimulated}
                      className="text-xs text-destructive cursor-pointer"
                    >
                      Clear Simulated Calls
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by caller, phone, reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {/* Region Filter */}
            <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => setRegionFilter('ALL')}
                className={`px-2 py-1 rounded text-xs transition-colors ${regionFilter === 'ALL' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All Regions
              </button>
              <button
                type="button"
                onClick={() => setRegionFilter('USA')}
                className={`px-2 py-1 rounded text-xs transition-colors ${regionFilter === 'USA' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                🇺🇸 USA
              </button>
              <button
                type="button"
                onClick={() => setRegionFilter('Nigeria')}
                className={`px-2 py-1 rounded text-xs transition-colors ${regionFilter === 'Nigeria' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                🇳🇬 Nigeria
              </button>
            </div>

            {/* Source Filter */}
            <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => setSourceFilter('ALL')}
                className={`px-2 py-1 rounded text-xs transition-colors ${sourceFilter === 'ALL' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All Sources
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter('inbound_voip')}
                className={`px-2 py-1 rounded text-xs transition-colors ${sourceFilter === 'inbound_voip' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Live Calls
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter('voice_request')}
                className={`px-2 py-1 rounded text-xs transition-colors ${sourceFilter === 'voice_request' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Voice App
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter('callback_request')}
                className={`px-2 py-1 rounded text-xs transition-colors ${sourceFilter === 'callback_request' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Callbacks
              </button>
            </div>

            {/* Priority Filter */}
            <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => setPriorityFilter('ALL')}
                className={`px-2 py-1 rounded text-xs transition-colors ${priorityFilter === 'ALL' ? 'bg-background font-medium shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All Priority
              </button>
              <button
                type="button"
                onClick={() => setPriorityFilter('urgent')}
                className={`px-2 py-1 rounded text-xs transition-colors ${priorityFilter === 'urgent' ? 'bg-destructive text-destructive-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Urgent Only
              </button>
            </div>
          </div>
        </div>

        {/* Queue List Rows */}
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center rounded-lg border border-dashed border-border/80 bg-muted/20">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="font-semibold text-foreground text-sm">Call Queue is Clear</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
              {searchQuery || regionFilter !== 'ALL' || sourceFilter !== 'ALL' || priorityFilter !== 'ALL'
                ? 'No waiting callers match your active filters. Clear your filters to see all queued items.'
                : 'No incoming calls or requests are currently waiting. Incoming voice calls and callback inquiries will appear here in real-time.'}
            </p>
            {searchQuery || regionFilter !== 'ALL' || sourceFilter !== 'ALL' || priorityFilter !== 'ALL' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setRegionFilter('ALL');
                  setSourceFilter('ALL');
                  setPriorityFilter('ALL');
                }}
                className="h-8 text-xs"
              >
                Clear All Filters
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSimulateCall()}
                className="h-8 text-xs gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Simulate Test Inbound Call
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {filteredItems.map((item, index) => {
              const waitSeconds = Math.max(0, Math.floor((now - new Date(item.createdAt).getTime()) / 1000));
              const isUrgent = item.priority === 'urgent';
              const isLongWait = waitSeconds > 180; // > 3 mins

              return (
                <div
                  key={item.id}
                  className={`p-3.5 sm:p-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isUrgent
                      ? 'bg-destructive/5 hover:bg-destructive/10'
                      : 'bg-card hover:bg-muted/40'
                  }`}
                >
                  {/* Left: Caller Info & Badges */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    {/* Position Indicator */}
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center font-mono font-bold text-xs text-muted-foreground border border-border">
                      #{index + 1}
                    </div>

                    {/* Caller Details */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate max-w-[200px]">
                          {item.callerName}
                        </span>

                        {/* Caller Role */}
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                          {item.callerRole}
                        </Badge>

                        {/* Region */}
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-mono px-1.5 py-0 flex items-center gap-1"
                        >
                          <span>{item.region === 'USA' ? '🇺🇸 +1' : '🇳🇬 +234'}</span>
                        </Badge>

                        {/* Source Type */}
                        {item.source === 'inbound_voip' && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-1.5 py-0 flex items-center gap-1">
                            <Radio className="h-2.5 w-2.5 animate-pulse" />
                            Live Inbound
                          </Badge>
                        )}
                        {item.source === 'voice_request' && (
                          <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] px-1.5 py-0 flex items-center gap-1">
                            <Headphones className="h-2.5 w-2.5" />
                            Voice App
                          </Badge>
                        )}
                        {item.source === 'callback_request' && (
                          <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] px-1.5 py-0 flex items-center gap-1">
                            <MessageSquare className="h-2.5 w-2.5" />
                            Callback Request
                          </Badge>
                        )}

                        {/* Priority */}
                        {item.priority === 'urgent' && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 animate-pulse flex items-center gap-1 font-bold">
                            <AlertCircle className="h-2.5 w-2.5" />
                            URGENT
                          </Badge>
                        )}
                        {item.priority === 'high' && (
                          <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] px-1.5 py-0 font-medium">
                            High
                          </Badge>
                        )}
                      </div>

                      {/* Phone Number & Reason */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {item.callerPhone && (
                          <span className="font-mono font-medium text-foreground/80">
                            {formatPhoneForDisplay(item.callerPhone)}
                          </span>
                        )}
                        {item.callerPhone && item.reason && <span>•</span>}
                        {item.reason && (
                          <span className="italic text-foreground/90 max-w-md truncate">
                            "{item.reason}"
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Wait Timer & Action Controls */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                    {/* Live Ticking Wait Timer */}
                    <div className="text-right">
                      <div
                        className={`inline-flex items-center gap-1 font-mono font-bold text-xs px-2 py-0.5 rounded ${
                          isUrgent || isLongWait
                            ? 'bg-destructive/15 text-destructive border border-destructive/30'
                            : waitSeconds > 60
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>Wait: {formatDuration(waitSeconds)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {/* Answer Button */}
                      <Button
                        size="sm"
                        onClick={() => handleAnswer(item)}
                        disabled={isAnsweringId === item.id}
                        className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        <span>{isAnsweringId === item.id ? 'Connecting...' : 'Answer Call'}</span>
                      </Button>

                      {/* Route to Next Available Receiver */}
                      {onRouteToNextAvailable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRouteToNextAvailable(item)}
                          className="h-8 px-2 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1"
                          title="Route to next available receiver"
                        >
                          <GitBranch className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Route FIFO</span>
                        </Button>
                      )}

                      {/* Escalate Priority */}
                      {item.priority !== 'urgent' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEscalateCall(item)}
                          className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                          title="Escalate to Urgent Priority"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only sm:inline ml-1">Escalate</span>
                        </Button>
                      )}

                      {/* Dismiss / Reject */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDismissCall(item)}
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Dismiss from queue"
                      >
                        <PhoneOff className="h-3.5 w-3.5" />
                        <span className="sr-only">Dismiss</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallQueueList;
