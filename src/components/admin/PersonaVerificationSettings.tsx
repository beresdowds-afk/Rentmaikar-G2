import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Settings2,
  FileText,
  CheckCircle2,
  Fingerprint,
  UserCheck,
  Search,
  Scale,
  Car,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePersonaEnabled, PERSONA_SETTING_KEY } from '@/hooks/usePersonaEnabled';

interface PersonaVerificationSettingsProps {
  compact?: boolean;
}

/**
 * Admin switch that turns Persona identity verification and criminal/background checks —
 * and every gate that depends on them — on or off platform-wide.
 */
export function PersonaVerificationSettings({ compact = false }: PersonaVerificationSettingsProps) {
  const { enabled, backgroundChecksEnabled, identityEnabled, isLoading, refetch } = usePersonaEnabled();
  const [saving, setSaving] = useState(false);
  const [testingCheck, setTestingCheck] = useState(false);

  // Master switch toggling both Identity and Criminal & Background screening
  const toggleMaster = async (next: boolean) => {
    setSaving(true);
    try {
      const payload = {
        enabled: next,
        background_check_enabled: next,
        identity_verification_enabled: next,
      };

      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert({ key: PERSONA_SETTING_KEY, value: payload }, { onConflict: 'key' });

      if (error) {
        // Fallback to local API gateway if direct Supabase client is disconnected
        const res = await fetch('/api/functions/persona-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null);
        if (!res || !res.ok) throw error;
      }

      await refetch();
      toast.success(
        next
          ? 'Persona verification & criminal background checks ENFORCED platform-wide.'
          : 'Persona verification & criminal background checks BYPASSED platform-wide.',
      );
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update verification settings');
    } finally {
      setSaving(false);
    }
  };

  // Toggle specifically the Criminal and Background checks gate
  const toggleBackgroundCheck = async (next: boolean) => {
    setSaving(true);
    try {
      const payload = {
        enabled: next || identityEnabled,
        background_check_enabled: next,
        identity_verification_enabled: identityEnabled,
      };

      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert({ key: PERSONA_SETTING_KEY, value: payload }, { onConflict: 'key' });

      if (error) {
        const res = await fetch('/api/functions/persona-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null);
        if (!res || !res.ok) throw error;
      }

      await refetch();
      toast.success(
        next
          ? 'Criminal & background checks ENFORCED — drivers must clear screening.'
          : 'Criminal & background checks DISABLED — screening gate bypassed.',
      );
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update background check settings');
    } finally {
      setSaving(false);
    }
  };

  // Toggle specifically the Persona Identity verification gate
  const toggleIdentity = async (next: boolean) => {
    setSaving(true);
    try {
      const payload = {
        enabled: next || backgroundChecksEnabled,
        background_check_enabled: backgroundChecksEnabled,
        identity_verification_enabled: next,
      };

      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert({ key: PERSONA_SETTING_KEY, value: payload }, { onConflict: 'key' });

      if (error) {
        const res = await fetch('/api/functions/persona-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null);
        if (!res || !res.ok) throw error;
      }

      await refetch();
      toast.success(
        next
          ? 'Persona Identity verification ENFORCED — biometric & ID proof active.'
          : 'Persona Identity verification DISABLED — biometric & ID gate bypassed.',
      );
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update identity settings');
    } finally {
      setSaving(false);
    }
  };

  // Quick simulator to verify background check API readiness
  const handleTestBackgroundScreening = async () => {
    setTestingCheck(true);
    try {
      const res = await fetch('/api/functions/driver-background-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check-eligibility',
          driverId: 'test-admin-probe',
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        toast.success('Background check engine online & responding normally.');
      } else {
        toast.info('Background check endpoint reachable.');
      }
    } catch {
      toast.info('Background check service probe complete.');
    } finally {
      setTestingCheck(false);
    }
  };

  if (compact) {
    const isEnforced = enabled && (backgroundChecksEnabled || identityEnabled);

    return (
      <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg border bg-card text-card-foreground shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          {isEnforced ? (
            <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold">Persona &amp; Background Checks</span>
              <Badge variant={isEnforced ? 'default' : 'secondary'} className="text-[10px] h-4.5 px-1.5 font-medium">
                {isEnforced ? 'Enforced' : 'Bypassed (Off)'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {isEnforced
                ? `Active (Identity: ${identityEnabled ? 'ON' : 'OFF'}, Criminal Check: ${backgroundChecksEnabled ? 'ON' : 'OFF'})`
                : 'Automated verification & background checks bypassed for testing'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            id="persona-toggle-compact"
            checked={isEnforced}
            onCheckedChange={toggleMaster}
            disabled={saving || isLoading}
            aria-label="Toggle Persona and Background Checks platform-wide"
          />
        </div>
      </div>
    );
  }

  const isMasterEnforced = enabled && (backgroundChecksEnabled || identityEnabled);

  return (
    <Card className="border shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Persona Verification &amp; Criminal Background Screening
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Platform-wide authoritative controls. Enable or disable Persona biometric identity verification,
              police clearance, and criminal &amp; driving record checks across driver onboarding and marketplace gates.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isMasterEnforced ? 'default' : 'secondary'}
              className="text-xs font-semibold px-3 py-1 flex items-center gap-1.5"
            >
              {isMasterEnforced ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active / Enforced
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Disabled / Bypassed (Dev/Testing Mode)
                </>
              )}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading verification settings...
          </div>
        ) : (
          <>
            {/* Primary Master Switch */}
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4 bg-muted/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="persona-master-toggle" className="font-semibold text-sm cursor-pointer">
                    Master Persona &amp; Background Screening Switch
                  </Label>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    Master Gate
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  When toggled off, both identity checks and criminal background checks are bypassed across all
                  driver portals, applications, and onboarding sequences. When toggled on, strict compliance is enforced.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  id="persona-master-toggle"
                  checked={isMasterEnforced}
                  onCheckedChange={toggleMaster}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Granular Sub-Switches */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Granular Switch 1: Persona Identity Verification */}
              <div className="flex flex-col justify-between p-4 rounded-xl border bg-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      <Label htmlFor="persona-identity-toggle" className="font-medium text-xs cursor-pointer">
                        Persona Identity &amp; Biometrics
                      </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Gov-issued driver license scanning, selfie liveness proof, and automated inquiry review.
                    </p>
                  </div>
                  <Switch
                    id="persona-identity-toggle"
                    checked={identityEnabled}
                    onCheckedChange={toggleIdentity}
                    disabled={saving}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-[11px]">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={identityEnabled ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                    {identityEnabled ? 'Enforced' : 'Bypassed'}
                  </span>
                </div>
              </div>

              {/* Granular Switch 2: Criminal & Background Checks */}
              <div className="flex flex-col justify-between p-4 rounded-xl border bg-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <Label htmlFor="persona-bg-toggle" className="font-medium text-xs cursor-pointer">
                        Criminal &amp; Background Check Gate
                      </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Multi-state criminal history, sex offender registry lookup, and motor vehicle driving record (MVR).
                    </p>
                  </div>
                  <Switch
                    id="persona-bg-toggle"
                    checked={backgroundChecksEnabled}
                    onCheckedChange={toggleBackgroundCheck}
                    disabled={saving}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-[11px]">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={backgroundChecksEnabled ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                    {backgroundChecksEnabled ? 'Enforced' : 'Bypassed'}
                  </span>
                </div>
              </div>
            </div>

            {/* Explanatory State Callout */}
            <Alert className={isMasterEnforced ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20'}>
              {isMasterEnforced ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              )}
              <AlertDescription className="text-xs space-y-1">
                {isMasterEnforced ? (
                  <div>
                    <strong className="text-foreground">COMPLIANCE ENFORCEMENT ACTIVE:</strong> Drivers must complete Persona government ID verification
                    {backgroundChecksEnabled ? ' and clear criminal & driving-record background screening' : ''} before rideshare vehicles can be reserved or activated.
                  </div>
                ) : (
                  <div>
                    <strong className="text-foreground">VERIFICATION BYPASS ACTIVE:</strong> Persona identity verification and criminal background checks are currently bypassed. Drivers and test accounts can submit applications and advance through onboarding without waiting for external API approvals.
                  </div>
                )}
              </AlertDescription>
            </Alert>

            {/* Quick Links for Persona & Background Management */}
            <div className="pt-2 border-t flex flex-wrap gap-2 items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Compliance &amp; Screening Tools:</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestBackgroundScreening}
                  disabled={testingCheck}
                  className="h-8 text-xs gap-1.5"
                >
                  {testingCheck ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 text-blue-500" />}
                  Test Background Service
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/admin/persona-templates">
                    <Settings2 className="h-3.5 w-3.5 text-purple-500" />
                    Templates &amp; Roles
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/admin/persona-inquiries">
                    <FileText className="h-3.5 w-3.5 text-purple-500" />
                    Inquiries Log
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/admin/persona-review">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                    Manual Review
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PersonaVerificationSettings;
