import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, RefreshCw, XCircle, MessageSquareWarning, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type NegativeAttestation = {
  id: string;
  application_id: string;
  referee_index: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  attestation_response: string | null;
  attestation_comments: string | null;
  attested_at: string | null;
  applicant_name?: string;
  applicant_id?: string;
};

export default function NegativeAttestationReviewPanel() {
  const [rows, setRows] = useState<NegativeAttestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data: refs, error } = await supabase
      .from("referee_verifications")
      .select("id, application_id, referee_index, full_name, email, phone, attestation_response, attestation_comments, attested_at")
      .eq("attestation_status", "attested_negative")
      .order("attested_at", { ascending: false });

    if (error) {
      toast.error("Failed to load negative attestations");
      setLoading(false);
      return;
    }
    const appIds = Array.from(new Set((refs ?? []).map(r => r.application_id)));
    let appMap: Record<string, { name: string; user_id: string }> = {};
    if (appIds.length) {
      const { data: apps } = await supabase
        .from("applications")
        .select("id, user_id, full_name, first_name, last_name")
        .in("id", appIds);
      appMap = Object.fromEntries((apps ?? []).map((a: any) => [a.id, {
        name: a.full_name ?? [a.first_name, a.last_name].filter(Boolean).join(" ") ?? "Applicant",
        user_id: a.user_id,
      }]));
    }
    setRows((refs ?? []).map((r: any) => ({
      ...r,
      applicant_name: appMap[r.application_id]?.name,
      applicant_id: appMap[r.application_id]?.user_id,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const recordAudit = async (action: string, target_id: string, details: any) => {
    try {
      await supabase.rpc("log_admin_action", {
        _action: action,
        _target_table: "referee_verifications",
        _target_id: target_id,
        _details: details,
      } as any);
    } catch { /* audit best-effort */ }
  };

  const rejectRegistration = async (row: NegativeAttestation) => {
    setBusyId(row.id);
    try {
      const note = notes[row.id] ?? "";
      const { error } = await supabase
        .from("applications")
        .update({
          status: "rejected",
          referees_verification_status: "rejected",
          rejection_reason: `Rejected after negative referee attestation from ${row.full_name}. ${note}`.trim(),
        } as any)
        .eq("id", row.application_id);
      if (error) throw error;

      if (row.applicant_id) {
        await supabase.from("inbox_messages").insert({
          user_id: row.applicant_id,
          direction: "inbound",
          channel: "system",
          subject: "Application rejected",
          body: `Your driver application was rejected after a negative referee attestation. Reason: ${note || "Failed referee attestation."}`,
          status: "unread",
        } as any);
      }

      await recordAudit("reject_registration_negative_referee", row.id, {
        application_id: row.application_id,
        referee: row.full_name,
        note,
      });
      toast.success("Application rejected and applicant notified");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reject");
    } finally {
      setBusyId(null);
    }
  };

  const requestUpdates = async (row: NegativeAttestation) => {
    setBusyId(row.id);
    try {
      const note = notes[row.id] ?? "";
      const { error } = await supabase
        .from("applications")
        .update({
          referees_verification_status: "updates_requested",
        } as any)
        .eq("id", row.application_id);
      if (error) throw error;

      if (row.applicant_id) {
        await supabase.from("inbox_messages").insert({
          user_id: row.applicant_id,
          direction: "inbound",
          channel: "system",
          subject: "Please update your referees",
          body: `A referee attestation was negative. Please review and update your referee list, then resubmit. ${note}`,
          status: "unread",
        } as any);
      }

      await recordAudit("request_referee_updates", row.id, {
        application_id: row.application_id,
        referee: row.full_name,
        note,
      });
      toast.success("Applicant asked to update referees");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to request updates");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquareWarning className="h-5 w-5 text-destructive" />
          <h3 className="text-lg font-semibold">Negative Referee Attestations</h3>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No negative attestations pending review.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Referee #{r.referee_index + 1}: {r.full_name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Applicant: {r.applicant_name ?? "Unknown"} · App {r.application_id.slice(0, 8)}…
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.email ?? "no email"} · {r.phone ?? "no phone"} · {r.attested_at ? new Date(r.attested_at).toLocaleString() : ""}
                  </div>
                </div>
                <Badge variant="destructive">Negative</Badge>
              </div>

              {r.attestation_comments && (
                <div className="text-sm bg-muted/50 rounded p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Referee comments</div>
                  {r.attestation_comments}
                </div>
              )}

              <Textarea
                placeholder="Internal note / reason (recorded in audit log and sent to applicant)"
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                rows={2}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === r.id}
                  onClick={() => rejectRegistration(r)}
                >
                  <XCircle className="h-4 w-4 mr-2" /> Reject Registration
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.id}
                  onClick={() => requestUpdates(r)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Request Referee Updates
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
