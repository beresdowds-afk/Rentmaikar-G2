import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Real-time listener that reacts to assistant/admin approval of the current
 * user's application (or Persona verification completion) and refreshes the
 * dashboard immediately without requiring a manual reload.
 *
 * Subscribes to:
 *  - public.applications  (row matching auth.uid()) — status transitions
 *  - public.profiles      (row matching auth.uid()) — verification/onboarding flags
 *  - public.user_roles    (rows for auth.uid())     — role grants after approval
 */
export function useApplicationApprovalNotifier() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lastStatus = useRef<string | null>(null);
  const lastVerified = useRef<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const invalidateDashboards = () => {
      // Broad refresh across driver/owner dashboards + gating hooks.
      [
        "driver-rental", "driver-payments",
        "owner-vehicles", "owner-earnings", "owner-payouts",
        "profile", "profiles",
        "user-roles", "role",
        "onboarding", "onboarding-state",
        "applications", "application",
        "entitlements", "subscriptions",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    };

    const channel = supabase
      .channel(`approval-notifier-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "applications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const status = payload?.new?.status as string | undefined;
          if (status && status !== lastStatus.current) {
            lastStatus.current = status;
            if (status === "approved") {
              toast.success("Your application was approved — dashboard unlocked.");
            } else if (status === "rejected") {
              toast.error("Your application was rejected. Please review the notes.");
            } else if (status === "needs_more_info") {
              toast.info("Reviewer requested more information on your application.");
            }
            invalidateDashboards();
          }
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const verified = payload?.new?.verified === true || payload?.new?.identity_verified === true;
          if (verified && lastVerified.current !== true) {
            lastVerified.current = true;
            toast.success("Identity verification complete — your dashboard is live.");
          }
          invalidateDashboards();
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const role = payload?.new?.role as string | undefined;
          if (role && ["driver", "owner"].includes(role)) {
            toast.success(`You now have ${role} access — welcome aboard!`);
          }
          invalidateDashboards();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
}
