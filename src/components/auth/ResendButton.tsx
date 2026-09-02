import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useResendCooldown, type ResendChannel } from '@/hooks/useResendCooldown';

interface Props {
  channel: ResendChannel;
  identifier: string | null | undefined;
  onResend: () => Promise<{ retryAfterSec?: number } | void>;
  label?: string;
  variant?: 'default' | 'outline' | 'link' | 'ghost';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

/**
 * Reusable resend action with a persistent cooldown timer, accessible
 * countdown announcement, and rate-limit backoff. Wire this anywhere
 * users can request a fresh verification / OTP / 2FA code.
 */
export function ResendButton({
  channel,
  identifier,
  onResend,
  label = 'Resend code',
  variant = 'outline',
  size = 'sm',
  className,
}: Props) {
  const { remaining, canSend, trigger } = useResendCooldown(channel, identifier);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      await trigger(onResend);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={!canSend || busy}
      onClick={handleClick}
      aria-live="polite"
      data-testid={`resend-${channel}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : !canSend ? (
        <Clock className="h-4 w-4 mr-2" />
      ) : (
        <RefreshCw className="h-4 w-4 mr-2" />
      )}
      {!canSend ? `Resend in ${remaining}s` : label}
    </Button>
  );
}

export default ResendButton;
