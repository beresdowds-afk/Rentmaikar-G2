import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Scale,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Gavel,
  ShieldCheck,
  FileText,
  Clock,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export interface DisputeItem {
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
  resolved_by: string | null;
  resolution_notes: string | null;
  correlation_id: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  under_review: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  escalated: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  resolved_merchant: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  resolved_customer: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  overridden: "bg-primary/15 text-primary border-primary/30",
};

export const DisputesPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [adjudicateStatus, setAdjudicateStatus] = useState<string>("resolved_merchant");
  const [adjudicateNotes, setAdjudicateNotes] = useState<string>("");

  const { data: rawDisputes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["control-plane-disputes-list"],
    queryFn: async (): Promise<DisputeItem[]> => {
      const { data, error } = await supabase
        .from("payment_disputes")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(100);

      if (error) {
        console.warn("Disputes query notice:", error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        payment_id: row.payment_id,
        provider: row.provider,
        provider_reference: row.provider_reference,
        reason: row.reason,
        amount: Number(row.amount || 0),
        currency: row.currency || "USD",
        status: row.status || "open",
        opened_at: row.opened_at || row.created_at,
        resolved_at: row.resolved_at,
        resolved_by: row.resolved_by,
        resolution_notes: row.resolution_notes,
        correlation_id: row.correlation_id,
      }));
    },
    staleTime: 30000,
  });

  const disputes: DisputeItem[] = useMemo(() => rawDisputes || [], [rawDisputes]);

  const stats = useMemo(() => {
    return {
      total: disputes.length,
      open: disputes.filter((d) => d.status === "open").length,
      underReview: disputes.filter((d) => d.status === "under_review").length,
      escalated: disputes.filter((d) => d.status === "escalated").length,
      resolved: disputes.filter((d) => d.status.startsWith("resolved_") || d.status === "overridden").length,
    };
  }, [disputes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return disputes.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;

      if (!q) return true;
      return (
        d.id.toLowerCase().includes(q) ||
        d.payment_id.toLowerCase().includes(q) ||
        (d.reason && d.reason.toLowerCase().includes(q)) ||
        (d.provider && d.provider.toLowerCase().includes(q)) ||
        (d.provider_reference && d.provider_reference.toLowerCase().includes(q))
      );
    });
  }, [disputes, search, statusFilter]);

  const adjudicateMutation = useMutation({
    mutationFn: async ({
      disputeId,
      newStatus,
      notes,
    }: {
      disputeId: string;
      newStatus: string;
      notes: string;
    }) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("payment_disputes")
        .update({
          status: newStatus,
          resolved_at: now,
          resolution_notes: notes,
          resolved_by: "Control Plane Adjudication Officer",
        })
        .eq("id", disputeId);

      if (error) throw error;

      // Automatically append to outbound_decision_log for full decision audit
      try {
        await supabase.from("outbound_decision_log").insert({
          channel: "dispute_resolution",
          provider: "rentmaikar_adjudication",
          decision: newStatus === "resolved_merchant" ? "approved" : "blocked",
          reason: `Dispute Adjudicated: ${newStatus}. Notes: ${notes.slice(0, 200)}`,
          recipient_masked: `payment:${selectedDispute?.payment_id}`,
          notification_type: "dispute_adjudication",
        });
      } catch (logErr) {
        console.warn("Outbound decision log mirror notice:", logErr);
      }
    },
    onSuccess: () => {
      toast.success("Dispute Adjudicated Successfully: Decision entered into audit record.");
      queryClient.invalidateQueries({ queryKey: ["control-plane-disputes-list"] });
      setSelectedDispute(null);
      setAdjudicateNotes("");
    },
    onError: (err: any) => {
      toast.error(`Adjudication Failed: ${err.message}`);
    },
  });

  const handleOpenAdjudicate = (d: DisputeItem) => {
    setSelectedDispute(d);
    setAdjudicateStatus(d.status.startsWith("resolved") ? d.status : "resolved_merchant");
    setAdjudicateNotes(d.resolution_notes || "");
  };

  const handleConfirmAdjudicate = () => {
    if (!selectedDispute) return;
    if (!adjudicateNotes.trim()) {
      toast.error("Please provide written adjudication findings / notes");
      return;
    }
    adjudicateMutation.mutate({
      disputeId: selectedDispute.id,
      newStatus: adjudicateStatus,
      notes: adjudicateNotes.trim(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Counters Header */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Open Disputes</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-amber-600">
              <Clock className="h-4 w-4" />
              {stats.open}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Awaiting initial investigation</span>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Under Review</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-blue-600">
              <Search className="h-4 w-4" />
              {stats.underReview}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Evidence collection in progress</span>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Escalated to Provider</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-rose-600">
              <AlertTriangle className="h-4 w-4" />
              {stats.escalated}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Bank / processor arbitration</span>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Resolved &amp; Settled</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {stats.resolved}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Binding rulings recorded</span>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="p-5 border-b border-border/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Scale className="h-5 w-5 text-rose-500" />
                Disputes &amp; Claims Arbitration Tribunal
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Formal adjudication panel for payment chargebacks, transaction disputes, and damage claims.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1.5 text-xs h-8"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Sync
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search dispute ID, payment ID, reason, provider..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Status: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved_merchant">Resolved (Merchant Favored)</SelectItem>
                <SelectItem value="resolved_customer">Resolved (Customer Favored)</SelectItem>
                <SelectItem value="overridden">Overridden</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 text-[11px]">
                  <TableHead className="w-[140px]">OPENED AT</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>AMOUNT</TableHead>
                  <TableHead>REASON / CLAIM</TableHead>
                  <TableHead>PROVIDER / REF</TableHead>
                  <TableHead>PAYMENT ID</TableHead>
                  <TableHead className="text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                      Loading disputes and arbitration claims...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                      No active disputes match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((d) => (
                    <TableRow key={d.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(d.opened_at), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${STATUS_STYLES[d.status] || "border-border"} text-[10px] uppercase font-mono`}
                        >
                          {d.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono font-bold text-foreground">
                        {d.currency} {Number(d.amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium text-foreground">
                        {d.reason || "Unspecified dispute claim"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {d.provider} {d.provider_reference ? `(${d.provider_reference.slice(0, 8)})` : ""}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground select-all">
                        {d.payment_id.slice(0, 10)}...
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleOpenAdjudicate(d)}
                          className="h-7 px-2.5 text-xs gap-1"
                        >
                          <Gavel className="h-3.5 w-3.5" />
                          Adjudicate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Adjudication Workbench Dialog */}
      <Dialog open={Boolean(selectedDispute)} onOpenChange={(open) => !open && setSelectedDispute(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Scale className="h-5 w-5 text-rose-500" />
              Dispute Adjudication &amp; Ruling Workbench
            </DialogTitle>
            <DialogDescription className="text-xs">
              Review transaction claims, inspect evidence, and render a legally binding resolution.
            </DialogDescription>
          </DialogHeader>

          {selectedDispute && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Dispute ID</span>
                  <span className="font-mono font-semibold text-foreground select-all">{selectedDispute.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Disputed Amount</span>
                  <span className="font-mono font-bold text-foreground">
                    {selectedDispute.currency} {Number(selectedDispute.amount).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Payment ID</span>
                  <span className="font-mono text-foreground select-all">{selectedDispute.payment_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Provider Reference</span>
                  <span className="font-mono text-foreground">{selectedDispute.provider_reference || "N/A"}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[10px] uppercase">Customer / Issuer Claim</span>
                <p className="p-2.5 rounded bg-muted/30 text-foreground border border-border/60">
                  {selectedDispute.reason || "Customer claimed unrecognized charge / non-fulfillment"}
                </p>
              </div>

              {/* Adjudication Form */}
              <div className="space-y-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <Label className="text-xs font-bold text-foreground">Formal Resolution Decision</Label>
                <Select value={adjudicateStatus} onValueChange={setAdjudicateStatus}>
                  <SelectTrigger className="text-xs h-8 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resolved_merchant">Resolve in Favor of Merchant (Uphold Payment)</SelectItem>
                    <SelectItem value="resolved_customer">Resolve in Favor of Customer (Authorize Refund)</SelectItem>
                    <SelectItem value="escalated">Escalate to External Processor Arbitration</SelectItem>
                    <SelectItem value="under_review">Mark Under Active Investigation</SelectItem>
                    <SelectItem value="overridden">Administrative Override</SelectItem>
                  </SelectContent>
                </Select>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">Written Findings &amp; Rationale</Label>
                  <Textarea
                    placeholder="Provide detailed reasons, evidence citations, and justification for this ruling..."
                    value={adjudicateNotes}
                    onChange={(e) => setAdjudicateNotes(e.target.value)}
                    rows={3}
                    className="text-xs bg-background"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" size="sm" onClick={() => setSelectedDispute(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmAdjudicate}
                  disabled={adjudicateMutation.isPending}
                  className="gap-1.5"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  {adjudicateMutation.isPending ? "Executing Ruling..." : "Seal & Execute Ruling"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
