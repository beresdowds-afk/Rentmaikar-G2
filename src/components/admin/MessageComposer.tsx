import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Save,
  Search,
  Send,
  Trash2,
  Users,
  Bell,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useCannedReplies } from '@/hooks/useCannedReplies';
import { UseCaseDraftPicker } from '@/components/admin/UseCaseDraftPicker';
import { renderPlaceholders, type PlaceholderValues } from '@/lib/reply-placeholders';

import {
  useMessageDrafts,
  useRecipientSearch,
  useRoleRecipients,
  useSendComposedMessage,
  type ComposerChannel,
  type ComposerDraft,
  type RecipientOption,
} from '@/hooks/useMessageComposer';

const CHANNELS: { value: ComposerChannel; label: string; icon: typeof Mail }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'in_app', label: 'In-app', icon: Bell },
];

const AUDIENCES: { value: string; label: string }[] = [
  { value: 'driver', label: 'All drivers' },
  { value: 'owner', label: 'All vehicle owners' },
  { value: 'admin', label: 'All admins' },
  { value: 'admin_assistant', label: 'All admin assistants' },
  { value: 'legal_support', label: 'Legal support staff' },
  { value: 'iot_support', label: 'IoT support staff' },
  { value: 'vehicle_support', label: 'Vehicle support staff' },
  { value: 'insurance_support', label: 'Insurance support staff' },
];

/**
 * Outbound composer for the messaging center — one form for email, SMS and
 * WhatsApp. Everything sent here lands in the same unified conversation thread.
 * Recipients can be a single contact or a bulk audience pulled from the database.
 */
export function MessageComposer({ onSent }: { onSent?: () => void }) {
  const [channel, setChannel] = useState<ComposerChannel>('email');
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [bulk, setBulk] = useState<RecipientOption[]>([]);

  const { results, isSearching } = useRecipientSearch(search);
  const { drafts, saveDraft, deleteDraft } = useMessageDrafts();
  const { send, sendBulk, isSending, bulkProgress } = useSendComposedMessage();
  const { fetchByRole, isLoading: isLoadingAudience } = useRoleRecipients();
  const { replies } = useCannedReplies();

  const channelReplies = useMemo(
    () => replies.filter((r) => r.is_active && (!r.channel || r.channel === channel)),
    [replies, channel],
  );

  const reachable = useMemo(
    () =>
      bulk.filter((r) =>
        channel === 'email' ? !!r.email : channel === 'in_app' ? !!r.user_id : !!r.phone,
      ).length,
    [bulk, channel],
  );

  /** Values we can already resolve for the selected recipient. */
  const livePlaceholders = useMemo<PlaceholderValues>(() => {
    const target = bulk.length === 1 ? bulk[0] : null;
    const name = (target?.full_name || recipientName || '').trim();
    if (!name && !email && !phone) return {};
    return {
      customer_name: name || undefined,
      first_name: name ? name.split(' ')[0] : undefined,
      customer_email: target?.email || email || undefined,
      customer_phone: target?.phone || phone || undefined,
      today: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    };
  }, [bulk, recipientName, email, phone]);

  /** What the recipient will actually read, with placeholders filled in. */
  const renderedBody = useMemo(
    () => renderPlaceholders(body, livePlaceholders, { keepUnknown: true }),
    [body, livePlaceholders],
  );


  const addRecipients = (people: RecipientOption[]) => {
    setBulk((prev) => {
      const map = new Map(prev.map((p) => [p.user_id, p]));
      people.forEach((p) => map.set(p.user_id, p));
      return Array.from(map.values());
    });
  };

  const reset = () => {
    setRecipientUserId(null);
    setRecipientName('');
    setEmail('');
    setPhone('');
    setSubject('');
    setBody('');
    setDraftId(undefined);
    setSearch('');
    setBulk([]);
  };

  const currentDraft = () => ({
    id: draftId,
    channel,
    recipientUserId,
    recipientName,
    email,
    phone,
    subject,
    body,
  });

  const loadDraft = (d: ComposerDraft) => {
    setChannel(d.channel);
    setRecipientUserId(d.recipientUserId);
    setRecipientName(d.recipientName);
    setEmail(d.email);
    setPhone(d.phone);
    setSubject(d.subject);
    setBody(d.body);
    setDraftId(d.id);
  };

  const handleSend = async () => {
    if (bulk.length > 0) {
      const result = await sendBulk(bulk, { channel, subject, body });
      if (result.sent > 0) {
        if (draftId) deleteDraft(draftId);
        reset();
        onSent?.();
      }
      return;
    }

    const outcome = await send({
      channel,
      recipientUserId,
      recipientName,
      email,
      phone,
      subject,
      body,
    });
    if (outcome.delivered) {
      if (draftId) deleteDraft(draftId);
      reset();
      onSent?.();
    }

  };


  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" /> New message
          </CardTitle>
          <CardDescription>
            Draft and send on any channel. Replies thread back into the unified inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={channel === value ? 'default' : 'outline'}
                onClick={() => setChannel(value)}
              >
                <Icon className="mr-2 h-4 w-4" /> {label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient-search">Find users</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="recipient-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or phone"
                className="pl-9"
              />
            </div>
            {isSearching && (
              <p className="text-xs text-muted-foreground">Searching…</p>
            )}
            {results.length > 0 && (
              <>
                <div className="max-h-40 divide-y overflow-y-auto rounded-md border">
                  {results.map((r) => (
                    <div key={r.user_id} className="flex items-center gap-2 px-2 py-1">
                      <button
                        type="button"
                        className={cn(
                          'flex-1 rounded px-1 py-1 text-left text-sm hover:bg-muted/60',
                          recipientUserId === r.user_id && 'bg-muted',
                        )}
                        onClick={() => {
                          setRecipientUserId(r.user_id);
                          setRecipientName(r.full_name || r.email || 'User');
                          setEmail(r.email || '');
                          setPhone(r.phone || '');
                          setSearch('');
                        }}
                      >
                        <span className="font-medium">{r.full_name || 'Unnamed user'}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[r.email, r.phone].filter(Boolean).join(' · ') || 'No contact details'}
                        </span>
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addRecipients([r])}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => addRecipients(results)}
                >
                  <Users className="mr-2 h-4 w-4" /> Add all {results.length} results
                </Button>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Bulk audience</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                onValueChange={async (role) => {
                  const people = await fetchByRole(role);
                  addRecipients(people);
                }}
              >
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue placeholder="Add everyone with a role…" />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLoadingAudience && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {bulk.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {bulk.length} selected ·{' '}
                  <span className="text-muted-foreground">
                    {reachable} reachable by {channel.toUpperCase()}
                  </span>
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulk([])}>
                  Clear all
                </Button>
              </div>
              <ScrollArea className="max-h-32">
                <div className="flex flex-wrap gap-2 pr-2">
                  {bulk.map((r) => {
                    const ok =
                      channel === 'email' ? !!r.email : channel === 'in_app' ? !!r.user_id : !!r.phone;
                    return (
                      <Badge
                        key={r.user_id}
                        variant={ok ? 'secondary' : 'outline'}
                        className={cn('gap-1', !ok && 'text-muted-foreground line-through')}
                      >
                        {r.full_name || r.email || r.phone || 'User'}
                        <button
                          type="button"
                          aria-label={`Remove ${r.full_name || 'recipient'}`}
                          onClick={() =>
                            setBulk((prev) => prev.filter((p) => p.user_id !== r.user_id))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              </ScrollArea>
              {bulkProgress && (
                <div className="space-y-1">
                  {isSending && (
                    <Progress value={(bulkProgress.completed / bulkProgress.total) * 100} />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {bulkProgress.completed}/{bulkProgress.total} processed ·{' '}
                    {bulkProgress.sent} delivered ·{' '}
                    <span className={bulkProgress.failed > 0 ? 'text-destructive' : undefined}>
                      {bulkProgress.failed} failed
                    </span>
                  </p>
                  {!isSending && !!bulkProgress.failures?.length && (
                    <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-destructive">
                      {bulkProgress.failures.map((f, i) => (
                        <li key={`${f.recipient}-${i}`}>
                          {f.recipient}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

            </div>
          )}


          {bulk.length === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="compose-email">Email address</Label>
                <Input
                  id="compose-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="driver@example.com"
                  disabled={channel !== 'email'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="compose-phone">Phone number</Label>
                <Input
                  id="compose-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+2348012345678"
                  disabled={channel === 'email' || channel === 'in_app'}
                />
              </div>
            </div>
          )}


          {channel === 'email' && (
            <div className="space-y-2">
              <Label htmlFor="compose-subject">Subject</Label>
              <Input
                id="compose-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Message from Rentmaikar"
              />
            </div>
          )}

          <UseCaseDraftPicker
            channel={channel === 'in_app' ? 'email' : channel}
            placeholderValues={livePlaceholders}
            onApply={({ body: draftBody, subject: draftSubject }) => {
              setBody(draftBody);
              if (channel === 'email') setSubject(draftSubject);
            }}
          />

          {channelReplies.length > 0 && (
            <div className="space-y-2">
              <Label>Insert a saved reply</Label>
              <Select onValueChange={(id) => {
                const reply = channelReplies.find((r) => r.id === id);
                if (reply) setBody((prev) => (prev ? `${prev}\n\n${reply.body}` : reply.body));
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {channelReplies.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}


          <div className="space-y-2">
            <Label htmlFor="compose-body">Message</Label>
            <Textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              className="min-h-[160px]"
            />
            <p className="text-xs text-muted-foreground">{body.length} characters</p>
            {renderedBody !== body && (
              <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                <p className="text-xs font-medium">Preview with recipient details</p>
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">
                  {renderedBody}
                </pre>
                <p className="text-[11px] text-muted-foreground">
                  Remaining tokens are resolved from the recipient&apos;s rental record before
                  sending.
                </p>
              </div>
            )}
          </div>


          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSend} disabled={isSending || !body.trim()}>
              {isSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send {channel.toUpperCase()}
              {bulk.length > 0 ? ` to ${reachable} recipient${reachable === 1 ? '' : 's'}` : ''}

            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const saved = saveDraft(currentDraft());
                setDraftId(saved.id);
              }}
              disabled={!body.trim()}
            >
              <Save className="mr-2 h-4 w-4" /> Save draft
            </Button>
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drafts</CardTitle>
          <CardDescription>Saved on this device.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[420px]">
            {drafts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No saved drafts.</p>
            ) : (
              <div className="divide-y">
                {drafts.map((d) => (
                  <div key={d.id} className="flex items-start gap-2 p-3">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => loadDraft(d)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="h-5 text-[10px] uppercase">
                          {d.channel}
                        </Badge>
                        <span className="truncate text-sm font-medium">
                          {d.recipientName || d.email || d.phone || 'No recipient'}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {format(new Date(d.savedAt), 'MMM d, HH:mm')}
                      </p>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteDraft(d.id)}
                      aria-label="Delete draft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default MessageComposer;
