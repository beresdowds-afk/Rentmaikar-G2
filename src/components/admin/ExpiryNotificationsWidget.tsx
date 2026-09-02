import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Bell, 
  Phone, 
  Car, 
  FileText, 
  Shield, 
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface ExpiringItem {
  id: string;
  type: 'insurance' | 'registration' | 'inspection' | 'license';
  expiry_date: string;
  days_until_expiry: number;
  vehicle_id?: string;
  vehicle_info?: string;
  owner_id?: string;
  owner_name?: string;
  owner_phone?: string;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
}

interface NotificationLog {
  id: string;
  notification_type: string;
  recipient_type: string;
  days_until_expiry: number;
  notification_channel: string;
  sent_at: string;
  vehicle_id?: string;
}

export const ExpiryNotificationsWidget = () => {
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [recentNotifications, setRecentNotifications] = useState<NotificationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [callingId, setCallingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchExpiringItems = async () => {
    setIsLoading(true);
    try {
      const today = new Date();
      const in30Days = new Date(today);
      in30Days.setDate(today.getDate() + 30);

      // Fetch vehicles with expiring documents
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select(`
          id,
          make,
          model,
          year,
          license_plate,
          owner_id,
          insurance_expiry,
          registration_expiry,
          inspection_expiry
        `)
        .or(`insurance_expiry.lte.${in30Days.toISOString().split('T')[0]},registration_expiry.lte.${in30Days.toISOString().split('T')[0]},inspection_expiry.lte.${in30Days.toISOString().split('T')[0]}`);

      if (vehiclesError) throw vehiclesError;

      const items: ExpiringItem[] = [];

      for (const vehicle of vehicles || []) {
        const vehicleInfo = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
        
        // Get owner info
        let ownerInfo = null;
        if (vehicle.owner_id) {
          const { data: owner } = await supabase
            .from('profiles')
            .select('user_id, full_name, phone')
            .eq('user_id', vehicle.owner_id)
            .maybeSingle();
          ownerInfo = owner;
        }

        const checkExpiry = (expiryDate: string | null, type: 'insurance' | 'registration' | 'inspection') => {
          if (!expiryDate) return;
          const expiry = new Date(expiryDate);
          const daysUntil = differenceInDays(expiry, today);
          
          if (daysUntil <= 30 && daysUntil >= 0) {
            items.push({
              id: `${vehicle.id}-${type}`,
              type,
              expiry_date: expiryDate,
              days_until_expiry: daysUntil,
              vehicle_id: vehicle.id,
              vehicle_info: vehicleInfo,
              owner_id: ownerInfo?.user_id,
              owner_name: ownerInfo?.full_name,
              owner_phone: ownerInfo?.phone,
            });
          }
        };

        checkExpiry(vehicle.insurance_expiry, 'insurance');
        checkExpiry(vehicle.registration_expiry, 'registration');
        checkExpiry(vehicle.inspection_expiry, 'inspection');
      }

      // Sort by days until expiry
      items.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
      setExpiringItems(items);

      // Fetch recent notifications
      const { data: notifications } = await supabase
        .from('expiry_notifications')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(20);

      setRecentNotifications(notifications || []);
    } catch (error) {
      console.error('Error fetching expiring items:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch expiry data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiringItems();
  }, []);

  const triggerManualNotifications = async () => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-expiry-notifications', {
        body: { trigger: 'manual' },
      });

      if (error) throw error;

      toast({
        title: 'Notifications Processed',
        description: `Sent ${data.emailsSent || 0} emails, ${data.voipCallsMade || 0} calls`,
      });

      fetchExpiringItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process notifications',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerReminderCall = async (item: ExpiringItem) => {
    if (!item.owner_phone) {
      toast({
        title: 'No Phone Number',
        description: 'Owner has no phone number on file',
        variant: 'destructive',
      });
      return;
    }

    setCallingId(item.id);
    try {
      const { error } = await supabase.functions.invoke('initiate-voip-call', {
        body: {
          callType: 'individual',
          region: item.owner_phone.startsWith('+234') ? 'Nigeria' : 'USA',
          recipients: [{
            phoneNumber: item.owner_phone,
            displayName: item.owner_name,
            userId: item.owner_id,
          }],
          expiryReminder: {
            type: item.type,
            vehicleInfo: item.vehicle_info,
            expiryDate: item.expiry_date,
            daysUntil: item.days_until_expiry,
          },
        },
      });

      if (error) throw error;

      toast({
        title: 'Call Initiated',
        description: `Calling ${item.owner_name || item.owner_phone}...`,
      });
    } catch (error: any) {
      toast({
        title: 'Call Failed',
        description: error.message || 'Failed to initiate call',
        variant: 'destructive',
      });
    } finally {
      setCallingId(null);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'insurance': return <Shield className="h-4 w-4" />;
      case 'registration': return <FileText className="h-4 w-4" />;
      case 'inspection': return <Car className="h-4 w-4" />;
      case 'license': return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getUrgencyBadge = (days: number) => {
    if (days <= 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (days <= 7) {
      return <Badge variant="destructive">{days}d left</Badge>;
    } else if (days <= 14) {
      return <Badge className="bg-orange-500">{days}d left</Badge>;
    } else {
      return <Badge variant="secondary">{days}d left</Badge>;
    }
  };

  const getChannelBadge = (channel: string) => {
    const colors: Record<string, string> = {
      email: 'bg-primary',
      sms: 'bg-accent',
      whatsapp: 'bg-accent',
      voip: 'bg-secondary',
    };
    return (
      <Badge className={colors[channel] || 'bg-muted'}>
        {channel.toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Expiry Notifications
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchExpiringItems}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={triggerManualNotifications}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Bell className="h-4 w-4 mr-1" />
            )}
            Send All Reminders
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="upcoming">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upcoming" className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Upcoming ({expiringItems.length})
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Sent ({recentNotifications.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            <ScrollArea className="h-[400px]">
              {expiringItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No documents expiring in the next 30 days</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expiringItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-full">
                          {getTypeIcon(item.type)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">{item.type}</span>
                            {getUrgencyBadge(item.days_until_expiry)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.vehicle_info}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Owner: {item.owner_name || 'N/A'} • Expires: {format(new Date(item.expiry_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerReminderCall(item)}
                        disabled={callingId === item.id || !item.owner_phone}
                      >
                        {callingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Phone className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sent">
            <ScrollArea className="h-[400px]">
              {recentNotifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No notifications sent yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {getTypeIcon(notif.notification_type)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">
                              {notif.notification_type}
                            </span>
                            {getChannelBadge(notif.notification_channel)}
                            <Badge variant="outline">{notif.recipient_type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {notif.days_until_expiry} days before expiry • 
                            {format(new Date(notif.sent_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
