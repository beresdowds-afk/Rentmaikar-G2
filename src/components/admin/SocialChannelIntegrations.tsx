import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Facebook, Instagram, Linkedin, Chrome, Inbox, Loader2, Copy, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChannelConfig {
  id: string;
  platform: string;
  display_name: string;
  is_enabled: boolean;
  webhook_url: string | null;
  page_id: string | null;
  app_id: string | null;
  api_status: string | null;
  last_connected_at: string | null;
  metadata: any;
}

const META = { icon: Facebook, hint: "Meta app ID + Page ID from Meta Business Suite" };
const ICONS: Record<string, { icon: any; hint: string; inboxChannel: string }> = {
  facebook_messenger: { ...META, inboxChannel: "facebook" },
  instagram: { icon: Instagram, hint: "Instagram professional account linked to your Meta app", inboxChannel: "instagram" },
  linkedin: { icon: Linkedin, hint: "LinkedIn organisation URN + app client ID", inboxChannel: "linkedin" },
  linkedin_pages: { icon: Linkedin, hint: "LinkedIn Page URN for organic posts and messages", inboxChannel: "linkedin" },
  google_chat: { icon: Chrome, hint: "Google Chat app configuration", inboxChannel: "google" },
  google_business: { icon: Chrome, hint: "Google Business Messages agent ID", inboxChannel: "google" },
  tiktok: { icon: Chrome, hint: "TikTok business account", inboxChannel: "google" },
};

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const webhookBase = `https://${projectId}.supabase.co/functions/v1/social-inbox-webhook`;

export const SocialChannelIntegrations = () => {
  const [rows, setRows] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { page_id: string; app_id: string }>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("social_messaging_configs")
      .select("*")
      .order("display_name");
    if (error) toast.error("Could not load channels", { description: error.message });
    const list = (data ?? []) as ChannelConfig[];
    setRows(list);
    setDrafts(
      Object.fromEntries(list.map((r) => [r.id, { page_id: r.page_id ?? "", app_id: r.app_id ?? "" }])),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (row: ChannelConfig, patch: Partial<ChannelConfig>) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("social_messaging_configs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } as ChannelConfig : r)));
    toast.success(`${row.display_name} updated`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" /> Social channel integrations
        </CardTitle>
        <CardDescription>
          Connect Meta (Facebook &amp; Instagram), LinkedIn and Google channels. Incoming messages are threaded
          into the unified inbox so the team replies from one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-xs space-y-1">
            <span className="block">
              Point each provider&apos;s webhook at this endpoint — messages land in the unified inbox automatically:
            </span>
            <span className="flex items-center gap-2 font-mono break-all">
              {webhookBase}?platform=&lt;facebook|instagram|linkedin|google&gt;
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  navigator.clipboard.writeText(webhookBase);
                  toast.success("Webhook URL copied");
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </span>
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-1" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((row) => {
              const meta = ICONS[row.platform] ?? { icon: Chrome, hint: "", inboxChannel: "google" };
              const Icon = meta.icon;
              const draft = drafts[row.id] ?? { page_id: "", app_id: "" };
              const dirty = draft.page_id !== (row.page_id ?? "") || draft.app_id !== (row.app_id ?? "");
              return (
                <div key={row.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{row.display_name}</p>
                        <p className="text-xs text-muted-foreground">{meta.hint}</p>
                      </div>
                    </div>
                    <Switch
                      checked={row.is_enabled}
                      disabled={savingId === row.id}
                      onCheckedChange={(checked) =>
                        save(row, { is_enabled: checked, api_status: checked ? "connected" : "disabled" })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant={row.is_enabled ? "default" : "secondary"}>
                      {row.is_enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge variant="outline">Inbox channel: {meta.inboxChannel}</Badge>
                    {row.api_status && <Badge variant="outline">{row.api_status}</Badge>}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Page / Account ID</Label>
                      <Input
                        value={draft.page_id}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [row.id]: { ...draft, page_id: e.target.value } }))
                        }
                        placeholder="e.g. 1029384756"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">App / Client ID</Label>
                      <Input
                        value={draft.app_id}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [row.id]: { ...draft, app_id: e.target.value } }))
                        }
                        placeholder="e.g. 7788990011"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {row.last_connected_at
                        ? `Last connected ${new Date(row.last_connected_at).toLocaleString()}`
                        : "Never connected"}
                    </span>
                    <Button
                      size="sm"
                      disabled={!dirty || savingId === row.id}
                      onClick={() =>
                        save(row, {
                          page_id: draft.page_id || null,
                          app_id: draft.app_id || null,
                          webhook_url: `${webhookBase}?platform=${meta.inboxChannel}`,
                          last_connected_at: new Date().toISOString(),
                        })
                      }
                    >
                      {savingId === row.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SocialChannelIntegrations;
