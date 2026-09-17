import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Cpu, 
  MapPin, 
  Shield, 
  Truck,
  CheckCircle,
  Clock,
  Package,
  Wrench,
  Smartphone,
  CreditCard,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { formatCurrency } from '@/lib/payment-config';
import { PayPalCheckout } from '@/components/payments/PayPalCheckout';
import { PaystackCheckout } from '@/components/payments/PaystackCheckout';
import { OpayCheckout } from '@/components/payments/OpayCheckout';

interface DevicePricing {
  id: string;
  region: string;
  currency: string;
  price: number;
  description: string | null;
}

interface DeviceOrder {
  id: string;
  device_price: number;
  currency: string;
  payment_status: string;
  payment_method: string | null;
  payment_reference?: string | null;
  shipping_status: string;
  tracking_number: string | null;
  shipping_address?: string | null;
  created_at: string;
  delivery_confirmed_at: string | null;
  installation_confirmed_at: string | null;
  installed_sim_number: string | null;
  installed_sim_provider: string | null;
}

const SIM_PROVIDERS = {
  usa: ['AT&T', 'T-Mobile', 'Verizon', 'Other'],
  nigeria: ['MTN', 'Airtel', 'Glo', '9Mobile', 'Other'],
};

export function IoTDevicePurchase() {
  const { user } = useAuth();
  const { country } = useRegion();
  const [pricing, setPricing] = useState<DevicePricing | null>(null);
  const [orders, setOrders] = useState<DeviceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState<'details' | 'checkout'>('details');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderAmount, setActiveOrderAmount] = useState<number>(0);
  const [deliveryConfirmOpen, setDeliveryConfirmOpen] = useState(false);
  const [installConfirmOpen, setInstallConfirmOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeviceOrder | null>(null);
  const [shippingAddress, setShippingAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Installation form state
  const [simNumber, setSimNumber] = useState('');
  const [simProvider, setSimProvider] = useState('');
  const [installNotes, setInstallNotes] = useState('');

  const currentRegion = country === 'Nigeria' ? 'nigeria' : 'usa';

  useEffect(() => {
    fetchData();
  }, [currentRegion, user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [pricingRes, ordersRes] = await Promise.all([
        supabase
          .from('iot_device_pricing')
          .select('*')
          .eq('region', currentRegion)
          .single(),
        supabase
          .from('iot_device_orders')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
      ]);

      if (pricingRes.error && pricingRes.error.code !== 'PGRST116') {
        throw pricingRes.error;
      }
      if (ordersRes.error) throw ordersRes.error;

      setPricing(pricingRes.data);
      setOrders(ordersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load device information');
    } finally {
      setLoading(false);
    }
  };

  const handleStartPurchase = () => {
    if (!pricing) return;
    setActiveOrderId(null);
    setActiveOrderAmount(pricing.price);
    setPurchaseStep('details');
    setPurchaseOpen(true);
  };

  const handleProceedToPayment = async () => {
    if (!user || !pricing) return;
    
    if (!shippingAddress.trim()) {
      toast.error('Please enter your delivery street address');
      return;
    }
    if (!phone.trim()) {
      toast.error('Please enter a phone number for courier dispatch');
      return;
    }

    setProcessing(true);

    try {
      if (!activeOrderId) {
        // Create initial pending order
        const { data: orderData, error } = await supabase.from('iot_device_orders').insert({
          owner_id: user.id,
          device_price: pricing.price,
          currency: pricing.currency,
          payment_method: currentRegion === 'nigeria' ? 'paystack' : 'paypal',
          payment_status: 'pending',
          shipping_address: shippingAddress.trim(),
          owner_email: user.email,
          owner_phone: phone.trim() || null,
        }).select().single();

        if (error) throw error;
        setActiveOrderId(orderData.id);
        setActiveOrderAmount(pricing.price);
      } else {
        // Update shipping address if modified
        await supabase.from('iot_device_orders').update({
          shipping_address: shippingAddress.trim(),
          owner_phone: phone.trim() || null,
        }).eq('id', activeOrderId);
      }

      setPurchaseStep('checkout');
    } catch (error) {
      console.error('Error preparing order:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to prepare order');
    } finally {
      setProcessing(false);
    }
  };

  const handleResumePendingOrder = (order: DeviceOrder) => {
    setActiveOrderId(order.id);
    setActiveOrderAmount(order.device_price);
    setShippingAddress(order.shipping_address || '');
    setPurchaseStep('checkout');
    setPurchaseOpen(true);
  };

  const handlePaymentSuccess = async (data?: { reference?: string; orderId?: string; paymentId?: string }) => {
    const ref = data?.orderId || data?.reference || `ref_${Date.now()}`;
    const orderIdToConfirm = activeOrderId;
    
    if (orderIdToConfirm) {
      try {
        await supabase
          .from('iot_device_orders')
          .update({
            payment_status: 'confirmed',
            payment_reference: ref,
            payment_confirmed_at: new Date().toISOString(),
          })
          .eq('id', orderIdToConfirm);

        // Send order notification for logistics fulfillment
        try {
          await supabase.functions.invoke('send-order-notification', {
            body: {
              orderId: orderIdToConfirm,
              ownerEmail: user?.email,
              ownerPhone: phone.trim() || null,
              devicePrice: activeOrderAmount || pricing?.price,
              currency: pricing?.currency ?? (currentRegion === 'nigeria' ? 'NGN' : 'USD'),
              shippingAddress: shippingAddress.trim(),
              paymentMethod: currentRegion === 'nigeria' ? 'Paystack / OPay' : 'PayPal',
              paymentReference: ref,
            }
          });
        } catch (notifyErr) {
          console.warn('Fulfillment notification dispatched:', notifyErr);
        }
      } catch (err) {
        console.error('Failed to update local order status:', err);
      }
    }

    toast.success('Hardware order placed and paid successfully!', {
      description: `Payment reference ${ref} confirmed. Logistics will dispatch your tracking device.`,
    });
    setPurchaseOpen(false);
    setPurchaseStep('details');
    setActiveOrderId(null);
    setShippingAddress('');
    setPhone('');
    fetchData();
  };

  const handleConfirmDelivery = async () => {
    if (!selectedOrder || !user) return;
    setProcessing(true);

    try {
      const { error } = await supabase
        .from('iot_device_orders')
        .update({
          shipping_status: 'delivered',
          delivery_confirmed_at: new Date().toISOString(),
          delivery_confirmed_by: user.id,
        })
        .eq('id', selectedOrder.id);

      if (error) throw error;

      toast.success('Delivery confirmed!', {
        description: 'Please proceed with device installation.',
      });
      setDeliveryConfirmOpen(false);
      setSelectedOrder(null);
      fetchData();
    } catch (error) {
      console.error('Error confirming delivery:', error);
      toast.error('Failed to confirm delivery');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmInstallation = async () => {
    if (!selectedOrder || !user) return;
    
    if (!simNumber.trim()) {
      toast.error('Please enter the SIM card number');
      return;
    }
    if (!simProvider) {
      toast.error('Please select the SIM provider');
      return;
    }

    setProcessing(true);

    try {
      const { error } = await supabase
        .from('iot_device_orders')
        .update({
          installation_confirmed_at: new Date().toISOString(),
          installed_sim_number: simNumber,
          installed_sim_provider: simProvider,
          installation_notes: installNotes || null,
        })
        .eq('id', selectedOrder.id);

      if (error) throw error;

      toast.success('Installation confirmed!', {
        description: 'Your device is now ready for tracking.',
      });
      setInstallConfirmOpen(false);
      setSelectedOrder(null);
      setSimNumber('');
      setSimProvider('');
      setInstallNotes('');
      fetchData();
    } catch (error) {
      console.error('Error confirming installation:', error);
      toast.error('Failed to confirm installation');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (order: DeviceOrder) => {
    if (order.payment_status === 'pending') {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-600 bg-amber-50/50 dark:bg-amber-950/20">
          <Clock className="h-3 w-3 mr-1" />
          Pending Online Payment
        </Badge>
      );
    }
    if (order.payment_status === 'confirmed' && order.shipping_status === 'pending') {
      return <Badge className="bg-blue-500"><Package className="h-3 w-3 mr-1" />Processing & Dispatch</Badge>;
    }
    if (order.shipping_status === 'shipped' && !order.delivery_confirmed_at) {
      return <Badge className="bg-purple-500"><Truck className="h-3 w-3 mr-1" />In Transit</Badge>;
    }
    if (order.delivery_confirmed_at && !order.installation_confirmed_at) {
      return <Badge className="bg-orange-500"><Wrench className="h-3 w-3 mr-1" />Pending Installation</Badge>;
    }
    if (order.installation_confirmed_at) {
      return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
    }
    return <Badge variant="secondary">{order.payment_status}</Badge>;
  };

  const simProviders = currentRegion === 'nigeria' ? SIM_PROVIDERS.nigeria : SIM_PROVIDERS.usa;

  return (
    <div className="space-y-6">
      {/* Device Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cpu className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>IoT Tracking Device</CardTitle>
              <CardDescription>GPS tracking and remote telemetry for your fleet vehicles</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Real-time Tracking</p>
                <p className="text-sm text-muted-foreground">Live GPS telematics and trip logs 24/7</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Anti-theft Security</p>
                <p className="text-sm text-muted-foreground">Geofencing & automated tamper alerts</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Truck className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Doorstep Courier</p>
                <p className="text-sm text-muted-foreground">Free doorstep delivery included</p>
              </div>
            </div>
          </div>

          <Separator />

          {loading ? (
            <div className="text-center py-4 text-muted-foreground">Loading pricing...</div>
          ) : pricing ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Hardware Unit Price ({currentRegion.toUpperCase()})</p>
                <p className="text-3xl font-bold">{formatCurrency(pricing.price, pricing.currency as 'USD' | 'NGN' | (string & {}))}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Secure online payment via {currentRegion === 'nigeria' ? 'Paystack and OPay' : 'PayPal'}
                </p>
              </div>
              <Button size="lg" onClick={handleStartPurchase}>
                <CreditCard className="h-4 w-4 mr-2" />
                Purchase Device
              </Button>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              Pricing not available for your region
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order History */}
      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Device Orders</CardTitle>
            <CardDescription>Track hardware orders, courier shipments, and SIM installations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium">IoT Tracking Device</p>
                      <p className="text-sm text-muted-foreground">
                        Ordered {new Date(order.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-sm font-medium">
                        {formatCurrency(order.device_price, order.currency as 'USD' | 'NGN' | (string & {}))}
                      </p>
                    </div>
                    <div className="text-left sm:text-right space-y-1.5">
                      <div>{getStatusBadge(order)}</div>
                      {order.payment_method && (
                        <p className="text-xs text-muted-foreground uppercase font-semibold">
                          Via {order.payment_method}
                        </p>
                      )}
                      {order.tracking_number && (
                        <p className="text-xs text-muted-foreground">
                          Courier Tracking: <span className="font-mono font-medium text-foreground">{order.tracking_number}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {order.payment_status === 'pending' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>Payment not completed</span>
                        </div>
                        <p className="text-muted-foreground">
                          Complete checkout via {order.currency === 'USD' ? 'PayPal' : 'Paystack or OPay'} to release logistics dispatch.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => handleResumePendingOrder(order)}
                      >
                        <CreditCard className="h-3.5 w-3.5 mr-1" />
                        Complete Payment
                      </Button>
                    </div>
                  )}

                  {order.shipping_address && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Delivery to:</span> {order.shipping_address}
                    </p>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t">
                    {order.shipping_status === 'shipped' && !order.delivery_confirmed_at && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setDeliveryConfirmOpen(true);
                        }}
                      >
                        <Package className="h-4 w-4 mr-1" />
                        Confirm Delivery
                      </Button>
                    )}
                    {order.delivery_confirmed_at && !order.installation_confirmed_at && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setInstallConfirmOpen(true);
                        }}
                      >
                        <Wrench className="h-4 w-4 mr-1" />
                        Confirm Installation
                      </Button>
                    )}
                    {order.installation_confirmed_at && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Smartphone className="h-4 w-4" />
                        SIM: {order.installed_sim_provider} - {order.installed_sim_number}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purchase Dialog */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {purchaseStep === 'details' ? 'Purchase IoT Hardware' : 'Complete Online Payment'}
            </DialogTitle>
            <DialogDescription>
              {purchaseStep === 'details'
                ? 'Provide delivery coordinates for courier fulfillment'
                : 'Authorize payment using Rentmaikar approved payment channels'}
            </DialogDescription>
          </DialogHeader>

          {pricing && (
            <div className="space-y-5">
              {/* Order Summary */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between items-center text-sm">
                  <span>IoT Tracking Hardware</span>
                  <span className="font-semibold">{formatCurrency(activeOrderAmount || pricing.price, pricing.currency as 'USD' | 'NGN' | (string & {}))}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                  <span>Doorstep Courier Shipping</span>
                  <span className="text-green-600 dark:text-green-400 font-medium">Free Included</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between items-center font-bold">
                  <span>Total Amount Due</span>
                  <span className="text-primary text-base">
                    {formatCurrency(activeOrderAmount || pricing.price, pricing.currency as 'USD' | 'NGN' | (string & {}))}
                  </span>
                </div>
              </div>

              {purchaseStep === 'details' ? (
                /* Step 1: Shipping Details */
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="address">Delivery Street Address *</Label>
                    <Textarea
                      id="address"
                      placeholder="Street address, Apt/Suite, City, State/Province, ZIP/Postal code"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Where the hardware unit and pre-configured SIM should be delivered.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number (for courier dispatch) *</Label>
                    <PhoneNumberInput
                      id="phone"
                      value={phone}
                      onChange={setPhone}
                    />
                    <p className="text-xs text-muted-foreground">
                      Our dispatch driver will call this number prior to arrival.
                    </p>
                  </div>

                  <div className="p-3 bg-muted/60 rounded-lg border text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      Rentmaikar Payment Policy
                    </p>
                    <p>
                      Payments are strictly processed through {currentRegion === 'nigeria' ? 'Paystack and OPay' : 'PayPal'}.
                      Funds are verified instantly and trigger automated courier dispatch.
                    </p>
                  </div>
                </div>
              ) : (
                /* Step 2: Online Payment Gateway Selection & Execution */
                <div className="space-y-4">
                  <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg border flex justify-between items-center">
                    <div>
                      <span className="font-medium text-foreground">Delivery to: </span>
                      <span className="truncate inline-block max-w-[250px] align-bottom">{shippingAddress}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setPurchaseStep('details')}
                    >
                      Edit
                    </Button>
                  </div>

                  {currentRegion === 'usa' ? (
                    /* USA: PayPal */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10 text-xs text-muted-foreground">
                        <Shield className="h-4 w-4 text-primary shrink-0" />
                        <span>Pay securely using your PayPal account, debit card, or credit card.</span>
                      </div>
                      <PayPalCheckout
                        amount={activeOrderAmount || pricing.price}
                        purpose="iot_device"
                        iotDeviceId={activeOrderId ?? undefined}
                        description="Rentmaikar IoT Tracking Hardware"
                        onSuccess={handlePaymentSuccess}
                        onError={(err) => toast.error(err)}
                      />
                    </div>
                  ) : (
                    /* Nigeria: Paystack & OPay */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10 text-xs text-muted-foreground">
                        <Shield className="h-4 w-4 text-primary shrink-0" />
                        <span>Select your preferred authorized payment provider (Paystack or OPay).</span>
                      </div>

                      <Tabs defaultValue="paystack" className="w-full">
                        <TabsList className="grid grid-cols-2 w-full">
                          <TabsTrigger value="paystack">Paystack</TabsTrigger>
                          <TabsTrigger value="opay">OPay</TabsTrigger>
                        </TabsList>
                        <TabsContent value="paystack" className="pt-3">
                          <PaystackCheckout
                            amount={activeOrderAmount || pricing.price}
                            currency="NGN"
                            purpose="iot_device"
                            iotDeviceId={activeOrderId ?? undefined}
                            description="Rentmaikar IoT Tracking Hardware"
                            onSuccess={handlePaymentSuccess}
                            onError={(err) => toast.error(err)}
                          />
                        </TabsContent>
                        <TabsContent value="opay" className="pt-3">
                          <OpayCheckout
                            amount={activeOrderAmount || pricing.price}
                            purpose="iot_device"
                            iotDeviceId={activeOrderId ?? undefined}
                            description="Rentmaikar IoT Tracking Hardware"
                            onSuccess={handlePaymentSuccess}
                            onError={(err) => toast.error(err)}
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {purchaseStep === 'details' ? (
              <>
                <Button variant="outline" onClick={() => setPurchaseOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleProceedToPayment}
                  disabled={processing || !shippingAddress.trim() || !phone.trim()}
                >
                  {processing ? 'Preparing Order...' : 'Continue to Payment'}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setPurchaseStep('details')}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Shipping Details
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Confirmation Dialog */}
      <Dialog open={deliveryConfirmOpen} onOpenChange={setDeliveryConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Device Delivery</DialogTitle>
            <DialogDescription>
              Please confirm that you have received your IoT tracking device
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Before confirming, please verify:</p>
              <ul className="text-sm space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Package is undamaged
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Device is present in the package
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  All accessories are included
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmDelivery} disabled={processing}>
              {processing ? 'Confirming...' : 'Confirm Delivery'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Installation Confirmation Dialog */}
      <Dialog open={installConfirmOpen} onOpenChange={setInstallConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Device Installation</DialogTitle>
            <DialogDescription>
              Enter the SIM card details installed in your tracking device
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sim-provider">SIM Provider *</Label>
              <Select value={simProvider} onValueChange={setSimProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select SIM provider" />
                </SelectTrigger>
                <SelectContent>
                  {simProviders.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sim-number">SIM Card Number *</Label>
              <Input
                id="sim-number"
                placeholder="Enter SIM card phone number"
                value={simNumber}
                onChange={(e) => setSimNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This is the phone number associated with the SIM card in your device
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="install-notes">Installation Notes (Optional)</Label>
              <Textarea
                id="install-notes"
                placeholder="Any additional notes about the installation..."
                value={installNotes}
                onChange={(e) => setInstallNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmInstallation} disabled={processing}>
              {processing ? 'Confirming...' : 'Confirm Installation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
