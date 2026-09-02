import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { History } from "lucide-react";

interface AuditRow {
  id: string;
  action: string;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  review_notes: string | null;
  actor_id: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  created: "Vehicle created",
  updated: "Details updated",
  published: "Published to catalogue",
  rejected: "Rejected",
  review_updated: "Review status changed",
  made_public: "Made visible",
  hidden: "Hidden from catalogue",
};

const FIELD_LABEL: Record<string, string> = {
  make: "Make",
  model: "Model",
  year: "Year",
  license_plate: "Plate",
  color: "Colour",
  vin: "VIN",
  status: "Status",
  is_public: "Public",
  pickup_city: "Pickup city",
  pickup_address: "Pickup address",
  pickup_instructions: "Pickup instructions",
  photo_urls: "Photos",
  review_status: "Review status",
  review_notes: "Review notes",
  daily_rate: "Daily rate",
  weekly_rate: "Weekly rate",
  category: "Category",
};

const badgeVariant = (action: string) =>
  action === "rejected" ? "destructive" : action === "published" ? "default" : "secondary";

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/** Read-only change history for a single vehicle (edits, publishes, rejections). */
export function VehicleHistoryDialog({
  vehicleId,
  label = "History",
  size = "sm",
}: {
  vehicleId: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-audit-log", vehicleId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_audit_log")
        .select("id, action, changed_fields, old_values, new_values, review_notes, actor_id, created_at")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="outline">
          <History className="w-4 h-4 mr-2" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vehicle change history</DialogTitle>
          <DialogDescription>
            Every edit, publish and rejection recorded for this vehicle, newest first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No changes recorded yet.
            </p>
          ) : (
            data.map((row) => {
              const fields = (row.changed_fields ?? []).filter((f) => f !== "*");
              return (
                <div key={row.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={badgeVariant(row.action)}>
                      {ACTION_LABEL[row.action] ?? row.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>

                  {fields.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {fields.map((field) => (
                        <li key={field} className="flex flex-wrap gap-1">
                          <span className="font-medium">{FIELD_LABEL[field] ?? field}:</span>
                          <span className="text-muted-foreground line-through">
                            {display(row.old_values?.[field])}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span>{display(row.new_values?.[field])}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {row.review_notes && row.action === "rejected" && (
                    <p className="text-xs text-muted-foreground">Reason: {row.review_notes}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default VehicleHistoryDialog;
