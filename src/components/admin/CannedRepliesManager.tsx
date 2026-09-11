import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Zap, MessageSquareText, Loader2, Link2, Search, Filter, Sparkles, Car, Calendar, Brackets, Check, Copy } from 'lucide-react';
import {
  useCannedReplies,
  useAutoReplyRules,
  CannedReply,
  AutoReplyRule,
} from '@/hooks/useCannedReplies';
import { AutoReplyPreview } from '@/components/admin/AutoReplyPreview';
import { PlaceholderPicker } from '@/components/admin/PlaceholderPicker';
import { UseCaseDraftPicker } from '@/components/admin/UseCaseDraftPicker';
import type { UseCaseChannel } from '@/lib/message-use-cases';
import { AutoReplyPriorityEditor } from '@/components/admin/AutoReplyPriorityEditor';
import { AutoReplyTestMode } from '@/components/admin/AutoReplyTestMode';
import { ProduceOwnerMessageDialog } from '@/components/admin/ProduceOwnerMessageDialog';
import { OwnerPortalLinksTracker } from '@/components/admin/OwnerPortalLinksTracker';
import { REPLY_PLACEHOLDERS, usedPlaceholders, type PlaceholderDefinition } from '@/lib/reply-placeholders';
import { toast } from 'sonner';

const ANY = '__any__';

export const CannedRepliesManager = () => {
  const { replies, isLoading, saveReply, deleteReply } = useCannedReplies();
  const {
    rules,
    isLoading: rulesLoading,
    saveRule,
    toggleRule,
    deleteRule,
    reorderRules,
    setRulePriority,
  } = useAutoReplyRules();

  const [replyDraft, setReplyDraft] = useState<Partial<CannedReply> | null>(null);
  const [ruleDraft, setRuleDraft] = useState<(Partial<AutoReplyRule> & { keywordsText?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'sms' | 'email' | 'whatsapp'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [produceDialogOpen, setProduceDialogOpen] = useState(false);
  const [selectedReplyForProduce, setSelectedReplyForProduce] = useState<CannedReply | null>(null);
  const [showVariablesGuide, setShowVariablesGuide] = useState(false);
  const [guideCopiedToken, setGuideCopiedToken] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInsertToken = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setReplyDraft((d) => ({ ...d, body: `${d?.body || ''}${token}` }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const val = el.value || '';
    const next = val.slice(0, start) + token + val.slice(end);
    setReplyDraft((d) => ({ ...d, body: next }));
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const ruleKeywords = (ruleDraft?.keywordsText ?? (ruleDraft?.keywords || []).join(', '))
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const rulePreviewBody = ruleDraft?.canned_reply_id
    ? replies.find((r) => r.id === ruleDraft.canned_reply_id)?.body || ''
    : ruleDraft?.reply_body || '';

  const handleSaveReply = async () => {
    if (!replyDraft?.title?.trim() || !replyDraft?.body?.trim()) return;
    setSaving(true);
    const ok = await saveReply({
      ...replyDraft,
      title: replyDraft.title.trim(),
      body: replyDraft.body.trim(),
    });
    setSaving(false);
    if (ok) setReplyDraft(null);
  };

  const handleSaveRule = async () => {
    if (!ruleDraft?.name?.trim()) return;
    const keywords = (ruleDraft.keywordsText ?? (ruleDraft.keywords || []).join(', '))
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;
    setSaving(true);
    const ok = await saveRule({ ...ruleDraft, name: ruleDraft.name.trim(), keywords });
    setSaving(false);
    if (ok) setRuleDraft(null);
  };

  const filteredReplies = replies.filter((r) => {
    const matchesChannel =
      channelFilter === 'all' ||
      r.channel === channelFilter ||
      (!r.channel && channelFilter === 'all');
    const matchesSearch =
      !searchQuery ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.body.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesChannel && matchesSearch;
  });

  return (
    <Card className="shadow-sm border-border/80">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-primary" />
              Canned Messages Center & One-Time Portal Dispatch
            </CardTitle>
            <CardDescription className="text-xs">
              Manage editable multichannel templates for SMS, Email, and WhatsApp. Produce personalized messages with single-use links to owner dashboards.
            </CardDescription>
          </div>
          <Button
            className="gap-1.5 text-xs self-start sm:self-auto"
            onClick={() => {
              setSelectedReplyForProduce(null);
              setProduceDialogOpen(true);
            }}
          >
            <Link2 className="h-4 w-4" />
            Produce Message with One-Time Link
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="replies">
          <TabsList className="bg-muted/70 p-1">
            <TabsTrigger value="replies" className="text-xs">
              Canned Templates ({replies.length})
            </TabsTrigger>
            <TabsTrigger value="rules" className="text-xs">
              Auto-Reply Rules ({rules.length})
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              One-Time Portal Links
            </TabsTrigger>
          </TabsList>

          <TabsContent value="replies" className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    setSelectedReplyForProduce(null);
                    setProduceDialogOpen(true);
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Produce for Owner
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => setReplyDraft({ is_active: true, sort_order: 0 })}
                >
                  <Plus className="h-3.5 w-3.5" /> New template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                  onClick={() => setShowVariablesGuide(true)}
                  title="View all supported dynamic variables and how they auto-populate"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Dynamic Variables
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-44 sm:w-56">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search templates or variables..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs bg-background"
                  />
                </div>
                <Select
                  value={channelFilter}
                  onValueChange={(val) => setChannelFilter(val as any)}
                >
                  <SelectTrigger className="h-8 w-32 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground space-y-2 border rounded-xl border-dashed">
                <p>No canned templates found matching the current criteria.</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setChannelFilter('all');
                    setSearchQuery('');
                  }}
                >
                  Reset filters
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReplies.map((r) => {
                  const isOwnerNotice =
                    r.title.toLowerCase().includes('owner') ||
                    r.body.includes('[INDIVIDUAL PORTAL LINK]') ||
                    r.body.includes('{{individual_portal_link}}') ||
                    r.body.includes('[OWNER NAME]');
                  const detectedTokens = usedPlaceholders(r.body || '');

                  return (
                    <div
                      key={r.id}
                      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border p-4 transition-colors ${
                        isOwnerNotice
                          ? 'bg-card border-border hover:border-primary/40 shadow-xs'
                          : 'bg-card border-border hover:border-border/80'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{r.title}</span>
                          {!r.is_active && (
                            <Badge variant="outline" className="text-[10px]">
                              Inactive
                            </Badge>
                          )}
                          {r.channel === 'sms' && (
                            <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20">
                              SMS (10DLC)
                            </Badge>
                          )}
                          {r.channel === 'whatsapp' && (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                              WhatsApp
                            </Badge>
                          )}
                          {r.channel === 'email' && (
                            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                              Email
                            </Badge>
                          )}
                          {!r.channel && (
                            <Badge variant="secondary" className="text-[10px]">
                              Multichannel
                            </Badge>
                          )}
                          {r.region && (
                            <Badge variant="secondary" className="text-[10px]">
                              {r.region}
                            </Badge>
                          )}
                          {isOwnerNotice && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30">
                              One-Time Link Supported
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {r.body}
                        </p>

                        {/* Detected dynamic variables pills */}
                        {detectedTokens.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-0.5">
                              <Sparkles className="h-2.5 w-2.5 text-primary" /> Auto-populated:
                            </span>
                            {detectedTokens.slice(0, 5).map((tok) => {
                              const upperTok = tok.toUpperCase();
                              const isVehicleVar = upperTok.includes('VEHICLE') || upperTok.includes('PLATE');
                              const isDueVar = upperTok.includes('DUE');
                              return (
                                <Badge
                                  key={tok}
                                  variant="secondary"
                                  className={`text-[10px] font-mono px-1.5 py-0 border ${
                                    isVehicleVar
                                      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                      : isDueVar
                                      ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                      : 'bg-primary/5 text-primary border-primary/20'
                                  }`}
                                >
                                  [{upperTok}]
                                </Badge>
                              );
                            })}
                            {detectedTokens.length > 5 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{detectedTokens.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => {
                            setSelectedReplyForProduce(r);
                            setProduceDialogOpen(true);
                          }}
                          title="Generate a message with dynamic variables and one-time link"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Produce for Owner</span>
                          <span className="md:hidden">Produce</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setReplyDraft(r)}
                          title="Edit canned template"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteReply(r.id)}
                          title="Delete template"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rules" className="space-y-3 pt-4">
            <Button
              size="sm"
              onClick={() =>
                setRuleDraft({ is_active: true, match_type: 'any', priority: 100, cooldown_minutes: 60, keywordsText: '' })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> New auto-reply rule
            </Button>
            <AutoReplyPriorityEditor
              rules={rules}
              isLoading={rulesLoading}
              onEdit={(rule) => setRuleDraft({ ...rule, keywordsText: rule.keywords.join(', ') })}
              onDelete={deleteRule}
              onToggle={toggleRule}
              onReorder={reorderRules}
              onSetPriority={setRulePriority}
            />

            <AutoReplyTestMode />
          </TabsContent>

          <TabsContent value="links" className="space-y-3 pt-4">
            <OwnerPortalLinksTracker />
          </TabsContent>
        </Tabs>
      </CardContent>

      <ProduceOwnerMessageDialog
        open={produceDialogOpen}
        onOpenChange={setProduceDialogOpen}
        initialReply={selectedReplyForProduce}
      />

      {/* Canned reply editor */}
      <Dialog open={!!replyDraft} onOpenChange={(o) => !o && setReplyDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{replyDraft?.id ? 'Edit canned reply' : 'New canned reply'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <UseCaseDraftPicker
              channel={(replyDraft?.channel as UseCaseChannel) || 'sms'}
              onApply={({ body }) => setReplyDraft((d) => ({ ...d, body }))}
            />
            <div>
              <Label>Title</Label>
              <Input
                value={replyDraft?.title || ''}
                onChange={(e) => setReplyDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Payment reminder"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Message Template</Label>
                <button
                  type="button"
                  onClick={() => setShowVariablesGuide(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  Variables Guide
                </button>
              </div>
              <Textarea
                ref={textareaRef}
                rows={5}
                value={replyDraft?.body || ''}
                onChange={(e) => setReplyDraft((d) => ({ ...d, body: e.target.value }))}
                placeholder="Hi [OWNER NAME], your [VEHICLE_MAKE] [VEHICLE_MODEL] requires inspection by [DUE_DATE]..."
                className="font-mono text-xs"
              />
            </div>

            {/* Quick insert dynamic variables */}
            <div className="space-y-1.5 bg-muted/40 p-2.5 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Quick Insert Dynamic Variables:
                </span>
                <span className="text-[11px] text-muted-foreground">Inserts at cursor position</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {[
                  { token: '[VEHICLE_MAKE]', label: 'Vehicle Make', color: 'blue' },
                  { token: '[VEHICLE_MODEL]', label: 'Vehicle Model', color: 'blue' },
                  { token: '[DUE_DATE]', label: 'Due Date', color: 'amber' },
                  { token: '[LICENSE_PLATE]', label: 'License Plate', color: 'blue' },
                  { token: '[PICKUP_LOCATION]', label: 'Pickup Location', color: 'blue' },
                  { token: '[INDIVIDUAL PORTAL LINK]', label: 'One-Time Link', color: 'purple' },
                  { token: '[OWNER NAME]', label: 'Owner Name', color: 'emerald' },
                ].map((item) => (
                  <Button
                    key={item.token}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs font-mono bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                    onClick={() => handleInsertToken(item.token)}
                    title={`Click to insert ${item.token} at cursor`}
                  >
                    + {item.token}
                  </Button>
                ))}
              </div>
            </div>

            {/* Detected variables in draft */}
            {replyDraft?.body && usedPlaceholders(replyDraft.body).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground bg-primary/5 p-2 rounded-md border border-primary/10">
                <span className="font-medium text-primary">Active variables detected:</span>
                {usedPlaceholders(replyDraft.body).map((token) => (
                  <Badge
                    key={token}
                    variant="secondary"
                    className="text-[10px] font-mono bg-background text-foreground border shadow-2xs"
                  >
                    [{token.toUpperCase()}]
                  </Badge>
                ))}
              </div>
            )}

            <PlaceholderPicker
              onInsert={handleInsertToken}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Channel</Label>
                <Select
                  value={replyDraft?.channel || ANY}
                  onValueChange={(v) => setReplyDraft((d) => ({ ...d, channel: v === ANY ? null : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any channel</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Region</Label>
                <Select
                  value={replyDraft?.region || ANY}
                  onValueChange={(v) => setReplyDraft((d) => ({ ...d, region: v === ANY ? null : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All regions</SelectItem>
                    <SelectItem value="USA">USA</SelectItem>
                    <SelectItem value="Nigeria">Nigeria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={replyDraft?.is_active ?? true}
                onCheckedChange={(v) => setReplyDraft((d) => ({ ...d, is_active: v }))}
              />
              <Label>Active</Label>
            </div>
            <AutoReplyPreview
              body={replyDraft?.body || ''}
              channel={replyDraft?.channel}
              region={replyDraft?.region}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDraft(null)}>Cancel</Button>
            <Button onClick={handleSaveReply} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rule editor */}
      <Dialog open={!!ruleDraft} onOpenChange={(o) => !o && setRuleDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ruleDraft?.id ? 'Edit auto-reply rule' : 'New auto-reply rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Rule name</Label>
              <Input
                value={ruleDraft?.name || ''}
                onChange={(e) => setRuleDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Balance enquiry"
              />
            </div>
            <div>
              <Label>Keywords (comma separated)</Label>
              <Input
                value={ruleDraft?.keywordsText ?? ''}
                onChange={(e) => setRuleDraft((d) => ({ ...d, keywordsText: e.target.value }))}
                placeholder="balance, how much, owe"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Match type</Label>
                <Select
                  value={ruleDraft?.match_type || 'any'}
                  onValueChange={(v) => setRuleDraft((d) => ({ ...d, match_type: v as AutoReplyRule['match_type'] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any keyword</SelectItem>
                    <SelectItem value="all">All keywords</SelectItem>
                    <SelectItem value="exact">Exact message</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel</Label>
                <Select
                  value={ruleDraft?.channel || ANY}
                  onValueChange={(v) => setRuleDraft((d) => ({ ...d, channel: v === ANY ? null : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any channel</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Reply with canned reply</Label>
              <Select
                value={ruleDraft?.canned_reply_id || ANY}
                onValueChange={(v) => setRuleDraft((d) => ({ ...d, canned_reply_id: v === ANY ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Use custom text below</SelectItem>
                  {replies.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!ruleDraft?.canned_reply_id && (
              <div className="space-y-2">
                <UseCaseDraftPicker
                  channel={(ruleDraft?.channel as UseCaseChannel) || 'sms'}
                  label="Start from a use case draft"
                  onApply={({ body, keywords }) =>
                    setRuleDraft((d) => ({
                      ...d,
                      reply_body: body,
                      keywordsText: d?.keywordsText?.trim() ? d.keywordsText : keywords.join(', '),
                    }))
                  }
                />
                <Label>Custom reply text</Label>
                <Textarea
                  rows={4}
                  value={ruleDraft?.reply_body || ''}
                  onChange={(e) => setRuleDraft((d) => ({ ...d, reply_body: e.target.value }))}
                  placeholder="Hi {{first_name}}, your {{vehicle}} booking runs to {{booking_end}}."
                />
                <PlaceholderPicker
                  onInsert={(token) =>
                    setRuleDraft((d) => ({ ...d, reply_body: `${d?.reply_body || ''}${token}` }))
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority (lower runs first)</Label>
                <Input
                  type="number"
                  value={ruleDraft?.priority ?? 100}
                  onChange={(e) => setRuleDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Cooldown (minutes)</Label>
                <Input
                  type="number"
                  value={ruleDraft?.cooldown_minutes ?? 60}
                  onChange={(e) => setRuleDraft((d) => ({ ...d, cooldown_minutes: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={ruleDraft?.is_active ?? true}
                onCheckedChange={(v) => setRuleDraft((d) => ({ ...d, is_active: v }))}
              />
              <Label>Rule active</Label>
            </div>
            <AutoReplyPreview
              body={rulePreviewBody}
              channel={ruleDraft?.channel}
              region={ruleDraft?.region}
              keywords={ruleKeywords}
              matchType={(ruleDraft?.match_type as 'any' | 'all' | 'exact') || 'any'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDraft(null)}>Cancel</Button>
            <Button onClick={handleSaveRule} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dynamic Variables Guide Dialog */}
      <Dialog open={showVariablesGuide} onOpenChange={setShowVariablesGuide}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-primary" />
              Dynamic Variables & Auto-Population Guide
            </DialogTitle>
            <DialogDescription className="text-xs">
              Admins can insert any of these tokens into SMS, Email, or WhatsApp message templates. When the message is dispatched, the system auto-populates them from the recipient&apos;s records, assigned fleet vehicle, and billing schedule.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/20 space-y-1">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <Brackets className="h-4 w-4" /> Two Supported Formats:
              </div>
              <p className="text-muted-foreground">
                Both bracket format (e.g. <code className="font-mono text-primary font-semibold">[VEHICLE_MAKE]</code>, <code className="font-mono text-primary font-semibold">[DUE_DATE]</code>) and mustache format (e.g. <code className="font-mono text-primary font-semibold">{'{{vehicle_make}}'}</code>) are seamlessly supported and resolved.
              </p>
            </div>

            {/* Grouped by category */}
            {(['vehicle', 'billing', 'recipient', 'links', 'company'] as const).map((cat) => {
              const items = REPLY_PLACEHOLDERS.filter((p) => p.category === cat);
              if (items.length === 0) return null;

              const categoryTitle = {
                vehicle: '🚗 Vehicle & Fleet Variables',
                billing: '📅 Due Dates & Billing Variables',
                recipient: '👤 Recipient & Owner Information',
                links: '🔗 Secure Links & One-Time Portals',
                company: '🏢 Company & Support Information',
              }[cat];

              return (
                <div key={cat} className="space-y-2">
                  <h4 className="font-semibold text-foreground text-xs">{categoryTitle}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.token}
                        className="flex flex-col justify-between p-2.5 rounded-lg border bg-card hover:border-primary/40 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-primary text-xs">
                              {item.bracketSyntax}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                navigator.clipboard.writeText(item.bracketSyntax);
                                setGuideCopiedToken(item.bracketSyntax);
                                toast.success(`Copied ${item.bracketSyntax} to clipboard`);
                                setTimeout(() => setGuideCopiedToken(null), 1800);
                              }}
                            >
                              {guideCopiedToken === item.bracketSyntax ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span className="ml-1 text-[10px]">Copy</span>
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {item.description}
                          </p>
                        </div>
                        <div className="mt-2 pt-1.5 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>Example:</span>
                          <span className="font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">
                            {item.example}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowVariablesGuide(false)}>Close Guide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CannedRepliesManager;
