import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GitBranch,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Radio,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { CallQueueItem } from '@/types/voip';
import type { useCallRouter } from '@/hooks/useCallRouter';
import type { ReceiverStatus, RoutingStrategy } from '@/types/callRouter';

interface CallRouterPanelProps {
  router: ReturnType<typeof useCallRouter>;
  queueItems: CallQueueItem[];
  onAnswerCall?: (item: CallQueueItem) => Promise<void>;
}

export const CallRouterPanel = ({
  router,
  queueItems,
}: CallRouterPanelProps) => {
  const {
    config,
    updateConfig,
    receivers,
    currentUserReceiver,
    setCurrentUserStatus,
    updateReceiverStatus,
    nextInLineReceiver,
    routeNextFifoCall,
    dispatchCall,
    acceptRoutedCall,
    declineRoutedCall,
    incomingRoutedCall,
    ringCountdown,
    logs,
    stats,
  } = router;

  const [filterRegion, setFilterRegion] = useState<string>('all');
  const waitingCalls = queueItems.filter((i) => i.status === 'waiting');

  const formatWaitTime = (createdAtStr: string) => {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(createdAtStr).getTime()) / 1000));
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: ReceiverStatus) => {
    switch (status) {
      case 'available':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Available (Ready)
          </Badge>
        );
      case 'in_call':
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 gap-1">
            <PhoneCall className="h-3 w-3 animate-bounce" />
            In Active Call
          </Badge>
        );
      case 'busy':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Busy (Paused)
          </Badge>
        );
      case 'wrap_up':
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 gap-1">
            <Clock className="h-3 w-3" />
            Post-Call Wrap-up
          </Badge>
        );
      case 'offline':
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Offline
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Incoming Routed Call Dialog (Appears when call is routed to THIS admin) */}
      <Dialog
        open={!!incomingRoutedCall}
        onOpenChange={(open) => {
          if (!open && incomingRoutedCall) {
            declineRoutedCall(incomingRoutedCall.call, 'Modal dismissed by receiver');
          }
        }}
      >
        <DialogContent className="sm:max-w-md border-amber-500/50 shadow-2xl bg-card">
          <DialogHeader className="text-center sm:text-left">
            <div className="mx-auto sm:mx-0 w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-2 animate-bounce">
              <PhoneIncoming className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl flex items-center gap-2">
              <span>Incoming Routed Call</span>
              <Badge variant="destructive" className="animate-pulse text-xs">
                FIFO #1
              </Badge>
            </DialogTitle>
            <DialogDescription>
              A waiting caller has been auto-directed to you on a first-in, first-out next available receiver basis.
            </DialogDescription>
          </DialogHeader>

          {incomingRoutedCall && (
            <div className="p-4 rounded-xl border border-muted bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-base">{incomingRoutedCall.call.callerName}</h4>
                  <p className="text-xs text-muted-foreground font-mono">
                    {incomingRoutedCall.call.callerPhone || 'In-app Voice Request'}
                  </p>
                </div>
                <Badge variant="outline" className="font-medium">
                  {incomingRoutedCall.call.region === 'USA' ? '🇺🇸 USA (+1)' : '🇳🇬 Nigeria (+234)'}
                </Badge>
              </div>

              {incomingRoutedCall.call.reason && (
                <p className="text-xs text-muted-foreground bg-background p-2.5 rounded-lg border">
                  <strong>Inquiry:</strong> {incomingRoutedCall.call.reason}
                </p>
              )}

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-muted-foreground">Auto-failover to next admin in:</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                  {ringCountdown}s
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => incomingRoutedCall && declineRoutedCall(incomingRoutedCall.call, 'Passed by operator')}
              className="w-full sm:w-auto"
            >
              <PhoneOff className="h-4 w-4 mr-1.5 text-muted-foreground" />
              Pass to Next Admin
            </Button>
            <Button
              onClick={() => incomingRoutedCall && acceptRoutedCall(incomingRoutedCall.call)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <PhoneCall className="h-4 w-4 mr-1.5 animate-pulse" />
              Answer & Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Banner: Operator Live Status & Quick Toggles */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <GitBranch className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg tracking-tight">FIFO Call Router</h3>
                  <Badge
                    variant={config.autoRoutingEnabled ? 'default' : 'secondary'}
                    className={
                      config.autoRoutingEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-600 text-white gap-1 text-[11px]'
                        : 'text-[11px]'
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        config.autoRoutingEnabled ? 'bg-white animate-ping' : 'bg-slate-400'
                      }`}
                    />
                    {config.autoRoutingEnabled ? 'Auto-Routing Active' : 'Auto-Routing Paused'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Directs incoming queue callers to available admins strictly on a First-In-First-Out & Next-Available-Receiver basis
                </p>
              </div>
            </div>

            {/* Operator Quick Status Controller */}
            <div className="flex items-center gap-2.5 flex-wrap w-full lg:w-auto p-2 rounded-xl bg-background/80 border shadow-xs">
              <div className="text-xs pr-2 border-r">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">My Operator Status</span>
                <span className="font-medium truncate max-w-[130px] block">
                  {currentUserReceiver?.name || 'Admin'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={currentUserReceiver?.status === 'available' ? 'default' : 'ghost'}
                  onClick={() => setCurrentUserStatus('available')}
                  className={`h-8 px-2.5 text-xs gap-1.5 ${
                    currentUserReceiver?.status === 'available'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Available
                </Button>

                <Button
                  size="sm"
                  variant={currentUserReceiver?.status === 'busy' ? 'default' : 'ghost'}
                  onClick={() => setCurrentUserStatus('busy')}
                  className={`h-8 px-2.5 text-xs gap-1.5 ${
                    currentUserReceiver?.status === 'busy'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white font-medium'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Busy
                </Button>

                <Button
                  size="sm"
                  variant={currentUserReceiver?.status === 'wrap_up' ? 'default' : 'ghost'}
                  onClick={() => setCurrentUserStatus('wrap_up')}
                  className={`h-8 px-2.5 text-xs gap-1.5 ${
                    currentUserReceiver?.status === 'wrap_up'
                      ? 'bg-purple-600 hover:bg-purple-700 text-white font-medium'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  Wrap-up
                </Button>

                <Button
                  size="sm"
                  variant={currentUserReceiver?.status === 'offline' ? 'default' : 'ghost'}
                  onClick={() => setCurrentUserStatus('offline')}
                  className={`h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground`}
                >
                  Offline
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Waiting in FIFO
            </span>
            <PhoneIncoming className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{waitingCalls.length}</span>
            <span className="text-xs text-muted-foreground">
              {waitingCalls.length === 0 ? 'Queue clear' : 'Awaiting admin receiver'}
            </span>
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available Receivers
            </span>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.availableReceiversCount}
            </span>
            <span className="text-xs text-muted-foreground">
              of {receivers.length} total staff
            </span>
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Next In Line Receiver
            </span>
            <ShieldCheck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2">
            {nextInLineReceiver ? (
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm truncate">{nextInLineReceiver.name}</span>
                {nextInLineReceiver.isCurrentUser && (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    You
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">No receivers available</span>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Priority: Longest Idle ({config.routingStrategy.replace('_', ' ')})
            </p>
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Calls Routed Today
            </span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{stats.totalRoutedToday}</span>
            <span className="text-xs text-muted-foreground">via automated FIFO ACD</span>
          </div>
        </Card>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols): FIFO Queue Pipeline & Receivers Directory */}
        <div className="lg:col-span-2 space-y-6">
          {/* FIFO Queue Dispatch Pipeline */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  First-In First-Out (FIFO) Dispatch Pipeline
                </CardTitle>
                <CardDescription className="text-xs">
                  Callers receive priority strictly by their arrival timestamp. Oldest call in queue routes first.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={routeNextFifoCall}
                disabled={waitingCalls.length === 0 || stats.availableReceiversCount === 0}
                className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90 font-semibold"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Dispatch Next Call (FIFO #1)
              </Button>
            </CardHeader>

            <CardContent className="space-y-3">
              {waitingCalls.length === 0 ? (
                <div className="py-8 text-center border rounded-xl bg-muted/20 border-dashed">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-sm font-medium">Inbound Queue Clear</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No incoming calls currently waiting. When a call arrives, it will auto-route to the next available receiver.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {waitingCalls.map((item, index) => {
                    const isNextInLine = index === 0;
                    return (
                      <div
                        key={item.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all ${
                          isNextInLine
                            ? 'border-amber-500/60 bg-amber-500/5 shadow-xs ring-1 ring-amber-500/20'
                            : 'border-muted bg-card hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Queue Position Badge */}
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                              isNextInLine
                                ? 'bg-amber-500 text-white shadow-xs animate-pulse'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            #{index + 1}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{item.callerName}</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 font-medium px-1.5"
                              >
                                {item.region === 'USA' ? '🇺🇸 USA' : '🇳🇬 Nigeria'}
                              </Badge>
                              {item.priority === 'urgent' && (
                                <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                                  Urgent
                                </Badge>
                              )}
                              {isNextInLine && (
                                <Badge className="bg-amber-600 text-white text-[10px] py-0 px-1.5 font-semibold">
                                  NEXT TO ROUTE
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span className="font-mono">{item.callerPhone || 'Voice In-app'}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1 font-mono">
                                <Clock className="h-3 w-3" />
                                Wait: {formatWaitTime(item.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Dispatch Action */}
                        <div className="mt-3 sm:mt-0 flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant={isNextInLine ? 'default' : 'outline'}
                            disabled={stats.availableReceiversCount === 0}
                            onClick={() => {
                              const receiver = nextInLineReceiver || receivers.find((r) => r.status === 'available');
                              if (receiver) {
                                dispatchCall(item, receiver, false);
                              }
                            }}
                            className={`h-8 text-xs gap-1.5 ${
                              isNextInLine ? 'bg-amber-600 hover:bg-amber-700 text-white font-medium' : ''
                            }`}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            Route to {nextInLineReceiver?.name ? nextInLineReceiver.name.split(' ')[0] : 'Next Admin'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin Receivers Directory */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Admin Receivers Pool ({receivers.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Available receivers are evaluated by idle time. Longest waiting admin receives the next call.
                </CardDescription>
              </div>

              <Select value={filterRegion} onValueChange={setFilterRegion}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="USA">USA Only</SelectItem>
                  <SelectItem value="Nigeria">Nigeria Only</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>

            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider border-b">
                      <tr>
                        <th className="py-2.5 px-3">Admin Receiver</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Specialty</th>
                        <th className="py-2.5 px-3">Availability / Idle</th>
                        <th className="py-2.5 px-3">Calls Handled</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {receivers
                        .filter((r) => filterRegion === 'all' || r.regionSpecialty === 'All' || r.regionSpecialty === filterRegion)
                        .map((receiver) => {
                          const isNext = nextInLineReceiver?.id === receiver.id;
                          return (
                            <tr
                              key={receiver.id}
                              className={`hover:bg-muted/30 transition-colors ${
                                receiver.isCurrentUser ? 'bg-primary/5 font-medium' : ''
                              }`}
                            >
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-foreground uppercase flex-shrink-0">
                                    {receiver.name.slice(0, 2)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-foreground">{receiver.name}</span>
                                      {receiver.isCurrentUser && (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-primary/20">
                                          You
                                        </Badge>
                                      )}
                                      {isNext && receiver.status === 'available' && (
                                        <Badge className="bg-blue-600 text-white text-[9px] px-1 py-0 font-bold">
                                          NEXT IN LINE
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">{receiver.email}</span>
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-3">{getStatusBadge(receiver.status)}</td>

                              <td className="py-2.5 px-3">
                                <Badge variant="outline" className="text-[10px]">
                                  {receiver.regionSpecialty}
                                </Badge>
                              </td>

                              <td className="py-2.5 px-3 font-mono text-muted-foreground">
                                {receiver.status === 'available' ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    Idle {formatWaitTime(receiver.availableSince)}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>

                              <td className="py-2.5 px-3 font-semibold">
                                {receiver.totalCallsHandled} call{receiver.totalCallsHandled === 1 ? '' : 's'}
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <Select
                                  value={receiver.status}
                                  onValueChange={(val: ReceiverStatus) => {
                                    if (receiver.isCurrentUser) {
                                      setCurrentUserStatus(val);
                                    } else {
                                      updateReceiverStatus(receiver.id, val);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-7 w-[105px] text-[11px] ml-auto">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent align="end">
                                    <SelectItem value="available">Available</SelectItem>
                                    <SelectItem value="busy">Busy</SelectItem>
                                    <SelectItem value="wrap_up">Wrap-up</SelectItem>
                                    <SelectItem value="offline">Offline</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Router Configuration & Real-Time Event Audit Feed */}
        <div className="space-y-6">
          {/* Router Settings Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                Router Rules & Logic
              </CardTitle>
              <CardDescription className="text-xs">
                Configure ACD dispatch rules and timeout policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {/* Auto Routing Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Auto-Route Incoming Calls</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Directs waiting FIFO calls automatically when an admin becomes available
                  </p>
                </div>
                <Switch
                  checked={config.autoRoutingEnabled}
                  onCheckedChange={(val) => updateConfig({ autoRoutingEnabled: val })}
                />
              </div>

              {/* Routing Strategy Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Receiver Selection Strategy</Label>
                <Select
                  value={config.routingStrategy}
                  onValueChange={(val: RoutingStrategy) => updateConfig({ routingStrategy: val })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="longest_idle">
                      Longest Idle Receiver (Recommended)
                    </SelectItem>
                    <SelectItem value="round_robin">
                      Round-Robin Rotation
                    </SelectItem>
                    <SelectItem value="fewest_calls">
                      Fewest Calls Handled (Load Balance)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Pairs the oldest waiting call with the receiver who has been idle longest.
                </p>
              </div>

              {/* Ring Timeout */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Ring / Acceptance Timeout</Label>
                <Select
                  value={String(config.ringTimeoutSeconds)}
                  onValueChange={(val) => updateConfig({ ringTimeoutSeconds: Number(val) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Seconds (Rapid)</SelectItem>
                    <SelectItem value="20">20 Seconds (Standard)</SelectItem>
                    <SelectItem value="30">30 Seconds (Extended)</SelectItem>
                    <SelectItem value="45">45 Seconds (Maximum)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  If an assigned admin does not answer within this period, the router fails over to the next available receiver.
                </p>
              </div>

              {/* Sound on Assignment */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    {config.soundOnAssignment ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
                    Assignment Chime
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Play audio alert when a call is routed to your line
                  </p>
                </div>
                <Switch
                  checked={config.soundOnAssignment}
                  onCheckedChange={(val) => updateConfig({ soundOnAssignment: val })}
                />
              </div>

              {/* Regional Priority Matching */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Regional Skill Match</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Prefer USA/Nigeria specialized admins before generalists
                  </p>
                </div>
                <Switch
                  checked={config.matchRegionFirst}
                  onCheckedChange={(val) => updateConfig({ matchRegionFirst: val })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Real-Time Routing Activity Feed */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Router Audit Feed
                </CardTitle>
                <CardDescription className="text-xs">
                  Live log of automated & manual dispatch events
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No routing events yet</p>
                ) : (
                  logs.map((log) => {
                    const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-lg border bg-muted/20 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {log.receiverName}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">{timeStr}</span>
                        </div>
                        <p className="text-muted-foreground text-[11px] leading-relaxed">
                          {log.details || `Call from ${log.callerName} (${log.callerRegion})`}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 py-0 font-medium ${
                              log.action === 'accepted'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                : log.action === 'routed'
                                ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            }`}
                          >
                            {log.action.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
