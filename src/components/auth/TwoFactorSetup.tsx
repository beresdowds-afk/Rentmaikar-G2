import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Shield, CheckCircle, Loader2, AlertTriangle, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { useRegionSamples } from '@/hooks/useRegionSamples';
import { PhoneNumberField } from '@/components/ui/phone-number-field';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

type Channel = 'sms' | 'whatsapp';
type VerifyChannel = 'sms' | 'whatsapp' | 'voice';

export const TwoFactorSetup = () => {
  const { user, userRole } = useAuth();
  const twoFaSamples = useRegionSamples();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isMandatory, setIsMandatory] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneIsValid, setPhoneIsValid] = useState(false);
  const [normalizedPhone, setNormalizedPhone] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('sms');
  const [existingPhone, setExistingPhone] = useState<string | null>(null);

  // Verification flow state
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifyChannel, setVerifyChannel] = useState<VerifyChannel>('sms');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const mandatoryRoles = ['admin', 'owner'];

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      setIsLoading(true);
      setIsMandatory(mandatoryRoles.includes(userRole || ''));

      const [{ data }, { data: profile }] = await Promise.all([
        supabase
          .from('two_factor_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('phone, phone_verified')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (data) {
        setIsEnabled(data.is_enabled);
        if (data.phone_number) {
          setExistingPhone(data.phone_number);
          setPhoneNumber(data.phone_number);
        } else if (profile?.phone) {
          setPhoneNumber(profile.phone);
        }
        setChannel((data.preferred_channel as Channel) || 'sms');
      } else if (profile?.phone) {
        setPhoneNumber(profile.phone);
      }
      setPhoneVerified(!!profile?.phone_verified && profile?.phone === (data?.phone_number || profile?.phone));
      setIsLoading(false);
    };
    fetchSettings();
  }, [user, userRole]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Reset verification whenever the number is edited.
  useEffect(() => {
    setPhoneVerified(false);
    setCodeSent(false);
    setOtp('');
  }, [normalizedPhone]);

  const handleSendCode = async () => {
    if (!phoneIsValid || !normalizedPhone) {
      toast.error('Enter a valid phone number first');
      return;
    }
    setSendingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone', {
        body: { action: 'send_code', phone: normalizedPhone, channel: verifyChannel },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to send code');
      setCodeSent(true);
      setCooldown(45);
      toast.success(`Code sent via ${verifyChannel.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(otp) || !normalizedPhone) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone', {
        body: { action: 'verify_code', phone: normalizedPhone, code: otp },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Invalid code');
      setPhoneVerified(true);
      toast.success('Phone verified — you can now enable 2FA.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!user || !normalizedPhone) return;
    if (!phoneVerified) {
      toast.error('Please verify your phone number before enabling 2FA.');
      return;
    }
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-2fa-code', {
        body: { action: 'setup', phone: normalizedPhone, channel },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setIsEnabled(true);
      setExistingPhone(normalizedPhone);
      toast.success('Two-factor authentication enabled!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!user || isMandatory) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('two_factor_settings')
        .update({ is_enabled: false, enabled_at: null })
        .eq('user_id', user.id);
      if (error) throw error;
      setIsEnabled(false);
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error('Failed to disable 2FA');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isMandatory && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Required
              </Badge>
            )}
            {isEnabled && (
              <Badge className="bg-green-500 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isMandatory && !isEnabled && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Two-factor authentication is mandatory for your role ({userRole}). Please set it up to continue using the platform.
            </AlertDescription>
          </Alert>
        )}

        {isEnabled && existingPhone ? (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                2FA is active. Codes are sent to <strong>{existingPhone}</strong> via {channel.toUpperCase()}.
              </AlertDescription>
            </Alert>
            {!isMandatory && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Disable 2FA</p>
                  <p className="text-xs text-muted-foreground">Remove two-factor authentication</p>
                </div>
                <Switch checked={isEnabled} onCheckedChange={() => handleDisable()} disabled={isSaving} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <PhoneNumberField
              id="tfa-phone"
              label="Phone Number for 2FA"
              value={phoneNumber}
              onChange={setPhoneNumber}
              onValidityChange={(valid, e164) => {
                setPhoneIsValid(valid);
                setNormalizedPhone(e164);
              }}
              hint={`Include your country code — e.g. ${twoFaSamples.phoneE164}. This is the number Rentmaikar will dial or text with security codes.`}
            />

            {/* Step 1: Verify the number */}
            {!phoneVerified && (
              <div className="rounded-md border border-dashed p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PhoneCall className="h-4 w-4 text-primary" />
                  Step 1 — Verify this number
                </div>
                <p className="text-xs text-muted-foreground">
                  Before we enable dialing or 2FA, we send a one-time code to confirm the number
                  is really yours. Choose how you'd like to receive it.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['sms', 'whatsapp', 'voice'] as const).map((c) => (
                    <Button
                      key={c}
                      type="button"
                      size="sm"
                      variant={verifyChannel === c ? 'default' : 'outline'}
                      onClick={() => setVerifyChannel(c)}
                    >
                      {c === 'voice' ? 'Voice call' : c === 'sms' ? 'SMS' : 'WhatsApp'}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleSendCode}
                    disabled={!phoneIsValid || sendingCode || cooldown > 0}
                    className="flex-1"
                  >
                    {sendingCode ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : codeSent
                        ? 'Resend code'
                        : 'Send verification code'}
                  </Button>
                </div>
                {codeSent && (
                  <div className="space-y-2">
                    <Label htmlFor="tfa-otp" className="text-xs">Enter the 6-digit code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="tfa-otp"
                        inputMode="numeric"
                        maxLength={6}
                        pattern="\d{6}"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        className="font-mono tracking-widest"
                      />
                      <Button onClick={handleVerifyOtp} disabled={verifying || otp.length !== 6}>
                        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {phoneVerified && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Number verified. You can now enable 2FA.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Step 2 — Delivery method for 2FA codes</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={channel === 'sms' ? 'default' : 'outline'} onClick={() => setChannel('sms')}>
                  SMS
                </Button>
                <Button type="button" variant={channel === 'whatsapp' ? 'default' : 'outline'} onClick={() => setChannel('whatsapp')}>
                  WhatsApp
                </Button>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving || !phoneIsValid || !phoneVerified}
              className="w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enabling...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Enable Two-Factor Authentication
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TwoFactorSetup;
