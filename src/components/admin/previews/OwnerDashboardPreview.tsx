import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/payment-config';
import {
  Car,
  DollarSign,
  TrendingUp,
  Calendar,
  MapPin,
  Users,
  Wallet,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Phone,
  Mail,
  Loader2,
} from 'lucide-react';

interface OwnerDashboardPreviewProps {
  userId: string;
  userProfile: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    phone_verified: boolean;
  };
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  status: string;
  created_at: string;
}

interface IoTOrder {
  id: string;
  device_price: number;
  currency: string;
  payment_status: string;
  shipping_status: string;
  created_at: string;
}

export function OwnerDashboardPreview({ userId, userProfile }: OwnerDashboardPreviewProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<IoTOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOwnerData();
  }, [userId]);

  const fetchOwnerData = async () => {
    try {
      setLoading(true);

      // Fetch owner's vehicles
      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select('*')
        .eq('owner_id', userId);

      // Fetch owner's IoT device orders
      const { data: ordersData } = await supabase
        .from('iot_device_orders')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      setVehicles(vehiclesData || []);
      setOrders(ordersData || []);
    } catch (error) {
      console.error('Error fetching owner data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeVehicles = vehicles.filter(v => v.status === 'approved' || v.status === 'rented');

  return (
    <div className="space-y-6 p-4">
      {/* Admin View Banner */}
      <Alert className="bg-amber-50 border-amber-200">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>Admin View:</strong> This is a read-only preview of {userProfile.full_name || 'the owner'}'s dashboard. No actions can be taken.
        </AlertDescription>
      </Alert>

      {/* Profile Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Owner Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{userProfile.full_name || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{userProfile.email || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{userProfile.phone || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-4 w-4 ${userProfile.phone_verified ? 'text-green-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm text-muted-foreground">Phone Status</p>
                <Badge variant={userProfile.phone_verified ? 'default' : 'secondary'}>
                  {userProfile.phone_verified ? 'Verified' : 'Not Verified'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Vehicles</p>
                <p className="text-2xl font-bold">{vehicles.length}</p>
              </div>
              <Car className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Vehicles</p>
                <p className="text-2xl font-bold">{activeVehicles.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">IoT Orders</p>
                <p className="text-2xl font-bold">{orders.length}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Orders</p>
                <p className="text-2xl font-bold">
                  {orders.filter(o => o.payment_status === 'pending').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="vehicles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vehicles">Vehicles ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="orders">IoT Orders ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <Card>
            <CardHeader>
              <CardTitle>Registered Vehicles</CardTitle>
              <CardDescription>All vehicles registered by this owner</CardDescription>
            </CardHeader>
            <CardContent>
              {vehicles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Car className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No vehicles registered</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {vehicles.map(vehicle => (
                    <div key={vehicle.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                          <Car className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{vehicle.make} {vehicle.model} ({vehicle.year})</p>
                          <p className="text-sm text-muted-foreground">{vehicle.license_plate}</p>
                        </div>
                      </div>
                      <Badge variant={
                        vehicle.status === 'approved' ? 'default' :
                        vehicle.status === 'rented' ? 'secondary' :
                        vehicle.status === 'pending' ? 'outline' : 'destructive'
                      }>
                        {vehicle.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>IoT Device Orders</CardTitle>
              <CardDescription>Order history for tracking devices</CardDescription>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No orders placed</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">
                          {formatCurrency(Number(order.device_price), order.currency as 'USD' | 'NGN' | (string & {}))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={order.payment_status === 'confirmed' ? 'default' : 'outline'}>
                          Payment: {order.payment_status}
                        </Badge>
                        <Badge variant={order.shipping_status === 'delivered' ? 'default' : 'secondary'}>
                          Shipping: {order.shipping_status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
