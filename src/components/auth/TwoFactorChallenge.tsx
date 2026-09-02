import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, ArrowLeft, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import rentmaikarLogo from '@/assets/rentmaikar-logo.jpg';
import { ResendButton } from '@/components/auth/ResendButton';

interface TwoFactorChallengeProps {
  userId: string;
  phone: string;
  channel: string;
  onVerified: () => void;
  onCancel: () => void;
}

export const TwoFactorChallenge = ({ userId, phone, channel, onVerified, onCancel }: TwoFactorChallengeProps) => {
  const [otpValue, setOtpValue] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  // Send code on mount
  useEffect(() => {
    sendCode();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendCode = async () => {
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
      setCountdown(60);
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

  const maskedPhone = phone ? `${phone.slice(0, 4)}****${phone.slice(-3)}` : '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src={rentmaikarLogo} alt="Rentmaikar" className="h-12 w-auto object-contain mx-auto" />
          </div>
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-display">Two-Factor Authentication</CardTitle>
          <CardDescription>
            {codeSent
              ? `Enter the 6-digit code sent to ${maskedPhone} via ${channel.toUpperCase()}`
              : 'Sending verification code...'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isSending && !codeSent ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otpValue} onChange={setOtpValue}>
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
                className="w-full"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Verify & Sign In
                  </>
                )}
              </Button>

              <div className="text-center">
                <ResendButton
                  channel="2fa"
                  identifier={phone}
                  onResend={async () => {
                    const { data, error } = await supabase.functions.invoke('send-2fa-code', {
                      body: { action: 'send_code', user_id: userId, phone, channel },
                    });
                    if (error) throw error;
                    if (!data?.success) throw new Error(data?.error ?? 'Failed to resend');
                    toast.success(`Verification code sent via ${channel.toUpperCase()}`);
                  }}
                  variant="link"
                  label="Resend code"
                />
              </div>
            </>
          )}
        </CardContent>

        <CardFooter>
          <Button variant="ghost" className="w-full gap-2" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default TwoFactorChallenge;
