import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const REMINDER_DAY_OPTIONS = [14, 7, 3, 1] as const;
export type ReminderDay = (typeof REMINDER_DAY_OPTIONS)[number];

export type AgreementReminderPreferences = {
  opted_in: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  reminder_days: number[];
};

export const DEFAULT_AGREEMENT_REMINDER_PREFS: AgreementReminderPreferences = {
  opted_in: true,
  email_enabled: true,
  sms_enabled: true,
  reminder_days: [14, 7, 3, 1],
};

/**
 * Per-user opt-in and cadence for monthly agreement renewal reminders.
 * Email always stays available as the mandatory channel when opted in; SMS is
 * the optional secondary channel.
 */
export function useAgreementReminderPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["agreement-reminder-prefs", user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async (): Promise<AgreementReminderPreferences> => {
      const { data, error } = await supabase
        .from("agreement_reminder_preferences")
        .select("opted_in, email_enabled, sms_enabled, reminder_days")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            opted_in: data.opted_in,
            email_enabled: data.email_enabled,
            sms_enabled: data.sms_enabled,
            reminder_days: (data.reminder_days ?? []) as number[],
          }
        : DEFAULT_AGREEMENT_REMINDER_PREFS;
    },
  });

  const save = useMutation({
    mutationFn: async (prefs: AgreementReminderPreferences) => {
      if (!user?.id) throw new Error("You must be signed in.");
      const { error } = await supabase
        .from("agreement_reminder_preferences")
        .upsert(
          {
            user_id: user.id,
            opted_in: prefs.opted_in,
            email_enabled: prefs.email_enabled,
            sms_enabled: prefs.sms_enabled,
            reminder_days: [...prefs.reminder_days].sort((a, b) => b - a),
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Renewal reminder settings saved");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not save your settings");
    },
  });

  return {
    preferences: query.data ?? DEFAULT_AGREEMENT_REMINDER_PREFS,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
  };
}
