import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

export function CallInMonitor() {
  const { data: callIns, isLoading } = useQuery({
    queryKey: ["admin-call-ins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_call_ins")
        .select("*, vehicles(make, model, license_plate), profiles!driver_call_ins_driver_id_fkey(full_name, phone)")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver Call-Ins</CardTitle>
        <CardDescription>
          Fault, maintenance, and sick call-ins. Payments are suspended while active; geofence breaches
          auto-reactivate payments. Repeated call-ins on 2 consecutive days trigger a recall request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !callIns?.length ? (
          <p className="text-sm text-muted-foreground">No call-ins recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {callIns.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{c.profiles?.full_name ?? c.driver_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">
                    {c.vehicles ? `${c.vehicles.make} ${c.vehicles.model} · ${c.vehicles.license_plate}` : c.vehicle_id.slice(0, 8)}
                  </TableCell>
                  <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : c.status === "breached" ? "destructive" : "secondary"}>
                      {c.status}
                    </Badge>
                    {c.extend_requested && <Badge variant="outline" className="ml-1">extend</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{formatDistanceToNow(new Date(c.started_at), { addSuffix: true })}</TableCell>
                  <TableCell className="text-xs">{formatDistanceToNow(new Date(c.expires_at), { addSuffix: true })}</TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate">{c.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
