import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useRentToOwn, type CreateRTOListingData } from '@/hooks/useRentToOwn';
import { useRegion } from '@/contexts/RegionContext';
import { formatCurrency } from '@/lib/payment-config';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Plus,
  Home,
  Car,
  Check,
  Loader2,
  Send,
  RefreshCw,
  Info,
  Globe,
} from 'lucide-react';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
}

export function OwnerRentToOwnListing() {
  const { currency, country } = useRegion();
  const { user } = useAuth();
  const {
    settings,
    listings,
    loading,
    fetchListings,
    createListing,
    acceptCounterOffer,
  } = useRentToOwn();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<'USA' | 'Nigeria' | (string & {})>(country === 'Nigeria' ? 'Nigeria' : 'USA');
  const [totalPrice, setTotalPrice] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [durationMonths, setDurationMonths] = useState('24');
  const [allowBuyout, setAllowBuyout] = useState(true);
  const [allowConversion, setAllowConversion] = useState(false);
  const [ownerMessage, setOwnerMessage] = useState('');

  useEffect(() => {
    fetchListings('owner');
    fetchVehicles();
  }, [fetchListings]);

  const fetchVehicles = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('vehicles')
      .select('id, make, model, year, license_plate')
      .eq('owner_id', user.id)
      .eq('status', 'active');

    if (data) {
      setVehicles(data);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending Review' },
      counter_offer: { variant: 'outline', label: 'Counter Offer' },
      approved: { variant: 'default', label: 'Approved' },
      active: { variant: 'default', label: 'Active - Listed' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      completed: { variant: 'secondary', label: 'Completed' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
    };
    const config = variants[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleSubmit = async () => {
    if (!selectedVehicleId || !totalPrice || !downPayment || !monthlyPayment) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    const data: CreateRTOListingData = {
      vehicle_id: selectedVehicleId,
      total_price: parseFloat(totalPrice),
      down_payment: parseFloat(downPayment),
      monthly_payment: parseFloat(monthlyPayment),
      duration_months: parseInt(durationMonths),
      currency: selectedCountry === 'Nigeria' ? 'NGN' : 'USD',
      allow_buyout: allowBuyout,
      allow_conversion_to_rental: allowConversion,
      owner_message: ownerMessage || undefined,
    };

    const result = await createListing(data);
    
    setIsSubmitting(false);
    
    if (result) {
      setIsCreateOpen(false);
      resetForm();
      await fetchListings('owner');
    }
  };

  const handleAcceptCounterOffer = async (listingId: string) => {
    await acceptCounterOffer(listingId);
    await fetchListings('owner');
  };

  const resetForm = () => {
    setSelectedVehicleId('');
    setSelectedCountry(country === 'Nigeria' ? 'Nigeria' : 'USA');
    setTotalPrice('');
    setDownPayment('');
    setMonthlyPayment('');
    setDurationMonths('24');
    setAllowBuyout(true);
    setAllowConversion(false);
    setOwnerMessage('');
  };

  // Calculate monthly payment suggestion
  const calculateSuggestedMonthly = () => {
    const total = parseFloat(totalPrice) || 0;
    const down = parseFloat(downPayment) || 0;
    const months = parseInt(durationMonths) || 24;
    
    if (total > down && months > 0) {
      return ((total - down) / months).toFixed(2);
    }
    return '';
  };

  if (!settings?.feature_enabled) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">Rent to Own Not Available</h3>
          <p className="text-muted-foreground">
            The Rent to Own feature is currently not enabled. Please check back later or contact support.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Rent to Own Listings
              </CardTitle>
              <CardDescription>
                List your vehicles for rent-to-own arrangements
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => fetchListings('owner')}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Listing
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Rent to Own Listing</DialogTitle>
                    <DialogDescription>
                      Set up a rent-to-own arrangement for one of your vehicles. Terms are subject to admin approval.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    {/* Vehicle Selection */}
                    <div className="space-y-2">
                      <Label>Select Vehicle *</Label>
                      <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a vehicle" />
                        </SelectTrigger>
                        <SelectContent>
                          {vehicles.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                              {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {vehicles.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No active vehicles found. Add a vehicle first.
                        </p>
                      )}
                    </div>

                    {/* Vehicle Location Country */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Vehicle Location (Country) *
                      </Label>
                      <Select 
                        value={selectedCountry} 
                        onValueChange={(value) => setSelectedCountry(value as 'USA' | 'Nigeria' | (string & {}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USA">
                            <span className="flex items-center gap-2">
                              <span>🇺🇸</span> United States (USD)
                            </span>
                          </SelectItem>
                          <SelectItem value="Nigeria">
                            <span className="flex items-center gap-2">
                              <span>🇳🇬</span> Nigeria (NGN)
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        This determines which region's drivers can see your listing
                      </p>
                    </div>

                    {/* Financial Terms */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Total Price ({currency}) *</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 15000"
                          value={totalPrice}
                          onChange={(e) => setTotalPrice(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Down Payment ({currency}) *</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 3000"
                          value={downPayment}
                          onChange={(e) => setDownPayment(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Duration (months) *</Label>
                        <Select value={durationMonths} onValueChange={setDurationMonths}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="12">12 months</SelectItem>
                            <SelectItem value="18">18 months</SelectItem>
                            <SelectItem value="24">24 months</SelectItem>
                            <SelectItem value="36">36 months</SelectItem>
                            <SelectItem value="48">48 months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Monthly Payment ({currency}) *</Label>
                        <Input
                          type="number"
                          placeholder={calculateSuggestedMonthly() || 'e.g. 500'}
                          value={monthlyPayment}
                          onChange={(e) => setMonthlyPayment(e.target.value)}
                        />
                        {calculateSuggestedMonthly() && !monthlyPayment && (
                          <p className="text-xs text-muted-foreground">
                            Suggested: {formatCurrency(parseFloat(calculateSuggestedMonthly()), currency)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Exit Options */}
                    <Separator />
                    <div className="space-y-4">
                      <h4 className="font-medium text-sm">Early Exit Options</h4>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Buyout</Label>
                          <p className="text-xs text-muted-foreground">
                            Driver can pay remaining balance anytime
                          </p>
                        </div>
                        <Switch checked={allowBuyout} onCheckedChange={setAllowBuyout} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Conversion to Rental</Label>
                          <p className="text-xs text-muted-foreground">
                            Driver can switch to regular rental (forfeits ownership progress)
                          </p>
                        </div>
                        <Switch checked={allowConversion} onCheckedChange={setAllowConversion} />
                      </div>
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                      <Label>Message to Admin (optional)</Label>
                      <Textarea
                        placeholder="Any additional information about this listing..."
                        value={ownerMessage}
                        onChange={(e) => setOwnerMessage(e.target.value)}
                      />
                    </div>

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Your listing will be reviewed by an admin. They may approve, reject, or propose different terms.
                      </AlertDescription>
                    </Alert>

                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !selectedVehicleId}
                      className="w-full"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Submit for Approval
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-8">
              <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Rent to Own Listings</h3>
              <p className="text-muted-foreground mb-4">
                Create your first rent-to-own listing to get started.
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Listing
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Total Price</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell>
                      <div className="font-medium">
                        {listing.vehicle?.year} {listing.vehicle?.make} {listing.vehicle?.model}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {listing.vehicle?.license_plate}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatCurrency(listing.total_price, listing.currency)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Down: {formatCurrency(listing.down_payment, listing.currency)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatCurrency(listing.monthly_payment, listing.currency)}
                    </TableCell>
                    <TableCell>
                      {listing.duration_months} months
                    </TableCell>
                    <TableCell>{getStatusBadge(listing.status)}</TableCell>
                    <TableCell>
                      {listing.status === 'counter_offer' && (
                        <div className="space-y-2">
                          <div className="text-xs bg-muted p-2 rounded">
                            <p className="font-medium">Counter Offer:</p>
                            <p>Total: {formatCurrency(listing.admin_counter_total_price || 0, listing.currency)}</p>
                            <p>Monthly: {formatCurrency(listing.admin_counter_monthly_payment || 0, listing.currency)}</p>
                            <p>Duration: {listing.admin_counter_duration_months} months</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAcceptCounterOffer(listing.id)}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Accept
                            </Button>
                          </div>
                        </div>
                      )}
                      {listing.admin_response && listing.status !== 'counter_offer' && (
                        <p className="text-xs text-muted-foreground">
                          {listing.admin_response}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default OwnerRentToOwnListing;
