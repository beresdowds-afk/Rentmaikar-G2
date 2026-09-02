import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RefereeVerification {
  id: string;
  referee_index: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  mismatch_reason: string | null;
  verified_at: string | null;
}

interface Props {
  applicationId: string;
  canRun?: boolean;
}

type ActionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  running: { label: "Running", variant: "secondary" },
  verified: { label: "Verified", variant: "default" },
  mismatch: { label: "Mismatch", variant: "destructive" },
  action_required: { label: "Action required", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
};

export default function RefereeVerificationPanel({ applicationId, canRun = true }: Props) {
  const [rows, setRows] = useState<RefereeVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteState, setInviteState] = useState<ActionState>({ kind: "idle" });
  const [verifyState, setVerifyState] = useState<ActionState>({ kind: "idle" });

  const busy = inviteState.kind === "loading" || verifyState.kind === "loading";

  async function load() {
    const { data } = await supabase
      .from("referee_verifications" as any)
      .select("*")
      .eq("application_id", applicationId)
      .order("referee_index");
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [applicationId]);

  async function run() {
    setVerifyState({ kind: "loading" });
    try {
      const { data, error } = await supabase.functions.invoke("verify-referees", {
        body: { application_id: applicationId },
      });
      if (error) throw error;
      const msg = `Verification triggered for ${data?.referees ?? 0} referee(s).`;
      setVerifyState({ kind: "success", message: msg });
      toast.success(msg);
      await load();
    } catch (e: any) {
      const msg = e?.message ?? "Could not run verification";
      setVerifyState({ kind: "error", message: msg });
      toast.error(msg);
    }
  }

  async function sendInvites() {
    setInviteState({ kind: "loading" });
    try {
      const { data, error } = await supabase.functions.invoke("notify-referees", {
        body: { application_id: applicationId },
      });
      if (error) throw error;
      const msg = `Attestation invites sent to ${data?.sent ?? 0} referee(s) via email, SMS & WhatsApp.`;
      setInviteState({ kind: "success", message: msg });
      toast.success(msg);
      await load();
    } catch (e: any) {
      const msg = e?.message ?? "Could not send invites";
      setInviteState({ kind: "error", message: msg });
      toast.error(msg);
    }
  }

  const renderState = (s: ActionState, testId: string) => {
    if (s.kind === "idle") return null;
    if (s.kind === "loading") {
      return (
        <div data-testid={`${testId}-loading`} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Working…
        </div>
      );
    }
    if (s.kind === "success") {
      return (
        <Alert data-testid={`${testId}-success`} className="py-2 border-green-200 bg-green-50">
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          <AlertDescription className="text-xs text-green-800">{s.message}</AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert data-testid={`${testId}-error`} variant="destructive" className="py-2">
        <XCircle className="h-3 w-3" />
        <AlertTitle className="text-xs">Action failed</AlertTitle>
        <AlertDescription className="text-xs">{s.message}</AlertDescription>
      </Alert>
    );
  };

  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="referee-verification-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Shield /> Referee verification
        </h3>
        {canRun && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={sendInvites} disabled={busy} data-testid="btn-send-invites">
              {inviteState.kind === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send attestation invites
            </Button>
            <Button size="sm" variant="outline" onClick={run} disabled={busy} data-testid="btn-verify">
              {verifyState.kind === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Re-run verification
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {renderState(inviteState, "invite")}
        {renderState(verifyState, "verify")}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No referee verifications yet. Trigger a run to start.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const s = statusBadge[r.status] ?? statusBadge.pending;
            return (
              <li key={r.id} className="flex items-start justify-between border rounded-md p-3">
                <div>
                  <div className="font-medium">Referee #{r.referee_index + 1} — {r.full_name}</div>
                  <div className="text-xs text-muted-foreground">{r.phone ?? "no phone"} · {r.email ?? "no email"}</div>
                  {r.mismatch_reason && (
                    <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {r.mismatch_reason}
                    </div>
                  )}
                </div>
                <Badge variant={s.variant}>
                  {r.status === "verified" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {s.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Shield() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
