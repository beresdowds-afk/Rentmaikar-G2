import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BookingRequestStatus =
  | "pending"
  | "offer_sent"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "cancelled";

export interface BookingRequestRow {
  id: string;
  vehicle_id: string;
  driver_id: string;
  start_date: string;
  end_date: string;
  driver_message: string | null;
  status: BookingRequestStatus;
  offered_rate: number | null;
  offer_currency: string | null;
  offer_note: string | null;
  offer_expires_at: string | null;
  offer_sent_at: string | null;
  responded_at: string | null;
  review_note: string | null;
  region: string | null;
  created_at: string;
}

const SELECT =
  "id, vehicle_id, driver_id, start_date, end_date, driver_message, status, offered_rate, offer_currency, offer_note, offer_expires_at, offer_sent_at, responded_at, review_note, region, created_at";

/** Requests belonging to the signed-in driver. */
export const useMyBookingRequests = (enabled = true) =>
  useQuery({
    queryKey: ["my-booking-requests"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_booking_requests")
        .select(SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BookingRequestRow[];
    },
  });

/** Full admin queue (RLS restricts this to privileged staff). */
export const useAdminBookingRequests = (status: "all" | BookingRequestStatus = "all") =>
  useQuery({
    queryKey: ["admin-booking-requests", status],
    queryFn: async () => {
      let q = supabase
        .from("vehicle_booking_requests")
        .select(SELECT)
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BookingRequestRow[];
    },
  });

export interface SubmitBookingInput {
  vehicleId: string;
  startDate: string;
  endDate: string;
  message?: string;
  region?: string;
}

export const useSubmitBookingRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitBookingInput) => {
      const { data, error } = await supabase.rpc("submit_booking_request", {
        _vehicle_id: input.vehicleId,
        _start_date: input.startDate,
        _end_date: input.endDate,
        _message: input.message ?? null,
        _region: input.region ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-booking-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-booking-requests"] });
    },
  });
};

export const useSendBookingOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      rate: number;
      currency: string;
      note?: string;
      expiresAt?: string | null;
    }) => {
      const { error } = await supabase.rpc("admin_send_booking_offer", {
        _request_id: input.requestId,
        _offered_rate: input.rate,
        _currency: input.currency,
        _note: input.note ?? null,
        _expires_at: input.expiresAt ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-booking-requests"] }),
  });
};

export const useReviewBookingRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; status: "declined" | "cancelled" | "accepted"; note?: string }) => {
      const { error } = await supabase.rpc("admin_review_booking_request", {
        _request_id: input.requestId,
        _status: input.status,
        _note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-booking-requests"] }),
  });
};

export const useRespondToBookingOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; accept: boolean }) => {
      const { error } = await supabase.rpc("driver_respond_to_booking_offer", {
        _request_id: input.requestId,
        _accept: input.accept,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-booking-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-booking-requests"] });
    },
  });
};

export const useWithdrawBookingRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("driver_withdraw_booking_request", { _request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-booking-requests"] }),
  });
};
