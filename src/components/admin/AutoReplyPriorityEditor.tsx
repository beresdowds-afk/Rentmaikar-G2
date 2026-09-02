import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Crown,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
  Zap,
} from 'lucide-react';
import type { AutoReplyRule } from '@/hooks/useCannedReplies';
import {
  byEnginePriority,
  conflictPairCount,
  conflictsForRule,
  simulateAutoReply,
} from '@/lib/auto-reply-conflicts';

const ANY = '__any__';

interface Props {
  rules: AutoReplyRule[];
  isLoading?: boolean;
  onEdit: (rule: AutoReplyRule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onReorder: (orderedIds: string[]) => Promise<boolean> | void;
  onSetPriority: (id: string, priority: number) => Promise<boolean> | void;
}

export const AutoReplyPriorityEditor = ({
  rules,
  isLoading,
  onEdit,
  onDelete,
  onToggle,
  onReorder,
  onSetPriority,
}: Props) => {
  const [savingOrder, setSavingOrder] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testChannel, setTestChannel] = useState<string>(ANY);
  const [testRegion, setTestRegion] = useState<string>(ANY);

  const ordered = useMemo(() => [...rules].sort(byEnginePriority), [rules]);
  const conflictCount = useMemo(() => conflictPairCount(rules), [rules]);

  const simulation = useMemo(
    () =>
      testMessage.trim()
        ? simulateAutoReply(rules, testMessage, {
            channel: testChannel === ANY ? null : testChannel,
            region: testRegion === ANY ? null : testRegion,
          })
        : [],
    [rules, testMessage, testChannel, testRegion],
  );

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    setSavingOrder(true);
    await onReorder(next.map((r) => r.id));
    setSavingOrder(false);
  };

  if (isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }

  if (ordered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rules yet. Rules are optional — inbound messages are only auto-answered when an active
        rule matches.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Crown className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Priority order</span>
          <Badge variant="outline">Top rule wins</Badge>
          {savingOrder && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground">
          When several rules match the same inbound message, only the highest rule in this list
          replies. Move rules up or down to change who wins.
        </p>
        {conflictCount > 0 && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {conflictCount} overlapping rule pair{conflictCount > 1 ? 's' : ''} share keywords on
              the same channel/region. Only the higher rule will ever reply for those keywords.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="space-y-2">
        {ordered.map((rule, index) => {
          const conflicts = conflictsForRule(rule, rules);
          const losing = conflicts.filter((c) => !c.wins);
          const winning = conflicts.filter((c) => c.wins);

          return (
            <div key={rule.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0 || savingOrder}
                      onClick={() => move(index, -1)}
                      aria-label={`Move ${rule.name} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === ordered.length - 1 || savingOrder}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${rule.name} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">#{index + 1}</Badge>
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant="outline">match: {rule.match_type}</Badge>
                      {rule.channel && <Badge variant="secondary">{rule.channel}</Badge>}
                      {rule.region && <Badge variant="secondary">{rule.region}</Badge>}
                      <Badge variant="outline">cooldown {rule.cooldown_minutes}m</Badge>
                      <Badge variant="outline">fired {rule.trigger_count}x</Badge>
                      {!rule.is_active && <Badge variant="outline">paused</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Keywords: {rule.keywords.join(', ') || '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <div className="hidden sm:flex items-center gap-1 mr-1">
                    <Label className="text-[11px] text-muted-foreground">Priority</Label>
                    <Input
                      type="number"
                      className="h-8 w-16"
                      defaultValue={rule.priority}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isNaN(value) && value !== rule.priority) {
                          onSetPriority(rule.id, value);
                        }
                      }}
                    />
                  </div>
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(v) => onToggle(rule.id, v)}
                    aria-label="Toggle rule"
                  />
                  <Button variant="ghost" size="icon" onClick={() => onEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(rule.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {losing.length > 0 && (
                <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                  <EyeOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Shadowed by{' '}
                    {losing
                      .map((c) => `${c.otherName} (${c.keywords.join(', ')})`)
                      .join('; ')}
                    . Move this rule up to make it win.
                  </span>
                </div>
              )}
              {winning.length > 0 && (
                <div className="flex items-start gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
                  <Crown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Wins over{' '}
                    {winning.map((c) => `${c.otherName} (${c.keywords.join(', ')})`).join('; ')}.
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <span className="text-sm font-medium">Conflict tester</span>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label className="text-xs">Channel</Label>
            <Select value={testChannel} onValueChange={setTestChannel}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any channel</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Label className="text-xs">Region</Label>
            <Select value={testRegion} onValueChange={setTestRegion}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any region</SelectItem>
                <SelectItem value="USA">USA</SelectItem>
                <SelectItem value="Nigeria">Nigeria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Label className="text-xs">Inbound message</Label>
            <Input
              className="h-9"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="e.g. how much do I owe?"
            />
          </div>
        </div>

        {testMessage.trim() && (
          <div className="space-y-1.5">
            {simulation.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No rule matches this message — nothing is auto-sent.
              </p>
            ) : (
              simulation.map((hit) => (
                <div
                  key={hit.rule.id}
                  className={`flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                    hit.winner ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {hit.winner ? (
                    <Crown className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  <span className="font-medium">{hit.rule.name}</span>
                  <span>· matched {hit.keywords.join(', ')}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {hit.winner ? 'Replies' : 'Skipped'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoReplyPriorityEditor;
