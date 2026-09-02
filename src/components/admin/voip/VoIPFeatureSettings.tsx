import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Phone, Users, Car, Settings, RefreshCw, Loader2, PhoneCall, Clock, CheckCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useVoIPCalls } from '@/hooks/useVoIPCalls';

interface VoIPSetting {
  id: string;
  feature_key: string;
  is_enabled: boolean;
  region: 'USA' | 'Nigeria' | (string & {}) | 'All';
  description: string | null;
  updated_at: string;
}

interface CallRequest {
  id: string;
  user_id: string;
  user_type: 'driver' | 'owner';
  region: 'USA' | 'Nigeria' | (string & {});
  phone_number: string;
  status: string;
  priority: string;
  reason: string | null;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

export const VoIPFeatureSettings = () => {
  const [settings, setSettings] = useState<VoIPSetting[]>([]);
  const [callRequests, setCallRequests] = useState<CallRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();
  const { initiateCall } = useVoIPCalls();

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('voip_settings')
        .select('*')
        .order('feature_key');

      if (error) throw error;
      setSettings((data || []) as VoIPSetting[]);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchCallRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('voip_call_requests')
        .select('*')
        .in('status', ['pending', 'callback_scheduled'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for each request
      const requestsWithProfiles = await Promise.all(
        (data || []).map(async (req) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('user_id', req.user_id)
            .single();
          return { ...req, profile } as CallRequest;
        })
      );

      setCallRequests(requestsWithProfiles);
    } catch (error) {
      console.error('Error fetching call requests:', error);
    }
  };

  const toggleSetting = async (featureKey: string, currentValue: boolean) => {
    setIsUpdating(featureKey);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('voip_settings')
        .update({ is_enabled: !currentValue, updated_by: user?.id })
        .eq('feature_key', featureKey);

      if (error) throw error;

      toast({
        title: 'Setting Updated',
        description: `Feature has been ${!currentValue ? 'enabled' : 'disabled'}.`,
      });

      await fetchSettings();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update setting',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const updateSettingRegion = async (featureKey: string, region: 'USA' | 'Nigeria' | (string & {}) | 'All') => {
    setIsUpdating(featureKey);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('voip_settings')
        .update({ region, updated_by: user?.id })
        .eq('feature_key', featureKey);

      if (error) throw error;

      toast({
        title: 'Region Updated',
        description: `Feature region set to ${region}.`,
      });

      await fetchSettings();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update region',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleCallBack = async (request: CallRequest) => {
    try {
      await initiateCall('individual', request.region, [{
        phoneNumber: request.phone_number,
        displayName: request.profile?.full_name || undefined,
        userId: request.user_id,
      }]);

      // Update request status
      await supabase
        .from('voip_call_requests')
        .update({ 
          status: 'called_back',
          called_back_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      await fetchCallRequests();
    } catch (error) {
      console.error('Error initiating callback:', error);
    }
  };

  const dismissRequest = async (requestId: string) => {
    try {
      await supabase
        .from('voip_call_requests')
        .update({ status: 'missed' })
        .eq('id', requestId);

      await fetchCallRequests();
      toast({
        title: 'Request Dismissed',
        description: 'The callback request has been marked as missed.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to dismiss request',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchSettings(), fetchCallRequests()]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('voip_call_requests_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voip_call_requests' },
        () => fetchCallRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getFeatureIcon = (featureKey: string) => {
    if (featureKey.includes('driver')) return <Car className="h-4 w-4" />;
    if (featureKey.includes('owner')) return <Users className="h-4 w-4" />;
    return <Phone className="h-4 w-4" />;
  };

  const getFeatureLabel = (featureKey: string) => {
    const labels: Record<string, string> = {
      'user_call_support': 'All Users',
      'driver_call_support': 'Drivers Only',
      'owner_call_support': 'Owners Only',
    };
    return labels[featureKey] || featureKey;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feature Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            VoIP Feature Settings
          </CardTitle>
          <CardDescription>
            Control who can request callbacks from support
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.map((setting) => (
            <div
              key={setting.id}
              className="flex items-center justify-between p-4 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-muted">
                  {getFeatureIcon(setting.feature_key)}
                </div>
                <div>
                  <Label className="font-medium">{getFeatureLabel(setting.feature_key)}</Label>
                  <p className="text-sm text-muted-foreground">{setting.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Select
                  value={setting.region}
                  onValueChange={(v) => updateSettingRegion(setting.feature_key, v as 'USA' | 'Nigeria' | (string & {}) | 'All')}
                  disabled={isUpdating === setting.feature_key}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">🌍 All Regions</SelectItem>
                    <SelectItem value="USA">🇺🇸 USA Only</SelectItem>
                    <SelectItem value="Nigeria">🇳🇬 Nigeria Only</SelectItem>
                  </SelectContent>
                </Select>
                <Switch
                  checked={setting.is_enabled}
                  onCheckedChange={() => toggleSetting(setting.feature_key, setting.is_enabled)}
                  disabled={isUpdating === setting.feature_key}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pending Callback Requests */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5" />
                Pending Callback Requests
                {callRequests.length > 0 && (
                  <Badge variant="destructive">{callRequests.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Users waiting for a callback from support
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCallRequests}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {callRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending callback requests</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {callRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{request.profile?.full_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{request.profile?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {request.user_type === 'driver' ? (
                            <Car className="h-3 w-3 mr-1" />
                          ) : (
                            <Users className="h-3 w-3 mr-1" />
                          )}
                          {request.user_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {request.region === 'USA' ? '🇺🇸' : '🇳🇬'} {request.region}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{request.phone_number}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {request.reason || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {format(new Date(request.created_at), 'h:mm a')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleCallBack(request)}
                          >
                            <Phone className="h-4 w-4 mr-1" />
                            Call
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => dismissRequest(request.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
