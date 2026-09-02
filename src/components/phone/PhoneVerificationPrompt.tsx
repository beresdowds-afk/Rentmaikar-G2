import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PhoneVerification } from '@/components/phone/PhoneVerification';

/** Routes where an interruptive prompt would be harmful. */
const EXCLUDED_PREFIXES = [
  '/auth',
  '/reset-password',
  '/referee-attest',
  '/proxy/consent',
  '/onboarding',
  '/driver/register',
  '/owner/register',
  '/verification',
  '/profile/settings',
  '/profile-settings',
  '/settings',
  '/profile',
];

const SNOOZE_MS = 24 * 60 * 60 * 1000;

function snoozeKey(userId: string) {
  return `phone-verify-prompt:${userId}`;
}

function isSnoozed(userId: string) {
  try {
    const raw = localStorage.getItem(snoozeKey(userId));
    return !!raw && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * App-wide phone verification prompt. Shown to every signed-in user that has a
 * platform role (driver, owner, admin, support staff) but no verified phone.
 */
export function PhoneVerificationPrompt() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const excluded = EXCLUDED_PREFIXES.some((p) => location.pathname.startsWith(p));

  const { data } = useQuery({
    queryKey: ['phone-verify-prompt', user?.id],
    enabled: !!user && !excluded,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('phone, phone_verified').eq('user_id', user!.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user!.id),
      ]);
      return {
        verified: !!profile?.phone_verified,
        hasRole: (roles?.length ?? 0) > 0,
      };
    },
  });

  useEffect(() => {
    if (!user || excluded || !data) return;
    if (data.verified || !data.hasRole) return;
    if (isSnoozed(user.id)) return;
    setOpen(true);
  }, [user, excluded, data]);

  const snooze = () => {
    if (user) {
      try {
        localStorage.setItem(snoozeKey(user.id), String(Date.now()));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  if (!user || excluded) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : snooze())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify your phone number</DialogTitle>
          <DialogDescription>
            We use your verified number for payment, vehicle and account alerts by SMS or WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <PhoneVerification showAsCard={false} onVerified={() => setOpen(false)} />
        <DialogFooter>
          <Button variant="ghost" onClick={snooze}>
            Remind me later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PhoneVerificationPrompt;
