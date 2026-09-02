import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Bell, Mail, MessageSquare, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface NotificationPreferencesProps {
  phoneVerified?: boolean;
}

export const NotificationPreferences = ({ phoneVerified = false }: NotificationPreferencesProps) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [secondChannel, setSecondChannel] = useState<'none' | 'sms' | 'whatsapp'>('none');

  useEffect(() => {
    const fetchPreferences = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_email, notification_sms, notification_whatsapp, phone_verified')
        .eq('user_id', user.id)
        .single();
      
      if (!error && data) {
        if (data.notification_whatsapp) {
          setSecondChannel('whatsapp');
        } else if (data.notification_sms) {
          setSecondChannel('sms');
        } else {
          setSecondChannel('none');
        }
      }
      setIsLoading(false);
    };
    
    fetchPreferences();
  }, [user]);

  const handleChannelChange = async (value: string) => {
    const channel = value as 'none' | 'sms' | 'whatsapp';

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_sms: channel === 'sms',
          notification_whatsapp: channel === 'whatsapp',
        })
        .eq('user_id', user?.id);

      if (error) throw error;

      setSecondChannel(channel);
      toast.success(
        channel === 'none'
          ? 'Second channel disabled — email only'
          : `${channel === 'sms' ? 'SMS' : 'WhatsApp'} enabled as second channel`
      );
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update notification preferences');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Choose how you want to receive updates about your rentals and negotiations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email - Always Required */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label className="font-medium">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive updates via email
              </p>
            </div>
          </div>
          <Badge variant="secondary">Required</Badge>
        </div>

        {/* Second channel — pick one */}
        <div className="p-4 rounded-lg border space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <Label className="font-medium">Second Notification Channel</Label>
            <Badge variant="outline" className="ml-auto text-xs">Optional</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose one additional channel alongside email (max 2 channels).
          </p>

          <RadioGroup
            value={secondChannel}
            onValueChange={handleChannelChange}
            disabled={isSaving}
            className="space-y-2 pt-1"
          >
            <label className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/40 transition-colors">
              <RadioGroupItem value="none" id="ch-none" />
              <span className="text-sm font-medium text-foreground">Email only</span>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/40">
              <RadioGroupItem value="sms" id="ch-sms" />
              <span className="text-sm font-medium text-foreground">SMS</span>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/40">
              <RadioGroupItem value="whatsapp" id="ch-whatsapp" />
              <span className="text-sm font-medium text-foreground">WhatsApp</span>
            </label>
          </RadioGroup>
        </div>

        {!phoneVerified && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              SMS and WhatsApp work without phone verification. Verification is only required
              before owners can withdraw earnings.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationPreferences;
