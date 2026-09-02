import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  CheckCircle,
  Loader2,
  AlertTriangle,
  PhoneCall,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRegionSamples } from '@/hooks/useRegionSamples';
import { PhoneNumberField } from '@/components/ui/phone-number-field';
import {
  generateTotpSecret,
  generateTotpUri,
  generateTotpQrCode,
  verifyTotpCode,
  formatSecretForDisplay,
  saveStoredTotpSecret,
  getStoredTotpSecret,
  removeStoredTotpSecret,
  getTotpSecondsRemaining,
} from '@/lib/totp';

type Channel = 'authenticator' | 'sms' | 'whatsapp';
type VerifyChannel = 'sms' | 'whatsapp' | 'voice';

export const TwoFactorSetup = () => {
  const { user, userRole } = useAuth();
  const twoFaSamples = useRegionSamples();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isMandatory, setIsMandatory] = useState(false);
  const [activeMethod, setActiveMethod] = useState<'authenticator' | 'phone'>('authenticator');

  // Phone state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneIsValid, setPhoneIsValid] = useState(false);
  const [normalizedPhone, setNormalizedPhone] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('authenticator');
  const [existingPhone, setExistingPhone] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifyChannel, setVerifyChannel] = useState<VerifyChannel>('sms');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Google Authenticator state
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [totpQrCode, setTotpQrCode] = useState<string>('');
  const [totpVerifyCode, setTotpVerifyCode] = useState<string>('');
  const [isVerifyingTotp, setIsVerifyingTotp] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isReconfiguringTotp, setIsReconfiguringTotp] = useState(false);

  // Live tester state
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const mandatoryRoles = ['admin', 'owner'];

  // Initialize a new Google Authenticator setup secret & QR code
  const initGoogleAuthenticatorSetup = useCallback(async () => {
    if (!user) return;
    try {
      const secret = generateTotpSecret(20);
      setTotpSecret(secret);
      const uri = generateTotpUri({
        secret,
        accountName: user.email || 'User',
        issuer: 'RentMaikar',
      });
      const qrDataUrl = await generateTotpQrCode(uri);
      setTotpQrCode(qrDataUrl);
      setTotpVerifyCode('');
    } catch (err) {
      console.error('Failed to generate TOTP secret:', err);
      toast.error('Failed to generate Google Authenticator setup key');
    }
  }, [user]);

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

      const storedTotp = getStoredTotpSecret(user.id);

      if (data) {
        setIsEnabled(data.is_enabled);
        const preferred = (data.preferred_channel as Channel) || 'authenticator';
        setChannel(preferred);
        if (preferred === 'authenticator' || storedTotp) {
          setActiveMethod('authenticator');
          if (storedTotp) {
            setTotpSecret(storedTotp);
          }
        } else {
          setActiveMethod('phone');
        }

        if (data.phone_number) {
          setExistingPhone(data.phone_number);
          setPhoneNumber(data.phone_number);
        } else if (profile?.phone) {
          setPhoneNumber(profile.phone);
        }
      } else {
        if (storedTotp) {
          setActiveMethod('authenticator');
          setTotpSecret(storedTotp);
        } else if (profile?.phone) {
          setPhoneNumber(profile.phone);
        }
      }

      setPhoneVerified(!!profile?.phone_verified && profile?.phone === (data?.phone_number || profile?.phone));
      setIsLoading(false);
    };

    fetchSettings();
  }, [user, userRole]);

  // Generate initial QR if not yet enabled or reconfiguring
  useEffect(() => {
    if (!isEnabled || isReconfiguringTotp) {
      if (!totpSecret) {
        initGoogleAuthenticatorSetup();
      }
    }
  }, [isEnabled, isReconfiguringTotp, totpSecret, initGoogleAuthenticatorSetup]);

  // Phone cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Reset verification whenever phone number is edited
  useEffect(() => {
    setPhoneVerified(false);
    setCodeSent(false);
    setPhoneOtp('');
  }, [normalizedPhone]);

  // Copy secret key
  const handleCopySecret = () => {
    if (!totpSecret) return;
    navigator.clipboard.writeText(totpSecret);
    setCopiedKey(true);
    toast.success('Setup key copied to clipboard');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Verify and Enable Google Authenticator
  const handleVerifyAndEnableGoogleAuthenticator = async () => {
    if (!user || !totpSecret) return;
    if (totpVerifyCode.length !== 6) {
      toast.error('Please enter the 6-digit code from Google Authenticator');
      return;
    }

    setIsVerifyingTotp(true);
    try {
      // 1. Verify TOTP code against secret
      const isValid = await verifyTotpCode(totpSecret, totpVerifyCode);
      if (!isValid) {
        toast.error('Invalid 6-digit code. Check that your device clock is accurate and try again.');
        setIsVerifyingTotp(false);
        return;
      }

      // 2. Persist in two_factor_settings
      const now = new Date().toISOString();
      const { error: dbError } = await supabase
        .from('two_factor_settings')
        .upsert(
          {
            user_id: user.id,
            is_enabled: true,
            preferred_channel: 'authenticator',
            enabled_at: now,
            updated_at: now,
          },
          { onConflict: 'user_id' }
        );

      if (dbError) {
        console.warn('Database two_factor_settings save error, continuing with local persistence:', dbError);
      }

      // 3. Save secret securely in client storage
      saveStoredTotpSecret(user.id, totpSecret);

      // 4. Try enrolling with Supabase native MFA if supported
      try {
        if (supabase.auth?.mfa?.enroll) {
          await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'Google Authenticator',
            issuer: 'RentMaikar',
          });
        }
      } catch {}

      setIsEnabled(true);
      setChannel('authenticator');
      setIsReconfiguringTotp(false);
      setTotpVerifyCode('');
      toast.success('Google Authenticator successfully activated!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enable Google Authenticator');
    } finally {
      setIsVerifyingTotp(false);
    }
  };

  // Test live code for enabled Google Authenticator
  const handleTestTotpCode = async () => {
    if (!totpSecret || testCode.length !== 6) return;
    const valid = await verifyTotpCode(totpSecret, testCode);
    setTestResult(valid ? 'success' : 'error');
    if (valid) {
      toast.success('Code matched! Google Authenticator is operating perfectly.');
    } else {
      toast.error('Code mismatch. Please check your authenticator app.');
    }
  };

  // Phone SMS/WhatsApp verification
  const handleSendPhoneCode = async () => {
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

  const handleVerifyPhoneOtp = async () => {
    if (!/^\d{6}$/.test(phoneOtp) || !normalizedPhone) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setVerifyingPhone(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone', {
        body: { action: 'verify_code', phone: normalizedPhone, code: phoneOtp },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Invalid code');
      setPhoneVerified(true);
      toast.success('Phone verified — you can now enable 2FA.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifyingPhone(false);
    }
  };

  const handleSavePhone2FA = async () => {
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
      toast.success('Two-factor authentication enabled via SMS/WhatsApp!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!user || isMandatory) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('two_factor_settings')
        .update({ is_enabled: false, enabled_at: null })
        .eq('user_id', user.id);
      if (error) throw error;

      removeStoredTotpSecret(user.id);
      setIsEnabled(false);
      setIsReconfiguringTotp(false);
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
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Two-Factor Authentication (2FA)
            </CardTitle>
            <CardDescription>
              Protect your account with Google Authenticator or SMS/WhatsApp security codes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isMandatory && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Required for {userRole}
              </Badge>
            )}
            {isEnabled && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs gap-1">
                <CheckCircle className="h-3 w-3" />
                {channel === 'authenticator' ? 'Google Authenticator Active' : 'Active (Phone)'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isMandatory && !isEnabled && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Two-factor authentication is mandatory for your role ({userRole}). Enable Google Authenticator below to secure administrative access.
            </AlertDescription>
          </Alert>
        )}

        {/* Method Switcher Tabs */}
        <Tabs
          value={activeMethod}
          onValueChange={(val) => setActiveMethod(val as 'authenticator' | 'phone')}
          className="space-y-4"
        >
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="authenticator" className="gap-1.5 text-xs">
              <Smartphone className="h-4 w-4 text-emerald-500" />
              <span>Google Authenticator</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                Recommended
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="phone" className="gap-1.5 text-xs">
              <PhoneCall className="h-4 w-4 text-blue-500" />
              <span>SMS / WhatsApp</span>
            </TabsTrigger>
          </TabsList>

          {/* ================= TAB 1: GOOGLE AUTHENTICATOR ================= */}
          <TabsContent value="authenticator" className="space-y-4">
            {isEnabled && channel === 'authenticator' && !isReconfiguringTotp ? (
              <div className="space-y-4">
                <Alert className="border-emerald-500/40 bg-emerald-500/10 text-foreground">
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <AlertDescription className="text-xs">
                    <strong>Google Authenticator is Active.</strong> Whenever you sign in, you'll be prompted for the 6-digit security code generated by your Google Authenticator app.
                  </AlertDescription>
                </Alert>

                {/* Quick Live Code Tester */}
                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Test Authenticator Code</Label>
                    <span className="text-[11px] text-muted-foreground">
                      Verify your device clock is in sync
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      maxLength={6}
                      pattern="\d{6}"
                      inputMode="numeric"
                      placeholder="Enter 6 digits"
                      value={testCode}
                      onChange={(e) => {
                        setTestCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setTestResult(null);
                      }}
                      className="font-mono text-center tracking-widest text-sm max-w-[160px] h-9"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTestTotpCode}
                      disabled={testCode.length !== 6}
                      className="h-9 text-xs"
                    >
                      Test Code
                    </Button>
                    {testResult === 'success' && (
                      <Badge className="bg-emerald-600 text-white text-xs gap-1">
                        <Check className="h-3 w-3" /> Valid
                      </Badge>
                    )}
                    {testResult === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        Invalid
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsReconfiguringTotp(true);
                      initGoogleAuthenticatorSetup();
                    }}
                    className="text-xs gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reconfigure / New Phone
                  </Button>

                  {!isMandatory && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDisable2FA}
                      disabled={isSaving}
                      className="text-xs text-destructive hover:bg-destructive/10"
                    >
                      Disable Google Authenticator
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-emerald-500" />
                    How to set up Google Authenticator:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 pt-1">
                    <li>Install <strong>Google Authenticator</strong> from the iOS App Store or Google Play Store.</li>
                    <li>Open the app, tap <strong>'+'</strong> and select <strong>Scan a QR code</strong>.</li>
                    <li>Scan the QR code below (or enter the key manually).</li>
                    <li>Enter the 6-digit confirmation code generated by the app to complete setup.</li>
                  </ol>
                </div>

                {/* QR Code & Manual Secret Display */}
                <div className="grid sm:grid-cols-2 gap-4 items-center p-4 rounded-xl border bg-card">
                  {/* QR Container */}
                  <div className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border shadow-xs">
                    {totpQrCode ? (
                      <img
                        src={totpQrCode}
                        alt="Google Authenticator QR Code"
                        className="w-44 h-44 object-contain rounded"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono mt-1">Scan with Google Authenticator</span>
                  </div>

                  {/* Manual Key Details */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold flex items-center gap-1">
                        <Key className="h-3.5 w-3.5 text-primary" />
                        Manual Setup Key
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Can't scan the QR code? Enter this secret key manually into Google Authenticator.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-muted border font-mono text-xs font-bold tracking-wider break-all select-all flex items-center justify-between gap-2">
                      <span>{formatSecretForDisplay(totpSecret)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCopySecret}
                        className="h-7 w-7 flex-shrink-0"
                        title="Copy Key"
                      >
                        {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>

                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p><strong>Account:</strong> {user?.email}</p>
                      <p><strong>Issuer:</strong> RentMaikar</p>
                      <p><strong>Type:</strong> Time-based (TOTP, 30s)</p>
                    </div>
                  </div>
                </div>

                {/* Confirmation Code Input */}
                <div className="space-y-2 p-3.5 rounded-xl border bg-primary/5 border-primary/20">
                  <Label htmlFor="totp-confirm-code" className="text-xs font-semibold">
                    Enter the 6-digit code shown in Google Authenticator:
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="totp-confirm-code"
                      inputMode="numeric"
                      maxLength={6}
                      pattern="\d{6}"
                      placeholder="123456"
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="font-mono text-center tracking-widest text-base font-bold max-w-[200px]"
                    />
                    <Button
                      onClick={handleVerifyAndEnableGoogleAuthenticator}
                      disabled={isVerifyingTotp || totpVerifyCode.length !== 6}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      {isVerifyingTotp ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Verify & Activate Google Authenticator
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {isReconfiguringTotp && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsReconfiguringTotp(false)}
                    className="text-xs"
                  >
                    Cancel Reconfiguration
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          {/* ================= TAB 2: PHONE (SMS / WHATSAPP) ================= */}
          <TabsContent value="phone" className="space-y-4">
            {isEnabled && existingPhone && channel !== 'authenticator' ? (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 text-xs">
                    Phone 2FA is active. Codes are dispatched to <strong>{existingPhone}</strong> via {channel.toUpperCase()}.
                  </AlertDescription>
                </Alert>
                {!isMandatory && (
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Disable 2FA</p>
                      <p className="text-xs text-muted-foreground">Remove phone two-factor authentication</p>
                    </div>
                    <Switch checked={isEnabled} onCheckedChange={() => handleDisable2FA()} disabled={isSaving} />
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
                  hint={`Include country code (e.g. ${twoFaSamples.phoneE164}).`}
                />

                {!phoneVerified && (
                  <div className="rounded-md border border-dashed p-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <PhoneCall className="h-4 w-4 text-primary" />
                      Verify Phone Number
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['sms', 'whatsapp', 'voice'] as const).map((c) => (
                        <Button
                          key={c}
                          type="button"
                          size="sm"
                          variant={verifyChannel === c ? 'default' : 'outline'}
                          onClick={() => setVerifyChannel(c)}
                          className="text-xs"
                        >
                          {c === 'voice' ? 'Voice call' : c === 'sms' ? 'SMS' : 'WhatsApp'}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={handleSendPhoneCode}
                        disabled={!phoneIsValid || sendingCode || cooldown > 0}
                        className="flex-1 text-xs"
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
                        <Label htmlFor="tfa-otp" className="text-xs">Enter 6-digit code</Label>
                        <div className="flex gap-2">
                          <Input
                            id="tfa-otp"
                            inputMode="numeric"
                            maxLength={6}
                            pattern="\d{6}"
                            value={phoneOtp}
                            onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="123456"
                            className="font-mono tracking-widest text-center"
                          />
                          <Button onClick={handleVerifyPhoneOtp} disabled={verifyingPhone || phoneOtp.length !== 6}>
                            {verifyingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {phoneVerified && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 text-xs">
                      Number verified. Select delivery channel to activate.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label className="text-xs">Delivery method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={channel === 'sms' ? 'default' : 'outline'}
                      onClick={() => setChannel('sms')}
                      className="text-xs"
                    >
                      SMS Text
                    </Button>
                    <Button
                      type="button"
                      variant={channel === 'whatsapp' ? 'default' : 'outline'}
                      onClick={() => setChannel('whatsapp')}
                      className="text-xs"
                    >
                      WhatsApp
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={handleSavePhone2FA}
                  disabled={isSaving || !phoneIsValid || !phoneVerified}
                  className="w-full text-xs"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enabling...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Enable Phone 2FA
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TwoFactorSetup;
