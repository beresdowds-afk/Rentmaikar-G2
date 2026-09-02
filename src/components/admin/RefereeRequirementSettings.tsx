import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useRefereeRequirement, REFEREE_REQUIREMENT_KEY } from '@/hooks/useRefereeRequirement';

/**
 * Admin switch that makes referees mandatory (or optional) during driver
 * registration. Driver's licence, phone OTP and email verification stay
 * mandatory either way.
 */
export function RefereeRequirementSettings() {
  const { required, isLoading, refetch } = useRefereeRequirement();
  const [saving, setSaving] = useState(false);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert({ key: REFEREE_REQUIREMENT_KEY, value: { enabled: next } }, { onConflict: 'key' });
      if (error) throw error;
      await refetch();
      toast.success(
        next
          ? 'Referees are now required to complete driver registration'
          : 'Referees are optional — drivers can register without them',
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
          <Users className="h-5 w-5" />
          Driver referee requirement
        </CardTitle>
        <CardDescription>
          Controls whether the three referees must be supplied before a driver application can
          be submitted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <Label htmlFor="referee-toggle" className="font-medium">
                  Require referees at registration
                </Label>
                <p className="text-sm text-muted-foreground">
                  When off, the referee section is hidden and drivers register freely. Referees
                  are still collected later, before a vehicle pickup location is released.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={required ? 'default' : 'secondary'}>
                  {required ? 'Required' : 'Optional'}
                </Badge>
                <Switch
                  id="referee-toggle"
                  checked={required}
                  disabled={saving}
                  onCheckedChange={toggle}
                />
              </div>
            </div>
            <Alert>
              <AlertDescription>
                Regardless of this setting, a valid government driver's licence, phone number
                verification and email verification remain mandatory for every driver.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RefereeRequirementSettings;
