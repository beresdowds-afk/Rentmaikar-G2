import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Briefcase,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  StickyNote,
} from 'lucide-react';
import Seo from '@/components/seo/Seo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';

interface CaseRow {
  id: string;
  case_number: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  region: string;
  origin_channel: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_user_id: string | null;
  call_id: string | null;
  conversation_id: string | null;
  last_activity_at: string;
  created_at: string;
}

interface NoteRow {
  id: string;
  body: string;
  is_internal: boolean;
  author_role: string;
  author_name: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  event_type: string;
  description: string | null;
  created_at: string;
}

interface ThreadMessage {
  id: string;
  content: string;
  channel: string;
  sender_type: string;
  created_at: string;
}

const STATUSES = ['open', 'assigned', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const statusTone: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  assigned: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  in_progress: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  waiting_customer: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  resolved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  closed: 'bg-muted text-muted-foreground',
};

const label = (value: string) => value.replace(/_/g, ' ');

/** Case Management — every call and conversation as a trackable case. */
export default function AdminCasesPage() {
  const [params, setParams] = useSearchParams();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');

  const selectedId = params.get('case');
  const selected = useMemo(() => cases.find((c) => c.id === selectedId) ?? null, [cases, selectedId]);

  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteInternal, setNoteInternal] = useState(true);
  const [smsDraft, setSmsDraft] = useState('');
  const [smsChannel, setSmsChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const loadCases = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('support_cases')
      .select('*')
      .order('last_activity_at', { ascending: false })
      .limit(300);
    setIsLoading(false);
    if (error) {
      toast.error(error.message || 'Could not load cases');
      return;
    }
    setCases((data ?? []) as unknown as CaseRow[]);
  }, []);

  const loadDetail = useCallback(async (caseRow: CaseRow) => {
    const [notesRes, eventsRes] = await Promise.all([
      supabase
        .from('case_notes')
        .select('id, body, is_internal, author_role, author_name, created_at')
        .eq('case_id', caseRow.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('case_events')
        .select('id, event_type, description, created_at')
        .eq('case_id', caseRow.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    setNotes((notesRes.data ?? []) as unknown as NoteRow[]);
    setEvents((eventsRes.data ?? []) as unknown as EventRow[]);

    if (caseRow.conversation_id) {
      const { data } = await supabase
        .from('inbox_messages')
        .select('id, content, channel, sender_type, created_at')
        .eq('conversation_id', caseRow.conversation_id)
        .order('created_at', { ascending: true })
        .limit(100);
      setThread((data ?? []) as unknown as ThreadMessage[]);
    } else {
      setThread([]);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter === 'active' && ['resolved', 'closed'].includes(c.status)) return false;
      if (statusFilter !== 'active' && statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return [c.case_number, c.subject, c.customer_name ?? '', c.customer_phone ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [cases, statusFilter, search]);

  const updateCase = async (patch: Partial<CaseRow>) => {
    if (!selected) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('support_cases')
      .update(patch as never)
      .eq('id', selected.id);
    setIsSaving(false);
    if (error) {
      toast.error(error.message || 'Could not update the case');
      return;
    }
    await supabase.from('case_events').insert({
      case_id: selected.id,
      event_type: 'case_updated',
      description: `Case updated: ${Object.keys(patch).map(label).join(', ')}`,
    } as never);
    toast.success('Case updated');
    setCases((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
    void loadDetail({ ...selected, ...patch } as CaseRow);
  };

  const addNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    setIsSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('case_notes').insert({
      case_id: selected.id,
      body: noteDraft.trim(),
      is_internal: noteInternal,
      author_role: 'admin',
      author_id: userData.user?.id ?? null,
    } as never);
    setIsSaving(false);
    if (error) {
      toast.error(error.message || 'Could not save the note');
      return;
    }
    setNoteDraft('');
    toast.success(noteInternal ? 'Internal note saved' : 'Note shared with the customer');
    void loadDetail(selected);
  };

  const sendUpdate = async () => {
    if (!selected || !smsDraft.trim()) return;
    setIsSending(true);
    const { data, error } = await supabase.functions.invoke('case-send-sms', {
      body: { case_id: selected.id, body: smsDraft.trim(), channel: smsChannel },
    });
    setIsSending(false);
    if (error || (data as { error?: string })?.error) {
      const detail = (data as { error?: string })?.error ?? error?.message;
      toast.error(detail || 'The update could not be sent');
      return;
    }
    setSmsDraft('');
    toast.success('Update sent to the customer');
    void loadDetail(selected);
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <Seo
        title="Case Management | Rentmaikar Admin"
        description="Track every customer call and conversation as a case with status, notes and messages."
        path="/admin/cases"
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Briefcase className="h-6 w-6 text-primary" /> Case Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Every call and message thread becomes a case you can assign, note and follow up on.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadCases()} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Cases</CardTitle>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search case, customer or number"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active cases</SelectItem>
                <SelectItem value="all">All cases</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {label(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[32rem]">
              {filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No cases yet</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setParams({ case: c.id })}
                    className={`w-full border-b px-4 py-3 text-left transition hover:bg-muted/60 ${
                      c.id === selectedId ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.case_number}
                      </span>
                      <Badge className={`capitalize ${statusTone[c.status] ?? ''}`}>
                        {label(c.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{c.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.customer_name || c.customer_phone || 'Unknown customer'} ·{' '}
                      {format(new Date(c.last_activity_at), 'MMM d, h:mm a')}
                    </p>
                  </button>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {selected.origin_channel === 'call' ? (
                      <Phone className="h-5 w-5 text-primary" />
                    ) : (
                      <MessageSquare className="h-5 w-5 text-primary" />
                    )}
                    {selected.subject}
                  </CardTitle>
                  <CardDescription>
                    {selected.case_number} · {selected.region} · opened{' '}
                    {format(new Date(selected.created_at), 'MMM d, yyyy h:mm a')}
                    {selected.customer_phone ? ` · ${selected.customer_phone}` : ''}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={selected.status}
                    onValueChange={(v) => void updateCase({ status: v })}
                  >
                    <SelectTrigger className="w-[11rem] capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {label(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selected.priority}
                    onValueChange={(v) => void updateCase({ priority: v })}
                  >
                    <SelectTrigger className="w-[8rem] capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="notes">
                <TabsList>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="messages">Messages</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="notes" className="space-y-4 pt-4">
                  <ScrollArea className="h-64 rounded-md border p-3">
                    {notes.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No notes yet
                      </p>
                    ) : (
                      notes.map((n) => (
                        <div key={n.id} className="mb-3 rounded-md bg-muted/50 p-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="capitalize">
                              {n.author_name || n.author_role}
                              {n.is_internal ? ' · internal' : ' · shared with customer'}
                            </span>
                            <span>{format(new Date(n.created_at), 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a note about this case…"
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="note-internal"
                        checked={noteInternal}
                        onCheckedChange={setNoteInternal}
                      />
                      <Label htmlFor="note-internal" className="text-sm">
                        Staff only
                      </Label>
                    </div>
                    <Button onClick={() => void addNote()} disabled={isSaving || !noteDraft.trim()}>
                      <StickyNote className="mr-2 h-4 w-4" /> Save note
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="messages" className="space-y-4 pt-4">
                  <ScrollArea className="h-64 rounded-md border p-3">
                    {thread.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No SMS or WhatsApp messages on this case yet
                      </p>
                    ) : (
                      thread.map((m) => (
                        <div
                          key={m.id}
                          className={`mb-3 max-w-[80%] rounded-md p-3 text-sm ${
                            m.sender_type === 'user'
                              ? 'bg-muted'
                              : 'ml-auto bg-primary/10 text-foreground'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {m.channel.toUpperCase()} ·{' '}
                            {format(new Date(m.created_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                  <Separator />
                  <div className="space-y-3">
                    <Textarea
                      value={smsDraft}
                      onChange={(e) => setSmsDraft(e.target.value)}
                      placeholder="Send the customer an update…"
                      rows={3}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <Select
                        value={smsChannel}
                        onValueChange={(v) => setSmsChannel(v as 'sms' | 'whatsapp')}
                      >
                        <SelectTrigger className="w-[10rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => void sendUpdate()}
                        disabled={isSending || !smsDraft.trim() || !selected.customer_phone}
                      >
                        {isSending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Send update
                      </Button>
                    </div>
                    {!selected.customer_phone && (
                      <p className="text-xs text-muted-foreground">
                        This case has no phone number, so updates cannot be texted.
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="pt-4">
                  <ScrollArea className="h-72 rounded-md border p-3">
                    {events.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nothing recorded yet
                      </p>
                    ) : (
                      events.map((e) => (
                        <div key={e.id} className="mb-3 border-l-2 border-primary/40 pl-3">
                          <p className="text-sm">{e.description || label(e.event_type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(e.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex items-center justify-center p-12">
            <p className="text-sm text-muted-foreground">Pick a case to see its full history</p>
          </Card>
        )}
      </div>
    </div>
  );
}
