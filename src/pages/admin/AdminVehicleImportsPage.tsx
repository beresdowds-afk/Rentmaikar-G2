import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Download, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";

interface ImportRun {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  scanned_count: number;
  imported_count: number;
  skipped_count: number;
  error_count: number;
}

interface ImportItem {
  id: string;
  run_id: string | null;
  application_id: string;
  owner_id: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  outcome: string;
  skip_reason: string | null;
  vehicle_id: string | null;
  existing_vehicle_id: string | null;
  resolution: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

const outcomeBadge = (outcome: string) => {
  switch (outcome) {
    case "imported":
      return <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Imported</Badge>;
    case "skipped_duplicate":
      return <Badge variant="secondary">Duplicate plate</Badge>;
    case "skipped_incomplete":
      return <Badge variant="outline">Incomplete details</Badge>;
    default:
      return <Badge variant="destructive">Error</Badge>;
  }
};

const RESOLUTION_LABEL: Record<string, string> = {
  unresolved: "Needs review",
  kept_existing: "Kept existing",
  merged: "Merged details",
  merged_and_transferred: "Merged + transferred",
};

const AdminVehicleImportsPage = () => {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<ImportItem | null>(null);
  const [notes, setNotes] = useState("");

  const runsQuery = useQuery({
    queryKey: ["vehicle-import-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_import_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ImportRun[];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["vehicle-import-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_import_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ImportItem[];
    },
  });

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const duplicates = items.filter((i) => i.outcome === "skipped_duplicate");
  const pendingDuplicates = duplicates.filter((i) => i.resolution === "unresolved");

  const invalidate = () => {
    ["vehicle-import-runs", "vehicle-import-items", "vehicles", "owner-vehicles", "public-vehicles"].forEach(
      (key) => queryClient.invalidateQueries({ queryKey: [key] }),
    );
  };

  const runSync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sync_approved_application_vehicles", {
        p_source: "manual",
      });
      if (error) throw error;
      return data as { imported: number; skipped: number; errors: number; scanned: number };
    },
    onSuccess: (res) => {
      toast.success("Import run complete", {
        description: `${res.scanned} scanned · ${res.imported} imported · ${res.skipped} skipped · ${res.errors} errors`,
      });
      invalidate();
    },
    onError: (e: any) => toast.error("Import failed", { description: e?.message }),
  });

  const resolve = useMutation({
    mutationFn: async ({ itemId, action }: { itemId: string; action: string }) => {
      const { error } = await supabase.rpc("resolve_vehicle_import_duplicate", {
        p_item_id: itemId,
        p_action: action,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Duplicate resolved");
      setActive(null);
      setNotes("");
      invalidate();
    },
    onError: (e: any) => toast.error("Could not resolve", { description: e?.message }),
  });

  const exportCsv = () => {
    const header = [
      "created_at",
      "application_id",
      "plate",
      "make",
      "model",
      "year",
      "outcome",
      "skip_reason",
      "resolution",
    ];
    const rows = items.map((i) =>
      [
        i.created_at,
        i.application_id,
        i.license_plate ?? "",
        i.make ?? "",
        i.model ?? "",
        i.year ?? "",
        i.outcome,
        (i.skip_reason ?? "").replace(/"/g, "'"),
        i.resolution,
      ]
        .map((v) => `"${String(v)}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehicle-import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const itemRows = (list: ImportItem[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vehicle</TableHead>
          <TableHead>Plate</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((i) => (
          <TableRow key={i.id}>
            <TableCell className="whitespace-nowrap">
              {[i.make, i.model, i.year].filter(Boolean).join(" ") || "—"}
              <div className="text-xs text-muted-foreground">
                {new Date(i.created_at).toLocaleString()}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">{i.license_plate ?? "—"}</TableCell>
            <TableCell>{outcomeBadge(i.outcome)}</TableCell>
            <TableCell className="max-w-[280px] text-sm text-muted-foreground">
              {i.skip_reason ?? "—"}
            </TableCell>
            <TableCell className="text-sm">
              {RESOLUTION_LABEL[i.resolution] ?? i.resolution}
              {i.resolution_notes && (
                <div className="text-xs text-muted-foreground">{i.resolution_notes}</div>
              )}
            </TableCell>
            <TableCell className="text-right">
              {i.outcome === "skipped_duplicate" && i.resolution === "unresolved" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActive(i);
                    setNotes("");
                  }}
                >
                  Review
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
        {list.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
              Nothing here yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Seo
        title="Vehicle Import Report | Rentmaikar Admin"
        description="Scheduled sync of approved owner vehicles into the catalogue and asset registry, with duplicate handling."
        path="/admin/vehicle-imports"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vehicle Import Report</h1>
          <p className="text-sm text-muted-foreground">
            Approved owner vehicle details are synced into the asset registry automatically. Duplicate
            plates are skipped and listed here for manual review.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              runsQuery.refetch();
              itemsQuery.refetch();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => runSync.mutate()} disabled={runSync.isPending} className="gap-2">
            {runSync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Run sync now
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total processed", value: items.length },
          { label: "Imported", value: items.filter((i) => i.outcome === "imported").length },
          { label: "Duplicates skipped", value: duplicates.length },
          { label: "Awaiting review", value: pendingDuplicates.length },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="duplicates">
        <TabsList>
          <TabsTrigger value="duplicates">Duplicates ({pendingDuplicates.length})</TabsTrigger>
          <TabsTrigger value="all">All entries</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="duplicates">
          <Card>
            <CardContent className="pt-6">
              {itemsQuery.isLoading ? <Skeleton className="h-40 w-full" /> : itemRows(pendingDuplicates)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardContent className="pt-6">
              {itemsQuery.isLoading ? <Skeleton className="h-40 w-full" /> : itemRows(items)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Scanned</TableHead>
                    <TableHead>Imported</TableHead>
                    <TableHead>Skipped</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runsQuery.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(r.started_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.source}</Badge>
                      </TableCell>
                      <TableCell>{r.scanned_count}</TableCell>
                      <TableCell>{r.imported_count}</TableCell>
                      <TableCell>{r.skipped_count}</TableCell>
                      <TableCell>{r.error_count}</TableCell>
                    </TableRow>
                  ))}
                  {(runsQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        No sync runs recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve duplicate plate</DialogTitle>
            <DialogDescription>
              A vehicle with plate {active?.license_plate} already exists. Choose whether to keep the
              existing registry record as-is, merge the submitted details into it, or merge and transfer
              ownership to the applicant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="font-medium">Submitted details</p>
              <p className="text-muted-foreground">
                {[active?.make, active?.model, active?.year, active?.color].filter(Boolean).join(" · ") ||
                  "—"}
              </p>
            </div>
            <Textarea
              placeholder="Resolution notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              disabled={resolve.isPending}
              onClick={() => active && resolve.mutate({ itemId: active.id, action: "keep_existing" })}
            >
              Keep existing
            </Button>
            <Button
              variant="secondary"
              disabled={resolve.isPending}
              onClick={() => active && resolve.mutate({ itemId: active.id, action: "merge" })}
            >
              Merge details
            </Button>
            <Button
              disabled={resolve.isPending}
              onClick={() =>
                active && resolve.mutate({ itemId: active.id, action: "merge_and_transfer" })
              }
            >
              Merge + transfer owner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVehicleImportsPage;
