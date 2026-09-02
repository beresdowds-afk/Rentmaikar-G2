import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/payment-config';
import {
  Car,
  DollarSign,
  TrendingUp,
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Phone,
  Mail,
  Loader2,
  MessageSquare,
} from 'lucide-react';

interface DriverDashboardPreviewProps {
  userId: string;
  userProfile: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    phone_verified: boolean;
  };
}

interface PriceNegotiation {
  id: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  requested_daily_rate: number;
  final_daily_rate: number | null;
  status: string;
  currency: string;
  created_at: string;
}

export function DriverDashboardPreview({ userId, userProfile }: DriverDashboardPreviewProps) {
  const [negotiations, setNegotiations] = useState<PriceNegotiation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  let mounted = true;

  const load = async () => {
    if (!userId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('price_negotiations')
        .select('*')
        .eq('driver_id', userId);

      if (!mounted) return;

      if (error) throw error;

      setNegotiations(Array.isArray(data) ? data : []);
    } finally {
      if (mounted) setLoading(false);
    }
  };

  load();

  return () => {
    mounted = false;
  };
}, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingNegotiations = negotiations.filter(n => n.status === 'pending');
  const approvedNegotiations = negotiations.filter(n => n.status === 'approved');

  return (
    <div className="space-y-6 p-4">
      {/* Admin View Banner */}
      <Alert className="bg-amber-50 border-amber-200">
        <Eye className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>Admin View:</strong> This is a read-only preview of {userProfile?.full_name ?? 'the driver'}'s dashboard. No actions can be taken.
        </AlertDescription>
      </Alert>

      {/* Profile Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Driver Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{userProfile?.full_name ?? 'Not set'}</p>
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
                <p className="text-sm text-muted-foreground">Total Negotiations</p>
                <p className="text-2xl font-bold">{negotiations.length}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{pendingNegotiations.length}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold">{approvedNegotiations.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className="mt-1" variant={userProfile.phone_verified ? 'default' : 'secondary'}>
                  {userProfile.phone_verified ? 'Active' : 'Pending Verification'}
                </Badge>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="negotiations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="negotiations">Price Negotiations ({negotiations.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="negotiations">
          <Card>
            <CardHeader>
              <CardTitle>Price Negotiation History</CardTitle>
              <CardDescription>All negotiation requests submitted by this driver</CardDescription>
            </CardHeader>
            <CardContent>
              {negotiations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No negotiations submitted</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {negotiations.map(neg => (
                    <div key={neg.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          neg.status === 'approved' ? 'bg-green-100' :
                          neg.status === 'pending' ? 'bg-orange-100' : 'bg-red-100'
                        }`}>
                          {neg.status === 'approved' ? (
                            <CheckCircle className="h-6 w-6 text-green-600" />
                          ) : neg.status === 'pending' ? (
                            <Clock className="h-6 w-6 text-orange-600" />
                          ) : (
                            <AlertTriangle className="h-6 w-6 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {neg.vehicle_make && neg.vehicle_model 
                              ? `${neg.vehicle_make} ${neg.vehicle_model}`
                              : 'Vehicle Request'
                            }
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Requested: {formatCurrency(Number(neg.requested_daily_rate), neg.currency as 'USD' | 'NGN' | (string & {}))}/day
                            {neg.final_daily_rate && (
                              <> • Final: {formatCurrency(Number(neg.final_daily_rate), neg.currency as 'USD' | 'NGN' | (string & {}))}/day</>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(neg.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant={
                        neg.status === 'approved' ? 'default' :
                        neg.status === 'pending' ? 'outline' : 'destructive'
                      }>
                        {neg.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity Summary</CardTitle>
              <CardDescription>Overview of driver's platform activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <span>Account Created</span>
                  </div>
                  <span className="text-muted-foreground">
                    {/* This would come from actual data */}
                    N/A
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    <span>Total Negotiation Requests</span>
                  </div>
                  <span className="font-medium">{negotiations.length}</span>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Successful Negotiations</span>
                  </div>
                  <span className="font-medium text-green-600">{approvedNegotiations.length}</span>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <span>Phone Verification</span>
                  </div>
                  <Badge variant={userProfile.phone_verified ? 'default' : 'secondary'}>
                    {userProfile.phone_verified ? 'Verified' : 'Pending'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
