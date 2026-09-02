import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallInPanel } from "@/components/driver/CallInPanel";
import { useCallIns, type CallInType } from "@/hooks/useCallIns";
import { useDriverDashboard } from "@/hooks/useDriverDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const TITLES: Record<CallInType | "all", string> = {
  fault: "Vehicle Fault Call-In",
  maintenance: "Maintenance Call-In",
  sick: "Sick Call-In",
  all: "Call-Ins",
};

/**
 * Mobile-first screen for driver call-ins.
 * Route: /m/call-in/:type?  (type ∈ fault | maintenance | sick)
 * Works as a standalone screen inside a Capacitor / installed PWA shell.
 */
export default function MobileCallIn() {
  const navigate = useNavigate();
  const { type } = useParams<{ type?: string }>();
  const { activeRental, vehicle } = useDriverDashboard();
  const { history } = useCallIns();
  const title = TITLES[(type as CallInType) ?? "all"] ?? TITLES.all;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card/95 backdrop-blur px-3 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">{title}</h1>
      </header>

      <div className="px-3 py-4 space-y-4">
        {vehicle ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active Vehicle</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {vehicle.make} {vehicle.model} · {vehicle.license_plate}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No active rental. You must have an active rental to submit a call-in.
            </CardContent>
          </Card>
        )}

        <CallInPanel vehicleId={vehicle?.id ?? null} rentalId={activeRental?.id ?? null} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Call-Ins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : !history.data?.length ? (
              <p className="text-xs text-muted-foreground">No call-ins yet.</p>
            ) : (
              history.data.map((c: any) => (
                <div key={c.id} className="rounded border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{c.type}</Badge>
                      <Badge variant={c.status === "active" ? "default" : c.status === "breached" ? "destructive" : "secondary"}>
                        {c.status}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(c.started_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2">{c.reason}</p>
                  {c.end_reason && <p className="mt-1 text-muted-foreground">{c.end_reason}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
