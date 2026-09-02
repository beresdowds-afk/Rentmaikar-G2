import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { DataPagination } from '@/components/ui/data-pagination';
import { toast } from 'sonner';
import { 
  Package, 
  DollarSign, 
  CheckCircle, 
  Truck, 
  Clock, 
  Edit, 
  Send,
  RefreshCw,
  AlertCircle,
  Wrench,
  Smartphone,
  Eye
} from 'lucide-react';
import { formatCurrency } from '@/lib/payment-config';

interface DeviceOrder {
  id: string;
  owner_id: string;
  device_price: number;
  currency: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_status: string;
  payment_confirmed_at: string | null;
  shipping_status: string;
  shipped_at: string | null;
  tracking_number: string | null;
  shipping_address: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  notes: string | null;
  created_at: string;
  delivery_confirmed_at: string | null;
  installation_confirmed_at: string | null;
  installed_sim_number: string | null;
  installed_sim_provider: string | null;
  installation_notes: string | null;
}

interface DevicePricing {
  id: string;
  region: string;
  currency: string;
  price: number;
  description: string | null;
}

export function IoTDeviceOrders() {
  const [orders, setOrders] = useState<DeviceOrder[]>([]);
  const [pricing, setPricing] = useState<DevicePricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<DeviceOrder | null>(null);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [shipDeviceOpen, setShipDeviceOpen] = useState(false);
  const [editPricingOpen, setEditPricingOpen] = useState(false);
  const [viewOrderOpen, setViewOrderOpen] = useState(false);
  const [selectedPricing, setSelectedPricing] = useState<DevicePricing | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [priceDescription, setPriceDescription] = useState('');
  const [processing, setProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, pricingRes] = await Promise.all([
        supabase.from('iot_device_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('iot_device_pricing').select('*').order('region')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (pricingRes.error) throw pricingRes.error;

      setOrders(ordersRes.data || []);
      setPricing(pricingRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedOrder) return;
    setProcessing(true);

    try {
      const { error } = await supabase
        .from('iot_device_orders')
        .update({
          payment_status: 'confirmed',
          payment_confirmed_at: new Date().toISOString(),
        })
        .eq('id', selectedOrder.id);

      if (error) throw error;

      toast.success('Payment confirmed successfully');
      setConfirmPaymentOpen(false);
      setSelectedOrder(null);
      fetchData();
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast.error('Failed to confirm payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleShipDevice = async () => {
    if (!selectedOrder) return;
    if (!trackingNumber.trim()) {
      toast.error('Please enter a tracking number');
      return;
    }
    setProcessing(true);

    try {
      // Update order status
      const { error: updateError } = await supabase
        .from('iot_device_orders')
        .update({
          shipping_status: 'shipped',
          shipped_at: new Date().toISOString(),
          tracking_number: trackingNumber,
        })
        .eq('id', selectedOrder.id);

      if (updateError) throw updateError;

      // Send shipping notification
      if (selectedOrder.owner_email) {
        const { error: notifyError } = await supabase.functions.invoke('send-shipping-notification', {
          body: {
            email: selectedOrder.owner_email,
            phone: selectedOrder.owner_phone,
            trackingNumber: trackingNumber,
            shippingAddress: selectedOrder.shipping_address,
          }
        });

        if (notifyError) {
          console.error('Notification error:', notifyError);
          toast.warning('Device shipped but notification may have failed');
        } else {
          toast.success('Device shipped and owner notified');
        }
      } else {
        toast.success('Device marked as shipped');
      }

      setShipDeviceOpen(false);
      setSelectedOrder(null);
      setTrackingNumber('');
      fetchData();
    } catch (error) {
      console.error('Error shipping device:', error);
      toast.error('Failed to update shipping status');
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdatePricing = async () => {
    if (!selectedPricing) return;
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price');
      return;
    }
    setProcessing(true);

    try {
      const { error } = await supabase
        .from('iot_device_pricing')
        .update({
          price: price,
          description: priceDescription || null,
        })
        .eq('id', selectedPricing.id);

      if (error) throw error;

      toast.success('Pricing updated successfully');
      setEditPricingOpen(false);
      setSelectedPricing(null);
      setNewPrice('');
      setPriceDescription('');
      fetchData();
    } catch (error) {
      console.error('Error updating pricing:', error);
      toast.error('Failed to update pricing');
    } finally {
      setProcessing(false);
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Confirmed</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getShippingStatusBadge = (order: DeviceOrder) => {
    if (order.installation_confirmed_at) {
      return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Installed</Badge>;
    }
    if (order.delivery_confirmed_at) {
      return <Badge className="bg-orange-500"><Wrench className="h-3 w-3 mr-1" />Awaiting Install</Badge>;
    }
    switch (order.shipping_status) {
      case 'shipped':
        return <Badge className="bg-blue-500"><Truck className="h-3 w-3 mr-1" />Shipped</Badge>;
      case 'delivered':
        return <Badge className="bg-purple-500"><Package className="h-3 w-3 mr-1" />Delivered</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="secondary">{order.shipping_status}</Badge>;
    }
  };

  const pendingPayments = orders.filter(o => o.payment_status === 'pending');
  const confirmedOrders = orders.filter(o => o.payment_status === 'confirmed');
  const readyToShip = confirmedOrders.filter(o => o.shipping_status === 'pending');
  const installedDevices = orders.filter(o => o.installation_confirmed_at);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">IoT Device Orders</h2>
        <p className="text-muted-foreground">
          Manage device pricing, confirm payments, and track shipments
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingPayments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready to Ship</CardTitle>
            <Truck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{readyToShip.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{confirmedOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Installed</CardTitle>
            <Smartphone className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{installedDevices.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="pricing">Device Pricing</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Device Orders</CardTitle>
              <CardDescription>View and manage all IoT device orders from owners</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No orders yet</div>
              ) : (
                <>
                  {(() => {
                    const totalPages = Math.ceil(orders.length / itemsPerPage);
                    const paginatedOrders = orders.slice(
                      (currentPage - 1) * itemsPerPage,
                      currentPage * itemsPerPage
                    );
                    return (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Order Date</TableHead>
                              <TableHead>Owner Email</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Payment</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedOrders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell>
                                  {new Date(order.created_at).toLocaleDateString()}
                                </TableCell>
                                <TableCell>{order.owner_email || 'N/A'}</TableCell>
                                <TableCell>
                                  {formatCurrency(order.device_price, order.currency as 'USD' | 'NGN' | (string & {}))}
                                </TableCell>
                                <TableCell>{getPaymentStatusBadge(order.payment_status)}</TableCell>
                                <TableCell>
                                  {getShippingStatusBadge(order)}
                                  {order.tracking_number && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      #{order.tracking_number}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setSelectedOrder(order);
                                        setViewOrderOpen(true);
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    {order.payment_status === 'pending' && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedOrder(order);
                                          setConfirmPaymentOpen(true);
                                        }}
                                      >
                                        <CheckCircle className="h-4 w-4 mr-1" />
                                        Confirm
                                      </Button>
                                    )}
                                    {order.payment_status === 'confirmed' && order.shipping_status === 'pending' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedOrder(order);
                                          setShipDeviceOpen(true);
                                        }}
                                      >
                                        <Send className="h-4 w-4 mr-1" />
                                        Ship
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <DataPagination
                          currentPage={currentPage}
                          totalPages={totalPages}
                          onPageChange={setCurrentPage}
                          className="mt-6"
                        />
                      </>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Pricing by Region</CardTitle>
              <CardDescription>Set the IoT device price for each region</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {pricing.map((price) => (
                  <Card key={price.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg capitalize">
                          {price.region === 'usa' ? '🇺🇸 USA' : '🇳🇬 Nigeria'}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPricing(price);
                            setNewPrice(price.price.toString());
                            setPriceDescription(price.description || '');
                            setEditPricingOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-muted-foreground" />
                        <span className="text-2xl font-bold">
                          {formatCurrency(price.price, price.currency as 'USD' | 'NGN' | (string & {}))}
                        </span>
                      </div>
                      {price.description && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {price.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Order Dialog */}
      <Dialog open={viewOrderOpen} onOpenChange={setViewOrderOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Complete order information and status
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Order ID:</span>
                  <p className="font-medium">{selectedOrder.id.slice(0, 8)}...</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <p className="font-medium">{new Date(selectedOrder.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Owner Email:</span>
                  <p className="font-medium">{selectedOrder.owner_email || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-medium">{selectedOrder.owner_phone || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>
                  <p className="font-medium">{formatCurrency(selectedOrder.device_price, selectedOrder.currency as 'USD' | 'NGN' | (string & {}))}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment Method:</span>
                  <p className="font-medium">{selectedOrder.payment_method || 'N/A'}</p>
                </div>
              </div>
              
              {selectedOrder.payment_reference && (
                <div>
                  <span className="text-sm text-muted-foreground">Payment Reference:</span>
                  <p className="font-medium">{selectedOrder.payment_reference}</p>
                </div>
              )}
              
              {selectedOrder.shipping_address && (
                <div>
                  <span className="text-sm text-muted-foreground">Shipping Address:</span>
                  <p className="font-medium">{selectedOrder.shipping_address}</p>
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <h4 className="font-medium">Status Timeline</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`h-4 w-4 ${selectedOrder.payment_status === 'confirmed' ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <span>Payment {selectedOrder.payment_status === 'confirmed' ? 'Confirmed' : 'Pending'}</span>
                    {selectedOrder.payment_confirmed_at && (
                      <span className="text-muted-foreground">
                        ({new Date(selectedOrder.payment_confirmed_at).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck className={`h-4 w-4 ${selectedOrder.shipping_status === 'shipped' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                    <span>{selectedOrder.shipping_status === 'shipped' ? 'Shipped' : 'Awaiting Shipment'}</span>
                    {selectedOrder.shipped_at && (
                      <span className="text-muted-foreground">
                        ({new Date(selectedOrder.shipped_at).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className={`h-4 w-4 ${selectedOrder.delivery_confirmed_at ? 'text-purple-500' : 'text-muted-foreground'}`} />
                    <span>{selectedOrder.delivery_confirmed_at ? 'Delivered' : 'Awaiting Delivery'}</span>
                    {selectedOrder.delivery_confirmed_at && (
                      <span className="text-muted-foreground">
                        ({new Date(selectedOrder.delivery_confirmed_at).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className={`h-4 w-4 ${selectedOrder.installation_confirmed_at ? 'text-green-600' : 'text-muted-foreground'}`} />
                    <span>{selectedOrder.installation_confirmed_at ? 'Installed' : 'Awaiting Installation'}</span>
                    {selectedOrder.installation_confirmed_at && (
                      <span className="text-muted-foreground">
                        ({new Date(selectedOrder.installation_confirmed_at).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {selectedOrder.installation_confirmed_at && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Installation Details</h4>
                  <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SIM Provider:</span>
                      <span className="font-medium">{selectedOrder.installed_sim_provider}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SIM Number:</span>
                      <span className="font-medium">{selectedOrder.installed_sim_number}</span>
                    </div>
                    {selectedOrder.installation_notes && (
                      <div className="pt-2">
                        <span className="text-muted-foreground">Notes:</span>
                        <p className="font-medium">{selectedOrder.installation_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOrderOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Payment Dialog */}
      <Dialog open={confirmPaymentOpen} onOpenChange={setConfirmPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              Confirm that you have received payment from this owner
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner:</span>
                  <span className="font-medium">{selectedOrder.owner_email || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">
                    {formatCurrency(selectedOrder.device_price, selectedOrder.currency as 'USD' | 'NGN' | (string & {}))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="font-medium">{selectedOrder.payment_method || 'N/A'}</span>
                </div>
                {selectedOrder.payment_reference && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference:</span>
                    <span className="font-medium">{selectedOrder.payment_reference}</span>
                  </div>
                )}
              </div>
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  Please verify the payment in your bank account before confirming.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPaymentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmPayment} disabled={processing}>
              {processing ? 'Confirming...' : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship Device Dialog */}
      <Dialog open={shipDeviceOpen} onOpenChange={setShipDeviceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship Device</DialogTitle>
            <DialogDescription>
              Enter tracking details for this shipment
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner:</span>
                  <span className="font-medium">{selectedOrder.owner_email || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-medium">{selectedOrder.owner_phone || 'N/A'}</span>
                </div>
                {selectedOrder.shipping_address && (
                  <div>
                    <span className="text-muted-foreground">Shipping to:</span>
                    <p className="font-medium mt-1">{selectedOrder.shipping_address}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tracking">Tracking Number *</Label>
                <Input
                  id="tracking"
                  placeholder="Enter tracking number"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipDeviceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleShipDevice} disabled={processing}>
              {processing ? 'Shipping...' : 'Mark as Shipped'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pricing Dialog */}
      <Dialog open={editPricingOpen} onOpenChange={setEditPricingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Device Pricing</DialogTitle>
            <DialogDescription>
              Set the price for {selectedPricing?.region === 'usa' ? 'USA' : 'Nigeria'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price ({selectedPricing?.currency}) *</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter price"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Add a description for this pricing"
                value={priceDescription}
                onChange={(e) => setPriceDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPricingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePricing} disabled={processing}>
              {processing ? 'Saving...' : 'Save Pricing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
