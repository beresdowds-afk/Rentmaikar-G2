import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

interface DisputeRow {
  id: string;
  payment_id: string;
  provider: string;
  provider_reference: string | null;
  reason: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  correlation_id: string | null;
  payment_status: string | null;
  payment_amount: number | null;
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-600",
  under_review: "bg-blue-500/15 text-blue-600",
  escalated: "bg-destructive/15 text-destructive",
  resolved_merchant: "bg-emerald-500/15 text-emerald-600",
  resolved_customer: "bg-muted text-muted-foreground",
  overridden: "bg-primary/15 text-primary",
};

const RESOLUTIONS = [
  {
    value: "merchant",
    label: "Resolved in our favour",
    hint: "Payment moves back to completed. Ledger entries stay as posted.",
  },
  {
    value: "customer",
    label: "Resolved for the customer",
    hint: "Payment is refunded and every ledger entry for it is reversed.",
  },
  {
    value: "escalate",
    label: "Escalate for further review",
    hint: "Keeps the case open and flags it as escalated.",
  },
  {
    value: "override",
    label: "Manual override",
    hint: "Force the payment into a chosen state (use only with an audit note).",
  },
] as const;

const OVERRIDE_STATES = ["completed", "settled", "failed", "refunded"] as const;

export default function AdminDisputesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [active, setActive] = useState<DisputeRow | null>(null);
  const [resolution, setResolution] = useState<string>("merchant");
  const [overrideState, setOverrideState] = useState<string>("completed");
  const [notes, setNotes] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-disputes", statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_disputes", {
        _status: statusFilter === "all" ? null : statusFilter,
        _limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as unknown as DisputeRow[];
    },
  });

  const disputes = useMemo(() => data ?? [], [data]);

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!active) return null;
      const { data, error } = await supabase.rpc("admin_resolve_dispute", {
        _dispute_id: active.id,
        _resolution: resolution,
        _notes: notes.trim() || null,
        _override_state: resolution === "override" ? overrideState : null,
      });
      if (error) throw error;
      return data as unknown as { ok: boolean; error?: string; status?: string };
    },
    onSuccess: (result) => {
      if (result && result.ok === false) {
        toast({
          title: "Could not apply",
          description: result.error ?? "The dispute could not be updated.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Dispute updated", description: `New status: ${result?.status ?? "updated"}` });
      setActive(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["admin-disputes"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: unknown) =>
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      }),
  });

  const openDialog = (row: DisputeRow) => {
    setActive(row);
    setResolution(row.status === "escalated" ? "merchant" : "escalate");
    setNotes("");
  };

  const money = (amount: number | null, currency: string | null) =>
    amount == null ? "—" : `${currency ?? ""} ${Number(amount).toLocaleString()}`.trim();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Payment disputes
            </CardTitle>
            <CardDescription>
              Chargebacks opened by a payment provider. Resolving a case automatically applies the
              correct follow-up payment state and writes an audit entry.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under review</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved_merchant">Resolved (us)</SelectItem>
                <SelectItem value="resolved_customer">Resolved (customer)</SelectItem>
                <SelectItem value="overridden">Overridden</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading disputes…
            </div>
          ) : disputes.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No disputes for this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Opened</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Payment state</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trace</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disputes.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(d.opened_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium capitalize">{d.provider}</div>
                        <div className="text-muted-foreground">{d.provider_reference ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">{money(d.amount, d.currency)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs" title={d.reason ?? ""}>
                        {d.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{d.payment_status ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[d.status] ?? ""} variant="secondary">
                          {d.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate font-mono text-[11px] text-muted-foreground">
                        {d.correlation_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={["resolved_merchant", "resolved_customer", "overridden"].includes(
                            d.status,
                          )}
                          onClick={() => openDialog(d)}
                        >
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Resolve dispute
            </DialogTitle>
            <DialogDescription>
              {active
                ? `${active.provider} · ${money(active.amount, active.currency)} · payment ${active.payment_id.slice(0, 8)}…`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {RESOLUTIONS.find((r) => r.value === resolution)?.hint}
              </p>
            </div>

            {resolution === "override" && (
              <div className="space-y-2">
                <Label>Force payment state</Label>
                <Select value={overrideState} onValueChange={setOverrideState}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERRIDE_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dispute-notes">Audit note</Label>
              <Textarea
                id="dispute-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Evidence submitted, provider decision, or reason for the override…"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending || (resolution === "override" && !notes.trim())}
            >
              {resolveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
