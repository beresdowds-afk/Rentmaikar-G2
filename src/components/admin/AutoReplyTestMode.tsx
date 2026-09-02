import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FlaskConical, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type Outcome =
  | 'would_send'
  | 'shadowed'
  | 'cooldown'
  | 'paused'
  | 'out_of_scope'
  | 'empty_body';

interface Evaluation {
  ruleId: string;
  ruleName: string;
  priority: number;
  matchedKeywords: string[];
  outcome: Outcome;
  reason?: string;
  body?: string;
  cannedReplyTitle?: string | null;
}

interface SimulationResult {
  channel: string;
  region: string | null;
  wouldSend: boolean;
  placeholdersResolved: boolean;
  evaluations: Evaluation[];
}

const OUTCOME_META: Record<Outcome, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  would_send: { label: 'Would reply', variant: 'default' },
  shadowed: { label: 'Skipped (shadowed)', variant: 'secondary' },
  cooldown: { label: 'Held by cooldown', variant: 'outline' },
  paused: { label: 'Paused', variant: 'outline' },
  out_of_scope: { label: 'Out of scope', variant: 'outline' },
  empty_body: { label: 'Empty body', variant: 'destructive' },
};

export function AutoReplyTestMode({ defaultRegion }: { defaultRegion?: string | null }) {
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | 'email'>('sms');
  const [region, setRegion] = useState(defaultRegion || 'any');
  const [conversationId, setConversationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const run = async () => {
    if (!content.trim()) {
      toast.error('Enter a message to simulate');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('auto-reply-simulate', {
        body: {
          content,
          channel,
          region: region === 'any' ? null : region,
          conversationId: conversationId.trim() || null,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setResult(data as SimulationResult);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4" /> Test mode
        </CardTitle>
        <CardDescription>
          Simulate an inbound message against the live rules. Nothing is sent, logged, or counted against cooldowns.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any region</SelectItem>
                <SelectItem value="USA">USA</SelectItem>
                <SelectItem value="Nigeria">Nigeria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Thread ID (optional)</Label>
            <Input
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
              placeholder="Resolve real placeholders"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Inbound message</Label>
          <Textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="e.g. Hi, how much is the weekly rent?"
          />
        </div>

        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1" />}
          Simulate inbound message
        </Button>

        {result && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              {result.wouldSend ? (
                <><CheckCircle2 className="h-4 w-4 text-primary" /> An auto-reply would be sent</>
              ) : (
                <><XCircle className="h-4 w-4 text-muted-foreground" /> No auto-reply would be sent</>
              )}
            </div>
            {!result.placeholdersResolved && (
              <p className="text-xs text-muted-foreground">
                Placeholders are shown unresolved — add a thread ID to render real customer data.
              </p>
            )}
            {result.evaluations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rule keywords matched this message.</p>
            ) : (
              result.evaluations.map((ev) => {
                const meta = OUTCOME_META[ev.outcome] ?? OUTCOME_META.out_of_scope;
                return (
                  <div key={ev.ruleId} className="rounded-md border p-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{ev.ruleName}</span>
                      <Badge variant="outline">#{ev.priority}</Badge>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    {ev.matchedKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ev.matchedKeywords.map((k) => (
                          <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
                        ))}
                      </div>
                    )}
                    {ev.reason && <p className="text-xs text-muted-foreground">{ev.reason}</p>}
                    {ev.body && (
                      <p className="whitespace-pre-wrap rounded bg-muted p-2 text-sm">{ev.body}</p>
                    )}
                    {ev.cannedReplyTitle && (
                      <p className="text-xs text-muted-foreground">From canned reply: {ev.cannedReplyTitle}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
