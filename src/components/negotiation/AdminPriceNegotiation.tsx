import { useState } from 'react';
import { CurrencyIcon } from '@/components/ui/Currencyicon';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 

  Clock, 
  CheckCircle, 
  XCircle, 
  Lock, 
  MessageSquare,
  Loader2,
  Eye,
  Send,
  AlertTriangle,
  Users,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { usePriceNegotiations, type PriceNegotiation, type ModificationRequest } from '@/hooks/usePriceNegotiations';
import { ProvisionRentalDialog } from './ProvisionRentalDialog';

const PRICE_CEILINGS = {
  budget: { ceiling: 250, label: 'Smart Start' },
  standard: { ceiling: 300, label: 'Earnings Optimizer' },
  premium: { ceiling: 350, label: 'Top Earner' },
};

export const AdminPriceNegotiation = () => {
  const {
    negotiations,
    modificationRequests,
    isLoading,
    approveNegotiation,
    sendCounterOffer,
    rejectNegotiation,
    processModificationRequest,
    refetch,
  } = usePriceNegotiations('admin');

  const [selectedNegotiation, setSelectedNegotiation] = useState<PriceNegotiation | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [counterOffer, setCounterOffer] = useState<string>('');
  const [adminResponse, setAdminResponse] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [provisionTarget, setProvisionTarget] = useState<PriceNegotiation | null>(null);

  const pendingNegotiations = negotiations.filter(n => n.status === 'pending');
  const counterOfferNegotiations = negotiations.filter(n => n.status === 'counter_offer');
  const lockedNegotiations = negotiations.filter(n => n.is_locked);
  const pendingModifications = modificationRequests.filter(m => m.status === 'pending');

  const openReview = (negotiation: PriceNegotiation) => {
    setSelectedNegotiation(negotiation);
    setCounterOffer(negotiation.requested_daily_rate.toString());
    setAdminResponse('');
    setRejectionReason('');
    setIsReviewOpen(true);
  };

  const handleApprove = async (withLock: boolean = false) => {
    if (!selectedNegotiation) return;
    setIsSubmitting(true);
    
    try {
      const finalRate = parseFloat(counterOffer) || selectedNegotiation.requested_daily_rate;
      await approveNegotiation(selectedNegotiation.id, finalRate, adminResponse, withLock);
      setIsReviewOpen(false);
      toast.success(withLock ? 'Price approved and locked!' : 'Price approved!');
    } catch (error) {
      console.error('Error approving negotiation:', error);
      toast.error('Failed to approve. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCounterOffer = async () => {
    if (!selectedNegotiation || !counterOffer) return;
    setIsSubmitting(true);
    
    try {
      await sendCounterOffer(selectedNegotiation.id, parseFloat(counterOffer), adminResponse);
      setIsReviewOpen(false);
      toast.success('Counter offer sent!');
    } catch (error) {
      console.error('Error sending counter offer:', error);
      toast.error('Failed to send counter offer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedNegotiation || !rejectionReason) return;
    setIsSubmitting(true);
    
    try {
      await rejectNegotiation(selectedNegotiation.id, rejectionReason);
      setIsReviewOpen(false);
      toast.success('Request rejected');
    } catch (error) {
      console.error('Error rejecting negotiation:', error);
      toast.error('Failed to reject. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModificationRequest = async (request: ModificationRequest, action: 'approve' | 'reject') => {
    setIsSubmitting(true);
    
    try {
      await processModificationRequest(request.id, action);
      toast.success(`Modification request ${action === 'approve' ? 'approved' : 'rejected'}`);
    } catch (error) {
      console.error('Error processing modification request:', error);
      toast.error('Failed to process request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
    return <Badge variant={statusConfig.variant}><Icon className="w-3 h-3 mr-1" />{statusConfig.label}</Badge>;
  };

  const getCurrencySymbol = (currency: string) => currency === 'NGN' ? '₦' : '$';

  const getRequesterType = (negotiation: PriceNegotiation): 'driver' | 'owner' => {
    return negotiation.owner_id ? 'owner' : 'driver';
  };

  const getCategoryLabel = (category: string | null) => {
    if (!category) return 'Unknown';
    return PRICE_CEILINGS[category as keyof typeof PRICE_CEILINGS]?.label || category;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Price Negotiation Management</h2>
          <p className="text-muted-foreground">Review, approve, and lock driver/owner rental prices</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingNegotiations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              Counter Offers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counterOfferNegotiations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4 text-purple-500" />
              Locked Prices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lockedNegotiations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Modification Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingModifications.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            Pending <Badge variant="secondary">{pendingNegotiations.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="counter" className="gap-2">
            Counter Offers <Badge variant="secondary">{counterOfferNegotiations.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="locked" className="gap-2">
            Locked <Badge variant="secondary">{lockedNegotiations.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="modifications" className="gap-2">
            Modifications <Badge variant="secondary">{pendingModifications.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Price Requests</CardTitle>
              <CardDescription>Review and respond to new price requests from drivers and owners</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingNegotiations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>All price requests have been processed!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requester</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Requested Rate</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingNegotiations.map((n) => {
                      const requesterType = getRequesterType(n);
                      const isOwner = requesterType === 'owner';
                      return (
                        <TableRow key={n.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{n.requester_profile?.full_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{n.requester_profile?.email || ''}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isOwner ? 'default' : 'secondary'}>
                              {isOwner ? 'Owner' : 'Driver'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {n.vehicle_year} {n.vehicle_make} {n.vehicle_model}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getCategoryLabel(n.vehicle_category)}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {getCurrencySymbol(n.currency)}{n.requested_daily_rate}/{isOwner ? 'day (weekly)' : 'day'}
                          </TableCell>
                          <TableCell>{new Date(n.created_at || '').toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" onClick={() => openReview(n)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Counter Offers Tab */}
        <TabsContent value="counter">
          <Card>
            <CardHeader>
              <CardTitle>Awaiting Response</CardTitle>
              <CardDescription>Counter offers waiting for driver/owner acceptance</CardDescription>
            </CardHeader>
            <CardContent>
              {counterOfferNegotiations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3" />
                  <p>No pending counter offers</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requester</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Original Request</TableHead>
                      <TableHead>Your Offer</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {counterOfferNegotiations.map((n) => {
                      const requesterType = getRequesterType(n);
                      const isOwner = requesterType === 'owner';
                      return (
                        <TableRow key={n.id}>
                          <TableCell className="font-medium">{n.requester_profile?.full_name || 'Unknown'}</TableCell>
                          <TableCell>
                            <Badge variant={isOwner ? 'default' : 'secondary'}>
                              {isOwner ? 'Owner' : 'Driver'}
                            </Badge>
                          </TableCell>
                          <TableCell>{n.vehicle_year} {n.vehicle_make} {n.vehicle_model}</TableCell>
                          <TableCell>{getCurrencySymbol(n.currency)}{n.requested_daily_rate}/day</TableCell>
                          <TableCell className="font-semibold text-primary">
                            {getCurrencySymbol(n.currency)}{n.admin_counter_offer}/day
                          </TableCell>
                          <TableCell>{getStatusBadge(n.status, n.is_locked)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Locked Tab */}
        <TabsContent value="locked">
          <Card>
            <CardHeader>
              <CardTitle>Locked Prices</CardTitle>
              <CardDescription>Finalized prices that can only be modified by admin</CardDescription>
            </CardHeader>
            <CardContent>
              {lockedNegotiations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Lock className="h-12 w-12 mx-auto mb-3" />
                  <p>No locked prices yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requester</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Final Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lockedNegotiations.map((n) => {
                      const requesterType = getRequesterType(n);
                      const isOwner = requesterType === 'owner';
                      return (
                        <TableRow key={n.id}>
                          <TableCell className="font-medium">{n.requester_profile?.full_name || 'Unknown'}</TableCell>
                          <TableCell>
                            <Badge variant={isOwner ? 'default' : 'secondary'}>
                              {isOwner ? 'Owner' : 'Driver'}
                            </Badge>
                          </TableCell>
                          <TableCell>{n.vehicle_year} {n.vehicle_make} {n.vehicle_model}</TableCell>
                          <TableCell className="font-semibold text-green-600">
                            {getCurrencySymbol(n.currency)}{n.final_daily_rate}/day
                          </TableCell>
                          <TableCell>{getStatusBadge(n.status, n.is_locked)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="default" size="sm" onClick={() => setProvisionTarget(n)}>
                                Provision rental & billing
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openReview(n)}>
                                Modify
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Modification Requests Tab */}
        <TabsContent value="modifications">
          <Card>
            <CardHeader>
              <CardTitle>Modification Requests</CardTitle>
              <CardDescription>Requests from drivers/owners to modify locked prices</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingModifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3" />
                  <p>No pending modification requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingModifications.map((request) => (
                    <Card key={request.id} className="border-l-4 border-l-orange-500">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={request.requester_type === 'owner' ? 'default' : 'secondary'}>
                                {request.requester_type === 'owner' ? 'Owner' : 'Driver'}
                              </Badge>
                              <span className="font-medium">{request.requester_profile?.full_name || 'Unknown'}</span>
                              <span className="text-muted-foreground">• {request.negotiation?.vehicle_year} {request.negotiation?.vehicle_make} {request.negotiation?.vehicle_model}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span>Current: <strong>{getCurrencySymbol(request.negotiation?.currency)}{request.current_rate}</strong></span>
                              <span>→</span>
                              <span className="text-primary">Requested: <strong>{getCurrencySymbol(request.negotiation?.currency)}{request.requested_rate}</strong></span>
                            </div>
                            <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                              "{request.reason}"
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleModificationRequest(request, 'reject')}
                              disabled={isSubmitting}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => handleModificationRequest(request, 'approve')}
                              disabled={isSubmitting}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Review Price Request</DialogTitle>
            <DialogDescription>
              <span className="flex items-center gap-2">
                <Badge variant={selectedNegotiation?.owner_id ? 'default' : 'secondary'}>
                  {selectedNegotiation?.owner_id ? 'Owner' : 'Driver'}
                </Badge>
                {selectedNegotiation?.requester_profile?.full_name || 'Unknown'} - {selectedNegotiation?.vehicle_year} {selectedNegotiation?.vehicle_make} {selectedNegotiation?.vehicle_model}
              </span>
            </DialogDescription>
          </DialogHeader>
          
          {selectedNegotiation && (
            <div className="space-y-4 py-4">
              {/* Request Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Requested Rate</p>
                  <p className="text-xl font-bold">
                    {getCurrencySymbol(selectedNegotiation.currency)}{selectedNegotiation.requested_daily_rate}/day
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Category Ceiling</p>
                  <p className="text-xl font-bold">
                    {getCurrencySymbol(selectedNegotiation.currency)}{PRICE_CEILINGS[selectedNegotiation.vehicle_category as keyof typeof PRICE_CEILINGS]?.ceiling || 300}/week
                  </p>
                </div>
              </div>

              {selectedNegotiation.driver_message && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">
                    {selectedNegotiation.owner_id ? "Owner's" : "Driver's"} Message
                  </p>
                  <p className="text-sm">{selectedNegotiation.driver_message}</p>
                </div>
              )}

              {/* Counter Offer Input */}
              <div className="space-y-2">
                <Label htmlFor="counterOffer">Your Rate ({selectedNegotiation.currency}/day)</Label>
                <div className="relative">
                  <CurrencyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="counterOffer"
                    type="number"
                    className="pl-9"
                    value={counterOffer}
                    onChange={(e) => setCounterOffer(e.target.value)}
                  />
                </div>
              </div>

              {/* Admin Response */}
              <div className="space-y-2">
                <Label htmlFor="adminResponse">Response Message</Label>
                <Textarea
                  id="adminResponse"
                  placeholder="Add a message to explain your decision..."
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                />
              </div>

              {/* Rejection Reason */}
              <div className="space-y-2">
                <Label htmlFor="rejectionReason">Rejection Reason (if rejecting)</Label>
                <Textarea
                  id="rejectionReason"
                  placeholder="Explain why you're rejecting this request..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-4">
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isSubmitting || !rejectionReason}
                >
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                  Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCounterOffer}
                  disabled={isSubmitting || !counterOffer}
                >
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send Counter Offer
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleApprove(false)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Approve
                </Button>
                <Button
                  onClick={() => handleApprove(true)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  Approve & Lock
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProvisionRentalDialog
        negotiation={provisionTarget}
        open={!!provisionTarget}
        onOpenChange={(o) => { if (!o) setProvisionTarget(null); }}
        onProvisioned={() => refetch()}
      />
    </div>
  );
};
