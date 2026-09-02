import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { Capacitor } from '@capacitor/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, ShieldAlert, Mail, Phone, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PersonaVerification from '@/components/verification/PersonaVerification';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';
import { Lock } from 'lucide-react';
import { useRegionSamples } from '@/hooks/useRegionSamples';
import { PhoneNumberField } from '@/components/ui/phone-number-field';

interface ProfileEditorProps {
  subjectRole: 'driver' | 'owner' | 'support_staff' | 'admin_assistant';
}

import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { friendlyPhoneError } from '@/lib/phone-errors';

/**
 * Normalise phone to E.164 using libphonenumber-js. Returns '' if the input
 * is blank; returns the raw trimmed input if it cannot be parsed so the
 * schema surfaces a proper validation error rather than silently mangling it.
 */
const normalizePhone = (raw: string) => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/[^\d]/g, '')}`;
  const parsed = parsePhoneNumberFromString(withPlus);
  return parsed?.isValid() ? parsed.number : trimmed;
};

const profileSchema = z.object({
  fullName: z.string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name must be under 80 characters')
    .regex(/^[\p{L}][\p{L}\s'.\-]*$/u, "Name may only contain letters, spaces, apostrophes, dots or hyphens"),
  email: z.string()
    .trim()
    .toLowerCase()
    .max(254, 'Email is too long')
    .email('Enter a valid email address'),
  phone: z.string()
    .trim()
    .refine((v) => {
      if (v === '') return true;
      const withPlus = v.startsWith('+') ? v : `+${v.replace(/[^\d]/g, '')}`;
      const parsed = parsePhoneNumberFromString(withPlus);
      return !!parsed?.isValid();
    }, 'Enter a valid international phone number (e.g. +15551234567)'),
});


type FieldErrors = Partial<Record<'fullName' | 'email' | 'phone', string>>;

export function ProfileEditor({ subjectRole }: ProfileEditorProps) {
  const profileSamples = useRegionSamples();
  const { user } = useAuth();
  const isNative = Capacitor.isNativePlatform();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingUnique, setCheckingUnique] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [initial, setInitial] = useState({ fullName: '', email: '', phone: '' });
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  const [needsReverify, setNeedsReverify] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const uniqueAbort = useRef<AbortController | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('full_name, email, phone, email_verified, phone_verified, identity_verification_status, identity_verified_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      const fn = data.full_name ?? '';
      const em = data.email ?? user.email ?? '';
      const ph = data.phone ?? '';
      setFullName(fn); setEmail(em); setPhone(ph);
      setInitial({ fullName: fn, email: em, phone: ph });
      setEmailVerified(!!data.email_verified);
      setPhoneVerified(!!data.phone_verified);
      const status = data.identity_verification_status ?? (data.identity_verified_at ? 'approved' : null);
      setIdentityStatus(status);
      setNeedsReverify(status === 'pending_reverification');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const emailChanged = email.trim().toLowerCase() !== initial.email.trim().toLowerCase();
  const phoneChanged = normalizePhone(phone) !== normalizePhone(initial.phone);
  const nameChanged = fullName.trim() !== initial.fullName.trim();
  const anyChange = emailChanged || phoneChanged || nameChanged;

  /** Warn if the user is trying to blank out a value that's already verified. */
  const stateWarnings = useMemo<string[]>(() => {
    const w: string[] = [];
    if (emailChanged && email.trim() === '') w.push('Email cannot be empty.');
    if (phoneChanged && phone.trim() === '' && phoneVerified) {
      w.push('Removing a verified phone will disable SMS/WhatsApp notifications.');
    }
    if (emailChanged && !emailVerified) {
      w.push('Your current email is not yet verified — changing it will restart email verification.');
    }
    return w;
  }, [emailChanged, phoneChanged, email, phone, emailVerified, phoneVerified]);

  const validateShape = (): FieldErrors => {
    const parsed = profileSchema.safeParse({
      fullName,
      email,
      phone: normalizePhone(phone),
    });
    const next: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
    }
    return next;
  };

  const checkUniqueness = async (): Promise<FieldErrors> => {
    if (!user) return {};
    const next: FieldErrors = {};
    uniqueAbort.current?.abort();
    const ctrl = new AbortController();
    uniqueAbort.current = ctrl;
    setCheckingUnique(true);
    try {
      if (emailChanged && email.trim()) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('email', email.trim().toLowerCase())
          .neq('user_id', user.id)
          .abortSignal(ctrl.signal)
          .maybeSingle();
        if (data) next.email = 'That email is already in use by another account.';
      }
      if (phoneChanged && phone.trim()) {
        const norm = normalizePhone(phone);
        const { data } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('phone', norm)
          .neq('user_id', user.id)
          .abortSignal(ctrl.signal)
          .maybeSingle();
        if (data) next.phone = 'That phone number is already in use by another account.';
      }
    } catch {
      /* aborted or network — ignore, server will re-validate */
    } finally {
      setCheckingUnique(false);
    }
    return next;
  };

  const nameLocked = identityStatus === 'approved';

  const handleSave = async () => {
    if (!user || !anyChange) return;

    // Names cannot be changed after identity is verified.
    if (nameLocked && nameChanged) {
      setErrors({ fullName: 'Name is locked after identity verification. Contact support to change it.' });
      toast.error('Your name is locked after identity verification.');
      return;
    }

    // 1. Client-side shape validation
    const shapeErrs = validateShape();
    if (Object.keys(shapeErrs).length) {
      setErrors(shapeErrs);
      toast.error('Please fix the highlighted fields.');
      return;
    }


    // 2. Uniqueness check for email/phone
    const uniqErrs = await checkUniqueness();
    if (Object.keys(uniqErrs).length) {
      setErrors(uniqErrs);
      toast.error('Please fix the highlighted fields.');
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const normPhone = normalizePhone(phone);

      // 3. Update auth email (Supabase sends the confirmation email)
      if (emailChanged) {
        const { error } = await supabase.auth.updateUser({ email: trimmedEmail });
        if (error) {
          if (/registered|exists|taken/i.test(error.message)) {
            setErrors({ email: 'That email is already registered.' });
          }
          throw error;
        }
      }

      // 4. Update profile row
      const updates: Record<string, any> = { full_name: fullName.trim() };
      if (emailChanged) {
        updates.email = trimmedEmail;
        updates.email_verified = false;
      }
      if (phoneChanged) {
        updates.phone = normPhone;
        updates.phone_verified = false;
      }

      const requiresReverification = emailChanged || phoneChanged;
      if (requiresReverification) {
        updates.identity_verified_at = null;
        updates.identity_verification_status = 'pending_reverification';
      }

      const { error: pErr } = await supabase.from('profiles').update(updates).eq('user_id', user.id);
      if (pErr) throw pErr;

      // 5. Audit trail — handled server-side by the profile_settings_audit
      // trigger. Client-side writes to admin_audit_log are blocked by RLS
      // (admin-only), so we intentionally don't insert here.

      setInitial({ fullName: fullName.trim(), email: trimmedEmail, phone: normPhone });
      setEmail(trimmedEmail);
      setPhone(normPhone);

      // Analytics: which fields were updated
      const changedFields: string[] = [];
      if (nameChanged) changedFields.push('full_name');
      if (emailChanged) changedFields.push('email');
      if (phoneChanged) changedFields.push('phone');
      trackOnboardingEvent('profile_updated', {
        role: subjectRole === 'driver' || subjectRole === 'owner' ? subjectRole : null,
        fields: changedFields,
      });

      if (requiresReverification) {
        setEmailVerified(!emailChanged && emailVerified);
        setPhoneVerified(!phoneChanged && phoneVerified);
        setIdentityStatus('pending_reverification');
        setNeedsReverify(true);

        trackOnboardingEvent('profile_reverification_triggered', {
          role: subjectRole === 'driver' || subjectRole === 'owner' ? subjectRole : null,
          fields: changedFields.filter((f) => f !== 'full_name'),
          extra: { channel: 'both' },
        });

        // 6. Kick off Persona re-verification (email + SMS with a hosted link).
        supabase.functions.invoke('persona-send-reverification', {
          body: {
            user_id: user.id,
            subject_role: subjectRole,
            channel: 'both',
            reason: emailChanged && phoneChanged
              ? 'Your email and phone changed — please re-verify your identity.'
              : emailChanged
                ? 'Your email address changed — please re-verify your identity.'
                : 'Your phone number changed — please re-verify your identity.',
          },
        }).catch(() => {});

        toast.success('Profile updated. Please re-verify your identity below.');
        if (emailChanged) toast.info('Check your new email inbox to confirm the change.');
      } else {
        toast.success('Profile saved.');
      }

    } catch (e: any) {
      const duplicate = friendlyPhoneError(e);
      if (duplicate) {
        setErrors((prev) => ({
          ...prev,
          ...(/email/i.test(duplicate) ? { email: duplicate } : { phone: duplicate }),
        }));
      }
      toast.error(duplicate ?? e.message ?? 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const fieldClass = (key: keyof FieldErrors) =>
    errors[key] ? 'border-destructive focus-visible:ring-destructive' : '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> Personal Information
          </CardTitle>
          <CardDescription>
            Edit your name, email or phone. Changing your email or phone will require re-verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pe-name" className="flex items-center gap-2">
                Full Name
                {nameLocked && (
                  <Badge variant="secondary" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" /> Locked
                  </Badge>
                )}
              </Label>
              <Input
                id="pe-name"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors(x => ({ ...x, fullName: undefined })); }}
                placeholder="Your name"
                autoComplete="name"
                autoCapitalize="words"
                maxLength={80}
                aria-invalid={!!errors.fullName}
                className={fieldClass('fullName')}
                disabled={nameLocked}
                readOnly={nameLocked}
              />
              {nameLocked && (
                <p className="text-xs text-muted-foreground">
                  Your name is locked after identity verification. Contact support to change it.
                </p>
              )}
              {errors.fullName && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.fullName}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pe-email" className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" /> Email
                {emailVerified ? (
                  <Badge variant="secondary" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Unverified</Badge>
                )}
              </Label>
              <Input
                id="pe-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(x => ({ ...x, email: undefined })); }}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                maxLength={254}
                aria-invalid={!!errors.email}
                className={fieldClass('email')}
              />
              {errors.email && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pe-phone" className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" /> Phone
                {phoneVerified ? (
                  <Badge variant="secondary" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Unverified</Badge>
                )}
              </Label>
              <PhoneNumberField
                id="pe-phone"
                value={phone}
                onChange={(v) => { setPhone(v); if (errors.phone) setErrors(x => ({ ...x, phone: undefined })); }}
                autoComplete="tel"
                error={errors.phone ?? null}
                hint={`Numbers are saved in international E.164 format (e.g. ${profileSamples.phoneE164}). Include your country code.`}
              />
            </div>
          </div>


          {stateWarnings.length > 0 && (
            <Alert variant="default" className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
              <AlertCircle className="h-4 w-4 text-blue-700" />
              <AlertDescription className="text-blue-900 dark:text-blue-200 space-y-1">
                {stateWarnings.map((w) => <div key={w}>{w}</div>)}
              </AlertDescription>
            </Alert>
          )}

          {(emailChanged || phoneChanged) && (
            <Alert variant="default" className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
              <ShieldAlert className="h-4 w-4 text-yellow-700" />
              <AlertDescription className="text-yellow-900 dark:text-yellow-200">
                Changing your {emailChanged && phoneChanged ? 'email and phone' : emailChanged ? 'email' : 'phone'} will
                require you to re-verify your identity before you can continue using your dashboard.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button onClick={handleSave} disabled={!anyChange || saving || checkingUnique} className="w-full sm:w-auto">
              {(saving || checkingUnique) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {checkingUnique ? 'Checking…' : saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {needsReverify && (
        <Card className="border-orange-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-600" /> Identity Re-verification Required
            </CardTitle>
            <CardDescription>
              Your contact information changed. Please re-verify your identity to keep your account active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PersonaVerification
              subject="self"
              subjectRole={subjectRole}
              fields={{
                'name-first': fullName.split(' ')[0] ?? '',
                'name-last': fullName.split(' ').slice(1).join(' '),
                'email-address': email,
                'phone-number': phone,
              }}
              onComplete={() => {
                toast.success('Verification submitted for review.');
                load();
              }}
            />
          </CardContent>
        </Card>
      )}

      {identityStatus === 'approved' && !needsReverify && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 pl-1">
          <CheckCircle2 className="h-3 w-3 text-green-600" /> Identity verified
        </p>
      )}
    </div>
  );
}

export default ProfileEditor;
