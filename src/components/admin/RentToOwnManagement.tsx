import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SignaturePad from '@/components/legal/SignaturePad';
import { useRentToOwn, type RTOListing, type RTOAgreement } from '@/hooks/useRentToOwn';
import { formatCurrency } from '@/lib/payment-config';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Power,
  PowerOff,
  Search,
  Eye,
  Check,
  X,
  Send,
  FileText,
  Car,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Home,
} from 'lucide-react';

interface Driver {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
}

export function RentToOwnManagement() {
  const {
    settings,
    listings,
    agreements,
    loading,
    toggleFeature,
    fetchListings,
    fetchAgreements,
    sendCounterOffer,
    approveListing,
    rejectListing,
    toggleListingAvailability,
    createAgreement,
  } = useRentToOwn();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedListing, setSelectedListing] = useState<RTOListing | null>(null);
  const [selectedAgreement, setSelectedAgreement] = useState<RTOAgreement | null>(null);
  const [isCounterOfferOpen, setIsCounterOfferOpen] = useState(false);
  const [isCreateAgreementOpen, setIsCreateAgreementOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Counter offer form state
  const [counterTotalPrice, setCounterTotalPrice] = useState('');
  const [counterDownPayment, setCounterDownPayment] = useState('');
  const [counterMonthlyPayment, setCounterMonthlyPayment] = useState('');
  const [counterDurationMonths, setCounterDurationMonths] = useState('');
  const [counterResponse, setCounterResponse] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchListings('admin');
    fetchAgreements('admin');
    fetchDrivers();
  }, [fetchListings, fetchAgreements]);

  const fetchDrivers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email')
      .order('full_name');
    
    if (data) {
      setDrivers(data as Driver[]);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending Review' },
      counter_offer: { variant: 'outline', label: 'Counter Offer Sent' },
      approved: { variant: 'default', label: 'Approved' },
      active: { variant: 'default', label: 'Active' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      completed: { variant: 'secondary', label: 'Completed' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
      pending_signatures: { variant: 'outline', label: 'Awaiting Signatures' },
      defaulted: { variant: 'destructive', label: 'Defaulted' },
      bought_out: { variant: 'default', label: 'Bought Out' },
      converted_to_rental: { variant: 'secondary', label: 'Converted to Rental' },
    };
    const config = variants[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleSendCounterOffer = async () => {
    if (!selectedListing) return;

    setIsSubmitting(true);
    await sendCounterOffer(
      selectedListing.id,
      {
        total_price: parseFloat(counterTotalPrice),
        down_payment: parseFloat(counterDownPayment),
        monthly_payment: parseFloat(counterMonthlyPayment),
        duration_months: parseInt(counterDurationMonths),
      },
      counterResponse
    );
    setIsSubmitting(false);
    setIsCounterOfferOpen(false);
    resetCounterOfferForm();
  };

  const handleApprove = async (listing: RTOListing) => {
    await approveListing(listing.id);
  };

  const handleReject = async (listing: RTOListing) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    await rejectListing(listing.id, rejectReason);
    setRejectReason('');
  };

  const handleCreateAgreement = async () => {
    if (!selectedListing || !selectedDriverId || !adminSignature) {
      toast.error('Please select a driver and provide your signature');
      return;
    }

    setIsSubmitting(true);
    const driver = drivers.find(d => d.user_id === selectedDriverId);
    if (!driver) {
      toast.error('Driver not found');
      setIsSubmitting(false);
      return;
    }

    await createAgreement(selectedListing.id, driver.user_id, adminSignature);
    setIsSubmitting(false);
    setIsCreateAgreementOpen(false);
    setSelectedDriverId('');
    setAdminSignature(null);
    await fetchListings('admin');
    await fetchAgreements('admin');
  };

  const resetCounterOfferForm = () => {
    setCounterTotalPrice('');
    setCounterDownPayment('');
    setCounterMonthlyPayment('');
    setCounterDurationMonths('');
    setCounterResponse('');
  };

  const openCounterOffer = (listing: RTOListing) => {
    setSelectedListing(listing);
    setCounterTotalPrice(listing.total_price.toString());
    setCounterDownPayment(listing.down_payment.toString());
    setCounterMonthlyPayment(listing.monthly_payment.toString());
    setCounterDurationMonths(listing.duration_months.toString());
    setIsCounterOfferOpen(true);
  };

  const filteredListings = listings.filter(listing => {
    const matchesSearch = 
      listing.vehicle?.make?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.vehicle?.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.owner_profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || listing.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const filteredAgreements = agreements.filter(agreement => {
    const matchesSearch = 
      agreement.vehicle?.make?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agreement.vehicle?.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agreement.driver_profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agreement.owner_profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading Rent to Own data...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feature Toggle Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Rent to Own Management
              </CardTitle>
              <CardDescription>
                Manage rent-to-own vehicle listings, negotiations, and agreements
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {settings?.feature_enabled ? (
                  <Power className="h-5 w-5 text-green-500" />
                ) : (
                  <PowerOff className="h-5 w-5 text-muted-foreground" />
                )}
                <Label htmlFor="rto-toggle">Feature {settings?.feature_enabled ? 'Enabled' : 'Disabled'}</Label>
              </div>
              <Switch
                id="rto-toggle"
                checked={settings?.feature_enabled || false}
                onCheckedChange={toggleFeature}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {!settings?.feature_enabled && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The Rent to Own feature is currently disabled. Enable it above to allow owners to create listings and drivers to search for rent-to-own vehicles.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Tabs defaultValue="listings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="listings" className="flex items-center gap-1">
            <Car className="h-4 w-4" />
            Listings ({listings.length})
          </TabsTrigger>
          <TabsTrigger value="agreements" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Agreements ({agreements.length})
          </TabsTrigger>
        </TabsList>

        {/* Search and Filters */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vehicles, owners, drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="counter_offer">Counter Offer</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => { fetchListings('admin'); fetchAgreements('admin'); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Listings Tab */}
        <TabsContent value="listings">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Total Price</TableHead>
                    <TableHead>Monthly</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredListings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No rent-to-own listings found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredListings.map((listing) => (
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
                          <div>{listing.owner_profile?.full_name || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">
                            {listing.owner_profile?.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {formatCurrency(listing.final_total_price || listing.total_price, listing.currency)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Down: {formatCurrency(listing.final_down_payment || listing.down_payment, listing.currency)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(listing.final_monthly_payment || listing.monthly_payment, listing.currency)}
                        </TableCell>
                        <TableCell>
                          {listing.final_duration_months || listing.duration_months} months
                        </TableCell>
                        <TableCell>{getStatusBadge(listing.status)}</TableCell>
                        <TableCell>
                          <Switch
                            checked={listing.is_available}
                            onCheckedChange={(checked) => toggleListingAvailability(listing.id, checked)}
                            disabled={listing.status !== 'active'}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedListing(listing)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Listing Details</DialogTitle>
                                </DialogHeader>
                                {selectedListing && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <h4 className="font-medium mb-2">Vehicle</h4>
                                        <p>{selectedListing.vehicle?.year} {selectedListing.vehicle?.make} {selectedListing.vehicle?.model}</p>
                                        <p className="text-sm text-muted-foreground">{selectedListing.vehicle?.license_plate}</p>
                                      </div>
                                      <div>
                                        <h4 className="font-medium mb-2">Owner</h4>
                                        <p>{selectedListing.owner_profile?.full_name}</p>
                                        <p className="text-sm text-muted-foreground">{selectedListing.owner_profile?.email}</p>
                                      </div>
                                    </div>
                                    <Separator />
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <h4 className="font-medium mb-2">Financial Terms</h4>
                                        <div className="space-y-1 text-sm">
                                          <p>Total: {formatCurrency(selectedListing.total_price, selectedListing.currency)}</p>
                                          <p>Down Payment: {formatCurrency(selectedListing.down_payment, selectedListing.currency)}</p>
                                          <p>Monthly: {formatCurrency(selectedListing.monthly_payment, selectedListing.currency)}</p>
                                          <p>Duration: {selectedListing.duration_months} months</p>
                                        </div>
                                      </div>
                                      <div>
                                        <h4 className="font-medium mb-2">Exit Options</h4>
                                        <div className="space-y-1 text-sm">
                                          <p>Buyout: {selectedListing.allow_buyout ? 'Yes' : 'No'}</p>
                                          <p>Convert to Rental: {selectedListing.allow_conversion_to_rental ? 'Yes' : 'No'}</p>
                                        </div>
                                      </div>
                                    </div>
                                    {selectedListing.owner_message && (
                                      <>
                                        <Separator />
                                        <div>
                                          <h4 className="font-medium mb-2">Owner Message</h4>
                                          <p className="text-sm">{selectedListing.owner_message}</p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>

                            {listing.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-green-600"
                                  onClick={() => handleApprove(listing)}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openCounterOffer(listing)}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive">
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Reject Listing</DialogTitle>
                                      <DialogDescription>
                                        Provide a reason for rejecting this rent-to-own listing.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <Textarea
                                      placeholder="Rejection reason..."
                                      value={rejectReason}
                                      onChange={(e) => setRejectReason(e.target.value)}
                                    />
                                    <Button
                                      variant="destructive"
                                      onClick={() => handleReject(listing)}
                                    >
                                      Reject Listing
                                    </Button>
                                  </DialogContent>
                                </Dialog>
                              </>
                            )}

                            {listing.status === 'active' && listing.is_available && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedListing(listing);
                                  setIsCreateAgreementOpen(true);
                                }}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Create Agreement
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agreements Tab */}
        <TabsContent value="agreements">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Monthly Payment</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgreements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No rent-to-own agreements found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAgreements.map((agreement) => (
                      <TableRow key={agreement.id}>
                        <TableCell>
                          <div className="font-medium">
                            {agreement.vehicle?.year} {agreement.vehicle?.make} {agreement.vehicle?.model}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{agreement.driver_profile?.full_name || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">
                            {agreement.driver_profile?.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{agreement.owner_profile?.full_name || 'Unknown'}</div>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(agreement.monthly_payment, agreement.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {agreement.payments_made} / {agreement.duration_months} payments
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(agreement.total_amount_paid, agreement.currency)} paid
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(agreement.status)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedAgreement(agreement)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Counter Offer Dialog */}
      <Dialog open={isCounterOfferOpen} onOpenChange={setIsCounterOfferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Counter Offer</DialogTitle>
            <DialogDescription>
              Propose different terms for this rent-to-own listing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Price ({selectedListing?.currency})</Label>
                <Input
                  type="number"
                  value={counterTotalPrice}
                  onChange={(e) => setCounterTotalPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Down Payment ({selectedListing?.currency})</Label>
                <Input
                  type="number"
                  value={counterDownPayment}
                  onChange={(e) => setCounterDownPayment(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Monthly Payment ({selectedListing?.currency})</Label>
                <Input
                  type="number"
                  value={counterMonthlyPayment}
                  onChange={(e) => setCounterMonthlyPayment(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (months)</Label>
                <Input
                  type="number"
                  value={counterDurationMonths}
                  onChange={(e) => setCounterDurationMonths(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Response Message</Label>
              <Textarea
                placeholder="Explain the counter offer..."
                value={counterResponse}
                onChange={(e) => setCounterResponse(e.target.value)}
              />
            </div>
            <Button onClick={handleSendCounterOffer} disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Counter Offer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Agreement Dialog */}
      <Dialog open={isCreateAgreementOpen} onOpenChange={setIsCreateAgreementOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Rent to Own Agreement</DialogTitle>
            <DialogDescription>
              Select a driver and sign to create the rent-to-own agreement for{' '}
              {selectedListing?.vehicle?.year} {selectedListing?.vehicle?.make} {selectedListing?.vehicle?.model}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Driver</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.user_id} value={driver.user_id}>
                      {driver.full_name} ({driver.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h4 className="font-medium">Agreement Terms</h4>
              <div className="text-sm space-y-1">
                <p>Total Price: {formatCurrency(selectedListing?.final_total_price || selectedListing?.total_price || 0, selectedListing?.currency || 'USD')}</p>
                <p>Down Payment: {formatCurrency(selectedListing?.final_down_payment || selectedListing?.down_payment || 0, selectedListing?.currency || 'USD')}</p>
                <p>Monthly Payment: {formatCurrency(selectedListing?.final_monthly_payment || selectedListing?.monthly_payment || 0, selectedListing?.currency || 'USD')}</p>
                <p>Duration: {selectedListing?.final_duration_months || selectedListing?.duration_months} months</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Admin Witness Signature</Label>
              <SignaturePad onSignatureChange={setAdminSignature} />
            </div>

            <Button
              onClick={handleCreateAgreement}
              disabled={isSubmitting || !selectedDriverId || !adminSignature}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Create & Witness Agreement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RentToOwnManagement;
