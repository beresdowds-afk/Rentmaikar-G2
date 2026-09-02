import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

export type OwnerReviewStatus = "pending" | "published" | "rejected";

export interface TrackedVehicle {
  id: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  license_plate?: string | null;
  review_status?: OwnerReviewStatus | null;
  review_notes?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const config: Record<OwnerReviewStatus, { label: string; icon: typeof Clock; variant: "secondary" | "default" | "destructive" }> = {
  pending: { label: "Pending review", icon: Clock, variant: "secondary" },
  published: { label: "Published", icon: CheckCircle2, variant: "default" },
  rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
};

export const VehicleSubmissionBadge = ({ status }: { status?: string | null }) => {
  const key = (status as OwnerReviewStatus) in config ? (status as OwnerReviewStatus) : "pending";
  const { label, icon: Icon, variant } = config[key];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
};

import VehicleHistoryDialog from "@/components/vehicles/VehicleHistoryDialog";

const VehicleSubmissionTracker = ({ vehicles }: { vehicles: TrackedVehicle[] }) => {
  const grouped = useMemo(() => {
    const buckets: Record<OwnerReviewStatus, TrackedVehicle[]> = { pending: [], published: [], rejected: [] };
    vehicles.forEach((v) => {
      const key = (v.review_status as OwnerReviewStatus) in config ? (v.review_status as OwnerReviewStatus) : "pending";
      buckets[key].push(v);
    });
    return buckets;
  }, [vehicles]);

  if (vehicles.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Submission status</CardTitle>
        <CardDescription>Track where each vehicle you submitted stands in admin review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(config) as OwnerReviewStatus[]).map((key) => {
            const { label, icon: Icon } = config[key];
            return (
              <div key={key} className="rounded-lg border border-border p-3 text-center">
                <Icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{grouped[key].length}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          {vehicles.map((v) => {
            const key = (v.review_status as OwnerReviewStatus) in config ? (v.review_status as OwnerReviewStatus) : "pending";
            return (
              <div key={v.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {v.year ?? ""} {v.make} {v.model}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.license_plate || "No plate on record"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <VehicleSubmissionBadge status={key} />
                    <VehicleHistoryDialog vehicleId={v.id} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>Submitted: {formatDate(v.submitted_at ?? v.created_at)}</span>
                  <span>Reviewed: {formatDate(v.reviewed_at)}</span>
                  <span>Published: {formatDate(v.published_at)}</span>
                </div>
                {key === "rejected" && v.review_notes && (
                  <Alert variant="destructive">
                    <AlertTitle>Why it was rejected</AlertTitle>
                    <AlertDescription>{v.review_notes}</AlertDescription>
                  </Alert>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default VehicleSubmissionTracker;
