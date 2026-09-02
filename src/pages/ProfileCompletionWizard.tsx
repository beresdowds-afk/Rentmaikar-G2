import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PhoneNumberField } from '@/components/ui/phone-number-field';
import { Loader2, CheckCircle2, Info } from 'lucide-react';
import { isStaffRole, homeForRole, type AppRole } from '@/lib/role-home';

type Step = 'contact' | 'emergency' | 'license' | 'vehicle' | 'payment' | 'done';

const STEP_ORDER: Step[] = ['contact', 'emergency', 'license', 'vehicle', 'payment', 'done'];

const STEP_META: Record<Exclude<Step, 'done'>, {
  title: string;
  description: string;
  mandatory: boolean;
}> = {
  contact:    { title: 'Contact & region',       description: 'We need a working phone number and your country to route support and payments.', mandatory: true },
  emergency:  { title: 'Emergency contact',       description: 'Someone we can reach in the event of an incident on your trip.', mandatory: true },
  license:    { title: "Driver's license",        description: 'Required if you plan to drive. You can skip and add this later.', mandatory: false },
  vehicle:    { title: 'Vehicle ownership',       description: 'Tell us if you own a vehicle you may list on the platform.', mandatory: false },
  payment:    { title: 'Payment method',          description: 'Link a payment method so you can rent or receive payouts. Skippable.', mandatory: false },
};

const ProfileCompletionWizard = () => {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '/';
  const { data: status, refetch, isLoading } = useProfileCompletion();

  const [step, setStep] = useState<Step>('contact');
  const [saving, setSaving] = useState(false);

  // form state
  const [phone, setPhone] = useState('');
  const [phoneValid, setPhoneValid] = useState(false);
  const [country, setCountry] = useState<'USA' | 'Nigeria' | (string & {}) | ''>('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecPhoneValid, setEcPhoneValid] = useState(false);
  const [licNumber, setLicNumber] = useState('');
  const [licExpiry, setLicExpiry] = useState('');
  const [ownsVehicle, setOwnsVehicle] = useState<'yes' | 'no' | ''>('');

  // Prefill from current profile
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles')
      .select('phone, preferred_country, emergency_contact_name, emergency_contact_phone, driver_license_number, driver_license_expiry, owns_vehicle')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.phone) setPhone(data.phone);
        if (data.preferred_country === 'USA' || data.preferred_country === 'Nigeria') {
          setCountry(data.preferred_country as 'USA' | 'Nigeria' | (string & {}));
        }
        setEcName(data.emergency_contact_name ?? '');
        setEcPhone(data.emergency_contact_phone ?? '');
        setLicNumber(data.driver_license_number ?? '');
        setLicExpiry(data.driver_license_expiry ?? '');
        if (data.owns_vehicle === true) setOwnsVehicle('yes');
        if (data.owns_vehicle === false) setOwnsVehicle('no');
      });
  }, [user]);

  const progress = useMemo(() => {
    const idx = STEP_ORDER.indexOf(step);
    return Math.round((idx / (STEP_ORDER.length - 1)) * 100);
  }, [step]);

  const persist = async (patch: Record<string, unknown>) => {
    if (!user) return false;
    setSaving(true);
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Could not save. Please try again.');
      return false;
    }
    await refetch();
    return true;
  };

  const goNext = (from: Step) => {
    const idx = STEP_ORDER.indexOf(from);
    setStep(STEP_ORDER[idx + 1]);
  };

  const finish = async (skipRemaining = false) => {
    if (skipRemaining) {
      await supabase.from('profiles')
        .update({ profile_completion_skipped_at: new Date().toISOString() })
        .eq('user_id', user!.id);
    }
    await refetch();
    navigate(returnTo, { replace: true });
  };

  // Staff accounts have no driver/owner profile requirements — bounce them
  // straight to their dashboard instead of trapping them in this wizard.
  useEffect(() => {
    if (isStaffRole(userRole as AppRole)) {
      navigate(homeForRole(userRole as AppRole, returnTo), { replace: true });
    }
  }, [userRole, navigate, returnTo]);

  // Auto-close if mandatory already complete and user landed here manually
  useEffect(() => {
    if (isLoading || !status) return;
    if (status.fully_complete) {
      navigate(returnTo, { replace: true });
    }
  }, [isLoading, status, navigate, returnTo]);

  const stepBody = () => {
    switch (step) {
      case 'contact':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pcw-country">Country</Label>
              <Select value={country} onValueChange={(v) => setCountry(v as 'USA' | 'Nigeria' | (string & {}))}>
                <SelectTrigger id="pcw-country"><SelectValue placeholder="Select your country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USA">United States</SelectItem>
                  <SelectItem value="Nigeria">Nigeria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PhoneNumberField
              label="Phone number"
              value={phone}
              onChange={(v) => setPhone(v ?? '')}
              onValidityChange={(ok) => setPhoneValid(ok)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={async () => {
                  if (!country || !phoneValid) {
                    toast.error('Country and a valid phone number are required.');
                    return;
                  }
                  if (await persist({ preferred_country: country, phone })) goNext('contact');
                }}
                disabled={saving}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Continue
              </Button>
            </div>
          </div>
        );
      case 'emergency':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pcw-ec-name">Full name</Label>
              <Input id="pcw-ec-name" value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <PhoneNumberField
              label="Phone number"
              value={ecPhone}
              onChange={(v) => setEcPhone(v ?? '')}
              onValidityChange={(ok) => setEcPhoneValid(ok)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={async () => {
                  if (!ecName.trim() || !ecPhoneValid) {
                    toast.error('Emergency contact name and a valid phone number are required.');
                    return;
                  }
                  if (await persist({ emergency_contact_name: ecName.trim(), emergency_contact_phone: ecPhone })) goNext('emergency');
                }}
                disabled={saving}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Continue
              </Button>
            </div>
          </div>
        );
      case 'license':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pcw-lic">License number</Label>
              <Input id="pcw-lic" value={licNumber} onChange={(e) => setLicNumber(e.target.value)} placeholder="e.g. D1234567" />
            </div>
            <div>
              <Label htmlFor="pcw-lic-exp">Expiry date</Label>
              <Input id="pcw-lic-exp" type="date" value={licExpiry} onChange={(e) => setLicExpiry(e.target.value)} />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => goNext('license')} disabled={saving}>Skip for now</Button>
              <Button
                onClick={async () => {
                  if (!licNumber.trim()) { toast.error('Enter a license number or skip.'); return; }
                  if (await persist({
                    driver_license_number: licNumber.trim(),
                    driver_license_expiry: licExpiry || null,
                  })) goNext('license');
                }}
                disabled={saving}
              >Save & continue</Button>
            </div>
          </div>
        );
      case 'vehicle':
        return (
          <div className="space-y-4">
            <RadioGroup value={ownsVehicle} onValueChange={(v) => setOwnsVehicle(v as 'yes' | 'no')}>
              <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="ov-yes" /><Label htmlFor="ov-yes">Yes, I own a vehicle I may list</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="ov-no" /><Label htmlFor="ov-no">No, I only want to rent</Label></div>
            </RadioGroup>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => goNext('vehicle')} disabled={saving}>Skip for now</Button>
              <Button
                onClick={async () => {
                  if (!ownsVehicle) { toast.error('Pick an option or skip.'); return; }
                  if (await persist({ owns_vehicle: ownsVehicle === 'yes' })) goNext('vehicle');
                }}
                disabled={saving}
              >Save & continue</Button>
            </div>
          </div>
        );
      case 'payment':
        return (
          <div className="space-y-4">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                You can add a payment method from your dashboard whenever you're ready. Marketplace rentals and payouts require this before they go live.
              </AlertDescription>
            </Alert>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => goNext('payment')} disabled={saving}>Skip for now</Button>
              <Button onClick={() => navigate('/settings/profile?tab=payment')}>Add payment method</Button>
            </div>
          </div>
        );
      case 'done':
        return (
          <div className="space-y-4 text-center py-6">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" />
            <p className="text-lg font-medium">Profile ready</p>
            <p className="text-sm text-muted-foreground">
              {status?.missing_optional?.length
                ? "You've completed everything required. You can add the remaining details anytime from Profile settings."
                : "You're all set."}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => finish(true)}>Go to my dashboard</Button>
            </div>
          </div>
        );
    }
  };

  const meta = step === 'done' ? null : STEP_META[step];

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Complete your profile</CardTitle>
            <CardDescription>
              A few quick details so you can safely rent, list, and get paid on RentMaikar.
            </CardDescription>
            <Progress value={progress} className="mt-3" />
          </CardHeader>
          <CardContent className="space-y-6">
            {meta && (
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{meta.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${meta.mandatory ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                    {meta.mandatory ? 'Required' : 'Optional'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>
              </div>
            )}
            {stepBody()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfileCompletionWizard;
