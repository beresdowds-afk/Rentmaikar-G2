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
  ShieldAlert,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  ExternalLink,
  Gavel,
  UserCheck,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export interface AppealRecord {
  id: string;
  created_at: string;
  application_id: string;
  reason: string;
  status: "open" | "approved" | "rejected" | "action_required" | string;
  requested_by?: string | null;
  documents?: any;
  resolution_notes?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  applicant_name?: string | null;
  applicant_email?: string | null;
  user_type?: string | null;
}

export const AppealsPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAppeal, setSelectedAppeal] = useState<AppealRecord | null>(null);
  const [rulingAction, setRulingAction] = useState<"approve" | "reject" | "action_required">("approve");
  const [rulingNotes, setRulingNotes] = useState<string>("");

  const { data: rawAppeals, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["control-plane-appeals-list"],
    queryFn: async (): Promise<AppealRecord[]> => {
      const { data, error } = await supabase
        .from("application_recovery_requests")
        .select(`
          id,
          created_at,
          application_id,
          reason,
          status,
          requested_by,
          documents,
          resolution_notes,
          reviewed_at,
          reviewed_by,
          applications (
            full_name,
            email,
            user_type,
            status,
            admin_notes
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.warn("Appeals query notice:", error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        application_id: row.application_id,
        reason: row.reason,
        status: row.status || "open",
        requested_by: row.requested_by,
        documents: row.documents,
        resolution_notes: row.resolution_notes,
        reviewed_at: row.reviewed_at,
        reviewed_by: row.reviewed_by,
        applicant_name: row.applications?.full_name || "Applicant",
        applicant_email: row.applications?.email || "N/A",
        user_type: row.applications?.user_type || "Driver",
      }));
    },
    staleTime: 30000,
  });

  const appeals: AppealRecord[] = useMemo(() => rawAppeals || [], [rawAppeals]);

  const stats = useMemo(() => {
    return {
      total: appeals.length,
      pending: appeals.filter((a) => a.status === "open").length,
      approved: appeals.filter((a) => a.status === "approved").length,
      rejected: appeals.filter((a) => a.status === "rejected").length,
    };
  }, [appeals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appeals.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;

      if (!q) return true;
      return (
        a.id.toLowerCase().includes(q) ||
        a.application_id.toLowerCase().includes(q) ||
        (a.applicant_name && a.applicant_name.toLowerCase().includes(q)) ||
        (a.applicant_email && a.applicant_email.toLowerCase().includes(q)) ||
        (a.reason && a.reason.toLowerCase().includes(q))
      );
    });
  }, [appeals, search, statusFilter]);

  const adjudicateMutation = useMutation({
    mutationFn: async ({
      appealId,
      applicationId,
      action,
      notes,
    }: {
      appealId: string;
      applicationId: string;
      action: "approve" | "reject" | "action_required";
      notes: string;
    }) => {
      const now = new Date().toISOString();
      const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "action_required";

      // 1. Update appeal record
      const { error: appealErr } = await supabase
        .from("application_recovery_requests")
        .update({
          status: newStatus,
          resolution_notes: notes,
          reviewed_at: now,
          reviewed_by: "Appellate Tribunal Officer",
        })
        .eq("id", appealId);

      if (appealErr) throw appealErr;

      // 2. If approved, overturn application rejection
      if (action === "approve") {
        await supabase
          .from("applications")
          .update({
            status: "approved",
            admin_notes: `Appellate ruling overturned rejection: ${notes}`,
          })
          .eq("id", applicationId);
      }

      // 3. Mirror into decision log
      try {
        await supabase.from("outbound_decision_log").insert({
          channel: "appellate_ruling",
          provider: "rentmaikar_appeals_tribunal",
          decision: action === "approve" ? "approved" : "rejected",
          reason: `Appeal ${newStatus.toUpperCase()}: ${notes.slice(0, 200)}`,
          recipient_masked: `app:${applicationId}`,
          notification_type: "appeal_adjudication",
        });
      } catch (logErr) {
        console.warn("Decision log mirror notice:", logErr);
      }
    },
    onSuccess: () => {
      toast.success("Appellate Ruling Executed and Recorded in Governance Ledger");
      queryClient.invalidateQueries({ queryKey: ["control-plane-appeals-list"] });
      setSelectedAppeal(null);
      setRulingNotes("");
    },
    onError: (err: any) => {
      toast.error(`Ruling Failed: ${err.message}`);
    },
  });

  const handleOpenAdjudicate = (app: AppealRecord) => {
    setSelectedAppeal(app);
    setRulingAction(app.status === "approved" ? "approve" : "approve");
    setRulingNotes(app.resolution_notes || "");
  };

  const handleConfirmRuling = () => {
    if (!selectedAppeal) return;
    if (!rulingNotes.trim()) {
      toast.error("Please provide written appellate findings / reasons");
      return;
    }
    adjudicateMutation.mutate({
      appealId: selectedAppeal.id,
      applicationId: selectedAppeal.application_id,
      action: rulingAction,
      notes: rulingNotes.trim(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Pending Appeals</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-amber-600">
              <Clock className="h-4 w-4" />
              {stats.pending}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Awaiting appellate reconsideration</span>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Overturned &amp; Reinstated</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {stats.approved}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Appeals granted &amp; approved</span>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Rejections Affirmed</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-rose-600">
              <XCircle className="h-4 w-4" />
              {stats.rejected}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Underwriting declination upheld</span>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm bg-card">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs">Total Appeals Logged</CardDescription>
            <CardTitle className="text-xl font-bold flex items-center gap-1.5 text-foreground">
              <ShieldAlert className="h-4 w-4 text-primary" />
              {stats.total}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <span className="text-[11px] text-muted-foreground">Across all onboarding queues</span>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="p-5 border-b border-border/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                Appellate Tribunal &amp; Reconsideration Bench
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Formal tribunal evaluating applicant appeals, referee disputes, and suspension reconsiderations.
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
                placeholder="Search by applicant name, email, application ID, ground..."
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
                <SelectItem value="open">Open (Pending)</SelectItem>
                <SelectItem value="approved">Approved (Overturned)</SelectItem>
                <SelectItem value="rejected">Rejected (Affirmed)</SelectItem>
                <SelectItem value="action_required">Action Required</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 text-[11px]">
                  <TableHead className="w-[140px]">SUBMITTED AT</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>APPLICANT</TableHead>
                  <TableHead>TYPE</TableHead>
                  <TableHead>GROUNDS OF APPEAL</TableHead>
                  <TableHead>DOCUMENTS</TableHead>
                  <TableHead className="text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                      Loading appeals docket...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                      No appeals recorded under the selected filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((app) => {
                    const isOpen = app.status === "open";
                    const isApproved = app.status === "approved";
                    const isRejected = app.status === "rejected";
                    const docCount = Array.isArray(app.documents) ? app.documents.length : 0;
                    return (
                      <TableRow key={app.id} className="text-xs hover:bg-muted/30">
                        <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(app.created_at), "yyyy-MM-dd HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              isOpen
                                ? "border-amber-500/30 text-amber-600 bg-amber-500/10 text-[10px] uppercase font-mono"
                                : isApproved
                                ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10 text-[10px] uppercase font-mono"
                                : "border-rose-500/30 text-rose-600 bg-rose-500/10 text-[10px] uppercase font-mono"
                            }
                          >
                            {app.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{app.applicant_name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{app.applicant_email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                            {app.user_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground text-[11px]">
                          {app.reason}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {docCount} File{docCount !== 1 ? "s" : ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleOpenAdjudicate(app)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            <Gavel className="h-3.5 w-3.5" />
                            Adjudicate
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Appeal Adjudication Dialog */}
      <Dialog open={Boolean(selectedAppeal)} onOpenChange={(open) => !open && setSelectedAppeal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Appellate Reconsideration Bench
            </DialogTitle>
            <DialogDescription className="text-xs">
              Hear applicant statements, inspect evidentiary attachments, and issue final administrative ruling.
            </DialogDescription>
          </DialogHeader>

          {selectedAppeal && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Applicant</span>
                  <span className="font-semibold text-foreground">{selectedAppeal.applicant_name}</span>
                  <span className="text-[11px] text-muted-foreground block font-mono">{selectedAppeal.applicant_email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Application Ref</span>
                  <span className="font-mono text-foreground select-all">{selectedAppeal.application_id}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                  Appellant's Ground of Appeal
                </span>
                <p className="p-3 rounded bg-muted/30 text-foreground text-xs leading-relaxed border border-border/60">
                  {selectedAppeal.reason}
                </p>
              </div>

              {/* Rationale & Action Form */}
              <div className="space-y-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <Label className="text-xs font-bold text-foreground">Tribunal Determination</Label>
                <Select
                  value={rulingAction}
                  onValueChange={(val: any) => setRulingAction(val)}
                >
                  <SelectTrigger className="text-xs h-8 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">Overturn Rejection &amp; Approve Application</SelectItem>
                    <SelectItem value="reject">Affirm Original Rejection (Dismiss Appeal)</SelectItem>
                    <SelectItem value="action_required">Request Supplemental Evidentiary Submissions</SelectItem>
                  </SelectContent>
                </Select>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">Appellate Opinion &amp; Justification</Label>
                  <Textarea
                    placeholder="Enter official legal and operational reasoning for this determination..."
                    value={rulingNotes}
                    onChange={(e) => setRulingNotes(e.target.value)}
                    rows={3}
                    className="text-xs bg-background"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" size="sm" onClick={() => setSelectedAppeal(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmRuling}
                  disabled={adjudicateMutation.isPending}
                  className="gap-1.5"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  {adjudicateMutation.isPending ? "Issuing Ruling..." : "Issue Final Appellate Ruling"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
