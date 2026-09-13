import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, ShieldAlert, ExternalLink, Settings2, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePersonaEnabled, PERSONA_SETTING_KEY } from '@/hooks/usePersonaEnabled';

interface PersonaVerificationSettingsProps {
  compact?: boolean;
}

/**
 * Admin switch that turns Persona identity verification — and every gate that
 * depends on it — on or off platform-wide.
 */
export function PersonaVerificationSettings({ compact = false }: PersonaVerificationSettingsProps) {
  const { enabled, isLoading, refetch } = usePersonaEnabled();
  const [saving, setSaving] = useState(false);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert({ key: PERSONA_SETTING_KEY, value: { enabled: next } }, { onConflict: 'key' });
      if (error) throw error;
      await refetch();
      toast.success(
        next
          ? 'Identity verification enabled — gates are active again'
          : 'Identity verification disabled — dependent gates are now bypassed',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Persona Verification</span>
              <Badge variant={enabled ? 'default' : 'secondary'} className="text-xs">
                {enabled ? 'Enforced' : 'Disabled (Bypassed)'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {enabled
                ? 'Automated identity verification required before gates unlock'
                : 'Automated verification bypassed — gates treat identity as passed'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            id="persona-toggle-compact"
            checked={enabled}
            onCheckedChange={toggle}
            disabled={saving || isLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Identity Verification (Persona)
            </CardTitle>
            <CardDescription>
              Controls whether users must complete Persona identity verification before the
              marketplace, portals, and onboarding gates unlock.
            </CardDescription>
          </div>
          <Badge variant={enabled ? 'default' : 'secondary'} className="text-xs font-semibold px-3 py-1">
            {enabled ? 'Active / Enforced' : 'Disabled / Bypassed (Default)'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border p-4 bg-muted/20">
              <div className="space-y-1">
                <Label htmlFor="persona-toggle" className="font-medium cursor-pointer">
                  Require Persona Verification Platform-wide
                </Label>
                <p className="text-sm text-muted-foreground">
                  When toggled off, identity checks are skipped and all verification-dependent gates
                  are immediately treated as passed.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  id="persona-toggle"
                  checked={enabled}
                  onCheckedChange={toggle}
                  disabled={saving}
                />
              </div>
            </div>

            <Alert className={enabled ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20'}>
              {enabled ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              )}
              <AlertDescription className="text-xs">
                {enabled ? (
                  <span>
                    <strong>Persona is currently ENFORCED.</strong> Users must complete government ID verification to access rideshare driver/owner features.
                  </span>
                ) : (
                  <span>
                    <strong>Persona is currently DISABLED.</strong> Verification is not required, and all user accounts can progress without automated Persona verification.
                  </span>
                )}
              </AlertDescription>
            </Alert>

            {/* Quick Links for Persona Management */}
            <div className="pt-2 border-t flex flex-wrap gap-2 items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Persona Management Tools:</span>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/admin/persona-templates">
                    <Settings2 className="h-3.5 w-3.5" />
                    Templates & Roles
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/admin/persona-inquiries">
                    <FileText className="h-3.5 w-3.5" />
                    Inquiries Log
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/admin/persona-review">
                    <ExternalLink className="h-3.5 w-3.5" />
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

