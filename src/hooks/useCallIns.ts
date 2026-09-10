import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type CallInType = "fault" | "maintenance" | "sick";

export interface CreateCallInInput {
  type: CallInType;
  reason: string;
  notes?: string;
  vehicle_id: string;
  rental_id?: string;
  geofence_lat: number;
  geofence_lng: number;
  telemetry_snapshot?: Record<string, unknown>;
}

export function useCallIns() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const activeCallIn = useQuery({
    queryKey: ["active-call-in", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("driver_call_ins")
        .select("*")
        .eq("driver_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const history = useQuery({
    queryKey: ["call-in-history", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("driver_call_ins")
        .select("*")
        .eq("driver_id", user.id)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (input: CreateCallInInput) => {
      const { data, error } = await supabase.functions.invoke("create-call-in", { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Call-in submitted. Payments paused; 20m geofence active.");
      qc.invalidateQueries({ queryKey: ["active-call-in"] });
      qc.invalidateQueries({ queryKey: ["call-in-history"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create call-in"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("driver_call_ins")
        .update({ status: "cancelled", end_reason: "Driver cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Call-in cancelled.");
      qc.invalidateQueries({ queryKey: ["active-call-in"] });
      qc.invalidateQueries({ queryKey: ["call-in-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestExtension = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("driver_call_ins")
        .update({ extend_requested: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Extension request flagged. Requires owner + admin approval.");
      qc.invalidateQueries({ queryKey: ["active-call-in"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renew = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      try {
        const { data, error } = await supabase.functions.invoke("renew-call-in", {
          body: { call_in_id: id, notes },
        });
        if (!error && data) {
          if ((data as any).error) throw new Error((data as any).error);
          return data;
        }
      } catch (err) {
        console.warn("renew-call-in edge function fallback to rpc:", err);
      }

      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("renew_driver_call_in", {
        p_call_in_id: id,
        p_notes: notes ?? null,
      });
      if (rpcError) throw rpcError;
      if (rpcData && (rpcData as any).error) throw new Error((rpcData as any).error);
      return rpcData;
    },
    onSuccess: (res: any) => {
      if (res?.max_reached || res?.recall_initiated) {
        toast.warning(
          res?.message || "Maximum 3 renewals reached. Vehicle call-in process initiated.",
          { duration: 7000 }
        );
      } else {
        toast.success(res?.message || "Call-in renewed for 24 hours.");
      }
      qc.invalidateQueries({ queryKey: ["active-call-in"] });
      qc.invalidateQueries({ queryKey: ["call-in-history"] });
      qc.invalidateQueries({ queryKey: ["admin-call-ins"] });
      qc.invalidateQueries({ queryKey: ["recalls-approvals"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to renew call-in"),
  });

  return { activeCallIn, history, create, cancel, requestExtension, renew };
}
