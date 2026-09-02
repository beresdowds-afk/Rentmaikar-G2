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
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useRegion } from '@/contexts/RegionContext';
import { useCategoryYearSpecs } from '@/hooks/useCategoryYearSpecs';
import { usePriceNegotiations, type PriceNegotiation } from '@/hooks/usePriceNegotiations';

const requestSchema = z.object({
  vehicleCategory: z.enum(['budget', 'standard', 'premium']),
  vehicleMake: z.string().min(2, 'Vehicle make is required'),
  vehicleModel: z.string().min(1, 'Vehicle model is required'),
  vehicleYear: z.number().min(2015).max(2025),
  requestedDailyRate: z.number().min(1, 'Daily rate must be positive'),
  driverMessage: z.string().max(500).optional(),
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

export const DriverPriceNegotiation = () => {
  const { country } = useRegion();
  const currency = country === 'Nigeria' ? 'NGN' : 'USD';
  const currencySymbol = currency === 'NGN' ? '₦' : '$';
  const { getForCategory: getSpec, formatRange, visible: yearsVisible } = useCategoryYearSpecs(country);
  const rangeFor = (key: 'budget' | 'standard' | 'premium') => {
    if (!yearsVisible) return '';
    const spec = getSpec(key);
    return spec ? formatRange(spec) : `${PRICE_CEILINGS[key].min}-${PRICE_CEILINGS[key].max}`;
  };
  const rangeSuffix = (key: 'budget' | 'standard' | 'premium') => {
    const r = rangeFor(key);
    return r ? ` (${r})` : '';
  };
  
  const { 
    negotiations, 
    isLoading, 
    createNegotiation, 
    acceptCounterOffer,
    createModificationRequest,
    refetch 
  } = usePriceNegotiations('driver');
  
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [isModificationOpen, setIsModificationOpen] = useState(false);
  const [selectedNegotiation, setSelectedNegotiation] = useState<PriceNegotiation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestForm = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      vehicleCategory: 'standard',
      vehicleMake: '',
      vehicleModel: '',
      vehicleYear: 2022,
      requestedDailyRate: 0,
      driverMessage: '',
    },
  });

  const modificationForm = useForm<ModificationRequestData>({
    resolver: zodResolver(modificationRequestSchema),
    defaultValues: {
      requestedRate: 0,
      reason: '',
    },
  });

  const handleNewRequest = async (data: RequestFormData) => {
    setIsSubmitting(true);
    
    try {
      await createNegotiation({
        vehicle_make: data.vehicleMake,
        vehicle_model: data.vehicleModel,
        vehicle_year: data.vehicleYear,
        vehicle_category: data.vehicleCategory,
        requested_daily_rate: data.requestedDailyRate,
        driver_message: data.driverMessage,
        currency,
      });
      
      setIsNewRequestOpen(false);
      requestForm.reset();
      toast.success('Price request submitted!', {
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
        description: 'Your daily rate has been confirmed.',
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
        current_rate: selectedNegotiation.final_daily_rate || selectedNegotiation.requested_daily_rate,
        requested_rate: data.requestedRate,
        reason: data.reason,
        requester_type: 'driver',
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
    modificationForm.setValue('requestedRate', negotiation.final_daily_rate || negotiation.requested_daily_rate);
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

  const selectedCategory = requestForm.watch('vehicleCategory');
  const categoryInfo = PRICE_CEILINGS[selectedCategory];

  const getCategoryLabel = (category: string | null) => {
    if (!category) return 'Unknown';
    return PRICE_CEILINGS[category as keyof typeof PRICE_CEILINGS]?.label || category;
  };

  if (isLoading) {
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
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Price Negotiation</h2>
          <p className="text-muted-foreground">Request and negotiate daily rental rates with administrators</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Price Request
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Request Daily Rate</DialogTitle>
                <DialogDescription>
                  Submit a price request for your rental. An admin will review and respond.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={requestForm.handleSubmit(handleNewRequest)}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Vehicle Category</Label>
                    <Select
                      value={requestForm.watch('vehicleCategory')}
                      onValueChange={(v: 'budget' | 'standard' | 'premium') => requestForm.setValue('vehicleCategory', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="budget">Budget{rangeSuffix('budget')} - Up to {currencySymbol}250/week</SelectItem>
                        <SelectItem value="standard">Standard{rangeSuffix('standard')} - Up to {currencySymbol}300/week</SelectItem>
                        <SelectItem value="premium">Premium{rangeSuffix('premium')} - Up to {currencySymbol}350/week</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Category: {categoryInfo.label} | Max weekly: {currencySymbol}{categoryInfo.ceiling}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="make">Vehicle Make</Label>
                      <Input
                        id="make"
                        placeholder="Toyota"
                        {...requestForm.register('vehicleMake')}
                      />
                      {requestForm.formState.errors.vehicleMake && (
                        <p className="text-xs text-destructive">{requestForm.formState.errors.vehicleMake.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="model">Vehicle Model</Label>
                      <Input
                        id="model"
                        placeholder="Camry"
                        {...requestForm.register('vehicleModel')}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="year">Year</Label>
                      <Input
                        id="year"
                        type="number"
                        min={categoryInfo.min}
                        max={categoryInfo.max}
                        {...requestForm.register('vehicleYear', { valueAsNumber: true })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rate">Daily Rate ({currency})</Label>
                      <div className="relative">
                        <CurrencyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="rate"
                          type="number"
                          className="pl-9"
                          placeholder="50"
                          {...requestForm.register('requestedDailyRate', { valueAsNumber: true })}
                        />
                      </div>
                      {requestForm.formState.errors.requestedDailyRate && (
                        <p className="text-xs text-destructive">{requestForm.formState.errors.requestedDailyRate.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message (Optional)</Label>
                    <Textarea
                      id="message"
                      placeholder="Any additional information for the admin..."
                      {...requestForm.register('driverMessage')}
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
          <strong>Weekly Price Ceilings:</strong> Budget{rangeSuffix('budget')}: {currencySymbol}250 | Standard{rangeSuffix('standard')}: {currencySymbol}300 | Premium{rangeSuffix('premium')}: {currencySymbol}350
        </AlertDescription>
      </Alert>

      {/* Negotiations List */}
      <div className="space-y-4">
        {negotiations.length === 0 ? (
          <Card className="p-8 text-center">
            <CurrencyIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Negotiations Yet</h3>
            <p className="text-muted-foreground mb-4">Submit your first price request to get started</p>
            <Button onClick={() => setIsNewRequestOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Price Request
            </Button>
          </Card>
        ) : (
          negotiations.map((negotiation) => (
            <Card key={negotiation.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
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
                      {currencySymbol}{negotiation.requested_daily_rate}/day
                    </p>
                  </div>
                  {negotiation.admin_counter_offer && (
                    <div>
                      <p className="text-muted-foreground">Counter Offer</p>
                      <p className="text-lg font-semibold text-primary">
                        {currencySymbol}{negotiation.admin_counter_offer}/day
                      </p>
                    </div>
                  )}
                  {negotiation.final_daily_rate && (
                    <div>
                      <p className="text-muted-foreground">Final Rate</p>
                      <p className="text-lg font-semibold text-green-600">
                        {currencySymbol}{negotiation.final_daily_rate}/day
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
                        Accept {currencySymbol}{negotiation.admin_counter_offer}/day
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
                    <strong>Current Rate:</strong> {currencySymbol}{selectedNegotiation.final_daily_rate || selectedNegotiation.requested_daily_rate}/day
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedNegotiation.vehicle_year} {selectedNegotiation.vehicle_make} {selectedNegotiation.vehicle_model}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="newRate">Requested New Rate ({currency})</Label>
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
