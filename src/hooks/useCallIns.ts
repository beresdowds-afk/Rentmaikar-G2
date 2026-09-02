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

  return { activeCallIn, history, create, cancel, requestExtension };
}
