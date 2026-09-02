import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  TrendingUp, 
  Package, 
  CheckCircle, 
  Clock,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { formatCurrency } from '@/lib/payment-config';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';

interface DeviceOrder {
  id: string;
  owner_id: string;
  device_price: number;
  currency: string;
  payment_status: string;
  payment_confirmed_at: string | null;
  shipping_status: string;
  owner_email: string | null;
  created_at: string;
  installation_confirmed_at: string | null;
}

interface RevenueStats {
  totalOrders: number;
  confirmedOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  confirmedRevenue: number;
  pendingRevenue: number;
}

function calculateStats(orders: DeviceOrder[]): RevenueStats {
  const confirmedOrders = orders.filter(o => o.payment_status === 'confirmed');
  const pendingOrders = orders.filter(o => o.payment_status === 'pending');
  
  return {
    totalOrders: orders.length,
    confirmedOrders: confirmedOrders.length,
    pendingOrders: pendingOrders.length,
    totalRevenue: orders.reduce((sum, o) => sum + o.device_price, 0),
    confirmedRevenue: confirmedOrders.reduce((sum, o) => sum + o.device_price, 0),
    pendingRevenue: pendingOrders.reduce((sum, o) => sum + o.device_price, 0),
  };
}

interface RegionOrdersProps {
  orders: DeviceOrder[];
  currency: 'USD' | 'NGN' | (string & {});
  region: string;
  loading: boolean;
}

function RegionOrders({ orders, currency, region, loading }: RegionOrdersProps) {
  const stats = calculateStats(orders);
  const currencySymbol = currency === 'USD' ? '$' : '₦';
  const flag = region === 'USA' ? '🇺🇸' : '🇳🇬';

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

  return (
    <div className="space-y-6">
      {/* Revenue Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.confirmedRevenue, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.confirmedOrders} confirmed orders
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Revenue</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(stats.pendingRevenue, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.pendingOrders} pending orders
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(stats.totalRevenue, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalOrders} total orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{flag}</span>
            {region} Device Orders
          </CardTitle>
          <CardDescription>
            All device orders from {region} owners
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No orders from {region} yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Owner Email</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment Status</TableHead>
                  <TableHead>Shipping</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      {new Date(order.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{order.owner_email || 'N/A'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(order.device_price, currency)}
                    </TableCell>
                    <TableCell>{getPaymentStatusBadge(order.payment_status)}</TableCell>
                    <TableCell>
                      <Badge variant={order.installation_confirmed_at ? 'default' : 'outline'}>
                        {order.installation_confirmed_at 
                          ? 'Installed' 
                          : order.shipping_status === 'shipped' 
                            ? 'Shipped' 
                            : 'Pending'}
                      </Badge>
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

export function DeviceOrderRevenue() {
  const [orders, setOrders] = useState<DeviceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { convertToUSD, rates } = useCurrencyConversion();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('iot_device_orders')
        .select('id, owner_id, device_price, currency, payment_status, payment_confirmed_at, shipping_status, owner_email, created_at, installation_confirmed_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const usaOrders = orders.filter(o => o.currency === 'USD');
  const nigeriaOrders = orders.filter(o => o.currency === 'NGN');

  const usaStats = calculateStats(usaOrders);
  const nigeriaStats = calculateStats(nigeriaOrders);

  // Calculate combined revenue in USD
  const nigeriaRevenueInUsd = convertToUSD(nigeriaStats.confirmedRevenue, 'NGN');
  const totalCombinedRevenueUsd = usaStats.confirmedRevenue + nigeriaRevenueInUsd;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Device Order Revenue</h2>
          <p className="text-muted-foreground">
            Track IoT device sales revenue by region
          </p>
        </div>
        <Button variant="outline" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Combined Revenue Summary */}
      <Card className="bg-gradient-to-r from-primary/10 to-accent/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Total Confirmed Revenue (All Regions)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <span>🇺🇸</span> USA Revenue
              </p>
              <p className="text-xl font-bold">${usaStats.confirmedRevenue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <span>🇳🇬</span> Nigeria Revenue
              </p>
              <p className="text-xl font-bold">₦{nigeriaStats.confirmedRevenue.toLocaleString()}</p>
              {rates && (
                <p className="text-xs text-muted-foreground">
                  ≈ ${nigeriaRevenueInUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Combined (USD)</p>
              <p className="text-2xl font-bold text-primary">
                ${totalCombinedRevenueUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              {rates && (
                <p className="text-xs text-muted-foreground">
                  Rate: USD 1 = NGN {rates.USD_NGN.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Region Tabs */}
      <Tabs defaultValue="usa" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="usa" className="flex items-center gap-2">
            <span>🇺🇸</span> USA
            <Badge variant="secondary" className="ml-1">{usaOrders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="nigeria" className="flex items-center gap-2">
            <span>🇳🇬</span> Nigeria
            <Badge variant="secondary" className="ml-1">{nigeriaOrders.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usa">
          <RegionOrders 
            orders={usaOrders} 
            currency="USD" 
            region="USA" 
            loading={loading} 
          />
        </TabsContent>

        <TabsContent value="nigeria">
          <RegionOrders 
            orders={nigeriaOrders} 
            currency="NGN" 
            region="Nigeria" 
            loading={loading} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
