import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { usePersonaEnabled, PERSONA_SETTING_KEY } from '@/hooks/usePersonaEnabled';

/**
 * Admin switch that turns Persona identity verification — and every gate that
 * depends on it — on or off platform-wide.
 */
export function PersonaVerificationSettings() {
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
          : 'Identity verification disabled — dependent gates are now open',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Identity verification (Persona)
        </CardTitle>
        <CardDescription>
          Controls whether users must complete Persona identity verification before the
          marketplace, portals and dashboards unlock.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <Label htmlFor="persona-toggle" className="font-medium">
                  Require Persona verification
                </Label>
                <p className="text-sm text-muted-foreground">
                  When off, identity checks are skipped and all verification-dependent gates
                  are treated as passed.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={enabled ? 'default' : 'secondary'}>
                  {enabled ? 'Enforced' : 'Bypassed'}
                </Badge>
                <Switch
                  id="persona-toggle"
                  checked={enabled}
                  disabled={saving}
                  onCheckedChange={toggle}
                />
              </div>
            </div>

            <Alert>
              <AlertDescription>
                Changes apply instantly to every signed-in session. Existing verification
                records are kept, so turning this back on restores enforcement without any
                data loss.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PersonaVerificationSettings;
