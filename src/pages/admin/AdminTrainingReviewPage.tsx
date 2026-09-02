import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, RefreshCw, Search, GraduationCap, Loader2 } from "lucide-react";

interface PendingRow {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  module_id: string;
  module_title: string;
  module_region: string;
  score: number | null;
  completed_at: string;
  verification_status: string;
  verified_at: string | null;
  review_notes: string | null;
}

const STATUS_TONE: Record<string, string> = {
  verified: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
  rejected: "bg-red-500/15 text-red-500 border-red-500/40",
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/40",
};

export default function AdminTrainingReviewPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<{ row: PendingRow; approve: boolean } | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-training-completions", status],
    queryFn: async (): Promise<PendingRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_pending_training_completions", {
        _status: status,
      });
      if (error) throw error;
      return (data ?? []) as PendingRow[];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) =>
      [r.full_name, r.email, r.phone, r.module_title]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, search]);

  const submitReview = async () => {
    if (!target) return;
    setSaving(true);
    const { data: result, error } = await supabase.rpc("admin_review_training_completion", {
      _completion_id: target.row.id,
      _approve: target.approve,
      _notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = (result ?? {}) as { training_complete?: boolean };

    // Notify the driver on their device(s).
    void supabase.functions.invoke("notify-training-review", {
      body: {
        user_id: target.row.user_id,
        approved: target.approve,
        module_title: target.row.module_title,
        training_complete: !!res.training_complete,
        notes: notes.trim() || null,
      },
    });

    toast.success(
      target.approve
        ? `Verified — ${target.row.full_name ?? "driver"} notified`
        : `Rejected — ${target.row.full_name ?? "driver"} notified to retake`
    );
    setTarget(null);
    setNotes("");
    void qc.invalidateQueries({ queryKey: ["admin-training-completions"] });
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Compliance Training Review</h1>
          <p className="text-muted-foreground text-sm">
            Verify driver module completions. Drivers stay flagged until every module is verified.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>{rows.length} record{rows.length === 1 ? "" : "s"}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 w-56"
                placeholder="Search driver or module"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending review</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    {isFetching ? "Loading…" : "Nothing to review."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email ?? r.phone ?? r.user_id}</div>
                    </TableCell>
                    <TableCell>{r.module_title}</TableCell>
                    <TableCell className="uppercase text-xs">{r.module_region}</TableCell>
                    <TableCell>{r.score ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(r.completed_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[r.verification_status] ?? ""}>
                        {r.verification_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-600"
                        onClick={() => { setTarget({ row: r, approve: true }); setNotes(""); }}
                        disabled={r.verification_status === "verified"}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => { setTarget({ row: r, approve: false }); setNotes(""); }}
                        disabled={r.verification_status === "rejected"}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.approve ? "Verify completion" : "Reject completion"}
            </DialogTitle>
            <DialogDescription>
              {target?.row.full_name ?? "Driver"} — {target?.row.module_title}. The driver is notified
              on their device and the dashboard banner updates immediately.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Review notes (optional, shared with the driver)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => void submitReview()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {target?.approve ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
