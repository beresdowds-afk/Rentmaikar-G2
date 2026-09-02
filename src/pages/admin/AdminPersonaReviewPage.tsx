import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { RefreshCw, Search, CheckCircle2, XCircle, Eye, ShieldCheck, History, Loader2 } from "lucide-react";

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  identity_verification_status: string | null;
  identity_verified_at: string | null;
  latest_inquiry_row_id: string | null;
  latest_inquiry_id: string | null;
  latest_inquiry_status: string | null;
  latest_inquiry_updated_at: string | null;
  latest_region: string | null;
  latest_mismatch_fields: Record<string, unknown> | null;
};

type AuditRow = {
  id: string;
  admin_id: string;
  action: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "unstarted", label: "Not started" },
  { value: "created", label: "Created" },
  { value: "pending", label: "Pending" },
  { value: "needs_review", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
];

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  declined: "bg-red-500/15 text-red-400 border-red-500/40",
  expired: "bg-red-500/15 text-red-400 border-red-500/40",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  needs_review: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  created: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  unstarted: "bg-muted text-muted-foreground border-border",
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "unstarted";
  return <Badge variant="outline" className={STATUS_TONE[s] ?? ""}>{s}</Badge>;
}

export default function AdminPersonaReviewPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const [selected, setSelected] = useState<UserRow | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | "acknowledge" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_search_persona_users", {
      _query: q || null,
      _status: status,
      _limit: 100,
    });
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data as UserRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { search(); /* eslint-disable-next-line */ }, [status]);

  const loadAudit = async (userRowId: string | null, targetUserId: string) => {
    setAuditLoading(true);
    let query = supabase
      .from("admin_audit_log")
      .select("id, admin_id, action, target_id, details, created_at")
      .like("action", "persona_review_%")
      .order("created_at", { ascending: false })
      .limit(50);
    if (userRowId) {
      query = query.or(`target_id.eq.${userRowId},details->>target_user_id.eq.${targetUserId}`);
    } else {
      query = query.eq("details->>target_user_id", targetUserId);
    }
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setAudit(((data as any[]) ?? []) as AuditRow[]);
    setAuditLoading(false);
  };

  const openAction = (row: UserRow, act: "approve" | "reject" | "acknowledge") => {
    setSelected(row);
    setAction(act);
    setNotes("");
    void loadAudit(row.latest_inquiry_row_id, row.user_id);
  };

  const submit = async () => {
    if (!selected || !action) return;
    if (!selected.latest_inquiry_row_id) {
      toast.error("No Persona inquiry exists for this user yet.");
      return;
    }
    if (action !== "acknowledge" && notes.trim().length < 4) {
      toast.error("Please add a short justification note.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_review_persona_inquiry", {
      _inquiry_row_id: selected.latest_inquiry_row_id,
      _action: action,
      _notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Persona ${action} recorded and logged`);
    setAction(null);
    setSelected(null);
    setNotes("");
    await search();
  };

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Persona review desk
          </h1>
          <p className="text-sm text-muted-foreground">
            Search users, review Persona outcomes, and record override/acknowledgement decisions to the admin audit log.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={search} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-3">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, email, user id or inquiry id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Profile status</TableHead>
                <TableHead>Latest inquiry</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? "no email"}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.user_id.slice(0, 8)}…</div>
                  </TableCell>
                  <TableCell><StatusBadge status={r.identity_verification_status} /></TableCell>
                  <TableCell>
                    <StatusBadge status={r.latest_inquiry_status} />
                    <div className="font-mono text-[10px] text-muted-foreground mt-1">
                      {r.latest_inquiry_id ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{r.latest_region ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.latest_inquiry_updated_at ? new Date(r.latest_inquiry_updated_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openAction(r, "acknowledge")}>
                      <Eye className="h-4 w-4 mr-1" /> Review
                    </Button>
                    <Button size="sm" variant="ghost" className="text-emerald-500"
                            disabled={!r.latest_inquiry_row_id}
                            onClick={() => openAction(r, "approve")}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500"
                            disabled={!r.latest_inquiry_row_id}
                            onClick={() => openAction(r, "reject")}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading…" : "No users match the current filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setSelected(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {action === "approve" && "Override to approved"}
              {action === "reject" && "Override to declined"}
              {action === "acknowledge" && "Acknowledge current outcome"}
            </DialogTitle>
            <DialogDescription>
              {selected?.full_name ?? selected?.email ?? selected?.user_id}
              {" · "}
              current profile status:{" "}
              <span className="font-medium">{selected?.identity_verification_status ?? "unstarted"}</span>
            </DialogDescription>
          </DialogHeader>

          {selected?.latest_mismatch_fields && Object.keys(selected.latest_mismatch_fields).length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-medium">Persona flagged checks</div>
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(selected.latest_mismatch_fields, null, 2)}
              </pre>
            </div>
          )}

          {action !== "acknowledge" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Reviewer notes (required)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explain why this override is warranted. Recorded in the admin audit log."
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" /> Prior reviews
            </div>
            <div className="rounded-md border max-h-48 overflow-y-auto text-xs">
              {auditLoading && (
                <div className="p-3 text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading audit history…
                </div>
              )}
              {!auditLoading && audit.length === 0 && (
                <div className="p-3 text-muted-foreground">No prior reviews recorded.</div>
              )}
              {!auditLoading && audit.map((a) => (
                <div key={a.id} className="border-b last:border-b-0 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{a.action.replace("persona_review_", "")}</span>
                    <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  {a.details?.notes ? (
                    <div className="mt-1 text-muted-foreground">“{String(a.details.notes)}”</div>
                  ) : null}
                  <div className="mt-1 text-muted-foreground">
                    {String((a.details as any)?.prev_status ?? "?")} → {String((a.details as any)?.new_status ?? "?")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAction(null); setSelected(null); }}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm {action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
