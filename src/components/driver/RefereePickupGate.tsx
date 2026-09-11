import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { toast } from 'sonner';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Lock, MapPin, ShieldCheck, Loader2, Users } from 'lucide-react';
import { useRegionSamples } from '@/hooks/useRegionSamples';

interface PickupDetails {
  has_rental: boolean;
  referees_submitted: boolean;
  vehicle_enabled?: boolean;
  disabled_reason?: string | null;
  match_id?: string | null;
  match_status?: string | null;
  rental_id?: string;
  vehicle?: { id?: string; make?: string; model?: string; year?: number; license_plate?: string } | null;
  pickup?: {
    location?: string | null;
    address?: string | null;
    city?: string | null;
    instructions?: string | null;
  } | null;
}

type RefereeForm = { name: string; phone: string; email: string };
const emptyReferee = (): RefereeForm => ({ name: '', phone: '', email: '' });

/**
 * Pickup-location gate for drivers.
 *
 * Referee details were removed from registration; instead, an approved driver
 * with an active rental submits three referees here before the vehicle pickup
 * location is revealed (enforced server-side by `get_my_pickup_details`).
 */
export function RefereePickupGate() {
  const { user } = useAuth();
  const samples = useRegionSamples();
  const queryClient = useQueryClient();
  const [referees, setReferees] = useState<RefereeForm[]>([
    emptyReferee(),
    emptyReferee(),
    emptyReferee(),
  ]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my-pickup-details', user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async (): Promise<PickupDetails> => {
      const { data, error } = await supabase.rpc('get_my_pickup_details' as never);
      if (error) throw error;
      return data as unknown as PickupDetails;
    },
  });

  if (isLoading || !data?.has_rental) return null;

  const vehicleLabel = data.vehicle
    ? `${data.vehicle.year ?? ''} ${data.vehicle.make ?? ''} ${data.vehicle.model ?? ''}`
        .replace(/\s+/g, ' ')
        .trim() || 'your vehicle'
    : 'your vehicle';

  const update = (idx: number, key: keyof RefereeForm) => (value: string) => {
    setReferees((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    referees.forEach((r, idx) => {
      if (r.name.trim().length < 2) errs[`${idx}-name`] = 'Full name is required';
      const parsed = r.phone.trim() ? parsePhoneNumberFromString(r.phone.trim()) : undefined;
      if (r.phone.trim() && !parsed?.isValid())
        errs[`${idx}-phone`] = 'Enter a valid number with country code';
      if (r.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim()))
        errs[`${idx}-email`] = 'Enter a valid email';
      if (!parsed?.isValid() && !r.email.trim())
        errs[`${idx}-phone`] = 'Provide a phone number or an email address';
    });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const payload = referees.map((r) => {
        const parsed = parsePhoneNumberFromString(r.phone.trim());
        return {
          name: r.name.trim(),
          phone: parsed?.isValid() ? parsed.format('E.164') : null,
          email: r.email.trim() || null,
        };
      });
      const { data: applicationId, error } = await supabase.rpc('submit_driver_referees' as never, {
        _referees: payload,
      } as never);
      if (error) throw error;

      // Best-effort fanout: invite + verify referees. Failures don't block the unlock.
      await Promise.allSettled([
        supabase.functions.invoke('notify-referees', { body: { application_id: applicationId } }),
        supabase.functions.invoke('verify-referees', { body: { application_id: applicationId } }),
      ]);

      toast.success('Referees submitted — Provisioned vehicle enabled', {
        description: 'Your vehicle has been enabled and pickup location unlocked. Your referees will be contacted to attest for you.',
      });
      await queryClient.invalidateQueries({ queryKey: ['my-pickup-details'] });
    } catch (err) {
      toast.error('Could not submit referees', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!data.referees_submitted) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Lock className="h-5 w-5 text-amber-500" />
              Provisioned Vehicle Disabled · Referee Submission Required
            </CardTitle>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Vehicle Disabled
            </span>
          </div>
          <CardDescription className="text-sm">
            <strong className="text-foreground">Condition for vehicle pickup:</strong> As required by fleet provisioning policy, matched provisioned vehicles are automatically disabled immediately upon signing the owner-driver agreement. Submitting your 3 referee contact details below will immediately <strong>enable the provisioned vehicle</strong> and unlock the handover pickup details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3.5 rounded-lg border border-amber-500/30 bg-background text-xs space-y-1 text-muted-foreground">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              Referee Verification &amp; Service Disruption Policy
            </p>
            <p>
              Referee contact details are verified prior to final handover. Any adverse or negative report submitted by a referee is a basis for vehicle service disruption (remote ignition restriction when parked) and immediate vehicle call-in and recall.
            </p>
          </div>
          {referees.map((r, idx) => (
            <div key={idx} className="p-4 rounded-lg border border-border space-y-3">
              <h4 className="font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" /> Referee {idx + 1}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`gate-referee${idx}-name`}>Full Name</Label>
                  <Input
                    id={`gate-referee${idx}-name`}
                    placeholder={samples.name}
                    value={r.name}
                    onChange={(e) => update(idx, 'name')(e.target.value)}
                  />
                  {fieldErrors[`${idx}-name`] && (
                    <p className="text-destructive text-sm">{fieldErrors[`${idx}-name`]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`gate-referee${idx}-phone`}>Phone Number</Label>
                  <PhoneNumberInput
                    id={`gate-referee${idx}-phone`}
                    value={r.phone}
                    onChange={update(idx, 'phone')}
                    aria-invalid={!!fieldErrors[`${idx}-phone`]}
                  />
                  {fieldErrors[`${idx}-phone`] && (
                    <p className="text-destructive text-sm">{fieldErrors[`${idx}-phone`]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`gate-referee${idx}-email`}>
                    Email <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id={`gate-referee${idx}-email`}
                    type="email"
                    placeholder={samples.email}
                    value={r.email}
                    onChange={(e) => update(idx, 'email')(e.target.value)}
                  />
                  {fieldErrors[`${idx}-email`] && (
                    <p className="text-destructive text-sm">{fieldErrors[`${idx}-email`]}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          <Button onClick={submit} disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Submit referees &amp; enable provisioned vehicle
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pickup = data.pickup;
  const hasAny =
    !!(pickup?.city || pickup?.address || pickup?.location || pickup?.instructions);
  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-600" />
            Vehicle Pickup Location &amp; Status
          </CardTitle>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            Vehicle Enabled
          </span>
        </div>
        <CardDescription>
          Referee contacts on file. {vehicleLabel} is <strong>enabled for pickup</strong>. Coordinate handover with the team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-background flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Provisioned vehicle engine starter is enabled. Adherence to platform guidelines and positive referee standing are required throughout your rental.</span>
        </div>
        {pickup?.city && (
          <p>
            <span className="text-muted-foreground">City: </span>
            <span className="font-medium text-foreground">{pickup.city}</span>
          </p>
        )}
        {pickup?.address && (
          <p>
            <span className="text-muted-foreground">Address: </span>
            <span className="font-medium text-foreground">{pickup.address}</span>
          </p>
        )}
        {pickup?.location && (
          <p>
            <span className="text-muted-foreground">Pickup point: </span>
            <span className="font-medium text-foreground">{pickup.location}</span>
          </p>
        )}
        {pickup?.instructions && (
          <p>
            <span className="text-muted-foreground">Instructions: </span>
            <span className="font-medium text-foreground">{pickup.instructions}</span>
          </p>
        )}
        {!hasAny && (
          <p className="text-muted-foreground">
            The owner has not shared exact pickup coordinates yet — our team will contact you with
            handover arrangements.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default RefereePickupGate;
