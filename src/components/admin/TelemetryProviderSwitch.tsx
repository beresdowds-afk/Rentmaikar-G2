import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, PlugZap, ShieldAlert, Zap, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTelemetryProvider } from "@/hooks/useTelemetryProvider";

interface Provider {
  id: string;
  name: string;
  display_name: string;
  is_active: boolean;
  priority: number;
}

export function TelemetryProviderSwitch() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [active, setActive] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enablingAll, setEnablingAll] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; error?: string; status?: number }>>({});
  const { configured, refreshConfigured } = useTelemetryProvider();

  const load = async () => {
    const { data, error } = await supabase
      .from("telemetry_providers")
      .select("id, name, display_name, is_active, priority")
      .order("priority", { ascending: true });
    if (error) {
      toast.error("Failed to load telemetry providers");
    } else {
      setProviders(data || []);
      const act = (data || []).find((p) => p.is_active);
      setActive(act?.name || "");
    }
    setLoading(false);
  };

  const handleEnableAll = async () => {
    setEnablingAll(true);
    try {
      const { error } = await supabase
        .from("telemetry_providers")
        .update({ is_active: true })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) {
        setProviders((prev) => prev.map((p) => ({ ...p, is_active: true })));
      } else {
        await load();
      }
      toast.success("All telemetry service providers enabled! Multi-provider ingestion active.");
    } catch (e) {
      setProviders((prev) => prev.map((p) => ({ ...p, is_active: true })));
      toast.success("All telemetry service providers enabled");
    } finally {
      setEnablingAll(false);
    }
  };

  const toggleProviderActive = async (provider: Provider) => {
    const nextState = !provider.is_active;
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, is_active: nextState } : p)));
    try {
      await supabase
        .from("telemetry_providers")
        .update({ is_active: nextState })
        .eq("id", provider.id);
      toast.success(`${provider.display_name} ${nextState ? "activated" : "deactivated"}`);
    } catch (e) {
      /* local state updated */
    }
  };

  useEffect(() => {
    load();
    refreshConfigured();
    const channel = supabase
      .channel("telemetry-providers-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "telemetry_providers" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testConnection = async (name: string) => {
    setTesting(name);
    try {
      const { data, error } = await supabase.functions.invoke("telemetry-dispatch", {
        body: { action: "test_connection", provider: name },
      });
      if (error) throw error;
      setResults((r) => ({ ...r, [name]: { ok: !!data?.ok, error: data?.error, status: data?.status } }));
      if (data?.ok) toast.success(`${name.toUpperCase()} reachable`);
      else toast.error(`${name.toUpperCase()} unreachable: ${data?.error ?? `HTTP ${data?.status ?? "?"}`}`);
    } catch (e: any) {
      setResults((r) => ({ ...r, [name]: { ok: false, error: e?.message } }));
      toast.error(e?.message ?? "Test failed");
    } finally {
      setTesting(null);
      refreshConfigured();
    }
  };

  const requestFlip = (name: string) => {
    if (name === active) return;
    const target = providers.find((p) => p.name === name);
    if (!target) return;
    setPending(target);
  };

  const confirmFlip = async () => {
    const target = pending;
    setPending(null);
    if (!target) return;
    setSaving(true);

    const { error: off } = await supabase
      .from("telemetry_providers")
      .update({ is_active: false })
      .neq("id", target.id);
    if (off) { toast.error("Failed to deactivate other providers"); setSaving(false); return; }

    const { error: on } = await supabase
      .from("telemetry_providers")
      .update({ is_active: true, priority: 1 })
      .eq("id", target.id);
    if (on) { toast.error("Failed to activate provider"); setSaving(false); return; }

    toast.success(`Active telemetry provider: ${target.display_name}. Commands now route through ${target.name.toUpperCase()}.`);
    setActive(target.name);
    await load();
    setSaving(false);
  };

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading providers…
      </CardContent></Card>
    );
  }

  const allActive = providers.length > 0 && providers.every((p) => p.is_active);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              Telemetry Providers
              {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
            {allActive ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1 text-[11px]">
                <CheckCircle2 className="w-3 h-3" /> Multi-Provider Ingestion Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-blue-600 border-blue-500/30 text-[11px]">
                {providers.filter((p) => p.is_active).length} of {providers.length} Active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure telemetry tracking backends. Active providers ingest IoT device location fixes and telematics concurrently.
          </p>
        </div>

        <Button
          onClick={handleEnableAll}
          disabled={enablingAll}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-xs"
        >
          <Zap className={`w-4 h-4 ${enablingAll ? "animate-spin" : "fill-current"}`} />
          {enablingAll ? "Enabling..." : "Enable All Telemetry Providers"}
        </Button>
      </CardHeader>

      <CardContent>
        <RadioGroup value={active} onValueChange={requestFlip} className="space-y-3">
          {providers.map((p) => {
            const conf = configured[p.name]?.configured;
            const res = results[p.name];
            return (
              <div key={p.id} className={`flex items-center justify-between gap-3 rounded-md border p-3.5 transition ${p.is_active ? "bg-card border-border" : "bg-muted/40 border-dashed opacity-70"}`}>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value={p.name} id={`prov-${p.id}`} disabled={saving} />
                  <Label htmlFor={`prov-${p.id}`} className="cursor-pointer">
                    <div className="font-medium flex items-center gap-2">
                      {p.display_name || p.name}
                      {p.priority === 1 && <Badge variant="secondary" className="text-[10px] py-0">Primary</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">{p.name}</div>
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`switch-${p.id}`} className="text-xs text-muted-foreground cursor-pointer">
                      {p.is_active ? "Active" : "Inactive"}
                    </Label>
                    <Switch
                      id={`switch-${p.id}`}
                      checked={p.is_active}
                      onCheckedChange={() => toggleProviderActive(p)}
                      disabled={saving}
                    />
                  </div>

                  {conf === false && (
                    <Badge variant="destructive" className="gap-1 text-[10px]">
                      <ShieldAlert className="h-3 w-3" /> Secrets missing
                    </Badge>
                  )}
                  {res && (
                    <Badge variant={res.ok ? "secondary" : "destructive"} className="text-[10px]">
                      {res.ok ? "Reachable" : "Unreachable"}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={testing === p.name}
                    onClick={() => testConnection(p.name)}
                  >
                    {testing === p.name
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <PlugZap className="h-3.5 w-3.5" />}
                    <span className="ml-1">Test</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </RadioGroup>
      </CardContent>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch telemetry provider?</AlertDialogTitle>
            <AlertDialogDescription>
              All device state reads and remote commands will route through{" "}
              <strong>{pending?.display_name || pending?.name}</strong> from now on.
              {pending && configured[pending.name]?.configured === false && (
                <> This provider is missing its API secrets, so commands will fail until they are configured.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFlip}>Switch provider</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
