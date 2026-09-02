import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';

interface VoiceCallRequest {
  id: string;
  requester_id: string;
  requester_role: string;
  target_role: string;
  target_id: string | null;
  reason: string | null;
  status: string;
  assigned_to: string | null;
  call_id: string | null;
  region: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface CallHistoryItem {
  id: string;
  call_type: string;
  region: string;
  status: string;
  direction: string;
  duration_seconds: number | null;
  caller_role: string | null;
  receiver_role: string | null;
  receiver_id: string | null;
  initiated_by: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export const useVoiceCall = (userRole?: string) => {
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<VoiceCallRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<VoiceCallRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const { country } = useRegion();

  const fetchCallHistory = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('voip_calls')
        .select('*')
        .or(`initiated_by.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCallHistory((data || []) as CallHistoryItem[]);
    } catch (error) {
      console.error('Error fetching call history:', error);
    }
  }, [user]);

  const fetchPendingRequests = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('voice_call_requests')
        .select('*')
        .eq('requester_id', user.id)
        .in('status', ['pending', 'accepted', 'escalated'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingRequests((data || []) as VoiceCallRequest[]);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  }, [user]);

  const fetchIncomingRequests = useCallback(async () => {
    if (!user || !userRole) return;
    // Admin and support roles can see incoming requests targeting their role
    if (!['admin', 'legal_support', 'iot_support', 'vehicle_support'].includes(userRole)) return;

    try {
      const { data, error } = await supabase
        .from('voice_call_requests')
        .select('*')
        .in('status', ['pending', 'escalated'])
        .or(`target_role.eq.${userRole},target_role.eq.admin`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIncomingRequests((data || []) as VoiceCallRequest[]);
    } catch (error) {
      console.error('Error fetching incoming requests:', error);
    }
  }, [user, userRole]);

  const requestCall = async (targetRole: string, targetId?: string, reason?: string) => {
    if (!user) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return null;
    }

    try {
      const { data, error } = await supabase.functions.invoke('voice-call-request', {
        body: {
          action: 'create',
          targetRole,
          targetId,
          reason,
          region: country,
        },
      });

      if (error) throw error;

      toast({
        title: 'Call Request Sent',
        description: 'Your call request has been submitted. Support will reach out shortly.',
      });

      await fetchPendingRequests();
      return data?.request;
    } catch (error: any) {
      toast({
        title: 'Call Request Failed',
        description: error.message || 'Failed to submit call request',
        variant: 'destructive',
      });
      return null;
    }
  };

  const acceptCallRequest = async (requestId: string) => {
    try {
      const { error } = await supabase.functions.invoke('voice-call-request', {
        body: { action: 'accept', requestId },
      });
      if (error) throw error;

      toast({ title: 'Call Request Accepted', description: 'You can now call the user.' });
      await fetchIncomingRequests();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const rejectCallRequest = async (requestId: string) => {
    try {
      const { error } = await supabase.functions.invoke('voice-call-request', {
        body: { action: 'reject', requestId },
      });
      if (error) throw error;

      toast({ title: 'Call Request Rejected' });
      await fetchIncomingRequests();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const escalateCallRequest = async (requestId: string) => {
    try {
      const { error } = await supabase.functions.invoke('voice-call-request', {
        body: { action: 'escalate', requestId },
      });
      if (error) throw error;

      toast({ title: 'Call Escalated', description: 'Request has been escalated to Admin.' });
      await fetchIncomingRequests();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const cancelCallRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('voice_call_requests')
        .update({ status: 'canceled', resolved_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('requester_id', user?.id);

      if (error) throw error;

      toast({ title: 'Request Canceled' });
      await fetchPendingRequests();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchCallHistory(), fetchPendingRequests(), fetchIncomingRequests()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchCallHistory, fetchPendingRequests, fetchIncomingRequests]);

  // Realtime subscription for incoming call requests
  useEffect(() => {
    const channel = supabase
      .channel('voice_call_requests_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_call_requests' },
        () => {
          fetchIncomingRequests();
          fetchPendingRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchIncomingRequests, fetchPendingRequests]);

  return {
    callHistory,
    pendingRequests,
    incomingRequests,
    isLoading,
    requestCall,
    acceptCallRequest,
    rejectCallRequest,
    escalateCallRequest,
    cancelCallRequest,
    refreshHistory: fetchCallHistory,
  };
};
