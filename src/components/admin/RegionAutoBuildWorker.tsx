import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Sparkles, Globe2, RefreshCw, CheckCircle2, XCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RegionRow {
  id: string;
  country_name: string;
  country_code: string;
  currency: string;
  currency_symbol: string;
  phone_prefix: string;
  flag_emoji: string | null;
  status: string;
  payment_gateway: string;
  sms_provider: string;
  build_error: string | null;
  build_log: any[] | null;
  updated_at: string;
}

interface LocalizedContentRow {
  content_key: string;
  content: any;
}

const TOTAL_STEPS = 6;

const emptyForm = {
  country_name: "",
  country_code: "",
  currency: "",
  currency_symbol: "",
  phone_prefix: "",
  timezone: "",
  primary_language: "en",
  sms_provider: "twilio",
  voice_provider: "twilio",
  whatsapp_provider: "twilio",
  payment_gateway: "paypal",
  support_hours: "",
  flag_emoji: "",
  cultural_tone: "warm, trustworthy, community-oriented",
};

const stepsCompleted = (log: any[] | null | undefined) =>
  (log ?? []).filter((e) => e?.event === "step_done").length;

export const RegionAutoBuildWorker = () => {
  const [form, setForm] = useState(emptyForm);
  const [building, setBuilding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewRegion, setPreviewRegion] = useState<RegionRow | null>(null);
  const [previewContent, setPreviewContent] = useState<LocalizedContentRow[]>([]);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("region_definitions")
      .select("id,country_name,country_code,currency,currency_symbol,phone_prefix,flag_emoji,status,payment_gateway,sms_provider,build_error,build_log,updated_at")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setRegions((data ?? []) as RegionRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime subscription for live job status.
  useEffect(() => {
    const channel = supabase
      .channel("region-autobuild-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "region_definitions" },
        (payload: any) => {
          setRegions((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== payload.old.id);
            }
            const next = payload.new as RegionRow;
            const idx = prev.findIndex((r) => r.id === next.id);
            if (idx === -1) return [next, ...prev];
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const build = async (preview_only = false) => {
    if (!form.country_name || !form.country_code || !form.currency || !form.currency_symbol || !form.phone_prefix) {
      toast.error("Country name, code, currency, symbol, and phone prefix are required");
      return;
    }
    const busy = preview_only ? setPreviewing : setBuilding;
    busy(true);
    const t = toast.loading(preview_only ? `Generating preview for ${form.country_name}…` : `Auto-building region for ${form.country_name}…`);
    try {
      const { data, error } = await supabase.functions.invoke("region-autobuild", {
        body: { ...form, preview_only },
      });
      if (error) throw error;
      if (preview_only) {
        setPreviewData(data?.preview ?? null);
        setPreviewRegion(null);
        setPreviewContent([]);
        toast.success("Preview ready — review before publishing", { id: t });
      } else {
        toast.success(`Region built for ${form.country_name}`, { id: t, description: `${data?.log?.length ?? 0} events` });
        setForm(emptyForm);
        load();
      }
    } catch (e: any) {
      toast.error(preview_only ? "Preview failed" : "Auto-build failed", { id: t, description: e.message });
    } finally {
      busy(false);
    }
  };

  const openPreview = async (r: RegionRow) => {
    setPreviewRegion(r);
    setPreviewData(null);
    const { data, error } = await (supabase as any)
      .from("region_localized_content")
      .select("content_key,content")
      .eq("region_id", r.id);
    if (error) return toast.error(error.message);
    setPreviewContent((data ?? []) as LocalizedContentRow[]);
  };

  const rebuild = async (r: RegionRow) => {
    setForm({
      country_name: r.country_name,
      country_code: r.country_code,
      currency: r.currency,
      currency_symbol: r.currency_symbol,
      phone_prefix: r.phone_prefix,
      timezone: "",
      primary_language: "en",
      sms_provider: r.sms_provider,
      voice_provider: "twilio",
      whatsapp_provider: "twilio",
      payment_gateway: r.payment_gateway,
      support_hours: "",
      flag_emoji: r.flag_emoji ?? "",
      cultural_tone: "warm, trustworthy, community-oriented",
    });
    toast.info("Loaded region into form. Click Auto-Build to regenerate.");
  };

  const publish = async (r: RegionRow) => {
    const next = r.status === "published" ? "ready" : "published";
    const { error } = await (supabase as any).from("region_definitions").update({ status: next }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(next === "published" ? "Region published" : "Region unpublished");
  };

  const remove = async (r: RegionRow) => {
    if (!confirm(`Delete region ${r.country_name}? This removes all generated content.`)) return;
    const { error } = await (supabase as any).from("region_definitions").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Region deleted");
  };

  const statusColor = (s: string) =>
    s === "ready" ? "default" : s === "published" ? "default" : s === "building" ? "secondary" : s === "failed" ? "destructive" : "outline";

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">Region Auto-Build Worker</h3>
            <p className="text-sm text-muted-foreground">Spin up a new region: config + AI-generated localized copy across hero, categories, features, testimonials, CTA and how-it-works. Preview before publishing.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Country name</Label>
            <Input value={form.country_name} onChange={(e) => setForm({ ...form, country_name: e.target.value })} placeholder="Ghana" />
          </div>
          <div className="space-y-1.5">
            <Label>Country code (ISO-2)</Label>
            <Input value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} placeholder="GH" maxLength={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Flag emoji</Label>
            <Input value={form.flag_emoji} onChange={(e) => setForm({ ...form, flag_emoji: e.target.value })} placeholder="🇬🇭" />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="GHS" />
          </div>
          <div className="space-y-1.5">
            <Label>Currency symbol</Label>
            <Input value={form.currency_symbol} onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })} placeholder="₵" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone prefix</Label>
            <Input value={form.phone_prefix} onChange={(e) => setForm({ ...form, phone_prefix: e.target.value })} placeholder="+233" />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Africa/Accra" />
          </div>
          <div className="space-y-1.5">
            <Label>Support hours</Label>
            <Input value={form.support_hours} onChange={(e) => setForm({ ...form, support_hours: e.target.value })} placeholder="8am-8pm GMT" />
          </div>
          <div className="space-y-1.5">
            <Label>Primary language</Label>
            <Input value={form.primary_language} onChange={(e) => setForm({ ...form, primary_language: e.target.value })} placeholder="en" />
          </div>
          <div className="space-y-1.5">
            <Label>SMS / WhatsApp provider</Label>
            <Select value={form.sms_provider} onValueChange={(v) => setForm({ ...form, sms_provider: v, whatsapp_provider: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="termii">Termii</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Voice provider</Label>
            <Select value={form.voice_provider} onValueChange={(v) => setForm({ ...form, voice_provider: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="termii">Termii</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment gateway</Label>
            <Select value={form.payment_gateway} onValueChange={(v) => setForm({ ...form, payment_gateway: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="flutterwave">Flutterwave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label>Cultural tone / copy guidance</Label>
            <Textarea rows={2} value={form.cultural_tone} onChange={(e) => setForm({ ...form, cultural_tone: e.target.value })} placeholder="e.g. warm, community-first, uses local rideshare brands (Bolt, Yango)" />
          </div>
        </div>

        <div className="flex justify-end mt-4 gap-2">
          <Button variant="outline" onClick={() => setForm(emptyForm)} disabled={building || previewing}>Reset</Button>
          <Button variant="secondary" onClick={() => build(true)} disabled={building || previewing}>
            {previewing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating preview…</> : <><Eye className="w-4 h-4 mr-2" /> Preview</>}
          </Button>
          <Button onClick={() => build(false)} disabled={building || previewing}>
            {building ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building…</> : <><Sparkles className="w-4 h-4 mr-2" /> Auto-Build Region</>}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Generated Regions ({regions.length})</h3>
            <Badge variant="outline" className="text-xs">Live status</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {regions.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">No regions yet. Build your first region above.</p>
        )}

        <div className="space-y-3">
          {regions.map((r) => {
            const done = stepsCompleted(r.build_log);
            const pct = r.status === "building" ? Math.round((done / TOTAL_STEPS) * 100) : r.status === "ready" || r.status === "published" ? 100 : 0;
            const lastEvent = (r.build_log ?? []).slice(-1)[0];
            return (
              <div key={r.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{r.flag_emoji || "🌐"}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{r.country_name}</p>
                        <Badge variant={statusColor(r.status) as any}>{r.status}</Badge>
                        {r.status === "ready" && <CheckCircle2 className="w-4 h-4 text-success" />}
                        {r.status === "failed" && <XCircle className="w-4 h-4 text-destructive" />}
                        {r.status === "building" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.country_code} · {r.currency_symbol} {r.currency} · {r.phone_prefix} · {r.payment_gateway} · {r.sms_provider}
                      </p>
                      {r.build_error && <p className="text-xs text-destructive mt-1">Error: {r.build_error}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openPreview(r)} disabled={r.status === "building"}>
                      <Eye className="w-4 h-4 mr-1" /> Preview
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rebuild(r)}>Edit / Rebuild</Button>
                    <Button size="sm" variant={r.status === "published" ? "secondary" : "default"} onClick={() => publish(r)} disabled={r.status === "building" || r.status === "failed"}>
                      {r.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(r)}>Delete</Button>
                  </div>
                </div>
                {(r.status === "building" || r.status === "ready" || r.status === "failed") && (
                  <div className="mt-2 space-y-1">
                    <Progress value={pct} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">
                      {done}/{TOTAL_STEPS} steps
                      {lastEvent?.key ? ` · last: ${lastEvent.event} (${lastEvent.key})` : lastEvent?.event ? ` · ${lastEvent.event}` : ""}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Preview modal: either newly generated preview (no region row) or existing region content */}
      <Dialog open={!!previewData || !!previewRegion} onOpenChange={(open) => { if (!open) { setPreviewData(null); setPreviewRegion(null); setPreviewContent([]); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {previewRegion ? `Preview: ${previewRegion.country_name}` : `Preview: ${form.country_name || "New region"}`}
            </DialogTitle>
            <DialogDescription>
              Localized content and configuration. Review before publishing.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="hero" className="w-full">
            <TabsList className="flex-wrap h-auto">
              {(previewData ? Object.keys(previewData) : previewContent.map((c) => c.content_key)).map((k) => (
                <TabsTrigger key={k} value={k}>{k}</TabsTrigger>
              ))}
              <TabsTrigger value="config">config</TabsTrigger>
            </TabsList>
            {(previewData
              ? Object.entries(previewData)
              : previewContent.map((c) => [c.content_key, c.content] as [string, any])
            ).map(([k, v]) => (
              <TabsContent key={k} value={k}>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-[50vh]">
                  {JSON.stringify(v, null, 2)}
                </pre>
              </TabsContent>
            ))}
            <TabsContent value="config">
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-[50vh]">
                {JSON.stringify(previewRegion ?? form, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
          <div className="flex justify-end gap-2 pt-2">
            {previewRegion && previewRegion.status !== "published" && (
              <Button onClick={() => { publish(previewRegion); setPreviewRegion(null); }}>
                Publish {previewRegion.country_name}
              </Button>
            )}
            <Button variant="outline" onClick={() => { setPreviewData(null); setPreviewRegion(null); setPreviewContent([]); }}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegionAutoBuildWorker;
