import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { VehiclePicker } from "./VehiclePicker";

type Step = { step: string; ok: boolean; detail?: unknown };

interface Props {
  onOnboarded?: () => void;
}

export function HologramOnboardWizard({ onOnboarded }: Props) {
  const [simId, setSimId] = useState("");
  const [planId, setPlanId] = useState("");
  const [zone, setZone] = useState("");
  const [limitMb, setLimitMb] = useState("");
  const [deviceIdExt, setDeviceIdExt] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const onboard = async () => {
    if (!simId.trim()) return;
    setBusy(true);
    setSteps(null);
    setConfirmed(null);
    try {
      const { data, error } = await supabase.functions.invoke("hologram-admin", {
        body: {
          action: "onboard_sim",
          sim_id: simId.trim(),
          ...(planId ? { plan_id: Number(planId) } : {}),
          ...(zone ? { zone } : {}),
          ...(limitMb ? { limit_bytes: Math.round(Number(limitMb) * 1_000_000) } : {}),
          ...(deviceIdExt ? { device_id_ext: deviceIdExt.trim() } : {}),
          ...(deviceName ? { name: deviceName.trim() } : {}),
          ...(vehicleId ? { vehicle_id: vehicleId } : {}),
        },
      });
      if (error) throw new Error(error.message);
      const res = data as { ok?: boolean; error?: string; steps?: Step[]; row?: { id: string; iccid: string } };
      if (res.error) throw new Error(res.error);
      setSteps(res.steps ?? []);

      // Confirm the SIM is now visible in the dashboard inventory.
      if (res.row?.id) {
        const { data: row } = await supabase
          .from("iot_sim_cards")
          .select("iccid, status")
          .eq("id", res.row.id)
          .maybeSingle();
        if (row) {
          setConfirmed(`${row.iccid} · ${row.status}`);
          toast.success("SIM onboarded and visible in the dashboard");
        }
      }
      onOnboarded?.();
    } catch (e) {
      toast.error("Onboarding failed", { description: (e as Error).message });
      setSteps([{ step: "failed", ok: false, detail: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-4 w-4" /> One-click SIM / device onboarding
        </CardTitle>
        <CardDescription>
          Resolves the SIM inside the RENTMAIKAR Hologram organization, activates it on a plan,
          applies a data ceiling, links it to a vehicle and registers it in the dashboard — in a
          single action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>ICCID or Hologram SIM ID *</Label>
            <Input value={simId} onChange={(e) => setSimId(e.target.value)} placeholder="8944…" />
          </div>
          <div className="space-y-1.5">
            <Label>Plan ID (optional — activates the SIM)</Label>
            <Input value={planId} onChange={(e) => setPlanId(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 12345" />
          </div>
          <div className="space-y-1.5">
            <Label>Zone (optional)</Label>
            <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. Z1" />
          </div>
          <div className="space-y-1.5">
            <Label>Monthly data limit (MB, optional)</Label>
            <Input value={limitMb} onChange={(e) => setLimitMb(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 500" />
          </div>
          <div className="space-y-1.5">
            <Label>Hologram device ID (optional)</Label>
            <Input value={deviceIdExt} onChange={(e) => setDeviceIdExt(e.target.value)} placeholder="e.g. 998877" />
          </div>
          <div className="space-y-1.5">
            <Label>Device name (optional)</Label>
            <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Tracker – ABC123" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Link to vehicle (optional)</Label>
            <VehiclePicker value={vehicleId} onChange={setVehicleId} />
          </div>
        </div>

        <Button onClick={onboard} disabled={!simId.trim() || busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          Onboard SIM
        </Button>

        {steps && (
          <div className="rounded-md border p-3 space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {s.ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <XCircle className="h-4 w-4 text-destructive" />}
                <span className="font-medium">{s.step.replace(/_/g, " ")}</span>
                {!s.ok && (
                  <span className="text-xs text-muted-foreground truncate">
                    {typeof s.detail === "string" ? s.detail : JSON.stringify(s.detail)}
                  </span>
                )}
              </div>
            ))}
            {confirmed && (
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="default">Visible in dashboard</Badge>
                <span className="text-xs text-muted-foreground">{confirmed}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
