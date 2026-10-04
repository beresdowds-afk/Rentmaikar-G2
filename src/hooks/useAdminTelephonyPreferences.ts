import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AdminTelephonyPreferences, TelephonyEngine, CallRegion } from "@/types/voip";

const STORAGE_KEY_PREFIX = "rentmaikar_telephony_pref_";

export function useAdminTelephonyPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [preferences, setPreferences] = useState<AdminTelephonyPreferences>({
    admin_id: user?.id || "guest",
    preferred_engine: "SOFTPHONE",
    caller_id: "",
    auto_record: true,
    region: "Global",
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Load preferences from DB or fallback to localStorage
  const fetchPreferences = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Attempt to load from database first
      const { data, error } = await supabase
        .from("admin_telephony_preferences" as any)
        .select("*")
        .eq("admin_id", user.id)
        .maybeSingle();

      if (data && !error) {
        const loaded: AdminTelephonyPreferences = {
          id: (data as any).id,
          admin_id: (data as any).admin_id,
          preferred_engine: ((data as any).preferred_engine as TelephonyEngine) || "SOFTPHONE",
          caller_id: (data as any).caller_id || "",
          auto_record: (data as any).auto_record ?? true,
          webrtc_audio_input_device_id: (data as any).webrtc_audio_input_device_id,
          webrtc_audio_output_device_id: (data as any).webrtc_audio_output_device_id,
          region: ((data as any).region as CallRegion) || "Global",
          created_at: (data as any).created_at,
          updated_at: (data as any).updated_at,
        };
        setPreferences(loaded);
        try {
          localStorage.setItem(STORAGE_KEY_PREFIX + user.id, JSON.stringify(loaded));
        } catch {}
      } else {
        // Fall back to localStorage
        try {
          const cached = localStorage.getItem(STORAGE_KEY_PREFIX + user.id);
          if (cached) {
            setPreferences(JSON.parse(cached));
          }
        } catch {}
      }
    } catch (err: any) {
      console.warn("[Telephony Preferences] Failed to load preferences:", err.message);
      try {
        const cached = localStorage.getItem(STORAGE_KEY_PREFIX + user.id);
        if (cached) {
          setPreferences(JSON.parse(cached));
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Update preferences with optimistic update and persistence
  const updatePreferences = async (
    updates: Partial<Omit<AdminTelephonyPreferences, "admin_id" | "id">>
  ): Promise<boolean> => {
    if (!user?.id) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to update telephony preferences.",
        variant: "destructive",
      });
      return false;
    }

    const previous = { ...preferences };
    const merged: AdminTelephonyPreferences = {
      ...previous,
      ...updates,
      admin_id: user.id,
      updated_at: new Date().toISOString(),
    };

    // Optimistic UI update
    setPreferences(merged);
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + user.id, JSON.stringify(merged));
    } catch {}

    setSaving(true);
    try {
      const { error } = await supabase
        .from("admin_telephony_preferences" as any)
        .upsert(
          {
            admin_id: user.id,
            preferred_engine: merged.preferred_engine,
            caller_id: merged.caller_id || null,
            auto_record: merged.auto_record,
            webrtc_audio_input_device_id: merged.webrtc_audio_input_device_id || null,
            webrtc_audio_output_device_id: merged.webrtc_audio_output_device_id || null,
            region: merged.region,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "admin_id" }
        );

      if (error) {
        // In local or offline dev environments without the table, keep localStorage intact
        console.warn("[Telephony Preferences] Database upsert warning:", error.message);
      }

      toast({
        title: "Telephony Mode Updated",
        description: `Active calling engine set to ${merged.preferred_engine}.`,
      });
      return true;
    } catch (err: any) {
      console.warn("[Telephony Preferences] Error updating preferences:", err.message);
      return true; // Still allow local persistence
    } finally {
      setSaving(false);
    }
  };

  const setPreferredEngine = async (engine: TelephonyEngine) => {
    return updatePreferences({ preferred_engine: engine });
  };

  return {
    preferences,
    loading,
    saving,
    updatePreferences,
    setPreferredEngine,
    reloadPreferences: fetchPreferences,
  };
}
