import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Mode = "owner" | "admin";

interface Props {
  mode: Mode;
}

/**
 * Approval / validation panel for vehicle recall requests.
 *  - Owner mode: approve/reject owner_approval_status
 *  - Admin mode: validate/reject admin_validation_status (independent gate)
 * Recall procedures only start once BOTH owner_approval_status = 'approved'
 * AND admin_validation_status = 'validated'.
 */
export function RecallApprovalPanel({ mode }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: recalls, isLoading } = useQuery({
    queryKey: ["recalls-approvals", mode, user?.id],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("vehicle_recalls")
        .select("*, vehicles(make, model, license_plate, owner_id), profiles!vehicle_recalls_driver_id_fkey(full_name)")
        .in("status", ["requested", "approved", "in_progress"])
        .order("created_at", { ascending: false });

      if (mode === "owner") q = q.eq("owner_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: async ({
      id, action,
    }: { id: string; action: "approve" | "reject" }) => {
      const patch: any = { resolution_notes: notes[id] ?? null };
      const now = new Date().toISOString();
      if (mode === "owner") {
        patch.owner_approval_status = action === "approve" ? "approved" : "rejected";
        patch.owner_approved_at = now;
      } else {
        patch.admin_validation_status = action === "approve" ? "validated" : "rejected";
        patch.admin_validated_at = now;
        patch.admin_validated_by = user?.id ?? null;
      }
      const { error } = await supabase.from("vehicle_recalls").update(patch).eq("id", id);
      if (error) throw error;

      // If either side rejected, mark recall cancelled; if both approved, mark in_progress.
      const { data: fresh } = await supabase
        .from("vehicle_recalls")
        .select("owner_approval_status, admin_validation_status")
        .eq("id", id).single();
      if (fresh) {
        if (fresh.owner_approval_status === "rejected" || fresh.admin_validation_status === "rejected") {
          await supabase.from("vehicle_recalls").update({ status: "cancelled", resolved_at: now }).eq("id", id);
        } else if (fresh.owner_approval_status === "approved" && fresh.admin_validation_status === "validated") {
          await supabase.from("vehicle_recalls").update({ status: "in_progress", acknowledged_at: now, acknowledged_by: user?.id }).eq("id", id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Decision recorded.");
      qc.invalidateQueries({ queryKey: ["recalls-approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  const statusBadge = (r: any) => {
    if (r.owner_approval_status === "approved" && r.admin_validation_status === "validated") {
      return <Badge variant="default"><ShieldCheck className="mr-1 h-3 w-3" />Procedures Active</Badge>;
    }
    if (r.owner_approval_status === "rejected" || r.admin_validation_status === "rejected") {
      return <Badge variant="destructive">Rejected</Badge>;
    }
    return <Badge variant="secondary">Awaiting approvals</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle Recall Approvals</CardTitle>
        <CardDescription>
          {mode === "owner"
            ? "Approve or reject recall requests on your vehicles. Recall procedures start only after both owner approval and admin validation."
            : "Validate recall requests. Both owner approval and admin validation are required before recall procedures begin."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !recalls?.length ? (
          <p className="text-sm text-muted-foreground">No recall requests requiring your action.</p>
        ) : (
          recalls.map((r: any) => {
            const myField = mode === "owner" ? "owner_approval_status" : "admin_validation_status";
            const alreadyDecided = r[myField] === "approved" || r[myField] === "validated" || r[myField] === "rejected";
            return (
              <div key={r.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {r.vehicles ? `${r.vehicles.make} ${r.vehicles.model} · ${r.vehicles.license_plate}` : r.vehicle_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Driver: {r.profiles?.full_name ?? r.driver_id?.slice(0, 8) ?? "—"} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  {statusBadge(r)}
                </div>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>{r.recall_type}:</strong> {r.recall_reason}
                  </AlertDescription>
                </Alert>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>Owner approval: <Badge variant="outline">{r.owner_approval_status ?? "pending"}</Badge></div>
                  <div>Admin validation: <Badge variant="outline">{r.admin_validation_status ?? "pending"}</Badge></div>
                </div>

                {!alreadyDecided && (
                  <>
                    <div>
                      <Label htmlFor={`notes-${r.id}`} className="text-xs">Notes (optional)</Label>
                      <Textarea
                        id={`notes-${r.id}`}
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                        maxLength={1000}
                        rows={2}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" className="gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            {mode === "owner" ? "Approve" : "Validate"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm {mode === "owner" ? "approval" : "validation"}</AlertDialogTitle>
                            <AlertDialogDescription>
                              Once both owner approval and admin validation are recorded, recall procedures
                              (driver notification, IoT geofence expansion, vehicle capture) will begin
                              automatically. This action is logged.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => decide.mutate({ id: r.id, action: "approve" })}>
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="gap-1">
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reject recall?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Rejecting cancels the recall request. The driver and other party will be notified.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => decide.mutate({ id: r.id, action: "reject" })}>
                              Reject recall
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
