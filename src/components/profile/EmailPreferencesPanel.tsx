import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MailCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EmailPrefs {
  booking_confirmations: boolean;
  booking_reminders: boolean;
  marketing: boolean;
}

const DEFAULTS: EmailPrefs = {
  booking_confirmations: true,
  booking_reminders: true,
  marketing: false,
};

const ITEMS: Array<{ key: keyof EmailPrefs; title: string; description: string }> = [
  {
    key: "booking_confirmations",
    title: "Booking confirmations",
    description: "Email me when a booking request for me is accepted.",
  },
  {
    key: "booking_reminders",
    title: "Booking reminders",
    description: "Email me a reminder 24 hours before an accepted booking starts.",
  },
  {
    key: "marketing",
    title: "Product updates & offers",
    description: "Occasional news about Rentmaikar features and promotions. Off by default.",
  },
];

export function EmailPreferencesPanel() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<EmailPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof EmailPrefs | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("email_notification_preferences" as never)
      .select("booking_confirmations, booking_reminders, marketing")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const row = data as unknown as EmailPrefs;
      setPrefs({
        booking_confirmations: row.booking_confirmations ?? true,
        booking_reminders: row.booking_reminders ?? true,
        marketing: row.marketing ?? false,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (key: keyof EmailPrefs, value: boolean) => {
    if (!user) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingKey(key);
    const { error } = await supabase
      .from("email_notification_preferences" as never)
      .upsert(
        {
          user_id: user.id,
          ...next,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id" },
      );
    setSavingKey(null);
    if (error) {
      setPrefs(prefs);
      toast.error(`Could not save preference: ${error.message}`);
    } else {
      toast.success("Email preference saved");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5" /> Email Notifications
        </CardTitle>
        <CardDescription>
          Choose which emails Rentmaikar sends you. Account security emails (password resets,
          sign-in links) are always sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
          </div>
        ) : (
          ITEMS.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={`email-pref-${item.key}`} className="text-sm font-medium">
                  {item.title}
                </Label>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {savingKey === item.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Switch
                  id={`email-pref-${item.key}`}
                  checked={prefs[item.key]}
                  onCheckedChange={(v) => update(item.key, v)}
                  disabled={!user || savingKey !== null}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
