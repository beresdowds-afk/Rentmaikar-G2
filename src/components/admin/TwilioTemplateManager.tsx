import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageSquare, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

export interface TwilioTemplate {
  id: string;
  template_key: string;
  name: string;
  channel: "sms" | "whatsapp" | "both";
  country_code: string | null;
  language: string;
  body: string;
  placeholders: string[];
  description: string | null;
  twilio_content_sid: string | null;
  is_active: boolean;
  updated_at: string;
}

const TABLE = "twilio_message_templates";

/** Common placeholders available to every notification template. */
const COMMON_PLACEHOLDERS = [
  "first_name",
  "last_name",
  "vehicle_name",
  "plate_number",
  "amount",
  "currency",
  "due_date",
  "pickup_date",
  "return_date",
  "support_phone",
  "portal_link",
];

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_RE)) found.add(match[1]);
  return [...found];
}

export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(PLACEHOLDER_RE, (_m, key: string) => values[key] ?? `{{${key}}}`);
}

const emptyDraft = {
  template_key: "",
  name: "",
  channel: "both" as TwilioTemplate["channel"],
  country_code: "",
  language: "en",
  body: "",
  description: "",
  twilio_content_sid: "",
  is_active: true,
};

type Draft = typeof emptyDraft;

const channelLabel: Record<TwilioTemplate["channel"], string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  both: "SMS + WhatsApp",
};

export default function TwilioTemplateManager() {
  const [templates, setTemplates] = useState<TwilioTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<TwilioTemplate | null>(null);
  const [previewTarget, setPreviewTarget] = useState<TwilioTemplate | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select("*")
      .order("template_key", { ascending: true });
    if (error) {
      toast.error("Could not load templates", { description: error.message });
    } else {
      setTemplates((data ?? []) as TwilioTemplate[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      const matchesChannel =
        channelFilter === "all" ||
        t.channel === channelFilter ||
        (t.channel === "both" && channelFilter !== "all");
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.template_key.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q);
      return matchesChannel && matchesSearch;
    });
  }, [templates, search, channelFilter]);

  const draftPlaceholders = useMemo(() => extractPlaceholders(draft.body), [draft.body]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setEditorOpen(true);
  };

  const openEdit = (t: TwilioTemplate) => {
    setEditingId(t.id);
    setDraft({
      template_key: t.template_key,
      name: t.name,
      channel: t.channel,
      country_code: t.country_code ?? "",
      language: t.language,
      body: t.body,
      description: t.description ?? "",
      twilio_content_sid: t.twilio_content_sid ?? "",
      is_active: t.is_active,
    });
    setEditorOpen(true);
  };

  const insertPlaceholder = (name: string) => {
    setDraft((d) => ({ ...d, body: `${d.body}{{${name}}}` }));
  };

  const save = async () => {
    if (!draft.template_key.trim() || !draft.name.trim() || !draft.body.trim()) {
      toast.error("Key, name and message body are required");
      return;
    }
    setSaving(true);
    const payload = {
      template_key: draft.template_key.trim(),
      name: draft.name.trim(),
      channel: draft.channel,
      country_code: draft.country_code.trim() || null,
      language: draft.language.trim() || "en",
      body: draft.body,
      description: draft.description.trim() || null,
      twilio_content_sid: draft.twilio_content_sid.trim() || null,
      placeholders: draftPlaceholders,
      is_active: draft.is_active,
    };
    const query = editingId
      ? (supabase as any).from(TABLE).update(payload).eq("id", editingId)
      : (supabase as any).from(TABLE).insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }
    toast.success(editingId ? "Template updated" : "Template created");
    setEditorOpen(false);
    loadTemplates();
  };

  const toggleActive = async (t: TwilioTemplate) => {
    const { error } = await (supabase as any)
      .from(TABLE)
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (error) {
      toast.error("Could not update status", { description: error.message });
      return;
    }
    setTemplates((prev) =>
      prev.map((p) => (p.id === t.id ? { ...p, is_active: !p.is_active } : p)),
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from(TABLE).delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Delete failed", { description: error.message });
    } else {
      toast.success("Template deleted");
      setTemplates((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const openPreview = (t: TwilioTemplate) => {
    const values: Record<string, string> = {};
    for (const key of extractPlaceholders(t.body)) values[key] = "";
    setPreviewValues(values);
    setPreviewTarget(t);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">Twilio Message Templates</h3>
              <p className="text-sm text-muted-foreground">
                Manage SMS and WhatsApp notification copy and their placeholders.
              </p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New template
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Input
            placeholder="Search by name, key or content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="both">SMS + WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No templates yet. Create your first SMS/WhatsApp template.
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="outline">{channelLabel[t.channel]}</Badge>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {t.template_key}
                    </Badge>
                    {t.country_code && <Badge variant="outline">{t.country_code}</Badge>}
                    <Badge variant="outline">{t.language.toUpperCase()}</Badge>
                    {!t.is_active && <Badge variant="destructive">Inactive</Badge>}
                  </div>
                  {t.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  )}
                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">
                    {t.body}
                  </pre>
                  {t.placeholders?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.placeholders.map((p) => (
                        <Badge key={p} variant="secondary" className="font-mono text-xs">
                          {`{{${p}}}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={t.is_active}
                    onCheckedChange={() => toggleActive(t)}
                    aria-label="Toggle template active"
                  />
                  <Button variant="ghost" size="icon" onClick={() => openPreview(t)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>
              Use <span className="font-mono">{"{{placeholder}}"}</span> markers for dynamic values.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tpl-key">Template key</Label>
                <Input
                  id="tpl-key"
                  value={draft.template_key}
                  onChange={(e) => setDraft({ ...draft, template_key: e.target.value })}
                  placeholder="payment_due_reminder"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-name">Display name</Label>
                <Input
                  id="tpl-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Payment due reminder"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={draft.channel}
                  onValueChange={(v) => setDraft({ ...draft, channel: v as Draft["channel"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="both">SMS + WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={draft.country_code || "all"}
                  onValueChange={(v) => setDraft({ ...draft, country_code: v === "all" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All regions</SelectItem>
                    <SelectItem value="US">United States</SelectItem>
                    <SelectItem value="NG">Nigeria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-lang">Language</Label>
                <Input
                  id="tpl-lang"
                  value={draft.language}
                  onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                  placeholder="en"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Description (internal)</Label>
              <Input
                id="tpl-desc"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Sent 72h before a rental payment is due"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-body">Message body</Label>
              <Textarea
                id="tpl-body"
                rows={7}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Hi {{first_name}}, your payment of {{amount}} is due on {{due_date}}."
              />
              <p className="text-xs text-muted-foreground">
                {draft.body.length} characters
                {draft.channel !== "whatsapp" && ` · ~${Math.max(1, Math.ceil(draft.body.length / 160))} SMS segment(s)`}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Insert placeholder</Label>
              <div className="flex flex-wrap gap-1">
                {COMMON_PLACEHOLDERS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    onClick={() => insertPlaceholder(p)}
                  >
                    {`{{${p}}}`}
                  </Button>
                ))}
              </div>
              {draftPlaceholders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Detected in this template: {draftPlaceholders.map((p) => `{{${p}}}`).join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-sid">Twilio Content SID (optional)</Label>
              <Input
                id="tpl-sid"
                value={draft.twilio_content_sid}
                onChange={(e) => setDraft({ ...draft, twilio_content_sid: e.target.value })}
                placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="tpl-active"
                checked={draft.is_active}
                onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
              />
              <Label htmlFor="tpl-active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={!!previewTarget} onOpenChange={(o) => !o && setPreviewTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview · {previewTarget?.name}</DialogTitle>
            <DialogDescription>Fill sample values to see the final message.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {Object.keys(previewValues).length === 0 && (
              <p className="text-sm text-muted-foreground">This template has no placeholders.</p>
            )}
            {Object.keys(previewValues).map((key) => (
              <div key={key} className="space-y-1">
                <Label className="font-mono text-xs">{`{{${key}}}`}</Label>
                <Input
                  value={previewValues[key]}
                  onChange={(e) =>
                    setPreviewValues((v) => ({ ...v, [key]: e.target.value }))
                  }
                  placeholder={`Sample ${key}`}
                />
              </div>
            ))}
            <div className="rounded-lg border bg-muted p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Rendered message</p>
              <pre className="whitespace-pre-wrap break-words text-sm">
                {previewTarget ? renderTemplate(previewTarget.body, previewValues) : ""}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” will be permanently removed. Notifications referencing this key
              will fall back to their built-in copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
