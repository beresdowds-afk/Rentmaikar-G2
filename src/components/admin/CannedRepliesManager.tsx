import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Zap, MessageSquareText, Loader2 } from 'lucide-react';
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5" />
          Canned Replies & Auto-Reply
        </CardTitle>
        <CardDescription>
          Save reusable replies and let keyword rules answer inbound messages automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="replies">
          <TabsList>
            <TabsTrigger value="replies">Canned replies ({replies.length})</TabsTrigger>
            <TabsTrigger value="rules">Auto-reply rules ({rules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="replies" className="space-y-3 pt-4">
            <Button size="sm" onClick={() => setReplyDraft({ is_active: true, sort_order: 0 })}>
              <Plus className="h-4 w-4 mr-1" /> New canned reply
            </Button>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : replies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No canned replies yet.</p>
            ) : (
              replies.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      {!r.is_active && <Badge variant="outline">Inactive</Badge>}
                      {r.channel && <Badge variant="secondary">{r.channel}</Badge>}
                      {r.region && <Badge variant="secondary">{r.region}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{r.body}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setReplyDraft(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteReply(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
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
        </Tabs>
      </CardContent>

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
              <Label>Message</Label>
              <Textarea
                rows={5}
                value={replyDraft?.body || ''}
                onChange={(e) => setReplyDraft((d) => ({ ...d, body: e.target.value }))}
                placeholder="Hi {{first_name}}, thanks for reaching out..."
              />
            </div>
            <PlaceholderPicker
              onInsert={(token) =>
                setReplyDraft((d) => ({ ...d, body: `${d?.body || ''}${token}` }))
              }
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
    </Card>
  );
};

export default CannedRepliesManager;
