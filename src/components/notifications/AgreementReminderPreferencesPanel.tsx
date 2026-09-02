import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock } from "lucide-react";
import {
  REMINDER_DAY_OPTIONS,
  useAgreementReminderPreferences,
  type AgreementReminderPreferences,
} from "@/hooks/useAgreementReminderPreferences";

/** Opt-in and cadence controls for monthly agreement renewal reminders. */
export function AgreementReminderPreferencesPanel() {
  const { preferences, isLoading, save, isSaving } = useAgreementReminderPreferences();
  const [draft, setDraft] = useState<AgreementReminderPreferences>(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const toggleDay = (day: number, checked: boolean) => {
    setDraft((d) => ({
      ...d,
      reminder_days: checked
        ? [...new Set([...d.reminder_days, day])].sort((a, b) => b - a)
        : d.reminder_days.filter((x) => x !== day),
    }));
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences);
  const noChannel = draft.opted_in && !draft.email_enabled && !draft.sms_enabled;
  const noDays = draft.opted_in && draft.reminder_days.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          Agreement renewal reminders
        </CardTitle>
        <CardDescription>
          Choose whether to be reminded before your monthly rental agreement expires, on which
          channels, and how far ahead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="renewal-opt-in" className="text-base">
                  Send me renewal reminders
                </Label>
                <p className="text-sm text-muted-foreground">
                  Turn this off to stop all renewal reminders. Signature requests and legally
                  required notices are still delivered.
                </p>
              </div>
              <Switch
                id="renewal-opt-in"
                checked={draft.opted_in}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, opted_in: v }))}
              />
            </div>

            <fieldset disabled={!draft.opted_in} className="space-y-4 disabled:opacity-50">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Channels</Label>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="renewal-email" className="font-normal">
                    Email reminders
                  </Label>
                  <Switch
                    id="renewal-email"
                    checked={draft.email_enabled}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, email_enabled: v }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="renewal-sms" className="font-normal">
                    SMS reminders
                  </Label>
                  <Switch
                    id="renewal-sms"
                    checked={draft.sms_enabled}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, sms_enabled: v }))}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Reminder frequency</Label>
                <p className="text-sm text-muted-foreground">
                  Pick how many days before expiry we should remind you.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {REMINDER_DAY_OPTIONS.map((day) => (
                    <label
                      key={day}
                      htmlFor={`renewal-day-${day}`}
                      className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer"
                    >
                      <Checkbox
                        id={`renewal-day-${day}`}
                        checked={draft.reminder_days.includes(day)}
                        onCheckedChange={(v) => toggleDay(day, v === true)}
                      />
                      <span className="text-sm">
                        {day} day{day === 1 ? "" : "s"} before
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>

            {noChannel && (
              <p className="text-sm text-destructive" role="alert">
                Select at least one channel, or turn reminders off entirely.
              </p>
            )}
            {noDays && (
              <p className="text-sm text-destructive" role="alert">
                Select at least one reminder day, or turn reminders off entirely.
              </p>
            )}

            <Button
              onClick={() => save(draft)}
              disabled={!dirty || isSaving || noChannel || noDays}
            >
              {isSaving ? "Saving…" : "Save reminder settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
