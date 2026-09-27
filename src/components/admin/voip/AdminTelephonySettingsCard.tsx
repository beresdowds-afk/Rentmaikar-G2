import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TelephonyEngineSelector } from "./TelephonyEngineSelector";
import { useAdminTelephonyPreferences } from "@/hooks/useAdminTelephonyPreferences";
import { ShieldCheck, PhoneCall, RefreshCw, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export const AdminTelephonySettingsCard = () => {
  const { preferences, updatePreferences, setPreferredEngine, saving, reloadPreferences } =
    useAdminTelephonyPreferences();

  const [callerId, setCallerId] = useState(preferences.caller_id || "");
  const [autoRecord, setAutoRecord] = useState(preferences.auto_record ?? true);

  const handleSaveCallerId = async () => {
    await updatePreferences({
      caller_id: callerId.trim() || undefined,
      auto_record: autoRecord,
    });
  };

  const handleToggleAutoRecord = async (checked: boolean) => {
    setAutoRecord(checked);
    await updatePreferences({ auto_record: checked });
  };

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Admin Telephony Harmonisation & Calling Engine</CardTitle>
              <CardDescription className="text-xs">
                Per-admin calling method control harmonising WebRTC Softphone, Server REST, and TwiML App engines.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            All 3 Engines Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Engine selector */}
        <TelephonyEngineSelector
          currentEngine={preferences.preferred_engine}
          onChange={(eng) => setPreferredEngine(eng)}
          disabled={saving}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
          {/* Custom Caller ID override */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Admin Caller ID Override (Optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. +16085489220 or +2349163072576"
                value={callerId}
                onChange={(e) => setCallerId(e.target.value)}
                className="font-mono text-xs"
              />
              <Button size="sm" variant="outline" onClick={handleSaveCallerId} disabled={saving}>
                Save
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Leaves blank to use the region's authoritative DID (+1 608-548-9220 USA, +234 916 307 2576 Nigeria).
            </p>
          </div>

          {/* Automatic Call Recording Switch */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Call Recording & Compliance</Label>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="space-y-0.5">
                <span className="text-xs font-medium block">Automatic Call Recording</span>
                <span className="text-[11px] text-muted-foreground block">
                  Captures dual-channel MP3 and synchronizes to compliance archive.
                </span>
              </div>
              <Switch
                checked={autoRecord}
                onCheckedChange={handleToggleAutoRecord}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Preferences synchronized across sessions for your Admin profile.</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => reloadPreferences()} className="h-7 text-xs gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
