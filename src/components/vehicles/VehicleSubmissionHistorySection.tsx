import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { History, MessageCircleQuestion, CheckCircle2, Loader2 } from "lucide-react";

interface AuditRow {
  id: string;
  action: string;
  changed_fields: string[] | null;
  review_notes: string | null;
  created_at: string;
}

interface ReviewRow {
  id: string;
  review_status: string | null;
  review_notes: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  created: "Submitted for review",
  updated: "Details updated",
  published: "Published to catalogue",
  rejected: "Rejected",
  needs_info: "Clarification requested",
  review_updated: "Review status changed",
  made_public: "Made visible",
  hidden: "Hidden from catalogue",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending review",
  published: "Published",
  rejected: "Rejected",
  needs_info: "Awaiting clarification",
};

const statusVariant = (status?: string | null) =>
  status === "published" ? "default" : status === "rejected" ? "destructive" : "secondary";

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");

/**
 * Submission history for a vehicle, shown on the public detail page to the
 * vehicle owner and to reviewing staff. Staff can request clarification from
 * the owner before publishing.
 */
export function VehicleSubmissionHistorySection({ vehicleId }: { vehicleId: string }) {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const canReview = userRole === "admin" || userRole === "admin_assistant" || userRole === "vehicle_support";

  const { data: review, isLoading: reviewLoading } = useQuery({
    queryKey: ["vehicle-review-state", vehicleId],
    enabled: Boolean(user && vehicleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, review_status, review_notes, created_at, reviewed_at, published_at")
        .eq("id", vehicleId)
        .maybeSingle();
      if (error) throw error;
      return data as ReviewRow | null;
    },
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["vehicle-audit-log", vehicleId],
    enabled: Boolean(user && review),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_audit_log")
        .select("id, action, changed_fields, review_notes, created_at")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const requestClarification = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_review_vehicle", {
        _vehicle_id: vehicleId,
        _decision: "needs_info",
        _reason: message.trim(),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Clarification requested",
        description: "The owner has been asked for more information before publishing.",
      });
      setOpen(false);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["vehicle-review-state", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-audit-log", vehicleId] });
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not request clarification",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  // Hidden from signed-out visitors and from users with no access to the record.
  if (!user) return null;
  if (reviewLoading) return <Skeleton className="h-40 w-full" />;
  if (!review) return null;

  return (
    <Card className="mt-10">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="w-5 h-5" />
              Submission history
            </CardTitle>
            <CardDescription>
              Review timeline for this listing. Only visible to the owner and reviewing staff.
            </CardDescription>
          </div>
          <Badge variant={statusVariant(review.review_status)}>
            {STATUS_LABEL[review.review_status ?? "pending"] ?? review.review_status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground">Submitted</p>
            <p className="font-medium">{fmt(review.created_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last reviewed</p>
            <p className="font-medium">{fmt(review.reviewed_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Published</p>
            <p className="font-medium">{fmt(review.published_at)}</p>
          </div>
        </div>

        {review.review_notes && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium mb-1">Latest reviewer note</p>
            <p className="text-muted-foreground">{review.review_notes}</p>
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          {historyLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet.</p>
          ) : (
            history.map((row) => (
              <div key={row.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant={row.action === "rejected" ? "destructive" : "secondary"}>
                    {ACTION_LABEL[row.action] ?? row.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{fmt(row.created_at)}</span>
                </div>
                {(row.changed_fields ?? []).filter((f) => f !== "*").length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Changed: {(row.changed_fields ?? []).filter((f) => f !== "*").join(", ")}
                  </p>
                )}
                {row.review_notes && (
                  <p className="text-xs text-muted-foreground mt-1">Note: {row.review_notes}</p>
                )}
              </div>
            ))
          )}
        </div>

        {canReview && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(true)}>
              <MessageCircleQuestion className="w-4 h-4 mr-2" />
              Request clarification
            </Button>
            {review.review_status === "published" && (
              <span className="inline-flex items-center text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Live in the catalogue
              </span>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request clarification from the owner</DialogTitle>
            <DialogDescription>
              The listing stays hidden from the public catalogue until the owner responds and it is published.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Tell the owner exactly what is missing, e.g. clearer photos of the interior and a valid inspection date."
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => requestClarification.mutate()}
              disabled={message.trim().length < 10 || requestClarification.isPending}
            >
              {requestClarification.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default VehicleSubmissionHistorySection;
