import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneCall, Loader2, X, Clock } from 'lucide-react';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { useRegion } from '@/contexts/RegionContext';
import { format } from 'date-fns';
import { ensureMediaPermissions } from '@/lib/media-permissions';
import { InAppCallDialog } from '@/components/voice/InAppCallDialog';


interface VoiceCallButtonProps {
  userRole: 'driver' | 'owner';
  targetRole?: string;
  targetId?: string;
  targetName?: string;
  variant?: 'button' | 'card' | 'floating';
}

export const VoiceCallButton = ({
  userRole,
  targetRole = 'admin',
  targetId,
  targetName,
  variant = 'button',
}: VoiceCallButtonProps) => {
  const { pendingRequests, requestCall, cancelCallRequest } = useVoiceCall(userRole);
  const { country } = useRegion();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInAppOpen, setIsInAppOpen] = useState(false);


  const activePending = pendingRequests.find(
    (r) => r.target_role === targetRole && r.status === 'pending'
  );

  const handleRequest = async () => {
    setIsSubmitting(true);
    // Ensure mic/speaker access before the call is queued so audio works
    // the moment support connects.
    await ensureMediaPermissions();
    const result = await requestCall(targetRole, targetId, reason || undefined);
    setIsSubmitting(false);
    if (result) {
      setIsDialogOpen(false);
      setReason('');
    }
  };

  const handleCancel = async () => {
    if (activePending) {
      await cancelCallRequest(activePending.id);
    }
  };

  // Show pending state
  if (activePending) {
    if (variant === 'floating') {
      return (
        <div className="fixed bottom-20 right-6 z-50">
          <Card className="w-72 shadow-lg border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />
                  <span className="font-medium text-sm">Call Pending</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Requested {format(new Date(activePending.created_at), 'h:mm a')}
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-yellow-600 animate-pulse" />
              <div>
                <p className="font-medium text-sm">Call Request Pending</p>
                <p className="text-xs text-muted-foreground">Support will call you back</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PhoneCall className="h-5 w-5" />
          {targetName ? `Call ${targetName}` : `Call ${targetRole === 'admin' ? 'Support' : targetRole}`}
        </DialogTitle>
        <DialogDescription>
          Your call request will be routed to the appropriate team. No personal numbers are shared.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {country === 'USA' ? '🇺🇸' : '🇳🇬'} {country}
          </Badge>
          <span className="text-sm text-muted-foreground">Region</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="call-reason">Reason (Optional)</Label>
          <Textarea
            id="call-reason"
            placeholder="Briefly describe why you need to call..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
          Cancel
        </Button>
        <Button onClick={handleRequest} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Requesting...
            </>
          ) : (
            <>
              <Phone className="h-4 w-4 mr-2" />
              Request Call
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  if (variant === 'floating') {
    return (
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="fixed bottom-20 right-6 z-50 rounded-full h-14 w-14 shadow-lg">
            <Phone className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Phone className="h-4 w-4" />
            {targetName ? `Call ${targetName}` : `Call ${targetRole === 'admin' ? 'Support' : targetRole}`}
          </Button>
        </DialogTrigger>
        {dialogContent}
      </Dialog>
      <Button className="gap-2" onClick={() => setIsInAppOpen(true)}>
        <PhoneCall className="h-4 w-4" />
        Call now (in-app)
      </Button>
      <InAppCallDialog
        open={isInAppOpen}
        onOpenChange={setIsInAppOpen}
        destination={targetId ? `client:user_${targetId}` : 'support'}
        title={targetName ? `Call ${targetName}` : 'Call support'}
      />
    </div>
  );
};

