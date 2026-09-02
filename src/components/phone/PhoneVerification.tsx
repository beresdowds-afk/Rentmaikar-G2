import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Phone, MessageSquare, CheckCircle, Loader2, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { useResolvedPhoneCountry } from '@/hooks/useDefaultPhoneCountry';

interface PhoneVerificationProps {
  onVerified?: () => void;
  showAsCard?: boolean;
}

interface Region {
  id: string;
  iso2: CountryCode;
  region_name: string;
  country_name: string;
  calling_code: string;
  is_active: boolean;
}

type Channel = 'sms' | 'whatsapp';

export const PhoneVerification = ({ onVerified, showAsCard = true }: PhoneVerificationProps) => {
  const { user } = useAuth();
  // Region-aware default: resolved from the user's own number/profile or a
  // deliberately selected region. Never a hardcoded US flag or "+1" sample.
  const resolvedCountry = useResolvedPhoneCountry();
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<CountryCode | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [channel, setChannel] = useState<Channel>('sms');
  const [showOTPDialog, setShowOTPDialog] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [existingPhone, setExistingPhone] = useState<string | null>(null);

  // Load regions (region + phone_reference join)
  useEffect(() => {
    const loadRegions = async () => {
      const { data, error } = await (supabase as any)
        .from('region_definitions')
        .select('id, country_name, country_code, phone_prefix, status')
        .eq('status', 'active')
        .order('country_name');

      if (!error && data) {
        const mapped: Region[] = data.map((r: any) => ({
          id: r.id,
          iso2: (r.country_code ?? '').toUpperCase(),
          region_name: r.country_name,
          country_name: r.country_name,
          calling_code: r.phone_prefix ?? '',
          is_active: true,
        }));
        setRegions(mapped);
        // The country picker on the phone input stays fully international;
        // this list is only a shortcut for the platform's live regions.
      }
    };
    loadRegions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch current verification status
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('phone, phone_verified')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setIsPhoneVerified(data.phone_verified || false);
        setExistingPhone(data.phone || null);
        if (data.phone) {
          setPhoneNumber(data.phone);
          const parsed = parsePhoneNumberFromString(data.phone);
          if (parsed?.country) setSelectedRegion(parsed.country);
        }
      }
    };
    fetchProfile();
  }, [user]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const getFullPhoneNumber = () => phoneNumber;

  const handleSendCode = async () => {
    const parsed = parsePhoneNumberFromString(phoneNumber || '');
    if (!parsed || !parsed.isPossible() || !parsed.isValid()) {
      toast.error('Please enter a valid phone number with country code');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone', {
        body: {
          action: 'send_code',
          phone: parsed.number,
          channel,
        },
      });

      if (error) {
        // functions.invoke masks non-2xx bodies — read the real reason
        // (e.g. the number already belongs to another account).
        let detail = error.message;
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.text === 'function') {
            const parsedBody = JSON.parse(await ctx.text());
            if (parsedBody?.error) detail = parsedBody.error;
          }
        } catch { /* keep the generic message */ }
        throw new Error(detail);
      }

      if (data.success) {
        setShowOTPDialog(true);
        setCountdown(60);
        toast.success(`Verification code sent via ${channel.toUpperCase()}`);
      } else {
        throw new Error(data.error || 'Failed to send code');
      }
    } catch (error) {
      console.error('Error sending verification code:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (otpValue.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-phone', {
        body: {
          action: 'verify_code',
          phone: getFullPhoneNumber(),
          code: otpValue,
        },
      });

      if (error) throw error;

      if (data.success) {
        // The verify-phone edge function already persists the normalized E.164
        // number and flips phone_verified — writing it again from the client is
        // blocked by RLS/column guards and silently masked verification errors.
        setIsPhoneVerified(true);

        setShowOTPDialog(false);
        setOtpValue('');
        toast.success('Phone number verified successfully!');
        onVerified?.();
      } else {
        throw new Error(data.error || 'Verification failed');
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to verify code');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    await handleSendCode();
  };

  const content = (
    <div className="space-y-4">
      {isPhoneVerified && existingPhone ? (
        <div className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Your phone number <strong>{existingPhone}</strong> is verified.
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            onClick={() => setIsPhoneVerified(false)}
            className="w-full"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Update Phone Number
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pv-phone">Phone Number</Label>
            {regions.length > 0 && (
              <Select
                value={selectedRegion}
                onValueChange={(v) => setSelectedRegion(v as CountryCode)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.iso2} value={region.iso2}>
                      {region.country_name} ({region.calling_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <PhoneNumberInput
              id="pv-phone"
              value={phoneNumber}
              defaultCountry={selectedRegion ?? resolvedCountry}
              onChange={(v) => {
                setPhoneNumber(v);
                const parsed = parsePhoneNumberFromString(v || '');
                if (parsed?.country) setSelectedRegion(parsed.country);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Verification Method</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={channel === 'sms' ? 'default' : 'outline'}
                onClick={() => setChannel('sms')}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                SMS
              </Button>
              <Button
                type="button"
                variant={channel === 'whatsapp' ? 'default' : 'outline'}
                onClick={() => setChannel('whatsapp')}
                className="gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </Button>
            </div>
          </div>

          <Button
            onClick={handleSendCode}
            disabled={isLoading || !phoneNumber}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                Send Verification Code
              </>
            )}
          </Button>
        </div>
      )}

      {/* OTP Verification Dialog */}
      <Dialog open={showOTPDialog} onOpenChange={setShowOTPDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Verification Code</DialogTitle>
            <DialogDescription>
              We sent a 6-digit code to {getFullPhoneNumber()} via {channel.toUpperCase()}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otpValue}
                onChange={setOtpValue}
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
              onClick={handleVerifyCode}
              disabled={isVerifying || otpValue.length !== 6}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Code'
              )}
            </Button>

            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Resend code in {countdown}s
                </p>
              ) : (
                <Button
                  variant="link"
                  onClick={handleResendCode}
                  disabled={isLoading}
                >
                  Resend Code
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (!showAsCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Phone Verification
            </CardTitle>
            <CardDescription>
              Verify your phone to receive SMS and WhatsApp notifications
            </CardDescription>
          </div>
          {isPhoneVerified && (
            <Badge className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
};

export default PhoneVerification;
