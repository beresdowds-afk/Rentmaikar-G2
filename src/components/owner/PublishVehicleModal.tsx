import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Car,
  CheckCircle2,
  ShieldCheck,
  Users,
  Key,
  Copy,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Info,
  Undo2,
  MapPin,
  Building2,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  publishAndAuthorizeVehicle,
  cancelVehicleAuthorization,
  LEGAL_AUTHORIZATION_TEXT,
  type VehicleRentalAuthorization,
} from '@/services/vehicleAuthorizationService';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRegionSamples } from '@/hooks/useRegionSamples';

interface PublishVehicleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    license_plate: string;
    vin?: string | null;
    color?: string | null;
    pickup_city?: string | null;
    pickup_location?: string | null;
    pickup_address?: string | null;
    pickup_instructions?: string | null;
    photo_urls?: string[] | null;
    owner_id?: string;
    is_public?: boolean | null;
  };
  existingAuthorization?: VehicleRentalAuthorization | null;
  onSuccess?: () => void;
}

const USA_CITIES = [
  'Baltimore',
  'Washington DC',
  'Arlington',
  'Alexandria',
  'Bethesda',
  'Silver Spring',
  'Rockville',
  'Annapolis',
  'Gaithersburg',
  'Frederick',
  'Towson',
];

const NIGERIA_CITIES = [
  'Lagos',
  'Abuja',
  'Port Harcourt',
  'Ibadan',
  'Kano',
  'Enugu',
  'Benin City',
  'Calabar',
  'Kaduna',
  'Asaba',
];

export function PublishVehicleModal({
  open,
  onOpenChange,
  vehicle,
  existingAuthorization,
  onSuccess,
}: PublishVehicleModalProps) {
  const { user } = useAuth();
  const samples = useRegionSamples();
  const { country } = useRegion();
  const queryClient = useQueryClient();

  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    authorization: VehicleRentalAuthorization;
    cancellationUrl: string;
  } | null>(null);

  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [cancelReason, setCancelReason] = useState('Published in error / Mistake');

  // Compulsory Pickup Location form states
  const [pickupCity, setPickupCity] = useState(vehicle.pickup_city || '');
  const [pickupAddress, setPickupAddress] = useState(vehicle.pickup_address || vehicle.pickup_location || '');
  const [pickupLocationName, setPickupLocationName] = useState(vehicle.pickup_location || '');
  const [pickupInstructions, setPickupInstructions] = useState(vehicle.pickup_instructions || '');
  const [useCustomCity, setUseCustomCity] = useState(false);

  // Sync state whenever the modal is opened or the vehicle prop updates
  useEffect(() => {
    if (open) {
      setPickupCity(vehicle.pickup_city || '');
      setPickupAddress(vehicle.pickup_address || vehicle.pickup_location || '');
      setPickupLocationName(vehicle.pickup_location || '');
      setPickupInstructions(vehicle.pickup_instructions || '');
      setAgreed(false);
      setSuccessResult(null);
      setShowCancelConfirmation(false);

      const cityList = country === 'USA' ? USA_CITIES : NIGERIA_CITIES;
      if (vehicle.pickup_city && !cityList.includes(vehicle.pickup_city)) {
        setUseCustomCity(true);
      } else {
        setUseCustomCity(false);
      }
    }
  }, [open, vehicle, country]);

  const defaultCities = country === 'USA' ? USA_CITIES : NIGERIA_CITIES;
  const photos = (vehicle.photo_urls || []).filter((u) => Boolean(u && u.trim()));
  const isAlreadyActive = existingAuthorization?.status === 'ACTIVE' || Boolean(vehicle.is_public);

  // Compulsory Pickup Location Validation
  const isCityValid = Boolean(pickupCity && pickupCity.trim().length >= 2);
  const isAddressValid = Boolean(pickupAddress && pickupAddress.trim().length >= 3);
  const isPickupLocationValid = isCityValid && isAddressValid;

  const handlePublish = async () => {
    if (!isPickupLocationValid) {
      toast.error('Vehicle pickup location is compulsory. Please enter both the pickup city and address.');
      return;
    }

    if (!agreed) {
      toast.error('Please confirm and accept the authorization terms to proceed with publishing.');
      return;
    }

    if (photos.length === 0) {
      toast.warning('Please upload at least one real vehicle photo before publishing to the catalogue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const effectiveLocation = pickupLocationName.trim() || pickupAddress.trim();
      const effectiveAddress = pickupAddress.trim();

      // 1. Immediately persist pickup location directly to the Supabase vehicles table
      try {
        await supabase
          .from('vehicles')
          .update({
            pickup_city: pickupCity.trim(),
            pickup_address: effectiveAddress,
            pickup_location: effectiveLocation,
            pickup_instructions: pickupInstructions.trim() || null,
          } as never)
          .eq('id', vehicle.id);
      } catch (dbErr) {
        console.warn('Could not update vehicle pickup details in Supabase directly:', dbErr);
      }

      // 2. Execute publish and authorization
      const result = await publishAndAuthorizeVehicle({
        vehicleId: vehicle.id,
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        licensePlate: vehicle.license_plate,
        vin: vehicle.vin,
        color: vehicle.color,
        pickupCity: pickupCity.trim(),
        pickupLocation: effectiveLocation,
        pickupAddress: effectiveAddress,
        pickupInstructions: pickupInstructions.trim() || null,
        photoUrls: photos,
        ownerId: vehicle.owner_id || user?.id || 'owner-user',
        ownerName: user?.user_metadata?.full_name || 'Vehicle Owner',
        ownerEmail: user?.email || 'owner@rentmaikar.com',
      });

      // 3. Invalidate caches so UI across tabs & components updates immediately
      queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['catalogue'] });

      setSuccessResult(result);
      toast.success('Vehicle published to Catalogue with pickup location configured!', {
        description: 'An authorization confirmation with a mistake cancellation link has been sent to your inbox.',
      });
      onSuccess?.();
    } catch (err: any) {
      console.error(err);
      toast.error('Could not complete vehicle authorization: ' + (err.message || 'Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAuthorization = async () => {
    setIsSubmitting(true);
    try {
      const res = await cancelVehicleAuthorization({
        vehicleId: vehicle.id,
        cancelledByUserId: user?.id || 'owner-user',
        cancelledByName: user?.user_metadata?.full_name || 'Vehicle Owner',
        cancelledByRole: 'owner',
        reason: cancelReason,
      });

      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] });
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        queryClient.invalidateQueries({ queryKey: ['catalogue'] });

        toast.info('Vehicle listing unpublished and authorization cancelled.', {
          description: 'Logged to Admin Authorization database.',
        });
        setShowCancelConfirmation(false);
        setSuccessResult(null);
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error('Error cancelling authorization: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyLink = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Cancellation link copied to clipboard!');
  };

  const handleClose = () => {
    setSuccessResult(null);
    setShowCancelConfirmation(false);
    setAgreed(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {successResult ? (
          <div className="space-y-6 py-2">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight">
                Vehicle Published &amp; Authorized
              </DialogTitle>
              <DialogDescription className="text-sm">
                Your vehicle is now live on the Rentmaikar Catalogue and entered into the verified driver matching pool.
              </DialogDescription>
            </div>

            <div className="bg-muted/60 border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Authorization Reference:</span>
                <Badge variant="outline" className="font-mono font-bold text-primary">
                  {successResult.authorization.id}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Vehicle:</span>
                <span className="font-semibold">
                  {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate})
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Pickup Location:</span>
                <span className="font-semibold flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <MapPin className="w-3.5 h-3.5" />
                  {pickupCity} ({pickupAddress})
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Status:</span>
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active in Catalogue
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Driver Matching Pool:</span>
                <Badge variant="secondary" className="gap-1">
                  <Users className="w-3 h-3 text-blue-500" /> Active Matching
                </Badge>
              </div>
            </div>

            <Alert className="bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="font-semibold text-amber-800 dark:text-amber-300">
                Notification Message &amp; Mistake Cancellation Link
              </AlertTitle>
              <AlertDescription className="text-xs space-y-2 mt-1">
                <p>
                  A confirmation notification has been delivered to your Messages inbox. In case you published this vehicle by mistake or need to revoke permission at any time, use your cancellation link:
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={successResult.cancellationUrl}
                    className="flex-1 bg-background border rounded px-2.5 py-1.5 text-xs font-mono text-muted-foreground select-all"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyLink(successResult.cancellationUrl)}
                    className="shrink-0 gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              </AlertDescription>
            </Alert>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button asChild variant="outline" className="w-full sm:w-auto gap-1">
                <a href={`/catalogue`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  View Public Catalogue
                </a>
              </Button>
              <Button onClick={handleClose} className="w-full sm:w-auto">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : showCancelConfirmation ? (
          <div className="space-y-4 py-2">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Cancel Vehicle Rental Authorization
              </DialogTitle>
              <DialogDescription>
                Unpublish <strong>{vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate})</strong> from the Catalogue and revoke Rentmaikar's driver matching authorization.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-foreground">
                Cancellation Reason (Logged in Admin Audit Database):
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              >
                <option value="Published in error / Mistake">Published in error / Mistake</option>
                <option value="Vehicle undergoing maintenance">Vehicle undergoing maintenance</option>
                <option value="Vehicle unavailable / In personal use">Vehicle unavailable / In personal use</option>
                <option value="Temporary pause in listings">Temporary pause in listings</option>
                <option value="Other / Owner preference">Other / Owner preference</option>
              </select>
            </div>

            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                This action will immediately remove the vehicle photos from the public Catalogue and log the cancellation event with your timestamp into the Admin Authorization Database.
              </AlertDescription>
            </Alert>

            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCancelConfirmation(false)}
                disabled={isSubmitting}
              >
                Go Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelAuthorization}
                disabled={isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Confirm Cancellation &amp; Unpublish
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5 py-1">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <Car className="h-5 w-5 text-primary" />
                  Publish Vehicle to Catalogue
                </DialogTitle>
                {isAlreadyActive && (
                  <Badge className="bg-emerald-600 text-white text-xs">Currently Published</Badge>
                )}
              </div>
              <DialogDescription>
                Authorise Rentmaikar to list your vehicle, match verified drivers, and display high-resolution photos on the Catalogue.
              </DialogDescription>
            </DialogHeader>

            {/* Vehicle Summary Card with Photos */}
            <div className="bg-muted/50 border rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h4 className="font-semibold text-base">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Plate: <span className="font-mono font-medium text-foreground">{vehicle.license_plate}</span>
                    {vehicle.color ? ` • ${vehicle.color}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {photos.length} Photo{photos.length === 1 ? '' : 's'} Attached
                </Badge>
              </div>

              {/* Photo Preview Strip */}
              {photos.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {photos.slice(0, 4).map((url, i) => (
                    <div key={url} className="relative rounded-md overflow-hidden aspect-video border bg-muted">
                      <img src={url} alt={`Vehicle photo ${i + 1}`} className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                          Catalogue Cover
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Alert variant="destructive" className="py-2 text-xs">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No photos found. Please upload photos via the Photo Manager before publishing to the Catalogue.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* COMPULSORY VEHICLE PICKUP LOCATION SECTION */}
            <div className="rounded-xl border-2 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-foreground flex items-center gap-2">
                      Vehicle Pickup Location
                      <Badge className="bg-amber-600 text-white text-[10px] font-semibold py-0 px-1.5">
                        * Compulsory Requirement
                      </Badge>
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Specify the city and exact handover address where the matched driver will collect the vehicle.
                    </p>
                  </div>
                </div>

                {isPickupLocationValid ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 gap-1 text-[11px] shrink-0">
                    <Check className="h-3 w-3" /> Location Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[11px] shrink-0">
                    Required to Publish
                  </Badge>
                )}
              </div>

              {!isPickupLocationValid && (
                <Alert className="bg-amber-100/70 dark:bg-amber-900/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-xs font-semibold">Pickup Location is Required to Enable Publishing</AlertTitle>
                  <AlertDescription className="text-[11px] mt-0.5">
                    Please provide the Pickup City and Full Street Address/Depot below. The publish button will remain locked until this information is provided.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* City Selection */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="publish-pickup-city" className="text-xs font-semibold flex items-center gap-1">
                      Pickup City <span className="text-destructive font-bold">*</span>
                    </Label>
                    <button
                      type="button"
                      onClick={() => setUseCustomCity(!useCustomCity)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {useCustomCity ? 'Choose from list' : 'Enter custom city'}
                    </button>
                  </div>

                  {useCustomCity ? (
                    <Input
                      id="publish-pickup-city"
                      placeholder={`e.g. ${samples.location || samples.city}`}
                      value={pickupCity}
                      onChange={(e) => setPickupCity(e.target.value)}
                      className="h-9 text-xs"
                    />
                  ) : (
                    <Select
                      value={pickupCity}
                      onValueChange={(val) => setPickupCity(val)}
                    >
                      <SelectTrigger id="publish-pickup-city" className="h-9 text-xs">
                        <SelectValue placeholder="Select vehicle pickup city..." />
                      </SelectTrigger>
                      <SelectContent>
                        {defaultCities.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!isCityValid && (
                    <p className="text-[10px] text-destructive">City is compulsory.</p>
                  )}
                </div>

                {/* Specific Location Name / Landmark */}
                <div className="space-y-1.5">
                  <Label htmlFor="publish-pickup-location" className="text-xs font-medium flex items-center gap-1">
                    Landmark / Depot Name <span className="text-muted-foreground text-[10px]">(Optional)</span>
                  </Label>
                  <Input
                    id="publish-pickup-location"
                    placeholder={`e.g. ${samples.landmark}`}
                    value={pickupLocationName}
                    onChange={(e) => setPickupLocationName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Full Address */}
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="publish-pickup-address" className="text-xs font-semibold flex items-center gap-1">
                    Full Handover Address / Street <span className="text-destructive font-bold">*</span>
                  </Label>
                  <Input
                    id="publish-pickup-address"
                    placeholder={`e.g. ${samples.address}`}
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className="h-9 text-xs"
                  />
                  {!isAddressValid && (
                    <p className="text-[10px] text-destructive">Full street address or exact pickup point is compulsory.</p>
                  )}
                </div>

                {/* Pickup Instructions */}
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="publish-pickup-instructions" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    Special Handover Instructions <span className="text-muted-foreground text-[10px]">(Optional)</span>
                  </Label>
                  <Textarea
                    id="publish-pickup-instructions"
                    placeholder="e.g. Ask for garage manager, vehicle keys in lockbox, verify driver rental agreement on phone..."
                    value={pickupInstructions}
                    onChange={(e) => setPickupInstructions(e.target.value)}
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>
              </div>
            </div>

            {/* MANDATORY NOTIFICATION & AUTHORIZATION DECLARATION */}
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-bold text-foreground">
                    Rentmaikar-Owner Vehicle Rental Authorization Notice
                  </h5>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Please review the legal permissions granted upon publishing:
                  </p>
                </div>
              </div>

              {/* Exact wording from user requirement */}
              <div className="rounded-lg bg-background p-3.5 border text-xs text-foreground leading-relaxed shadow-sm font-medium">
                "{LEGAL_AUTHORIZATION_TEXT}"
              </div>

              {/* Breakdown of 3 pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                <div className="p-2.5 rounded-lg bg-background border flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <Car className="h-3.5 w-3.5" />
                    <span>1. Catalogue Listing</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Full permission to publicly list photos and specs for incoming driver reservations.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-background border flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <Users className="h-3.5 w-3.5" />
                    <span>2. Driver Pool Match</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Permission to match with vetted, background-checked drivers from our verified pool.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-background border flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <Key className="h-3.5 w-3.5" />
                    <span>3. Handover Promise</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Commitment to hand over vehicle at the submitted pickup location upon driver verification match.
                  </p>
                </div>
              </div>
            </div>

            {/* Checkbox Acknowledgment */}
            <div className="flex items-start space-x-3 pt-1">
              <Checkbox
                id="auth-agreement-checkbox"
                checked={agreed}
                onCheckedChange={(c) => setAgreed(Boolean(c))}
                className="mt-0.5"
              />
              <label
                htmlFor="auth-agreement-checkbox"
                className="text-xs text-foreground leading-snug cursor-pointer select-none"
              >
                I confirm that I am the verified owner/authorized fleet manager for this vehicle. By publishing, I confirm the pickup location provided, grant Rentmaikar rental listing and driver matching authority, commit to vehicle handover, and acknowledge that all authorizations and cancellations are logged in the Rentmaikar Admin Compliance Database.
              </label>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t">
              {isAlreadyActive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto"
                  onClick={() => setShowCancelConfirmation(true)}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Cancel / Revoke Authorization
                </Button>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  * Instant cancellation link will be sent to your messages
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 w-full sm:w-auto">
                {!isPickupLocationValid && (
                  <span className="text-[11px] text-destructive font-medium">
                    * Compulsory pickup location required to enable publish
                  </span>
                )}
                {!agreed && isPickupLocationValid && (
                  <span className="text-[11px] text-muted-foreground">
                    * Please check the authorization agreement
                  </span>
                )}

                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={isSubmitting || !agreed || photos.length === 0 || !isPickupLocationValid}
                    className="gap-2 min-w-[150px]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Authorizing...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        {isAlreadyActive ? 'Update & Re-Authorize' : 'Publish & Authorize'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PublishVehicleModal;

