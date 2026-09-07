import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, LifeBuoy, MessageSquare, Send } from 'lucide-react';
import Seo from '@/components/seo/Seo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

interface PortalCase {
  id: string;
  case_number: string;
  subject: string;
  status: string;
  priority: string;
  origin_channel: string;
  created_at: string;
  last_activity_at: string;
  conversation_id: string | null;
}

interface PortalNote {
  id: string;
  body: string;
  author_role: string;
  author_name: string | null;
  created_at: string;
}

interface PortalMessage {
  id: string;
  content: string;
  channel: string;
  sender_type: string;
  created_at: string;
}

const statusTone: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  assigned: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  in_progress: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  waiting_customer: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  resolved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  closed: 'bg-muted text-muted-foreground',
};

const statusCopy: Record<string, string> = {
  open: 'Received — waiting for an agent',
  assigned: 'Assigned to an agent',
  in_progress: 'Being worked on',
  waiting_customer: 'Waiting for your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** Customer support portal — case status, updates and replies. */
export default function CustomerCasesPage() {
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<PortalNote[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);

  const selected = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId],
  );

  const loadCases = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('support_cases')
      .select(
        'id, case_number, subject, status, priority, origin_channel, created_at, last_activity_at, conversation_id',
      )
      .order('last_activity_at', { ascending: false });
    setIsLoading(false);
    if (error) {
      toast.error('Could not load your support cases');
      return;
    }
    const rows = (data ?? []) as unknown as PortalCase[];
    setCases(rows);
    setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
  }, []);

  const loadDetail = useCallback(async (row: PortalCase) => {
    const { data: noteRows } = await supabase
      .from('case_notes')
      .select('id, body, author_role, author_name, created_at')
      .eq('case_id', row.id)
      .order('created_at', { ascending: true });
    setNotes((noteRows ?? []) as unknown as PortalNote[]);

    if (row.conversation_id) {
      const { data } = await supabase
        .from('inbox_messages')
        .select('id, content, channel, sender_type, created_at')
        .eq('conversation_id', row.conversation_id)
        .order('created_at', { ascending: true })
        .limit(100);
      setMessages((data ?? []) as unknown as PortalMessage[]);
    } else {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setIsSending(true);
    const { error } = await supabase.rpc('customer_reply_to_case', {
      p_case_id: selected.id,
      p_body: reply.trim(),
    });
    setIsSending(false);
    if (error) {
      toast.error(error.message || 'Your reply could not be sent');
      return;
    }
    setReply('');
    toast.success('Reply sent to our support team');
    void loadCases();
    void loadDetail(selected);
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <Seo
        title="My Support Cases | Rentmaikar"
        description="Track your support cases, read updates from our team and reply to messages."
        path="/support/cases"
      />
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LifeBuoy className="h-6 w-6 text-primary" /> My support cases
        </h1>
        <p className="text-sm text-muted-foreground">
          Every call and message you have with our team, with its current status.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You have no support cases yet. Call or message us and a case will appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your cases</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[28rem]">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full border-b px-4 py-3 text-left transition hover:bg-muted/60 ${
                      c.id === selectedId ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.case_number}
                      </span>
                      <Badge className={statusTone[c.status] ?? ''}>
                        {statusCopy[c.status] ?? c.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{c.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {format(new Date(c.last_activity_at), 'MMM d, h:mm a')}
                    </p>
                  </button>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  {selected.subject}
                </CardTitle>
                <CardDescription>
                  {selected.case_number} · opened{' '}
                  {format(new Date(selected.created_at), 'MMM d, yyyy')} ·{' '}
                  {statusCopy[selected.status] ?? selected.status}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-72 rounded-md border p-3">
                  {[...notes.map((n) => ({
                    id: n.id,
                    body: n.body,
                    mine: n.author_role === 'customer',
                    who: n.author_role === 'customer' ? 'You' : n.author_name || 'Support team',
                    at: n.created_at,
                  })), ...messages.map((m) => ({
                    id: m.id,
                    body: m.content,
                    mine: m.sender_type === 'user',
                    who: m.sender_type === 'user' ? 'You' : `Support · ${m.channel.toUpperCase()}`,
                    at: m.created_at,
                  }))]
                    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                    .map((item) => (
                      <div
                        key={item.id}
                        className={`mb-3 max-w-[85%] rounded-md p-3 text-sm ${
                          item.mine ? 'ml-auto bg-primary/10' : 'bg-muted'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{item.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.who} · {format(new Date(item.at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    ))}
                  {notes.length === 0 && messages.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No updates yet — our team will be in touch.
                    </p>
                  )}
                </ScrollArea>

                <Separator />

                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply to our support team…"
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => void sendReply()}
                    disabled={isSending || !reply.trim() || selected.status === 'closed'}
                  >
                    {isSending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send reply
                  </Button>
                </div>
                {selected.status === 'closed' && (
                  <p className="text-right text-xs text-muted-foreground">
                    This case is closed. Message us to open a new one.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
