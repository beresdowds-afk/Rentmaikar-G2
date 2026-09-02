import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneCall, Loader2, X, Clock, CheckCircle } from 'lucide-react';
import { useCallSupport } from '@/hooks/useCallSupport';
import { useRegion } from '@/contexts/RegionContext';
import { format } from 'date-fns';

interface CallSupportButtonProps {
  userType: 'driver' | 'owner';
  variant?: 'button' | 'card' | 'floating';
}

export const CallSupportButton = ({ userType, variant = 'button' }: CallSupportButtonProps) => {
  const { isEnabled, pendingRequest, isLoading, requestCallback, cancelRequest } = useCallSupport(userType);
  const { country } = useRegion();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestCallback = async () => {
    setIsSubmitting(true);
    const result = await requestCallback(reason || undefined);
    setIsSubmitting(false);
    
    if (result.success) {
      setIsDialogOpen(false);
      setReason('');
    }
  };

  const handleCancelRequest = async () => {
    await cancelRequest();
  };

  if (isLoading) {
    return null;
  }

  if (!isEnabled) {
    return null;
  }

  // Pending request view
  if (pendingRequest) {
    if (variant === 'floating') {
      return (
        <div className="fixed bottom-6 right-6 z-50">
          <Card className="w-72 shadow-lg border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />
                  <span className="font-medium text-sm">Callback Pending</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCancelRequest}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Requested {format(new Date(pendingRequest.created_at), 'h:mm a')}
              </p>
              {pendingRequest.reason && (
                <p className="text-xs mt-1 truncate">{pendingRequest.reason}</p>
              )}
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
              <div className="p-2 rounded-full bg-yellow-500/20">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="font-medium">Callback Requested</p>
                <p className="text-sm text-muted-foreground">
                  We'll call you back soon
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleCancelRequest}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Floating button variant
  if (variant === 'floating') {
    return (
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-6 right-6 z-50 rounded-full h-14 w-14 shadow-lg"
          >
            <Phone className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5" />
              Request Admin Callback
            </DialogTitle>
            <DialogDescription>
              Request a call from our support team. We'll call you back at your verified phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {country === 'USA' ? '🇺🇸' : '🇳🇬'} {country}
              </Badge>
              <span className="text-sm text-muted-foreground">Support Region</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">What do you need help with? (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Briefly describe your issue..."
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
            <Button onClick={handleRequestCallback} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 mr-2" />
                  Request Callback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Card variant
  if (variant === 'card') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Need Help?
          </CardTitle>
          <CardDescription>
            Request a callback from our support team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <PhoneCall className="h-4 w-4 mr-2" />
                Request Callback
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PhoneCall className="h-5 w-5" />
                  Request Admin Callback
                </DialogTitle>
                <DialogDescription>
                  Request a call from our support team. We'll call you back at your verified phone number.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {country === 'USA' ? '🇺🇸' : '🇳🇬'} {country}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Support Region</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason-card">What do you need help with? (Optional)</Label>
                  <Textarea
                    id="reason-card"
                    placeholder="Briefly describe your issue..."
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
                <Button onClick={handleRequestCallback} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Requesting...
                    </>
                  ) : (
                    <>
                      <Phone className="h-4 w-4 mr-2" />
                      Request Callback
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  // Default button variant
  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Phone className="h-4 w-4 mr-2" />
          Call Support
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5" />
            Request Admin Callback
          </DialogTitle>
          <DialogDescription>
            Request a call from our support team. We'll call you back at your verified phone number.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {country === 'USA' ? '🇺🇸' : '🇳🇬'} {country}
            </Badge>
            <span className="text-sm text-muted-foreground">Support Region</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason-btn">What do you need help with? (Optional)</Label>
            <Textarea
              id="reason-btn"
              placeholder="Briefly describe your issue..."
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
          <Button onClick={handleRequestCallback} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Requesting...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 mr-2" />
                Request Callback
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
