import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, Camera, Clock } from 'lucide-react';

interface Props {
  vehicleId: string;
  photoUrls: string[] | null;
  reviewStatus?: string | null;
  reviewNotes?: string | null;
  onDone?: () => void;
}

export function VehicleVerificationAction({
  vehicleId,
  photoUrls,
  reviewStatus,
  reviewNotes,
  onDone,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const photoCount = (photoUrls ?? []).filter((u) => (u ?? '').trim().length > 0).length;
  const hasPhotos = photoCount > 0;
  const pending = reviewStatus === 'pending';

  const resubmit = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('owner_resubmit_vehicle_for_review' as never, {
        p_vehicle_id: vehicleId,
      } as never);
      if (error) throw error;
      toast({
        title: 'Sent for verification',
        description: 'An admin will review your photos before the listing goes live on the catalogue.',
      });
      onDone?.();
    } catch (e: any) {
      toast({
        title: 'Could not request verification',
        description: e.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!hasPhotos && (
        <Alert>
          <Camera className="h-4 w-4" />
          <AlertTitle>Photos required for the public catalogue</AlertTitle>
          <AlertDescription>
            This vehicle is listed in the assets registry only. Upload at least one real photo of the
            vehicle, then send it for verification to appear publicly.
          </AlertDescription>
        </Alert>
      )}

      {reviewStatus === 'rejected' && reviewNotes && (
        <Alert variant="destructive">
          <AlertTitle>Verification feedback</AlertTitle>
          <AlertDescription>{reviewNotes}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={resubmit} disabled={busy || !hasPhotos || pending} className="gap-2">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : pending ? (
            <Clock className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {pending ? 'Awaiting admin verification' : 'Re-run photo verification'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {photoCount} photo{photoCount === 1 ? '' : 's'} attached
        </span>
      </div>
    </div>
  );
}

export default VehicleVerificationAction;
