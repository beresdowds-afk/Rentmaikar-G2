import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Cpu, Loader2, MapPin, RefreshCw, Signal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { IoTAuditTrailPanel } from "@/components/admin/IoTAuditTrailPanel";

type Normalized = {
  device_id: string | null;
  name: string | null;
  iccid: string | null;
  imsi: string | null;
  msisdn: string | null;
  state: string | null;
  link_id: number | null;
  zone: number | null;
  imei: string | null;
  plan_id: number | null;
};

type DetailResponse = {
  ok?: boolean;
  device?: Record<string, unknown> | null;
  normalized?: Normalized | null;
  usage?: { ok?: boolean; bytes?: number | null; mb?: number | null; raw?: unknown; error?: string | null };
  location?: { ok?: boolean; data?: Record<string, unknown> | null; error?: string | null };
  error?: string | null;
};

const Field = ({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) => (
  <div className="space-y-1">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value === null || value === undefined || value === "" ? "—" : String(value)}</p>
  </div>
);

export default function HologramDeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("hologram-admin", {
        body: { action: "device_detail", device_id_ext: deviceId },
      });
      if (error) throw new Error(error.message);
      setDetail(data as DetailResponse);
    } catch (e) {
      toast.error("Could not load device", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  const n = detail?.normalized ?? null;
  const loc = detail?.location?.data ?? null;
  const lat = (loc?.latitude ?? loc?.lat) as number | undefined;
  const lon = (loc?.longitude ?? loc?.lon ?? loc?.lng) as number | undefined;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Cpu className="h-5 w-5" /> {n?.name || `Hologram device ${deviceId}`}
            </h1>
            <p className="text-sm text-muted-foreground">Troubleshooting view — identity, usage and last known location.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </Button>
      </div>

      {detail && detail.ok === false && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Hologram returned an error</AlertTitle>
          <AlertDescription>{detail.error ?? "Unknown provider error"}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Signal className="h-4 w-4" /> SIM identity</CardTitle>
            <CardDescription>Normalized from the device's cellular link.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Device ID" value={n?.device_id ?? deviceId} mono />
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">State</p>
              <Badge variant={n?.state === "live" ? "default" : "secondary"}>{n?.state ?? "unknown"}</Badge>
            </div>
            <Field label="ICCID" value={n?.iccid} mono />
            <Field label="IMSI" value={n?.imsi} mono />
            <Field label="MSISDN" value={n?.msisdn} mono />
            <Field label="IMEI" value={n?.imei} mono />
            <Field label="Link ID" value={n?.link_id} mono />
            <Field label="Zone / plan" value={[n?.zone, n?.plan_id].filter((v) => v !== null && v !== undefined).join(" / ")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current month data usage</CardTitle>
            <CardDescription>From Hologram's monthly usage report for this link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail?.usage?.ok ? (
              <>
                <p className="text-3xl font-semibold">
                  {detail.usage.mb !== null && detail.usage.mb !== undefined ? `${detail.usage.mb} MB` : "No usage reported"}
                </p>
                <p className="text-xs text-muted-foreground">{detail.usage.bytes ?? 0} bytes this billing month</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{detail?.usage?.error ?? "Usage unavailable for this device."}</p>
            )}
            <Separator />
            <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Last known location</CardTitle>
            {detail?.location?.ok && loc ? (
              <div className="space-y-2 text-sm">
                <p>
                  {lat !== undefined && lon !== undefined ? `${lat}, ${lon}` : "Coordinates unavailable"}
                </p>
                <pre className="text-[11px] overflow-x-auto rounded-md border p-2">{JSON.stringify(loc, null, 2)}</pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{detail?.location?.error ?? "No cell-tower location reported."}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <IoTAuditTrailPanel
        actionPrefix="hologram_"
        title="Hologram admin audit log"
        description="Every Hologram action (SIM deactivation, open sessions, org balance, device locations, detail lookups) with actor, timestamp and API result."
        limit={100}
      />
    </div>
  );
}
