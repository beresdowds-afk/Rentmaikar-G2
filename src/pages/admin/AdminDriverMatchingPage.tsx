import { useMemo, useState } from "react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Car, CheckCircle2, FileSignature, History, KeyRound, MapPin, RefreshCw, UserPlus, XCircle } from "lucide-react";
import AgreementSigningModal from "@/components/legal/AgreementSigningModal";
import {
  PROXIMITY_DEFAULT_RADIUS_MILES,
  useProximityMatching,
} from "@/hooks/useProximityMatching";
import {
  DriverVehicleMatch,
  MATCH_STAGE_LABEL,
  MATCH_STAGE_ORDER,
  MatchStatus,
  accreditMatch,
  assignDriverToVehicle,
  cancelMatch,
  fetchDriverAccreditation,
  initiateMatchAgreement,
  markMatchAgreementSigned,
  markMatchPickedUp,
  partyLabel,
  useDriverVehicleMatches,
  vehicleLabel,
} from "@/hooks/useDriverVehicleMatches";

const stageVariant = (status: MatchStatus) =>
  status === "cancelled" ? "destructive" : status === "picked_up" ? "default" : "secondary";

const formatMiles = (miles: number) => (miles < 0.5 ? "In city" : `${miles.toFixed(1)} mi`);
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

const AdminDriverMatchingPage = () => {
  const [radius, setRadius] = useState(PROXIMITY_DEFAULT_RADIUS_MILES);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyMatch, setHistoryMatch] = useState<DriverVehicleMatch | null>(null);
  const [agreementFor, setAgreementFor] = useState<{
    match: DriverVehicleMatch;
    vehicle: { id: string; make: string; model: string; year: number; licensePlate: string; vin?: string };
  } | null>(null);

  const proximity = useProximityMatching(radius);
  const { matches, events, isLoading, isFetching, refetch, invalidate, error } =
    useDriverVehicleMatches();

  const activeKey = useMemo(
    () => new Set(matches.filter((m) => m.status !== "cancelled").map((m) => `${m.vehicle_id}:${m.driver_id}`)),
    [matches],
  );

  const readyForAgreements = matches.filter((m) =>
    ["assigned", "agreement_initiated", "agreement_signed", "accredited"].includes(m.status),
  );

  const run = async (id: string, fn: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(success);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const openAgreement = async (match: DriverVehicleMatch) => {
    const { data, error: vErr } = await supabase
      .from("vehicles")
      .select("id, make, model, year, license_plate, vin")
      .eq("id", match.vehicle_id)
      .maybeSingle();
    if (vErr || !data) {
      toast.error("Could not load vehicle details for the agreement");
      return;
    }
    setAgreementFor({
      match,
      vehicle: {
        id: data.id,
        make: data.make ?? "",
        model: data.model ?? "",
        year: data.year ?? new Date().getFullYear(),
        licensePlate: (data as { license_plate?: string | null }).license_plate ?? "—",
        vin: (data as { vin?: string | null }).vin ?? undefined,
      },
    });
  };

  const onAgreementCreated = async (match: DriverVehicleMatch) => {
    try {
      const { data } = await supabase
        .from("legal_agreements")
        .select("id")
        .eq("vehicle_id", match.vehicle_id)
        .eq("driver_id", match.driver_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await initiateMatchAgreement(match.id, data?.id ?? null);
      toast.success("Agreement flow initiated. Driver and owner have been notified.");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAgreementFor(null);
    }
  };

  const showAccreditation = async (match: DriverVehicleMatch) => {
    try {
      const status = await fetchDriverAccreditation(match.driver_id);
      toast.info(
        `Licence: ${status.licence_document_id ? status.licence_status ?? "submitted" : "missing"} · Referees: ${status.referee_count ?? 0}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <Seo
        path="/admin/driver-matching"
        title="Driver & Vehicle Matching Pipeline | Admin"
        description="Assign drivers to provisioned vehicles, initiate owner-driver agreements, confirm accreditation and log every handover stage."
      />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Driver ↔ vehicle matching</h1>
        <p className="text-muted-foreground text-sm">
          Assign nearby drivers to provisioned vehicles, run the owner-driver agreement, confirm accreditation
          (driver's licence and referees) and log the vehicle handover.
        </p>
      </header>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">
            <FileSignature className="mr-2 h-4 w-4" /> Pipeline ({matches.length})
          </TabsTrigger>
          <TabsTrigger value="assign">
            <UserPlus className="mr-2 h-4 w-4" /> Assign drivers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Matching pipeline</CardTitle>
                <CardDescription>
                  {readyForAgreements.length} matches in progress · {matches.filter((m) => m.status === "picked_up").length} handed over
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {error ? (
                <p className="text-destructive text-sm">{(error as Error).message}</p>
              ) : isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {vehicleLabel(m.vehicle)}
                          <div className="text-muted-foreground text-xs">
                            {m.vehicle?.pickup_city ?? m.vehicle?.pickup_location ?? "Unknown pickup"}
                            {m.distance_miles != null ? ` · ${formatMiles(Number(m.distance_miles))}` : ""}
                          </div>
                        </TableCell>
                        <TableCell>{partyLabel(m.driver)}</TableCell>
                        <TableCell>{partyLabel(m.owner)}</TableCell>
                        <TableCell>
                          <Badge variant={stageVariant(m.status)}>{MATCH_STAGE_LABEL[m.status]}</Badge>
                          {m.status === "accredited" || m.status === "picked_up" ? (
                            <div className="text-muted-foreground mt-1 text-xs">
                              Referees: {m.referee_count}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="space-x-2 whitespace-nowrap text-right">
                          {m.status === "assigned" ? (
                            <Button size="sm" onClick={() => openAgreement(m)}>
                              <FileSignature className="mr-1 h-3.5 w-3.5" /> Start agreement
                            </Button>
                          ) : null}
                          {m.status === "agreement_initiated" ? (
                            <Button
                              size="sm"
                              disabled={busyId === m.id}
                              onClick={() =>
                                run(m.id, () => markMatchAgreementSigned(m.id), "Agreement marked as fully signed")
                              }
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirm signatures
                            </Button>
                          ) : null}
                          {m.status === "agreement_signed" ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => showAccreditation(m)}>
                                Check docs
                              </Button>
                              <Button
                                size="sm"
                                disabled={busyId === m.id}
                                onClick={() => run(m.id, () => accreditMatch(m.id), "Driver accredited")}
                              >
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Accredit
                              </Button>
                            </>
                          ) : null}
                          {m.status === "accredited" ? (
                            <Button
                              size="sm"
                              disabled={busyId === m.id}
                              onClick={() => run(m.id, () => markMatchPickedUp(m.id), "Vehicle pickup logged")}
                            >
                              <KeyRound className="mr-1 h-3.5 w-3.5" /> Log pickup
                            </Button>
                          ) : null}
                          <Button size="sm" variant="ghost" onClick={() => setHistoryMatch(m)}>
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          {m.status !== "cancelled" && m.status !== "picked_up" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === m.id}
                              onClick={() => run(m.id, () => cancelMatch(m.id), "Match cancelled")}
                            >
                              <XCircle className="text-destructive h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!matches.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground text-center text-sm">
                          No matches yet. Assign a driver from the "Assign drivers" tab.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assign" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end">
              <div className="w-full space-y-2 sm:w-40">
                <Label htmlFor="match-radius">Radius (miles)</Label>
                <Input
                  id="match-radius"
                  type="number"
                  min={1}
                  max={200}
                  value={radius}
                  onChange={(e) => setRadius(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                />
              </div>
              <Button variant="outline" onClick={() => proximity.refetch()} disabled={proximity.isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${proximity.isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </CardContent>
          </Card>

          {proximity.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            proximity.vehiclesWithDrivers.map((row) => (
              <Card key={row.vehicle.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Car className="h-4 w-4" />
                    {[row.vehicle.year, row.vehicle.make, row.vehicle.model].filter(Boolean).join(" ") ||
                      "Vehicle"}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {row.location ?? "Unknown"} · {row.drivers.length} nearby
                    drivers
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {row.drivers.length ? (
                    row.drivers.map((match) => {
                      const key = `${row.vehicle.id}:${match.item.user_id}`;
                      const already = activeKey.has(key);
                      return (
                        <Button
                          key={match.item.user_id}
                          size="sm"
                          variant={already ? "secondary" : "outline"}
                          disabled={already || busyId === key}
                          onClick={() =>
                            run(
                              key,
                              () =>
                                assignDriverToVehicle(row.vehicle.id, match.item.user_id, match.distanceMiles),
                              "Driver assigned — ready for owner-driver agreement",
                            )
                          }
                        >
                          <UserPlus className="mr-1 h-3.5 w-3.5" />
                          {match.item.full_name ?? match.item.email ?? "Driver"} ·{" "}
                          {formatMiles(match.distanceMiles)}
                          {already ? " (assigned)" : ""}
                        </Button>
                      );
                    })
                  ) : (
                    <span className="text-muted-foreground text-sm">No drivers in range</span>
                  )}
                </CardContent>
              </Card>
            ))
          )}
          {!proximity.isLoading && !proximity.vehiclesWithDrivers.length ? (
            <Card>
              <CardContent className="text-muted-foreground pt-6 text-sm">
                No provisioned vehicles are ready for matching yet.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog open={!!historyMatch} onOpenChange={(o) => !o && setHistoryMatch(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Stage history</DialogTitle>
            <DialogDescription>
              {historyMatch ? `${vehicleLabel(historyMatch.vehicle)} · ${partyLabel(historyMatch.driver)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {MATCH_STAGE_ORDER.map((stage) => {
              const ts = historyMatch
                ? ({
                    assigned: historyMatch.assigned_at,
                    agreement_initiated: historyMatch.agreement_initiated_at,
                    agreement_signed: historyMatch.agreement_signed_at,
                    accredited: historyMatch.accredited_at,
                    picked_up: historyMatch.picked_up_at,
                  } as Record<MatchStatus, string | null>)[stage]
                : null;
              return (
                <div key={stage} className="flex items-center justify-between text-sm">
                  <span>{MATCH_STAGE_LABEL[stage]}</span>
                  <span className="text-muted-foreground">{formatDate(ts)}</span>
                </div>
              );
            })}
            <div className="border-t pt-3">
              {events
                .filter((e) => e.match_id === historyMatch?.id)
                .map((e) => (
                  <div key={e.id} className="text-muted-foreground text-xs">
                    {new Date(e.created_at).toLocaleString()} · {e.message ?? e.stage}
                  </div>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {agreementFor ? (
        <AgreementSigningModal
          open
          onOpenChange={(o) => !o && setAgreementFor(null)}
          userRole="admin"
          driver={{
            id: agreementFor.match.driver_id,
            name: partyLabel(agreementFor.match.driver),
            email: agreementFor.match.driver?.email ?? "",
            phone: agreementFor.match.driver?.phone ?? undefined,
          }}
          owner={{
            id: agreementFor.match.owner_id ?? "",
            name: partyLabel(agreementFor.match.owner),
            email: agreementFor.match.owner?.email ?? "",
            phone: agreementFor.match.owner?.phone ?? undefined,
          }}
          vehicle={agreementFor.vehicle}
          onSuccess={() => onAgreementCreated(agreementFor.match)}
        />
      ) : null}
    </div>
  );
};

export default AdminDriverMatchingPage;
