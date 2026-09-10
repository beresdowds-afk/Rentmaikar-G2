import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Radio, CheckCircle2, ShieldCheck, Cpu, Car, Layers } from "lucide-react";
import { fetchIoTAuditLogs, subscribeToIoTAuditLog, IoTAuditLogRecord } from "@/lib/iot-liveness";

interface IoTAuditLogFeedProps {
  maxRows?: number;
  title?: string;
  description?: string;
  filterAction?: string;
}

export const IoTAuditLogFeed: React.FC<IoTAuditLogFeedProps> = ({
  maxRows = 25,
  title = "IoT Orchestration & Liveness Audit Stream",
  description = "Real-time records of SIM auto-enabling, device provisioning, liveness tests, and public catalogue publishing.",
  filterAction,
}) => {
  const [logs, setLogs] = useState<IoTAuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLogs = async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchIoTAuditLogs(maxRows);
      setLogs(data);
    } catch (err) {
      console.error("Error loading audit logs:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();

    const unsubscribe = subscribeToIoTAuditLog((newRecord) => {
      setLogs((prev) => [newRecord, ...prev.slice(0, maxRows - 1)]);
    });

    return () => {
      unsubscribe();
    };
  }, [maxRows]);

  const filteredLogs = filterAction
    ? logs.filter((l) => l.action === filterAction)
    : logs;

  const renderActionBadge = (action: string) => {
    switch (action) {
      case "auto_sim_enable":
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
            <Cpu className="h-3 w-3" /> Auto SIM Enabled
          </Badge>
        );
      case "auto_device_enable":
        return (
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
            <Car className="h-3 w-3" /> Device Provisioned
          </Badge>
        );
      case "auto_catalogue_publish":
        return (
          <Badge className="bg-purple-600 hover:bg-purple-700 text-white gap-1">
            <CheckCircle2 className="h-3 w-3" /> Catalogue Published
          </Badge>
        );
      case "liveness_test":
        return (
          <Badge variant="outline" className="border-emerald-500 text-emerald-600 gap-1">
            <Radio className="h-3 w-3 animate-pulse text-emerald-500" /> Liveness Tested
          </Badge>
        );
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const renderDetails = (log: IoTAuditLogRecord) => {
    const d = log.details || {};
    if (log.action === "auto_sim_enable") {
      return (
        <div className="text-xs space-y-0.5">
          <span className="font-semibold text-foreground">Device {d.device_serial || d.serial}</span>
          <span className="text-muted-foreground"> paired with SIM </span>
          <span className="font-mono text-muted-foreground">{d.iccid}</span>
          {d.provider && <span className="capitalize text-muted-foreground"> ({d.provider})</span>}
        </div>
      );
    }
    if (log.action === "auto_device_enable") {
      return (
        <div className="text-xs space-y-0.5">
          <span className="font-semibold text-foreground">{d.make} {d.model}</span>
          <span className="text-muted-foreground"> ({d.license_plate}) provisioned with device </span>
          <span className="font-semibold text-foreground">{d.device_serial}</span>
          {d.pickup_location && (
            <span className="text-muted-foreground"> · Pickup: <span className="font-medium text-foreground">{d.pickup_location}</span></span>
          )}
        </div>
      );
    }
    if (log.action === "auto_catalogue_publish") {
      return (
        <div className="text-xs space-y-0.5">
          <span className="font-semibold text-emerald-600">Published to Public Catalogue: </span>
          <span className="font-medium text-foreground">{d.make} {d.model}</span>
          <span className="text-muted-foreground"> ({d.license_plate}) · Pickup: </span>
          <span className="font-medium text-foreground">{d.pickup_location}</span>
        </div>
      );
    }
    if (log.action === "liveness_test") {
      const sims = d.sims || {};
      const devs = d.devices || {};
      const vehs = d.vehicles || {};
      return (
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
          <span>SIMs: <strong className="text-emerald-600">{sims.active || 0} live</strong> / {sims.inactive || 0} inactive</span>
          <span>Devices: <strong className="text-emerald-600">{devs.active || 0} live</strong> / {devs.inactive || 0} inactive</span>
          <span>Vehicles: <strong className="text-emerald-600">{vehs.active || 0} live</strong> / {vehs.inactive || 0} inactive</span>
        </div>
      );
    }
    return <span className="text-xs font-mono text-muted-foreground">{JSON.stringify(d)}</span>;
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {description}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[11px] font-medium text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Real-Time Feed
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={loadLogs}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading audit records...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No audit records logged yet. Run a liveness test or auto-enable pipeline to record events.
          </div>
        ) : (
          <div className="rounded-b-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs bg-muted/40">
                  <TableHead className="w-36">Timestamp</TableHead>
                  <TableHead className="w-48">Action</TableHead>
                  <TableHead>Audit Event Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="text-xs hover:bg-muted/30 transition-colors">
                    <TableCell className="text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      <span className="text-[10px] ml-1 opacity-70">
                        {new Date(log.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </TableCell>
                    <TableCell>{renderActionBadge(log.action)}</TableCell>
                    <TableCell>{renderDetails(log)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
