import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRegion } from '@/contexts/RegionContext';

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
  status: 'pending' | 'callback_scheduled' | 'called_back' | 'canceled' | 'missed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  reason: string | null;
  created_at: string;
}

export const useCallSupport = (userType?: 'driver' | 'owner') => {
  const [settings, setSettings] = useState<VoIPSetting[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<CallRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { country } = useRegion();

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('voip_settings')
        .select('*');

      if (error) throw error;
      setSettings((data || []) as VoIPSetting[]);

      // Check if feature is enabled for user type
      if (userType) {
        const specificSetting = data?.find(s => s.feature_key === `${userType}_call_support`);
        const generalSetting = data?.find(s => s.feature_key === 'user_call_support');
        
        const isSpecificEnabled = specificSetting?.is_enabled && 
          (specificSetting.region === 'All' || specificSetting.region === country);
        const isGeneralEnabled = generalSetting?.is_enabled && 
          (generalSetting.region === 'All' || generalSetting.region === country);
        
        setIsEnabled(isSpecificEnabled || isGeneralEnabled);
      }
    } catch (error) {
      console.error('Error fetching VoIP settings:', error);
    }
  }, [userType, country]);

  const fetchPendingRequest = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('voip_call_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setPendingRequest(data as CallRequest | null);
    } catch (error) {
      console.error('Error fetching pending request:', error);
    }
  }, []);

  const requestCallback = async (reason?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's phone number from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone, phone_verified')
        .eq('user_id', user.id)
        .single();

      if (!profile?.phone) {
        toast({
          title: 'Phone Required',
          description: 'Please verify your phone number in settings before requesting a callback.',
          variant: 'destructive',
        });
        return { success: false, needsPhone: true };
      }

      const { data, error } = await supabase
        .from('voip_call_requests')
        .insert({
          user_id: user.id,
          user_type: userType || 'driver',
          region: country as 'USA' | 'Nigeria' | (string & {}),
          phone_number: profile.phone,
          reason,
        })
        .select()
        .single();

      if (error) throw error;

      setPendingRequest(data as CallRequest);
      toast({
        title: 'Callback Requested',
        description: 'An admin will call you back shortly.',
      });

      return { success: true };
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to request callback',
        variant: 'destructive',
      });
      return { success: false };
    }
  };

  const cancelRequest = async () => {
    if (!pendingRequest) return;

    try {
      const { error } = await supabase
        .from('voip_call_requests')
        .update({ status: 'canceled' })
        .eq('id', pendingRequest.id);

      if (error) throw error;

      setPendingRequest(null);
      toast({
        title: 'Request Canceled',
        description: 'Your callback request has been canceled.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel request',
        variant: 'destructive',
      });
    }
  };

  // Admin functions
  const updateSetting = async (featureKey: string, updates: Partial<VoIPSetting>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('voip_settings')
        .update({ ...updates, updated_by: user?.id })
        .eq('feature_key', featureKey);

      if (error) throw error;

      toast({
        title: 'Setting Updated',
        description: 'VoIP feature setting has been updated.',
      });

      await fetchSettings();
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update setting',
        variant: 'destructive',
      });
      return false;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchSettings(), fetchPendingRequest()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchSettings, fetchPendingRequest]);

  return {
    settings,
    isEnabled,
    pendingRequest,
    isLoading,
    requestCallback,
    cancelRequest,
    updateSetting,
    refreshSettings: fetchSettings,
  };
};
