import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { assignRole } from '@/lib/user-provisioning';
import type { AppRole } from '@/lib/role-home';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PhoneNumberField } from '@/components/ui/phone-number-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useResendCooldown } from '@/hooks/useResendCooldown';
import { normalizeToE164, PhoneValidationError } from '@/lib/phone-normalize';

export type PhoneOtpMode = 'signin' | 'link';
type Role = 'driver' | 'owner';
type Provider = 'supabase' | 'custom';
type Step = 'phone' | 'code' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'phone', label: 'Your number' },
  { key: 'code', label: 'Enter code' },
  { key: 'done', label: 'Done' },
];

/** Compact 3-step progress indicator shown above the OTP form. */
function StepProgress({ current }: { current: Step }) {
  const index = STEPS.findIndex(s => s.key === current);
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={[
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                done
                  ? 'border-primary bg-primary text-primary-foreground'
                  : active
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground',
              ].join(' ')}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`text-xs ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  mode?: PhoneOtpMode;
  defaultRole?: Role;
  /** Prefill for the link flow. */
  initialPhone?: string;
  onDone?: (phone: string) => void;
}

/**
 * Phone OTP flow used both as an alternative sign-in method and to attach a
 * verified phone number to an existing account (mode="link" never creates a
 * new user or profile — it only updates the signed-in account).
 */
export function PhoneOtpPanel({ mode = 'signin', defaultRole = 'driver', initialPhone = '', onDone }: Props) {
  const [step, setStep] = useState<Step>('phone');
  const [phoneRaw, setPhoneRaw] = useState(initialPhone);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>(defaultRole);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default to the custom Twilio/Termii pipeline: Supabase-native phone auth
  // is not provisioned for this project, so it would fail silently.
  const [provider, setProvider] = useState<Provider>('custom');

  // Parse once and reuse: everything downstream works with strict E.164.
  const parsed = useMemo(() => {
    try {
      return { e164: normalizeToE164(phoneRaw).e164, error: null as string | null };
    } catch (e) {
      return {
        e164: null,
        error: e instanceof PhoneValidationError && e.code !== 'empty' ? e.message : null,
      };
    }
  }, [phoneRaw]);

  const { remaining, canSend, trigger } = useResendCooldown('sms', parsed.e164 ?? phoneRaw);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('platform_kv_settings')
        .select('value')
        .eq('key', 'phone_otp_provider')
        .maybeSingle();
      const v = (data?.value as { provider?: Provider } | null)?.provider;
      if (v === 'custom' || v === 'supabase') setProvider(v);
    })();
  }, []);

  /** Surface the real edge function error instead of "non-2xx status code". */
  const invokeOtp = async (body: Record<string, unknown>) => {
    const { data, error: fnError } = await supabase.functions.invoke('phone-otp-custom', { body });
    if (fnError) {
      let detail = fnError.message;
      const ctx = (fnError as { context?: Response }).context;
      if (ctx && typeof ctx.text === 'function') {
        try {
          const raw = await ctx.text();
          const parsedBody = JSON.parse(raw);
          detail = parsedBody?.error ?? raw ?? detail;
        } catch { /* keep default message */ }
      }
      throw new Error(detail);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const sendCode = async () => {
    setError(null);
    let e164: string;
    try {
      e164 = normalizeToE164(phoneRaw).e164;
    } catch (e) {
      setError(e instanceof PhoneValidationError ? e.message : 'Enter a valid phone number.');
      return;
    }
    if (!canSend) return;
    setSending(true);
    try {
      const ok = await trigger(async () => {
        if (mode === 'link') {
          await invokeOtp({ action: 'link_send', phone: e164 });
        } else if (provider === 'custom') {
          await invokeOtp({ action: 'send', phone: e164 });
        } else {
          const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: e164 });
          if (otpErr) throw otpErr;
        }
      });
      if (!ok) return;
      toast.success(`Verification code sent to ${e164}`);
      setCode('');
      setStep('code');
    } catch (e) {
      const message = (e as Error).message || 'Could not send the code. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    setError(null);
    if (code.length < 6) {
      setError('Enter the 6-digit code we sent you.');
      return;
    }
    const e164 = parsed.e164;
    if (!e164) { setError('Enter a valid phone number.'); return; }
    setVerifying(true);
    try {
      if (mode === 'link') {
        await invokeOtp({ action: 'link_verify', phone: e164, code });
        toast.success('Phone number verified and added to your account');
      } else if (provider === 'custom') {
        const data = await invokeOtp({ action: 'verify', phone: e164, code, full_name: name, role });
        // Exchange the one-time token for a real session (no password involved).
        const { error: sessionErr } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash as string,
          type: 'email',
        });
        if (sessionErr) throw sessionErr;
        if (data.is_new_user && name) {
          await supabase.from('profiles').update({ full_name: name }).eq('user_id', data.user_id);
        }
        toast.success('Signed in');
      } else {
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
        if (verifyErr) throw verifyErr;
        if (data.user) {
          try {
            await assignRole(data.user.id, role as AppRole);
          } catch (roleErr) {
            console.warn('Role assignment after phone sign-in failed:', roleErr);
          }
          if (name) {
            await supabase.from('profiles').update({ full_name: name }).eq('user_id', data.user.id);
          }
        }
        toast.success('Signed in');
      }
      setStep('done');
      onDone?.(e164);
    } catch (e) {
      const message = (e as Error).message || 'Verification failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <StepProgress current={step} />

      {error && (
        <Alert variant="destructive" role="alert" data-testid="phone-otp-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 'phone' && (
        <div className="space-y-4">
          {mode === 'signin' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone-otp-name">Full name (new users)</Label>
                <Input
                  id="phone-otp-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label>I am a</Label>
                <Select value={role} onValueChange={(v: Role) => setRole(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver">Driver</SelectItem>
                    <SelectItem value="owner">Vehicle Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Phone number</Label>
            <PhoneNumberField value={phoneRaw} onChange={setPhoneRaw} />
            {parsed.error ? (
              <p className="text-xs text-destructive">{parsed.error}</p>
            ) : parsed.e164 ? (
              <p className="text-xs text-muted-foreground">We'll text {parsed.e164}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick your country code — we format the number automatically.
              </p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={sendCode}
            disabled={sending || !parsed.e164 || !canSend}
            data-testid="phone-otp-send"
          >
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {canSend ? 'Send code' : `Try again in ${remaining}s`}
          </Button>
        </div>
      )}

      {step === 'code' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone-otp-code">Enter the 6-digit code sent to {parsed.e164}</Label>
            <Input
              id="phone-otp-code"
              value={code}
              onChange={e => { setError(null); setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              data-testid="phone-otp-code"
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={verifyCode} disabled={verifying || code.length < 6}>
              {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'link' ? 'Verify & add number' : 'Verify & continue'}
            </Button>
            <Button
              variant="outline"
              onClick={sendCode}
              disabled={!canSend || sending}
              data-testid="phone-otp-resend"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              {canSend ? 'Resend' : `${remaining}s`}
            </Button>
          </div>
          <Button variant="link" className="w-full" onClick={() => { setError(null); setStep('phone'); }}>
            Use a different number
          </Button>
        </div>
      )}

      {step === 'done' && (
        <Alert>
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription>
            {mode === 'link'
              ? `${parsed.e164} is now verified on your account.`
              : 'You are signed in. Redirecting…'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default PhoneOtpPanel;
