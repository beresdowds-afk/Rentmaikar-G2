import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PhoneIncoming,
  PhoneCall,
  ArrowUpCircle,
  X,
  Search,
  Timer,
  Volume2,
  VolumeX,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { QueuedCall, QueueRegion, QueueSource } from '@/hooks/useCallQueue';
import type { useCallQueue } from '@/hooks/useCallQueue';

interface CallQueueListProps {
  queueState: ReturnType<typeof useCallQueue>;
  onAnswer: (call: QueuedCall) => void | Promise<void>;
  onEscalate: (call: QueuedCall) => void | Promise<void>;
  onDismiss: (call: QueuedCall) => void | Promise<void>;
}

const formatWait = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
};

const waitTone = (ms: number) => {
  if (ms > 3 * 60 * 1000) return 'text-destructive';
  if (ms > 60 * 1000) return 'text-amber-500';
  return 'text-muted-foreground';
};

const sourceLabel: Record<QueueSource, string> = {
  live_inbound: 'Live inbound',
  voice_app: 'Voice app',
  callback: 'Callback',
};

export const CallQueueList = ({ queueState, onAnswer, onEscalate, onDismiss }: CallQueueListProps) => {
  const { queue, metrics, nextInLine, isLoading, soundEnabled, setSoundEnabled, waitMs, refresh, simulateInbound } =
    queueState;
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<'all' | QueueRegion>('all');
  const [source, setSource] = useState<'all' | QueueSource>('all');
  const [priority, setPriority] = useState<'all' | 'urgent' | 'normal'>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return queue.filter((call) => {
      if (region !== 'all' && call.region !== region) return false;
      if (source !== 'all' && call.source !== source) return false;
      const urgent = call.isUrgent || waitMs(call) > 3 * 60 * 1000;
      if (priority === 'urgent' && !urgent) return false;
      if (priority === 'normal' && urgent) return false;
      if (!term) return true;
      return [call.displayName, call.phoneNumber, call.reason]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [queue, region, source, priority, search, waitMs]);

  const stats = [
    { label: 'Waiting', value: `${metrics.waiting}`, hint: `${metrics.urgent} urgent`, icon: Users },
    { label: 'Longest wait', value: formatWait(metrics.longestWaitMs), hint: 'oldest caller', icon: Timer },
    { label: 'Average wait', value: formatWait(metrics.averageWaitMs), hint: 'across queue', icon: Timer },
    { label: 'Regions', value: `🇺🇸 ${metrics.usa} · 🇳🇬 ${metrics.nigeria}`, hint: 'inbound split', icon: PhoneIncoming },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PhoneIncoming className="h-5 w-5" />
                Call Queue
              </CardTitle>
              <CardDescription>
                Calls are routed first-in, first-out to the next available admin.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                <Label htmlFor="queue-sound" className="text-xs text-muted-foreground">
                  Chime
                </Label>
                <Switch id="queue-sound" checked={soundEnabled} onCheckedChange={setSoundEnabled} />
              </div>
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              {nextInLine && (
                <Button size="sm" className="gap-2" onClick={() => void onAnswer(nextInLine)}>
                  <PhoneCall className="h-4 w-4" />
                  Answer next
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative md:col-span-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name, phone, reason"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={region} onValueChange={(v) => setRegion(v as typeof region)}>
              <SelectTrigger><SelectValue placeholder="Region" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                <SelectItem value="USA">🇺🇸 USA (+1)</SelectItem>
                <SelectItem value="Nigeria">🇳🇬 Nigeria (+234)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="live_inbound">Live inbound</SelectItem>
                <SelectItem value="voice_app">Voice app</SelectItem>
                <SelectItem value="callback">Callbacks</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No callers waiting. New inbound calls appear here instantly.
            </p>
          )}

          {filtered.map((call, index) => {
            const wait = waitMs(call);
            const urgent = call.isUrgent || wait > 3 * 60 * 1000;
            const isNext = nextInLine?.id === call.id;
            return (
              <div
                key={call.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                  urgent ? 'border-destructive/50 bg-destructive/5' : 'bg-card'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{call.displayName}</span>
                    <Badge variant="outline">{call.region === 'Nigeria' ? '🇳🇬 +234' : '🇺🇸 +1'}</Badge>
                    <Badge variant="secondary">{sourceLabel[call.source]}</Badge>
                    {urgent && <Badge variant="destructive">Urgent</Badge>}
                    {isNext && <Badge className="bg-primary">Next up · #{index + 1}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {call.phoneNumber ?? 'No phone on file'}
                    {call.reason ? ` · ${call.reason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 text-sm font-mono ${waitTone(wait)}`}>
                    <Timer className="h-3.5 w-3.5" />
                    {formatWait(wait)}
                  </span>
                  <Button size="sm" className="gap-1" onClick={() => void onAnswer(call)}>
                    <PhoneCall className="h-4 w-4" />
                    Answer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void onEscalate(call)} disabled={urgent}>
                    <ArrowUpCircle className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void onDismiss(call)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Diagnostics · inbound simulation</CardTitle>
          <CardDescription>
            Live Twilio inbound calls now ring this queue automatically. These local test
            entries only exercise timers, routing and chimes — they never touch call records.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => simulateInbound('USA', 'USA driver')}>
            🇺🇸 Driver
          </Button>
          <Button variant="outline" size="sm" onClick={() => simulateInbound('USA', 'USA fleet owner')}>
            🇺🇸 Fleet owner
          </Button>
          <Button variant="outline" size="sm" onClick={() => simulateInbound('Nigeria', 'Nigeria driver')}>
            🇳🇬 Driver
          </Button>
          <Button variant="outline" size="sm" onClick={() => simulateInbound('Nigeria', 'Nigeria customer')}>
            🇳🇬 Customer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CallQueueList;
