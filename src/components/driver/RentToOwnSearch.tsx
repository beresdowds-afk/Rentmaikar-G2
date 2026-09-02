import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useRentToOwn } from '@/hooks/useRentToOwn';
import { useRegion } from '@/contexts/RegionContext';
import { formatCurrency } from '@/lib/payment-config';
import {
  Search,
  Home,
  Car,
  Wallet,
  Calendar,
  Check,
  X,
  Info,
  Loader2,
  RefreshCw,
  Shield,
} from 'lucide-react';

export function RentToOwnSearch() {
  const { currencySymbol, currency } = useRegion();
  const { settings, listings, loading, fetchListings } = useRentToOwn();

  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState<string>('all');
  const [durationFilter, setDurationFilter] = useState<string>('all');

  useEffect(() => {
    if (settings?.feature_enabled) {
      // Pass the driver's region currency to filter listings by country
      fetchListings('driver', currency);
    }
  }, [settings?.feature_enabled, fetchListings, currency]);

  const filteredListings = listings.filter(listing => {
    const matchesSearch = 
      listing.vehicle?.make?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.vehicle?.model?.toLowerCase().includes(searchQuery.toLowerCase());

    const totalPrice = listing.final_total_price || listing.total_price;
    let matchesPrice = true;
    if (priceFilter === 'under10k') matchesPrice = totalPrice < 10000;
    else if (priceFilter === '10k-20k') matchesPrice = totalPrice >= 10000 && totalPrice < 20000;
    else if (priceFilter === '20k-30k') matchesPrice = totalPrice >= 20000 && totalPrice < 30000;
    else if (priceFilter === 'over30k') matchesPrice = totalPrice >= 30000;

    const duration = listing.final_duration_months || listing.duration_months;
    let matchesDuration = true;
    if (durationFilter === '12') matchesDuration = duration === 12;
    else if (durationFilter === '24') matchesDuration = duration === 24;
    else if (durationFilter === '36') matchesDuration = duration === 36;
    else if (durationFilter === '48') matchesDuration = duration === 48;

    return matchesSearch && matchesPrice && matchesDuration;
  });

  if (!settings?.feature_enabled) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">Lease to Own Not Available</h3>
          <p className="text-muted-foreground">
            The Lease to Own feature is currently not enabled. Check back later for available vehicles.
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
                Lease to Own Vehicles
              </CardTitle>
              <CardDescription>
                Browse vehicles available for rent-to-own arrangements
              </CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={() => fetchListings('driver')}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by make or model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={priceFilter} onValueChange={setPriceFilter}>
              <SelectTrigger className="w-full md:w-48">
                <Wallet className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Price Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Prices</SelectItem>
                <SelectItem value="under10k">Under {currencySymbol}10,000</SelectItem>
                <SelectItem value="10k-20k">{currencySymbol}10,000 - {currencySymbol}20,000</SelectItem>
                <SelectItem value="20k-30k">{currencySymbol}20,000 - {currencySymbol}30,000</SelectItem>
                <SelectItem value="over30k">Over {currencySymbol}30,000</SelectItem>
              </SelectContent>
            </Select>
            <Select value={durationFilter} onValueChange={setDurationFilter}>
              <SelectTrigger className="w-full md:w-48">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Durations</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
                <SelectItem value="36">36 months</SelectItem>
                <SelectItem value="48">48 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-12">
              <Car className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-medium mb-2">No Vehicles Available</h3>
              <p className="text-muted-foreground">
                {listings.length === 0 
                  ? 'No lease-to-own vehicles are currently listed. Check back soon!'
                  : 'No vehicles match your search criteria. Try adjusting your filters.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredListings.map((listing) => {
                const totalPrice = listing.final_total_price || listing.total_price;
                const downPayment = listing.final_down_payment || listing.down_payment;
                const monthlyPayment = listing.final_monthly_payment || listing.monthly_payment;
                const durationMonths = listing.final_duration_months || listing.duration_months;

                return (
                  <Card key={listing.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Vehicle Image */}
                    {(listing.vehicle as any)?.photo_urls?.[0] ? (
                      <img
                        src={(listing.vehicle as any).photo_urls[0]}
                        alt={`${listing.vehicle?.year ?? ''} ${listing.vehicle?.make ?? ''} ${listing.vehicle?.model ?? ''}`.trim()}
                        loading="lazy"
                        className="h-40 w-full object-cover"
                      />
                    ) : (
                      <div className="h-40 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        <Car className="h-16 w-16 text-primary/40" />
                      </div>
                    )}


                    <CardContent className="p-4">
                      {/* Vehicle Info */}
                      <div className="mb-3">
                        <h3 className="text-lg font-semibold">
                          {listing.vehicle?.year} {listing.vehicle?.make} {listing.vehicle?.model}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {listing.vehicle?.license_plate}
                        </p>
                      </div>

                      {/* Price Highlights */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Total Price</span>
                          <span className="font-bold text-lg">
                            {formatCurrency(totalPrice, listing.currency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Monthly</span>
                          <span className="font-medium text-primary">
                            {formatCurrency(monthlyPayment, listing.currency)}/mo
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Duration</span>
                          <span className="font-medium">{durationMonths} months</span>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="flex gap-2 mb-4">
                        {listing.allow_buyout && (
                          <Badge variant="outline" className="text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Buyout Option
                          </Badge>
                        )}
                        {listing.allow_conversion_to_rental && (
                          <Badge variant="outline" className="text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Rental Conversion
                          </Badge>
                        )}
                      </div>

                      {/* Action Button */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="w-full">
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>
                              {listing.vehicle?.year} {listing.vehicle?.make} {listing.vehicle?.model}
                            </DialogTitle>
                            <DialogDescription>
                              Lease to Own Details
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-4">
                            {/* Financial Summary */}
                            <div className="bg-primary/5 p-4 rounded-lg space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Total Purchase Price</span>
                                <span className="text-xl font-bold">
                                  {formatCurrency(totalPrice, listing.currency)}
                                </span>
                              </div>
                              <Separator />
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Down Payment</span>
                                <span className="font-medium">
                                  {formatCurrency(downPayment, listing.currency)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Monthly Payment</span>
                                <span className="font-medium text-primary">
                                  {formatCurrency(monthlyPayment, listing.currency)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Payment Duration</span>
                                <span className="font-medium">{durationMonths} months</span>
                              </div>
                              <Separator />
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Total of Payments</span>
                                <span className="font-medium">
                                  {formatCurrency(downPayment + (monthlyPayment * durationMonths), listing.currency)}
                                </span>
                              </div>
                            </div>

                            {/* Options */}
                            <div className="space-y-3">
                              <h4 className="font-medium">Exit Options</h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div className={`p-3 rounded-lg border ${listing.allow_buyout ? 'bg-green-50 border-green-200' : 'bg-muted'}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {listing.allow_buyout ? (
                                      <Check className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <X className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span className="font-medium text-sm">Early Buyout</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Pay remaining balance anytime to complete purchase
                                  </p>
                                </div>
                                <div className={`p-3 rounded-lg border ${listing.allow_conversion_to_rental ? 'bg-blue-50 border-blue-200' : 'bg-muted'}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {listing.allow_conversion_to_rental ? (
                                      <Check className="h-4 w-4 text-blue-600" />
                                    ) : (
                                      <X className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span className="font-medium text-sm">Convert to Rental</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Switch to regular rental (forfeits ownership progress)
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Default Policy Alert */}
                            <Alert>
                              <Shield className="h-4 w-4" />
                              <AlertDescription className="text-sm">
                                <strong>Default Policy:</strong> If you default on payments, the vehicle will be recovered. All previous payments will be forfeited as rental charges.
                              </AlertDescription>
                            </Alert>

                            {/* Interest Notice */}
                            <Alert variant="default" className="bg-muted">
                              <Info className="h-4 w-4" />
                              <AlertDescription>
                                To express interest in this vehicle, please contact support. An admin will initiate the agreement process.
                              </AlertDescription>
                            </Alert>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default RentToOwnSearch;
