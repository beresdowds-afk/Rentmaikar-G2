import { useState } from 'react';
import { CurrencyIcon } from '@/components/ui/Currencyicon';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 

  Send, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Lock, 
  MessageSquare,
  AlertTriangle,
  Loader2,
  Plus,
  Car,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useRegion } from '@/contexts/RegionContext';
import { useCategoryYearSpecs } from '@/hooks/useCategoryYearSpecs';
import { usePriceNegotiations, useOwnerVehicles, type PriceNegotiation } from '@/hooks/usePriceNegotiations';

const requestSchema = z.object({
  vehicleId: z.string().min(1, 'Please select a vehicle'),
  requestedWeeklyRate: z.number().min(1, 'Weekly rate must be positive'),
  ownerMessage: z.string().max(500).optional(),
});

type RequestFormData = z.infer<typeof requestSchema>;

const modificationRequestSchema = z.object({
  requestedRate: z.number().min(1, 'Rate must be positive'),
  reason: z.string().min(10, 'Please provide a reason (min 10 characters)').max(500),
});

type ModificationRequestData = z.infer<typeof modificationRequestSchema>;

const PRICE_CEILINGS = {
  budget: { min: 2015, max: 2016, ceiling: 250, label: 'Smart Start' },
  standard: { min: 2017, max: 2020, ceiling: 300, label: 'Earnings Optimizer' },
  premium: { min: 2021, max: 2025, ceiling: 350, label: 'Top Earner' },
};

const getVehicleCategory = (year: number): 'budget' | 'standard' | 'premium' => {
  if (year >= 2021) return 'premium';
  if (year >= 2017) return 'standard';
  return 'budget';
};

export const OwnerPriceNegotiation = () => {
  const { country } = useRegion();
  const currency = country === 'Nigeria' ? 'NGN' : 'USD';
  const currencySymbol = currency === 'NGN' ? '₦' : '$';
  const { getForCategory: getSpec, formatRange, visible: yearsVisible } = useCategoryYearSpecs(country);
  const rangeSuffix = (key: 'budget' | 'standard' | 'premium') => {
    if (!yearsVisible) return '';
    const spec = getSpec(key);
    const fallback: Record<string, string> = { budget: '2015-16', standard: '2017-20', premium: '2021-25' };
    return ` (${spec ? formatRange(spec) : fallback[key]})`;
  };
  
  
  const { vehicles, isLoading: vehiclesLoading } = useOwnerVehicles();
  const { 
    negotiations, 
    isLoading, 
    createNegotiation, 
    acceptCounterOffer,
    createModificationRequest,
    refetch 
  } = usePriceNegotiations('owner');
  
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [isModificationOpen, setIsModificationOpen] = useState(false);
  const [selectedNegotiation, setSelectedNegotiation] = useState<PriceNegotiation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestForm = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      vehicleId: '',
      requestedWeeklyRate: 0,
      ownerMessage: '',
    },
  });

  const modificationForm = useForm<ModificationRequestData>({
    resolver: zodResolver(modificationRequestSchema),
    defaultValues: {
      requestedRate: 0,
      reason: '',
    },
  });

  const selectedVehicleId = requestForm.watch('vehicleId');
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const selectedCategory = selectedVehicle ? getVehicleCategory(selectedVehicle.year) : null;
  const categoryInfo = selectedCategory ? PRICE_CEILINGS[selectedCategory] : null;

  // Get vehicles that don't have active negotiations
  const availableVehicles = vehicles.filter(
    v => !negotiations.some(n => n.vehicle_id === v.id && !['rejected'].includes(n.status || ''))
  );

  const handleNewRequest = async (data: RequestFormData) => {
    setIsSubmitting(true);
    
    const vehicle = vehicles.find(v => v.id === data.vehicleId);
    if (!vehicle) {
      toast.error('Please select a valid vehicle');
      setIsSubmitting(false);
      return;
    }

    const category = getVehicleCategory(vehicle.year);
    
    try {
      // Convert weekly rate to daily rate (divide by 7)
      const dailyRate = Math.round(data.requestedWeeklyRate / 7);
      
      await createNegotiation({
        vehicle_id: data.vehicleId,
        vehicle_make: vehicle.make,
        vehicle_model: vehicle.model,
        vehicle_year: vehicle.year,
        vehicle_category: category,
        requested_daily_rate: dailyRate,
        driver_message: data.ownerMessage,
        currency,
      });
      
      setIsNewRequestOpen(false);
      requestForm.reset();
      toast.success('Rate request submitted!', {
        description: 'An admin will review your request shortly.',
      });
    } catch (error) {
      console.error('Error creating negotiation:', error);
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptCounterOffer = async (negotiation: PriceNegotiation) => {
    if (!negotiation.admin_counter_offer) return;
    
    setIsSubmitting(true);
    try {
      await acceptCounterOffer(negotiation.id, negotiation.admin_counter_offer);
      toast.success('Counter offer accepted!', {
        description: 'Your weekly rate has been confirmed.',
      });
    } catch (error) {
      console.error('Error accepting counter offer:', error);
      toast.error('Failed to accept offer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModificationRequest = async (data: ModificationRequestData) => {
    if (!selectedNegotiation) return;
    
    setIsSubmitting(true);
    try {
      await createModificationRequest({
        negotiation_id: selectedNegotiation.id,
        current_rate: (selectedNegotiation.final_daily_rate || selectedNegotiation.requested_daily_rate) * 7,
        requested_rate: data.requestedRate,
        reason: data.reason,
        requester_type: 'owner',
      });
      
      setIsModificationOpen(false);
      modificationForm.reset();
      setSelectedNegotiation(null);
      toast.success('Modification request submitted!', {
        description: 'An admin will review your request.',
      });
    } catch (error) {
      console.error('Error creating modification request:', error);
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openModificationDialog = (negotiation: PriceNegotiation) => {
    setSelectedNegotiation(negotiation);
    const weeklyRate = (negotiation.final_daily_rate || negotiation.requested_daily_rate) * 7;
    modificationForm.setValue('requestedRate', weeklyRate);
    setIsModificationOpen(true);
  };

  const getStatusBadge = (status: string | null, isLocked: boolean | null) => {
    if (isLocked) {
      return <Badge className="bg-purple-500"><Lock className="w-3 h-3 mr-1" /> Locked</Badge>;
    }
    
    const config: Record<string, { variant: 'secondary' | 'default' | 'destructive' | 'outline'; icon: typeof Clock; label: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: 'Pending' },
      counter_offer: { variant: 'default', icon: MessageSquare, label: 'Counter Offer' },
      approved: { variant: 'default', icon: CheckCircle, label: 'Approved' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'Rejected' },
      locked: { variant: 'outline', icon: Lock, label: 'Locked' },
    };
    
    const statusConfig = config[status || 'pending'];
    const Icon = statusConfig.icon;
    
    return (
      <Badge variant={statusConfig.variant}>
        <Icon className="w-3 h-3 mr-1" />
        {statusConfig.label}
      </Badge>
    );
  };

  const getCategoryLabel = (category: string | null) => {
    if (!category) return 'Unknown';
    return PRICE_CEILINGS[category as keyof typeof PRICE_CEILINGS]?.label || category;
  };

  // Convert daily rate to weekly for display
  const toWeekly = (dailyRate: number | null) => dailyRate ? dailyRate * 7 : 0;

  if (isLoading || vehiclesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-12 w-full" />
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Vehicle Rate Negotiation</h2>
          <p className="text-muted-foreground">Request and negotiate weekly rental rates for your vehicles</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={availableVehicles.length === 0}>
                <Plus className="h-4 w-4" />
                New Rate Request
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Request Weekly Rate</DialogTitle>
                <DialogDescription>
                  Submit a rate request for your vehicle. An admin will review and respond.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={requestForm.handleSubmit(handleNewRequest)}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Select Vehicle</Label>
                    <Select
                      value={requestForm.watch('vehicleId')}
                      onValueChange={(v) => requestForm.setValue('vehicleId', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVehicles.length === 0 ? (
                          <SelectItem value="" disabled>No available vehicles</SelectItem>
                        ) : (
                          availableVehicles.map(vehicle => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                              <span className="flex items-center gap-2">
                                <Car className="h-4 w-4" />
                                {vehicle.year} {vehicle.make} {vehicle.model}
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {requestForm.formState.errors.vehicleId && (
                      <p className="text-xs text-destructive">{requestForm.formState.errors.vehicleId.message}</p>
                    )}
                  </div>

                  {selectedVehicle && categoryInfo && (
                    <Alert>
                      <Car className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{categoryInfo.label}</strong> category ({selectedVehicle.year})
                        <br />
                        Maximum weekly rate: {currencySymbol}{categoryInfo.ceiling}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="rate">Requested Weekly Rate ({currency})</Label>
                    <div className="relative">
                      <CurrencyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="rate"
                        type="number"
                        className="pl-9"
                        placeholder={categoryInfo ? `Up to ${categoryInfo.ceiling}` : '0'}
                        max={categoryInfo?.ceiling}
                        {...requestForm.register('requestedWeeklyRate', { valueAsNumber: true })}
                      />
                    </div>
                    {requestForm.formState.errors.requestedWeeklyRate && (
                      <p className="text-xs text-destructive">{requestForm.formState.errors.requestedWeeklyRate.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message (Optional)</Label>
                    <Textarea
                      id="message"
                      placeholder="Describe vehicle condition, features, or any relevant information..."
                      {...requestForm.register('ownerMessage')}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsNewRequestOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Price Tiers Info */}
      <Alert>
        <CurrencyIcon className="h-4 w-4" />
        <AlertDescription>
          <strong>Weekly Rate Ceilings by Category:</strong> Smart Start{rangeSuffix('budget')}: {currencySymbol}250 | Earnings Optimizer{rangeSuffix('standard')}: {currencySymbol}300 | Top Earner{rangeSuffix('premium')}: {currencySymbol}350
        </AlertDescription>
      </Alert>

      {vehicles.length === 0 && (
        <Alert>
          <Car className="h-4 w-4" />
          <AlertDescription>
            You don't have any vehicles registered yet. Add a vehicle first to request rates.
          </AlertDescription>
        </Alert>
      )}

      {/* Negotiations List */}
      <div className="space-y-4">
        {negotiations.length === 0 ? (
          <Card className="p-8 text-center">
            <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Rate Negotiations Yet</h3>
            <p className="text-muted-foreground mb-4">Submit a rate request for your vehicle to get started</p>
            <Button onClick={() => setIsNewRequestOpen(true)} disabled={availableVehicles.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              New Rate Request
            </Button>
          </Card>
        ) : (
          negotiations.map((negotiation) => (
            <Card key={negotiation.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Car className="h-5 w-5" />
                      {negotiation.vehicle_year} {negotiation.vehicle_make} {negotiation.vehicle_model}
                    </CardTitle>
                    <CardDescription>
                      {getCategoryLabel(negotiation.vehicle_category)} • Submitted {new Date(negotiation.created_at || '').toLocaleDateString()}
                    </CardDescription>
                  </div>
                  {getStatusBadge(negotiation.status, negotiation.is_locked)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Your Request</p>
                    <p className="text-lg font-semibold">
                      {currencySymbol}{toWeekly(negotiation.requested_daily_rate)}/week
                    </p>
                  </div>
                  {negotiation.admin_counter_offer && (
                    <div>
                      <p className="text-muted-foreground">Counter Offer</p>
                      <p className="text-lg font-semibold text-primary">
                        {currencySymbol}{toWeekly(negotiation.admin_counter_offer)}/week
                      </p>
                    </div>
                  )}
                  {negotiation.final_daily_rate && (
                    <div>
                      <p className="text-muted-foreground">Final Rate</p>
                      <p className="text-lg font-semibold text-green-600">
                        {currencySymbol}{toWeekly(negotiation.final_daily_rate)}/week
                      </p>
                    </div>
                  )}
                </div>

                {negotiation.driver_message && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Your Message</p>
                    <p className="text-sm">{negotiation.driver_message}</p>
                  </div>
                )}

                {negotiation.admin_response && (
                  <div className="p-3 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                    <p className="text-xs text-muted-foreground mb-1">Admin Response</p>
                    <p className="text-sm">{negotiation.admin_response}</p>
                  </div>
                )}

                {negotiation.rejection_reason && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Rejected:</strong> {negotiation.rejection_reason}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  {negotiation.status === 'counter_offer' && negotiation.admin_counter_offer && (
                    <>
                      <Button 
                        onClick={() => handleAcceptCounterOffer(negotiation)}
                        disabled={isSubmitting}
                        className="gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Accept {currencySymbol}{toWeekly(negotiation.admin_counter_offer)}/week
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setIsNewRequestOpen(true)}
                      >
                        Submit New Request
                      </Button>
                    </>
                  )}

                  {negotiation.is_locked && (
                    <Button 
                      variant="outline" 
                      onClick={() => openModificationDialog(negotiation)}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Request Rate Modification
                    </Button>
                  )}

                  {negotiation.status === 'rejected' && (
                    <Button 
                      onClick={() => setIsNewRequestOpen(true)}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Submit New Request
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modification Request Dialog */}
      <Dialog open={isModificationOpen} onOpenChange={setIsModificationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Rate Modification</DialogTitle>
            <DialogDescription>
              Your current rate is locked. Submit a modification request for admin review.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={modificationForm.handleSubmit(handleModificationRequest)}>
            <div className="space-y-4 py-4">
              {selectedNegotiation && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong>Current Rate:</strong> {currencySymbol}{toWeekly(selectedNegotiation.final_daily_rate || selectedNegotiation.requested_daily_rate)}/week
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedNegotiation.vehicle_year} {selectedNegotiation.vehicle_make} {selectedNegotiation.vehicle_model}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="newRate">Requested New Weekly Rate ({currency})</Label>
                <div className="relative">
                  <CurrencyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newRate"
                    type="number"
                    className="pl-9"
                    {...modificationForm.register('requestedRate', { valueAsNumber: true })}
                  />
                </div>
                {modificationForm.formState.errors.requestedRate && (
                  <p className="text-xs text-destructive">{modificationForm.formState.errors.requestedRate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Modification</Label>
                <Textarea
                  id="reason"
                  placeholder="Explain why you're requesting this rate change..."
                  {...modificationForm.register('reason')}
                />
                {modificationForm.formState.errors.reason && (
                  <p className="text-xs text-destructive">{modificationForm.formState.errors.reason.message}</p>
                )}
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Only admins can approve rate modifications for locked prices.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModificationOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
