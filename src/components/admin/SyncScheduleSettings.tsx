import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Clock, Save } from "lucide-react";

interface Schedule {
  provider: string;
  enabled: boolean;
  interval_minutes: number;
  updated_at: string | null;
}

export function SyncScheduleSettings() {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("iot_sync_schedule").select("*").order("provider");
    setRows((data as Schedule[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async (r: Schedule) => {
    setSaving(r.provider);
    const { error } = await supabase.from("iot_sync_schedule").upsert({
      provider: r.provider,
      enabled: r.enabled,
      interval_minutes: r.interval_minutes,
    }, { onConflict: "provider" });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${r.provider} schedule saved`);
    load();
  };

  const update = (provider: string, patch: Partial<Schedule>) =>
    setRows(rs => rs.map(r => r.provider === provider ? { ...r, ...patch } : r));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Automated sync schedule</CardTitle>
        <CardDescription>
          Configure how often Hologram usage and Traccar positions are pulled automatically.
          The scheduler runs every minute and dispatches each provider once the interval elapses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map(r => (
          <div key={r.provider} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-b pb-4 last:border-none">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Provider</Label>
              <p className="font-semibold">{r.provider}</p>
            </div>
            <div>
              <Label htmlFor={`interval-${r.provider}`}>Interval (minutes)</Label>
              <Input id={`interval-${r.provider}`} type="number" min={1} max={1440}
                value={r.interval_minutes}
                onChange={e => update(r.provider, { interval_minutes: Math.max(1, Math.min(1440, Number(e.target.value) || 1)) })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={r.enabled} onCheckedChange={v => update(r.provider, { enabled: v })} />
              <Label>{r.enabled ? "Enabled" : "Disabled"}</Label>
            </div>
            <Button onClick={() => save(r)} disabled={saving === r.provider} className="gap-2">
              <Save className="h-4 w-4" /> {saving === r.provider ? "Saving…" : "Save"}
            </Button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
      </CardContent>
    </Card>
  );
}
