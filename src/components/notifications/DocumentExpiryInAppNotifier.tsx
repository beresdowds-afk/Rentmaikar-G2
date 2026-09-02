import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * In-app notifier for upcoming document expiries.
 * Complements the existing email/SMS/WhatsApp/IVR expiry protocol
 * driven by `process-expiry-notifications`.
 *
 * Fires a toast once per session for each document expiring in
 * <= 30 days (or already expired). Duplicates are suppressed via
 * sessionStorage so the user is not spammed on every navigation.
 */
export default function DocumentExpiryInAppNotifier() {
  const { user } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!user || ranRef.current) return;
    ranRef.current = true;

    const loadNotifications = async () => {
      const today = new Date();
      const in30 = new Date();
      in30.setDate(today.getDate() + 30);

      const { data, error } = await supabase
        .from("user_documents")
        .select("id, document_type, expiry_date, status")
        .eq("user_id", user.id)
        .not("expiry_date", "is", null)
        .lte("expiry_date", in30.toISOString().slice(0, 10));

      if (error || !data?.length) return;

      const seenKey = `doc_expiry_seen_${user.id}`;
      const seen: string[] = JSON.parse(sessionStorage.getItem(seenKey) ?? "[]");
      const newSeen = [...seen];

      for (const d of data) {
        if (seen.includes(d.id)) continue;
        const exp = new Date(d.expiry_date as string);
        const days = Math.ceil(
          (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const label = d.document_type.replace(/_/g, " ");
        if (days < 0) {
          toast.error(`${label} expired ${Math.abs(days)} day(s) ago`, {
            description: "Please upload a renewed document to stay compliant.",
            duration: 8000,
          });
        } else {
          toast.warning(`${label} expires in ${days} day(s)`, {
            description: "Renew it soon to avoid service interruption.",
            duration: 7000,
          });
        }
        newSeen.push(d.id);
      }
      sessionStorage.setItem(seenKey, JSON.stringify(newSeen));
    };

    void loadNotifications();
  }, [user]);

  return null;
}
