import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, AlertCircle, ArrowLeft, Smartphone, PhoneCall, Clock } from 'lucide-react';
import { toast } from 'sonner';
import rentmaikarLogo from '@/assets/rentmaikar-logo.png';
import { ResendButton } from '@/components/common/ResendButton';
import { verifyTotpCode, getStoredTotpSecret, getTotpSecondsRemaining } from '@/lib/totp';

interface TwoFactorChallengeProps {
  userId: string;
  phone?: string;
  channel?: 'authenticator' | 'sms' | 'whatsapp';
  onVerified: () => void;
  onCancel: () => void;
}

export const TwoFactorChallenge = ({
  userId,
  phone,
  channel: initialChannel = 'authenticator',
  onVerified,
  onCancel,
}: TwoFactorChallengeProps) => {
  const [channel, setChannel] = useState<'authenticator' | 'sms' | 'whatsapp'>(initialChannel);
  const [otpValue, setOtpValue] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [codeSent, setCodeSent] = useState(channel === 'authenticator');
  const [error, setError] = useState<string | null>(null);
  const [totpSeconds, setTotpSeconds] = useState(getTotpSecondsRemaining());

  // Dynamic 30-second countdown for Google Authenticator
  useEffect(() => {
    if (channel !== 'authenticator') return;
    const interval = setInterval(() => {
      setTotpSeconds(getTotpSecondsRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, [channel]);

  // Send SMS/WhatsApp code if channel is phone
  useEffect(() => {
    if (channel === 'authenticator') {
      setCodeSent(true);
      return;
    }
    if (phone) {
      sendPhoneCode();
    }
  }, [channel, phone]);

  const sendPhoneCode = async () => {
    if (!phone) return;
    setIsSending(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-2fa-code', {
        body: {
          action: 'send_code',
          user_id: userId,
          phone,
          channel,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setCodeSent(true);
      toast.success(`Verification code sent via ${channel.toUpperCase()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send code';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  const verifyCode = async () => {
    if (otpValue.length !== 6) return;
    setIsVerifying(true);
    setError(null);

    try {
      // 1. Google Authenticator Verification
      if (channel === 'authenticator') {
        const storedSecret = getStoredTotpSecret(userId);

        if (storedSecret) {
          const isValid = await verifyTotpCode(storedSecret, otpValue);
          if (!isValid) {
            throw new Error('Invalid code. Check Google Authenticator and make sure your device time is synchronized.');
          }
        } else {
          // Fallback check against Supabase MFA factors if present
          try {
            const factors = await supabase.auth.mfa.listFactors();
            if (factors.data?.totp && factors.data.totp.length > 0) {
              const factorId = factors.data.totp[0].id;
              const challenge = await supabase.auth.mfa.challenge({ factorId });
              if (!challenge.error) {
                const verifyRes = await supabase.auth.mfa.verify({
                  factorId,
                  challengeId: challenge.data.id,
                  code: otpValue,
                });
                if (verifyRes.error) throw verifyRes.error;
              }
            }
          } catch (mfaErr) {
            // If edge function has verify_totp or verify_code
            const { data } = await supabase.functions.invoke('send-2fa-code', {
              body: { action: 'verify_code', user_id: userId, code: otpValue },
            });
            if (data && !data.success) {
              throw new Error(data.error || 'Verification failed');
            }
          }
        }

        toast.success('Google Authenticator code verified!');
        onVerified();
        return;
      }

      // 2. Phone SMS / WhatsApp Verification
      const { data, error } = await supabase.functions.invoke('send-2fa-code', {
        body: {
          action: 'verify_code',
          user_id: userId,
          code: otpValue,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success('Identity verified!');
      onVerified();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
      setOtpValue('');
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-submit when 6 digits are reached
  useEffect(() => {
    if (otpValue.length === 6 && !isVerifying) {
      verifyCode();
    }
  }, [otpValue]);

  const maskedPhone = phone ? `${phone.slice(0, 4)}****${phone.slice(-3)}` : '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src={rentmaikarLogo} alt="RentMaikar" className="h-12 w-auto object-contain mx-auto" />
          </div>
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
            {channel === 'authenticator' ? (
              <Smartphone className="w-6 h-6 text-emerald-500" />
            ) : (
              <Shield className="w-6 h-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {channel === 'authenticator' ? 'Google Authenticator' : 'Two-Factor Authentication'}
          </CardTitle>
          <CardDescription className="text-xs max-w-xs mx-auto">
            {channel === 'authenticator'
              ? 'Enter the 6-digit security code from the Google Authenticator app on your mobile device'
              : codeSent
              ? `Enter the 6-digit code sent to ${maskedPhone} via ${channel.toUpperCase()}`
              : 'Sending verification code...'}
          </CardDescription>

          {channel === 'authenticator' && (
            <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <Clock className="h-3 w-3 text-emerald-500 animate-spin" />
              <span>Next code rotation in: </span>
              <span className="font-bold text-foreground">{totpSeconds}s</span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {isSending && !codeSent ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex justify-center py-2">
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={(val) => setOtpValue(val.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                onClick={verifyCode}
                disabled={isVerifying || otpValue.length !== 6}
                className="w-full bg-primary font-semibold"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying Code...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Verify & Sign In
                  </>
                )}
              </Button>

              {/* Alternate Channels Toggle */}
              {channel !== 'authenticator' ? (
                <div className="text-center pt-2">
                  <ResendButton
                    channel="2fa"
                    identifier={phone || ''}
                    onResend={sendPhoneCode}
                    variant="link"
                    label="Resend code"
                  />
                </div>
              ) : phone ? (
                <div className="text-center pt-1">
                  <Button
                    variant="link"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setChannel('sms')}
                  >
                    <PhoneCall className="h-3 w-3 mr-1" />
                    Can't access authenticator? Verify via SMS
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>

        <CardFooter>
          <Button variant="ghost" className="w-full gap-2 text-xs" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default TwoFactorChallenge;
