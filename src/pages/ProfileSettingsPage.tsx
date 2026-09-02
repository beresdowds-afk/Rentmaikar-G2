import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { UserIdentityCard } from '@/components/profile/UserIdentityCard';
import { ReverificationBanner } from '@/components/profile/ReverificationBanner';
import { ProfileAuditHistory } from '@/components/profile/ProfileAuditHistory';
import { ApplicationAppealPanel } from '@/components/profile/ApplicationAppealPanel';
import { ConnectedAccounts } from '@/components/profile/ConnectedAccounts';
import { PersonaNotificationPreference } from '@/components/profile/PersonaNotificationPreference';
import { MessagingPreferencesPanel } from '@/components/profile/MessagingPreferencesPanel';
import { SmsConsentPanel } from '@/components/profile/SmsConsentPanel';
import { RoleSwitchCard } from '@/components/profile/RoleSwitchCard';

import PWASettingsPanel from '@/components/pwa/PWASettingsPanel';
import LiveSyncSettingsPanel from '@/components/pwa/LiveSyncSettingsPanel';
import ConflictResolutionDialog from '@/components/sync/ConflictResolutionDialog';
import { useConflictAwareSave } from '@/hooks/useConflictAwareSave';
import type { FieldChoice } from '@/lib/conflict-resolution';


import { trackOnboardingEvent } from '@/lib/onboarding-analytics';
import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { useRegion } from '@/contexts/RegionContext';
import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { normalizeToE164, PhoneValidationError } from '@/lib/phone-normalize';
import { friendlyPhoneError } from '@/lib/phone-errors';
import AddPhoneNumberCard from '@/components/auth/AddPhoneNumberCard';
import { regionToDefaultCountry } from '@/hooks/useDefaultPhoneCountry';


const nameSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(120, 'Name must be less than 120 characters'),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal(''))
    .refine((v) => {
      if (!v) return true;
      const withPlus = v.startsWith('+') ? v : `+${v.replace(/[^\d]/g, '')}`;
      return !!parsePhoneNumberFromString(withPlus)?.isValid();
    }, 'Enter a valid international phone number (e.g. +14155551234)'),
});

import { validateAddress, ADDRESS_MIN, ADDRESS_MAX } from '@/lib/address-validation';

const normalize = (v: string | null | undefined) => (v ?? '').trim();

// Address rules are shared with the registration screens (and the Capacitor
// iOS/Android shells) via `@/lib/address-validation`.
export { validateAddress, ADDRESS_MIN, ADDRESS_MAX };





export default function ProfileSettingsPage() {
  const { user, hasRole } = useAuth();
  const { country } = useRegion();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [initial, setInitial] = useState({ fullName: '', phone: '', streetAddress: '' });
  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameImmutableError, setNameImmutableError] = useState<string | null>(null);

  const nameLocked = identityStatus === 'approved';
  const isDriver = hasRole('driver');

  // Optimistic-concurrency token + merge base for simultaneous edits made on
  // the website and an installed app at the same time.
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const conflictSave = useConflictAwareSave<Record<string, unknown>>();

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone, street_address, identity_verification_status, identity_verified_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        const fn = data.full_name ?? '';
        const ph = data.phone ?? '';
        const addr = (data as any).street_address ?? '';
        setFullName(fn);
        setPhone(ph);
        setStreetAddress(addr);
        setInitial({ fullName: fn, phone: ph, streetAddress: addr });
        setBaseUpdatedAt((data as any).updated_at ?? null);
        const status = (data as any).identity_verification_status
          ?? ((data as any).identity_verified_at ? 'approved' : null);
        setIdentityStatus(status);
      }
      setLoading(false);
    })();
  }, [user?.id]);


  const nameChanged = normalize(fullName) !== normalize(initial.fullName);
  const phoneChanged = normalize(phone) !== normalize(initial.phone);
  const addressChanged = normalize(streetAddress) !== normalize(initial.streetAddress);
  const addressLength = streetAddress.trim().length;
  const addressError = validateAddress(streetAddress, isDriver);
  const showAddressError = (addressTouched || addressChanged) && !!addressError;

  /** Shared success path for a normal save and a conflict-resolved save. */
  const finalizeSave = (
    row: Record<string, unknown> | null,
    ctx: {
      fullName: string;
      phone: string | null;
      streetAddress: string;
      phoneChanged: boolean;
      nameChanged: boolean;
      addressChanged: boolean;
      autoMerged: string[];
    },
  ) => {
    setNameImmutableError(null);

    // The saved row is the source of truth — a merge may have kept the other
    // device's value for some fields.
    const savedName = (row?.full_name as string | null) ?? ctx.fullName;
    const savedPhone = (row?.phone as string | null) ?? ctx.phone;
    const savedAddress = (row?.street_address as string | null) ?? ctx.streetAddress;
    setFullName(savedName ?? '');
    setPhone(savedPhone ?? '');
    setStreetAddress(savedAddress ?? '');
    setInitial({
      fullName: savedName ?? '',
      phone: savedPhone ?? '',
      streetAddress: savedAddress ?? '',
    });
    setBaseUpdatedAt((row?.updated_at as string | null) ?? null);
    setAddressTouched(false);

    const fields: string[] = [];
    if (ctx.nameChanged) fields.push('full_name');
    if (ctx.phoneChanged) fields.push('phone');
    if (ctx.addressChanged) fields.push('street_address');
    trackOnboardingEvent('profile_updated', { fields });

    if (ctx.phoneChanged) {
      setIdentityStatus('pending_reverification');
      trackOnboardingEvent('profile_reverification_triggered', {
        fields: ['phone'],
        extra: { channel: 'both' },
      });
      supabase.functions
        .invoke('persona-send-reverification', {
          body: { user_id: user!.id, channel: 'both', reason: 'Phone number changed.' },
        })
        .catch(() => {});
      toast({
        title: 'Profile updated',
        description: 'Your phone changed — please re-verify your identity.',
      });
    } else if (ctx.autoMerged.length > 0) {
      toast({
        title: 'Profile updated',
        description: 'Recent changes from your other device were kept as well.',
      });
    } else {
      toast({ title: 'Profile updated' });
    }
  };

  /** User picked which version to keep for each conflicting field. */
  const resolveConflicts = async (choices: Record<string, FieldChoice>) => {
    const outcome = await conflictSave.resolve(choices);
    if (!outcome) return;
    if (outcome.status === 'error') {
      const duplicate = friendlyPhoneError(outcome.error);
      toast({
        title: duplicate ? 'Phone number unavailable' : 'Save failed',
        description: duplicate ?? outcome.error?.message ?? 'Please try again.',
        variant: 'destructive',
      });
      return;
    }
    if (outcome.status === 'saved') {
      finalizeSave(outcome.row, {
        fullName,
        phone: phone || null,
        streetAddress,
        phoneChanged,
        nameChanged,
        addressChanged,
        autoMerged: outcome.autoMerged,
      });
    }
  };


  const save = async () => {
    if (!user?.id) return;

    if (nameLocked && nameChanged) {
      toast({
        title: 'Name is locked',
        description: 'Your name cannot be changed after identity verification. Contact support to make changes.',
        variant: 'destructive',
      });
      return;
    }

    const parsed = nameSchema.safeParse({ full_name: fullName, phone });
    if (!parsed.success) {
      toast({
        title: 'Please check your details',
        description: parsed.error.issues[0]?.message,
        variant: 'destructive',
      });
      return;
    }

    // Drivers must keep a valid home address; owners may leave it blank.
    const addressIssue = validateAddress(streetAddress, isDriver);
    if (addressIssue) {
      setAddressTouched(true);
      toast({ title: 'Home address', description: addressIssue, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Normalize to E.164 and enforce the number matches the user's
      // selected region so we never persist a mismatched flag/IDD combo.
      let newPhone: string | null = null;
      if (parsed.data.phone) {
        try {
          // No hardcoded region: fall back to the number's own country code.
          const expected = regionToDefaultCountry(country);
          newPhone = normalizeToE164(parsed.data.phone, expected).e164;
        } catch (err) {
          const message = err instanceof PhoneValidationError ? err.message : 'Invalid phone number.';
          toast({ title: 'Phone number', description: message, variant: 'destructive' });
          setSaving(false);
          return;
        }
      }
      const updates: Record<string, any> = {
        full_name: parsed.data.full_name,
        phone: newPhone,
        street_address: streetAddress.trim() || null,
      };



      if (phoneChanged) {
        updates.phone_verified = false;
        updates.identity_verified_at = null;
        updates.identity_verification_status = 'pending_reverification';
      }

      // Guarded write: refuses to overwrite a newer version saved from the
      // installed app / another tab, and auto-merges non-overlapping edits.
      const outcome = await conflictSave.save({
        table: 'profiles',
        match: { column: 'user_id', value: user.id },
        updates,
        base: {
          full_name: initial.fullName,
          phone: initial.phone || null,
          street_address: initial.streetAddress || null,
        },
        baseUpdatedAt,
        compareFields: ['full_name', 'phone', 'street_address'],
      });

      if (outcome.status === 'conflict') {
        // The dialog takes over; nothing was written.
        return;
      }
      if (outcome.status === 'error') throw outcome.error;

      finalizeSave(outcome.row, {
        fullName: parsed.data.full_name,
        phone: newPhone,
        streetAddress: streetAddress.trim(),
        phoneChanged,
        nameChanged,
        addressChanged,
        autoMerged: outcome.autoMerged,
      });


    } catch (err: any) {
      const msg = String(err?.message ?? '');
      // A duplicate phone/email is a user-fixable conflict, not a crash.
      const duplicate = friendlyPhoneError(err);
      // The address trigger also raises 23514 — keep the two apart so users
      // don't get a misleading "name is locked" message.
      const isAddress = !duplicate && /home address/i.test(msg);
      const isImmutable =
        !duplicate &&
        !isAddress &&
        (err?.code === '23514' ||
          /locked after identity verification|full_name is immutable/i.test(msg));
      if (isImmutable) {
        setNameImmutableError(
          'Your name is locked after identity verification. Contact support to make changes.',
        );
        setFullName(initial.fullName);
      }
      if (isAddress) setAddressTouched(true);
      toast({
        title: duplicate
          ? 'Phone number unavailable'
          : isImmutable
            ? 'Name is locked'
            : isAddress
              ? 'Home address'
              : 'Save failed',
        description: duplicate
          ? duplicate
          : isImmutable
            ? 'Contact support to change your legal name.'
            : msg,
        variant: 'destructive',
      });


    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto max-w-3xl px-4">
          <h1 className="text-2xl md:text-3xl font-display font-bold mb-6">
            Profile Settings
          </h1>

          <ReverificationBanner
            status={identityStatus as any}
            pendingLocalChange={phoneChanged}
          />

          <UserIdentityCard hideSettingsLink />

          <Card>
            <CardHeader>
              <CardTitle>Your details</CardTitle>
              <CardDescription>
                Update your name and contact information. Your passport picture
                can be managed above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {nameImmutableError && (
                <Alert
                  variant="destructive"
                  role="alert"
                  data-testid="name-immutable-banner"
                >
                  <ShieldAlert className="h-4 w-4" />
                  <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span>{nameImmutableError}</span>
                    <button
                      type="button"
                      onClick={() => setNameImmutableError(null)}
                      className="text-xs underline self-start sm:self-auto"
                    >
                      Dismiss
                    </button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="full_name" className="flex items-center gap-2">
                  Full name
                  {nameLocked && (
                    <Badge variant="secondary" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" /> Locked
                    </Badge>
                  )}
                </Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading || saving || nameLocked}
                  readOnly={nameLocked}
                  maxLength={120}
                  autoComplete="name"
                />
                {nameLocked && (
                  <p className="text-xs text-muted-foreground">
                    Your name is locked after identity verification. Contact support to change it.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  To change your email, use the Personal Information editor on your dashboard — email changes trigger re-verification.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <PhoneNumberInput
                  id="phone"
                  value={phone}
                  onChange={setPhone}
                  defaultCountry={regionToDefaultCountry(country)}
                  disabled={loading || saving}
                  autoComplete="tel"
                  placeholder="Enter phone number"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="street_address">
                    Home address{' '}
                    {isDriver ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">(optional)</span>
                    )}
                  </Label>
                  <span
                    className={`text-xs tabular-nums ${
                      showAddressError ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                    aria-live="polite"
                  >
                    {addressLength}/{ADDRESS_MAX}
                  </span>
                </div>
                <Input
                  id="street_address"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  onBlur={() => setAddressTouched(true)}
                  disabled={loading || saving}
                  maxLength={ADDRESS_MAX + 50}
                  autoComplete="street-address"
                  aria-invalid={showAddressError}
                  aria-describedby="street_address-hint"
                  placeholder="e.g. 24 Ademola Street, Ikeja"
                />
                <p
                  id="street_address-hint"
                  aria-live="polite"
                  className={`text-sm ${
                    showAddressError
                      ? 'text-destructive'
                      : addressLength >= ADDRESS_MIN
                      ? 'text-emerald-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  {showAddressError
                    ? addressError
                    : addressLength >= ADDRESS_MIN
                    ? 'Looks good — used for verification and vehicle handover.'
                    : isDriver
                    ? `Required for drivers — at least ${ADDRESS_MIN} characters.`
                    : 'Optional for owners — add it to speed up handover.'}
                </p>
              </div>



              {phoneChanged && (
                <Alert className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
                  <ShieldAlert className="h-4 w-4 text-yellow-700" />
                  <AlertDescription className="text-yellow-900 dark:text-yellow-200">
                    Changing your phone will require you to re-verify your identity.
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-2">
                <Button
                  onClick={save}
                  disabled={
                    loading ||
                    saving ||
                    !!addressError ||
                    (!nameChanged && !phoneChanged && !addressChanged)
                  }
                >

                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <AddPhoneNumberCard />

          <RoleSwitchCard />

          <MessagingPreferencesPanel />

          <SmsConsentPanel />

          <PersonaNotificationPreference />


          <ApplicationAppealPanel />



          <PWASettingsPanel />

          <LiveSyncSettingsPanel />


          <ConnectedAccounts />


          <ProfileAuditHistory />
        </div>
      </main>

      <ConflictResolutionDialog
        open={conflictSave.hasConflict}
        conflicts={conflictSave.conflicts}
        autoMerged={conflictSave.autoMerged}
        otherSourceLabel="another device"
        saving={conflictSave.saving}
        onCancel={conflictSave.cancel}
        onResolve={(choices) => void resolveConflicts(choices)}
      />

      <Footer />

    </div>
  );
}
