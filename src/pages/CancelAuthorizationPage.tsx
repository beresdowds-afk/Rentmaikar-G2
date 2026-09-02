import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ShieldAlert,
  CheckCircle2,
  Car,
  Calendar,
  User,
  FileText,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Undo2,
  Home,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAuthorizationByToken,
  cancelVehicleAuthorization,
  type VehicleRentalAuthorization,
} from '@/services/vehicleAuthorizationService';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export default function CancelAuthorizationPage() {
  const { token } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const queryToken = token || searchParams.get('token') || '';

  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [authorization, setAuthorization] = useState<VehicleRentalAuthorization | null>(null);
  const [reason, setReason] = useState('Published in error / Mistake');
  const [customNote, setCustomNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelledResult, setCancelledResult] = useState<VehicleRentalAuthorization | null>(null);

  useEffect(() => {
    async function load() {
      if (!queryToken) {
        setLoading(false);
        return;
      }
      try {
        const found = await getAuthorizationByToken(queryToken);
        setAuthorization(found);
        if (found?.status === 'CANCELLED') {
          setCancelledResult(found);
        }
      } catch (err) {
        console.error('Failed to load authorization by token:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [queryToken]);

  const handleCancel = async () => {
    if (!authorization) return;
    setIsSubmitting(true);
    try {
      const fullReason = customNote.trim() ? `${reason}: ${customNote.trim()}` : reason;
      const res = await cancelVehicleAuthorization({
        cancellationToken: authorization.cancellation_token,
        authorizationId: authorization.id,
        vehicleId: authorization.vehicle_id,
        cancelledByUserId: user?.id || authorization.owner_id,
        cancelledByName: user?.user_metadata?.full_name || authorization.owner_name || 'Vehicle Owner',
        cancelledByRole: 'owner',
        reason: fullReason,
      });

      if (res.success && res.authorization) {
        setCancelledResult(res.authorization);
        toast.success('Vehicle rental authorization cancelled successfully!', {
          description: 'Your vehicle has been removed from the public catalogue and logged.',
        });
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error('Could not cancel authorization: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container max-w-2xl mx-auto px-4 py-8 md:py-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Retrieving vehicle authorization details...</p>
          </div>
        ) : !authorization ? (
          <Card className="border-destructive/20 text-center p-8 space-y-4">
            <div className="w-14 h-14 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <CardTitle className="text-xl">Authorization Record Not Found</CardTitle>
            <CardDescription className="text-sm">
              The cancellation link provided is invalid, expired, or the vehicle record was removed.
            </CardDescription>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/owner-dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Owner Dashboard
              </Link>
            </Button>
          </Card>
        ) : cancelledResult ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5 p-6 md:p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <Check className="w-8 h-8" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Vehicle Authorization Cancelled
              </CardTitle>
              <CardDescription className="text-sm">
                Your vehicle has been successfully unpublished from the public Catalogue and driver matching pool.
              </CardDescription>
            </div>

            <div className="bg-background border rounded-xl p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Vehicle:</span>
                <span className="font-semibold">
                  {cancelledResult.vehicle_year} {cancelledResult.vehicle_make} {cancelledResult.vehicle_model}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">License Plate:</span>
                <span className="font-mono font-medium">{cancelledResult.license_plate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Authorization Ref:</span>
                <span className="font-mono text-xs">{cancelledResult.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cancellation Timestamp:</span>
                <span>
                  {cancelledResult.cancelled_at
                    ? format(new Date(cancelledResult.cancelled_at), 'PPP p')
                    : format(new Date(), 'PPP p')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Logged Reason:</span>
                <span className="text-destructive font-medium">
                  {cancelledResult.cancellation_reason || 'Published in error / Mistake'}
                </span>
              </div>
            </div>

            <Alert className="bg-background">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-sm font-semibold">Audit Database Updated</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                This cancellation has been logged permanently in the Rentmaikar Admin Compliance Database. You can re-publish this vehicle anytime from your Owner Dashboard.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button asChild className="w-full">
                <Link to="/owner-dashboard">
                  <Home className="w-4 h-4 mr-2" />
                  Go to Owner Dashboard
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/catalogue">
                  View Public Catalogue
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="border shadow-lg">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs font-mono">
                  Ref: {authorization.id}
                </Badge>
                <Badge className="bg-emerald-600 text-white text-xs">Currently Active</Badge>
              </div>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <Undo2 className="h-6 w-6 text-destructive" />
                Cancel Vehicle Rental Authorization
              </CardTitle>
              <CardDescription className="text-sm">
                If you published this vehicle by mistake or wish to revoke authorization, confirm below to instantly unpublish from the Catalogue.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Vehicle Detail Preview */}
              <div className="bg-muted/50 rounded-xl p-4 border space-y-3">
                <div className="flex items-start gap-3">
                  {authorization.photo_urls?.[0] ? (
                    <img
                      src={authorization.photo_urls[0]}
                      alt="Vehicle"
                      className="w-20 h-16 rounded-lg object-cover border bg-muted"
                    />
                  ) : (
                    <div className="w-20 h-16 rounded-lg bg-muted border flex items-center justify-center text-muted-foreground">
                      <Car className="w-8 h-8" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-base">
                      {authorization.vehicle_year} {authorization.vehicle_make} {authorization.vehicle_model}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      License Plate: <span className="font-mono font-semibold text-foreground">{authorization.license_plate}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Authorized On: {format(new Date(authorization.authorized_at), 'PPP p')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cancellation Reason Form */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-foreground">
                  Reason for Cancellation / Mistake Undo:
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="Published in error / Mistake">Published in error / Mistake</option>
                  <option value="Incorrect vehicle photos or details">Incorrect vehicle photos or details</option>
                  <option value="Vehicle unavailable / In personal use">Vehicle unavailable / In personal use</option>
                  <option value="Vehicle undergoing maintenance or inspection">Vehicle undergoing maintenance or inspection</option>
                  <option value="Temporary pause in rental listings">Temporary pause in rental listings</option>
                  <option value="Other reason">Other reason</option>
                </select>

                <textarea
                  className="w-full rounded-md border border-input bg-background p-3 text-sm focus:ring-2 focus:ring-primary min-h-[80px]"
                  placeholder="Optional additional notes for the compliance audit log..."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                />
              </div>

              <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="font-semibold text-xs">Immediate Effect Notice</AlertTitle>
                <AlertDescription className="text-xs">
                  Clicking cancel will immediately unpublish your vehicle from the Rentmaikar public Catalogue, withdraw it from driver matching, and log your cancellation timestamp in the Admin Authorization Database.
                </AlertDescription>
              </Alert>
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row gap-3 border-t pt-4">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => navigate('/owner-dashboard')}
                disabled={isSubmitting}
              >
                Keep Listing Active
              </Button>
              <Button
                variant="destructive"
                className="w-full sm:flex-1 gap-2"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Cancellation...
                  </>
                ) : (
                  <>
                    <Undo2 className="h-4 w-4" />
                    Confirm Cancellation &amp; Unpublish
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
