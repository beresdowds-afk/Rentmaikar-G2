import { useMemo, useState, useEffect, useRef } from 'react';
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
  Sparkles,
  Paperclip,
  Eye,
  Check,
  CheckCircle2,
  Clock,
  Info,
  ChevronRight,
  ShieldCheck,
  Globe,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCannedReplies } from '@/hooks/useCannedReplies';
import { UseCaseDraftPicker } from '@/components/admin/UseCaseDraftPicker';
import { renderPlaceholders, type PlaceholderValues } from '@/lib/reply-placeholders';
import {
  WHATSAPP_TEMPLATES_CATALOG,
  getWhatsAppSenderForRecipient,
} from '@/lib/whatsapp-templates-registry';
import { calculateSmsSegments, getSmsProviderAndSender } from '@/lib/sms-templates';
import { OUTGOING_EMAIL_CONFIG } from '@/lib/email-config';
import {
  validateAttachmentFile,
  formatFileSize,
  MAX_ATTACHMENTS,
} from '@/lib/inbox-attachments';

import {
  useMessageDrafts,
  useRecipientSearch,
  useRoleRecipients,
  useSendComposedMessage,
  type ComposerChannel,
  type ComposerDraft,
  type RecipientOption,
} from '@/hooks/useMessageComposer';

const CHANNELS: { value: ComposerChannel; label: string; icon: typeof Mail; color: string }[] = [
  { value: 'email', label: 'Email', icon: Mail, color: 'text-blue-500' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-500' },
  { value: 'sms', label: 'SMS', icon: Phone, color: 'text-emerald-500' },
  { value: 'in_app', label: 'In-App', icon: Bell, color: 'text-amber-500' },
];

const AUDIENCES: { value: string; label: string }[] = [
  { value: 'driver', label: 'All Drivers' },
  { value: 'owner', label: 'All Vehicle Owners' },
  { value: 'admin', label: 'All Admins' },
  { value: 'admin_assistant', label: 'All Admin Assistants' },
  { value: 'legal_support', label: 'Legal Support Staff' },
  { value: 'iot_support', label: 'IoT Support Staff' },
  { value: 'vehicle_support', label: 'Vehicle Support Staff' },
  { value: 'insurance_support', label: 'Insurance Support Staff' },
];

const QUICK_PLACEHOLDERS = [
  { label: 'Customer Name', value: '{{customer_name}}' },
  { label: 'First Name', value: '{{first_name}}' },
  { label: 'Vehicle Model', value: '{{vehicle_model}}' },
  { label: 'Rental ID', value: '{{rental_id}}' },
  { label: 'Today', value: '{{today}}' },
  { label: 'Support Phone', value: '{{support_phone}}' },
];

const ACTIVE_DRAFT_KEY = 'rentmaikar_active_composer_draft';

/**
 * Upgraded Message Editor & Omnichannel Outbound Composer.
 * Supports Email, WhatsApp HSM & Free-form, SMS with segment calculation, and In-App notifications.
 * Features persistent auto-save, live multi-channel preview, file attachments, and smart templates.
 */
export function MessageComposer({ onSent }: { onSent?: () => void }) {
  const [channel, setChannel] = useState<ComposerChannel>('email');
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [emailFromAlias, setEmailFromAlias] = useState<string>(OUTGOING_EMAIL_CONFIG.support);
  const [smsOptOut, setSmsOptOut] = useState(true);
  const [whatsappTemplateId, setWhatsappTemplateId] = useState<string>('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [bulk, setBulk] = useState<RecipientOption[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'drafts'>('editor');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { results, isSearching } = useRecipientSearch(search);
  const { drafts, saveDraft, deleteDraft } = useMessageDrafts();
  const { send, sendBulk, isSending, bulkProgress } = useSendComposedMessage();
  const { fetchByRole, isLoading: isLoadingAudience } = useRoleRecipients();
  const { replies } = useCannedReplies();

  // Restore active draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.body || parsed.subject) {
          if (parsed.channel) setChannel(parsed.channel);
          if (parsed.recipientName) setRecipientName(parsed.recipientName);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.phone) setPhone(parsed.phone);
          if (parsed.subject) setSubject(parsed.subject);
          if (parsed.body) setBody(parsed.body);
          if (parsed.recipientUserId) setRecipientUserId(parsed.recipientUserId);
          setLastAutoSaveTime(parsed.savedAt || 'Recently restored');
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  // Debounced auto-save active draft
  useEffect(() => {
    if (!body && !subject && !email && !phone) return;

    const timer = setTimeout(() => {
      const nowStr = format(new Date(), 'h:mm a');
      const payload = {
        channel,
        recipientUserId,
        recipientName,
        email,
        phone,
        subject,
        body,
        savedAt: nowStr,
      };
      localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(payload));
      setLastAutoSaveTime(nowStr);
    }, 700);

    return () => clearTimeout(timer);
  }, [channel, recipientUserId, recipientName, email, phone, subject, body]);

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

  // SMS segment counter
  const smsSegments = useMemo(() => {
    if (channel !== 'sms') return null;
    return calculateSmsSegments(renderedBody, smsOptOut);
  }, [channel, renderedBody, smsOptOut]);

  // Provider routing calculations
  const smsRouting = useMemo(() => {
    return getSmsProviderAndSender(phone);
  }, [phone]);

  const whatsappRouting = useMemo(() => {
    return getWhatsAppSenderForRecipient(phone);
  }, [phone]);

  const addRecipients = (people: RecipientOption[]) => {
    setBulk((prev) => {
      const map = new Map(prev.map((p) => [p.user_id, p]));
      people.forEach((p) => map.set(p.user_id, p));
      return Array.from(map.values());
    });
  };

  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const accepted: File[] = [];

    incoming.forEach((f) => {
      const err = validateAttachmentFile(f);
      if (err) {
        toast.error(err);
      } else {
        accepted.push(f);
      }
    });

    setPendingFiles((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > MAX_ATTACHMENTS) {
        toast.error(`Maximum of ${MAX_ATTACHMENTS} files allowed`);
        return merged.slice(0, MAX_ATTACHMENTS);
      }
      return merged;
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
    setPendingFiles([]);
    setLastAutoSaveTime(null);
    localStorage.removeItem(ACTIVE_DRAFT_KEY);
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
    setActiveTab('editor');
    toast.success('Draft loaded into editor');
  };

  const insertPlaceholder = (val: string) => {
    setBody((prev) => (prev ? `${prev} ${val}` : val));
  };

  const handleSend = async () => {
    if (bulk.length > 0) {
      let finalBody = body;
      if (channel === 'sms' && smsOptOut && !finalBody.toLowerCase().includes('stop to opt out')) {
        finalBody = `${finalBody}\n\nReply STOP to opt out.`;
      }
      const result = await sendBulk(bulk, { channel, subject, body: finalBody });
      if (result.sent > 0) {
        if (draftId) deleteDraft(draftId);
        reset();
        onSent?.();
      }
      return;
    }

    let finalBody = body;
    if (channel === 'sms' && smsOptOut && !finalBody.toLowerCase().includes('stop to opt out')) {
      finalBody = `${finalBody}\n\nReply STOP to opt out.`;
    }

    const outcome = await send({
      channel,
      recipientUserId,
      recipientName,
      email,
      phone,
      subject,
      body: finalBody,
      whatsappTemplateId: channel === 'whatsapp' && whatsappTemplateId ? whatsappTemplateId : undefined,
    });

    if (outcome.delivered) {
      if (draftId) deleteDraft(draftId);
      reset();
      onSent?.();
    }
  };

  return (
    <div className="space-y-4">
      {/* Editor Header Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card/60 backdrop-blur-sm">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Outbound Message Editor
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary font-normal">
              Omnichannel Dispatcher
            </Badge>
          </h3>
          <p className="text-xs text-muted-foreground">
            Compose and dispatch targeted messages across Email, SMS, WhatsApp, and In-App notifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lastAutoSaveTime && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 mr-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Auto-saved {lastAutoSaveTime}
            </span>
          )}

          <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'editor' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Composer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                activeTab === 'preview' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Live Preview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('drafts')}
              className={`px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                activeTab === 'drafts' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Drafts ({drafts.length})
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'editor' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* Main Composer Card */}
          <Card className="shadow-sm">
            <CardContent className="p-5 space-y-4">
              {/* Channel Selector Pills */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Delivery Channel</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CHANNELS.map(({ value, label, icon: Icon, color }) => (
                    <Button
                      key={value}
                      type="button"
                      variant={channel === value ? 'default' : 'outline'}
                      className="justify-start gap-2 h-9 text-xs"
                      onClick={() => setChannel(value)}
                    >
                      <Icon className={`h-4 w-4 ${channel === value ? 'text-primary-foreground' : color}`} />
                      <span>{label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Recipient Search & Selection */}
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="recipient-search" className="text-xs font-semibold">Recipient Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="recipient-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customer by name, email, or phone number..."
                    className="pl-8 h-8 text-xs bg-background"
                  />
                </div>
                {isSearching && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching platform users...
                  </p>
                )}
                {results.length > 0 && (
                  <div className="max-h-44 divide-y overflow-y-auto rounded-md border bg-card text-xs shadow-sm">
                    {results.map((r) => (
                      <div key={r.user_id} className="flex items-center justify-between p-2 hover:bg-muted/60">
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-foreground truncate">{r.full_name || 'Customer'}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[r.email, r.phone].filter(Boolean).join(' · ') || 'No contact info'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => {
                              setRecipientUserId(r.user_id);
                              setRecipientName(r.full_name || r.email || 'Customer');
                              setEmail(r.email || '');
                              setPhone(r.phone || '');
                              setSearch('');
                            }}
                          >
                            Set Single
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => addRecipients([r])}
                          >
                            + Bulk
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bulk Audience Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Bulk Audience Role</Label>
                  {isLoadingAudience && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading role contacts...</span>}
                </div>
                <Select
                  onValueChange={async (role) => {
                    const people = await fetchByRole(role);
                    addRecipients(people);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Add all users by role group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => (
                      <SelectItem key={a.value} value={a.value} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected Bulk Audience Chip Container */}
              {bulk.length > 0 && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">
                      {bulk.length} recipients selected · {reachable} reachable via {channel.toUpperCase()}
                    </span>
                    <Button type="button" size="sm" variant="ghost" className="h-5 px-1.5 text-[11px]" onClick={() => setBulk([])}>
                      Clear all
                    </Button>
                  </div>
                  <ScrollArea className="max-h-24">
                    <div className="flex flex-wrap gap-1.5">
                      {bulk.map((r) => {
                        const ok = channel === 'email' ? !!r.email : channel === 'in_app' ? !!r.user_id : !!r.phone;
                        return (
                          <Badge
                            key={r.user_id}
                            variant={ok ? 'secondary' : 'outline'}
                            className={`gap-1 text-[11px] ${!ok ? 'opacity-60 line-through text-destructive' : ''}`}
                          >
                            <span>{r.full_name || r.email || r.phone || 'User'}</span>
                            <button
                              type="button"
                              onClick={() => setBulk((prev) => prev.filter((p) => p.user_id !== r.user_id))}
                              className="hover:text-destructive"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {bulkProgress && (
                    <div className="space-y-1 pt-2 border-t">
                      {isSending && <Progress value={(bulkProgress.completed / bulkProgress.total) * 100} />}
                      <p className="text-[11px] text-muted-foreground">
                        {bulkProgress.completed}/{bulkProgress.total} processed · {bulkProgress.sent} sent ·{' '}
                        {bulkProgress.failed > 0 && <span className="text-destructive font-semibold">{bulkProgress.failed} failed</span>}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Single Contact Input Fields if not bulk */}
              {bulk.length === 0 && (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="compose-email" className="text-xs">Recipient Email</Label>
                    <Input
                      id="compose-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="driver@example.com"
                      disabled={channel !== 'email'}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="compose-phone" className="text-xs">Recipient Phone</Label>
                    <Input
                      id="compose-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+2348012345678 or +1608..."
                      disabled={channel === 'email' || channel === 'in_app'}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Email Specific Configuration */}
              {channel === 'email' && (
                <div className="grid gap-2 sm:grid-cols-12 p-3 rounded-lg border bg-muted/20">
                  <div className="sm:col-span-8 space-y-1">
                    <Label htmlFor="compose-subject" className="text-xs font-semibold">Subject Line</Label>
                    <Input
                      id="compose-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Important notice from Rentmaikar"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="sm:col-span-4 space-y-1">
                    <Label className="text-xs font-semibold">From Sender Alias</Label>
                    <Select value={emailFromAlias} onValueChange={setEmailFromAlias}>
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OUTGOING_EMAIL_CONFIG.support}>support@notify.rentmaikar.com</SelectItem>
                        <SelectItem value={OUTGOING_EMAIL_CONFIG.payments}>payments@notify.rentmaikar.com</SelectItem>
                        <SelectItem value={OUTGOING_EMAIL_CONFIG.documents}>documents@notify.rentmaikar.com</SelectItem>
                        <SelectItem value={OUTGOING_EMAIL_CONFIG.admin}>admin@notify.rentmaikar.com</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* WhatsApp Specific Configuration */}
              {channel === 'whatsapp' && (
                <div className="space-y-2.5 rounded-lg border bg-green-500/10 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4" />
                      Official WhatsApp Business Routing
                    </span>
                    <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-[10px]">
                      {whatsappRouting.provider} · {whatsappRouting.region}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Outbound sender: <strong>{whatsappRouting.designatedSenderNumber}</strong> ({whatsappRouting.label})
                  </p>

                  <Select
                    value={whatsappTemplateId}
                    onValueChange={(val) => {
                      setWhatsappTemplateId(val);
                      const tpl = WHATSAPP_TEMPLATES_CATALOG.find((t) => t.id === val);
                      if (tpl) {
                        const rendered = renderPlaceholders(tpl.body, livePlaceholders, { keepUnknown: false });
                        setBody(rendered);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Apply Meta-Approved WhatsApp HSM Template..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {WHATSAPP_TEMPLATES_CATALOG.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          <span className="font-semibold">{t.title}</span>{' '}
                          <span className="text-[10px] text-muted-foreground">({t.category})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* SMS Specific Configuration */}
              {channel === 'sms' && (
                <div className="p-3 rounded-lg border bg-emerald-500/10 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      Route: {smsRouting.providerName} (Sender: {smsRouting.senderId})
                    </span>
                    {smsSegments && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {smsSegments.characterCount} chars · {smsSegments.segments} segment{smsSegments.segments === 1 ? '' : 's'} ({smsSegments.encoding})
                      </Badge>
                    )}
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground">
                    <Checkbox
                      checked={smsOptOut}
                      onCheckedChange={(c) => setSmsOptOut(c === true)}
                    />
                    <span>Append A2P opt-out footer (&quot;Reply STOP to opt out&quot;)</span>
                  </label>
                </div>
              )}

              {/* Use Case Draft Picker */}
              <UseCaseDraftPicker
                channel={channel === 'in_app' ? 'email' : channel}
                placeholderValues={livePlaceholders}
                onApply={({ body: draftBody, subject: draftSubject }) => {
                  setBody(draftBody);
                  if (channel === 'email') setSubject(draftSubject);
                }}
              />

              {/* Saved Canned Replies */}
              {channelReplies.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Insert Canned Template</Label>
                  <Select
                    onValueChange={(id) => {
                      const reply = channelReplies.find((r) => r.id === id);
                      if (reply) setBody((prev) => (prev ? `${prev}\n\n${reply.body}` : reply.body));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a canned response template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {channelReplies.map((r) => (
                        <SelectItem key={r.id} value={r.id} className="text-xs">
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Placeholders Toolbar */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-purple-500" /> Tags:
                </span>
                {QUICK_PLACEHOLDERS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => insertPlaceholder(p.value)}
                    className="px-2 py-0.5 rounded border bg-muted/40 hover:bg-muted text-[11px] font-mono transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Message Body Textarea */}
              <div className="space-y-1.5">
                <Label htmlFor="compose-body" className="text-xs font-semibold">Message Content</Label>
                <Textarea
                  id="compose-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Draft your message content here…"
                  className="min-h-[160px] text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{body.length} characters</span>
                  {channel === 'sms' && smsSegments && (
                    <span className="font-mono">
                      {smsSegments.charsRemainingInSegment} chars left in segment {smsSegments.segments}
                    </span>
                  )}
                </div>
              </div>

              {/* File Attachments */}
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={(e) => handleAddFiles(e.target.files)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pendingFiles.length >= MAX_ATTACHMENTS}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach Files
                    {pendingFiles.length > 0 && ` (${pendingFiles.length})`}
                  </Button>
                </div>

                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingFiles.map((file, i) => (
                      <div
                        key={`${file.name}-${i}`}
                        className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-xs"
                      >
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[160px] truncate font-medium">{file.name}</span>
                        <span className="text-muted-foreground text-[10px]">({formatFileSize(file.size)})</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-destructive ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
                <Button
                  onClick={handleSend}
                  disabled={isSending || !body.trim()}
                  className="gap-2 shadow-sm"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Dispatch {channel.toUpperCase()}
                  {bulk.length > 0 ? ` (${reachable} recipients)` : ''}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    const saved = saveDraft(currentDraft());
                    setDraftId(saved.id);
                    toast.success('Draft saved to storage');
                  }}
                  disabled={!body.trim()}
                  className="gap-1.5 text-xs"
                >
                  <Save className="h-3.5 w-3.5" /> Save to Drafts
                </Button>

                <Button variant="ghost" onClick={reset} className="text-xs">
                  Clear Form
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Helper Sidebar */}
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Delivery Standards
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-xs space-y-3 text-muted-foreground leading-relaxed">
                <div>
                  <p className="font-semibold text-foreground">Email Route:</p>
                  <p>Delivered via Resend verified SPF/DKIM on notify.rentmaikar.com.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">SMS Regulations:</p>
                  <p>Termii telecom routes for Nigeria (+234); Sent.dm / Twilio 10DLC for USA (+1).</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">WhatsApp Compliance:</p>
                  <p>Meta Cloud API with automated 24-hr customer service window tracking.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Recent Saved Drafts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                {drafts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No saved drafts yet.</p>
                ) : (
                  <div className="divide-y max-h-56 overflow-y-auto">
                    {drafts.slice(0, 4).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => loadDraft(d)}
                        className="w-full text-left py-2 hover:bg-muted/40 transition-colors block"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <Badge variant="outline" className="text-[10px] uppercase">{d.channel}</Badge>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(d.savedAt), 'MMM d')}</span>
                        </div>
                        <p className="text-xs text-foreground font-medium truncate mt-0.5">
                          {d.recipientName || d.email || d.phone || 'No recipient'}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{d.body}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Live Customer Preview Tab */}
      {activeTab === 'preview' && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> Live Multi-Channel Customer Preview
            </CardTitle>
            <CardDescription>
              Simulates how the recipient will perceive this outbound dispatch on their device with tokens replaced.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40 text-xs">
                <div>
                  <span className="font-semibold text-foreground">Target: </span>
                  <span>{recipientName || email || phone || 'Sample Recipient'}</span>
                </div>
                <Badge variant="outline" className="uppercase font-mono">{channel}</Badge>
              </div>

              {/* Visual simulated bubble */}
              {channel === 'email' && (
                <div className="rounded-xl border shadow-sm bg-background overflow-hidden">
                  <div className="p-3 border-b bg-muted/20 text-xs space-y-1">
                    <p><strong>From:</strong> {emailFromAlias}</p>
                    <p><strong>To:</strong> {email || 'customer@example.com'}</p>
                    <p><strong>Subject:</strong> {subject || 'Notice from Rentmaikar'}</p>
                  </div>
                  <div className="p-6 text-sm whitespace-pre-wrap leading-relaxed">
                    {renderedBody || <span className="italic text-muted-foreground">Draft has no body content</span>}
                  </div>
                </div>
              )}

              {(channel === 'sms' || channel === 'whatsapp') && (
                <div className="max-w-sm mx-auto rounded-3xl border-4 border-slate-700 bg-slate-900 p-4 shadow-xl text-foreground">
                  <div className="text-center pb-3 border-b border-slate-800 text-[11px] text-slate-400">
                    {channel === 'whatsapp' ? 'WhatsApp Business' : 'SMS Message'}
                  </div>
                  <div className="py-6 space-y-2">
                    <div className={`p-3 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed ${
                      channel === 'whatsapp' ? 'bg-emerald-950/80 text-emerald-100 rounded-tr-none border border-emerald-800/40' : 'bg-blue-600 text-white rounded-tr-none'
                    }`}>
                      {renderedBody || <span className="italic opacity-60">Empty draft content</span>}
                      {channel === 'sms' && smsOptOut && (
                        <p className="mt-2 text-[10px] opacity-70">Reply STOP to opt out.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Drafts Manager Tab */}
      {activeTab === 'drafts' && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Saved Device Drafts
            </CardTitle>
            <CardDescription>Locally saved outbound message drafts on this browser device.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {drafts.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No saved drafts.</p>
            ) : (
              <div className="divide-y">
                {drafts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors">
                    <div className="space-y-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">{d.channel}</Badge>
                        <span className="text-sm font-semibold text-foreground">
                          {d.recipientName || d.email || d.phone || 'Unnamed recipient'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(d.savedAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      {d.subject && <p className="text-xs font-medium text-foreground truncate">{d.subject}</p>}
                      <p className="text-xs text-muted-foreground line-clamp-1">{d.body}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadDraft(d)}>
                        Load into Editor
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteDraft(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default MessageComposer;
