import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { VoIPCall, VoIPCallParticipant, VoIPCallGroup, VoIPGroupMember, CallRegion, CallType } from '@/types/voip';

export const useVoIPCalls = () => {
  const [calls, setCalls] = useState<VoIPCall[]>([]);
  const [groups, setGroups] = useState<VoIPCallGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCall, setActiveCall] = useState<VoIPCall | null>(null);
  const { toast } = useToast();

  const fetchCalls = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('voip_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Fetch participants for each call
      const callsWithParticipants = await Promise.all(
        (data || []).map(async (call) => {
          const { data: participants } = await supabase
            .from('voip_call_participants')
            .select('*')
            .eq('call_id', call.id);
          return { ...call, participants: participants || [] } as VoIPCall;
        })
      );
      
      setCalls(callsWithParticipants);
    } catch (error) {
      console.error('Error fetching calls:', error);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('voip_call_groups')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      
      // Fetch members for each group
      const groupsWithMembers = await Promise.all(
        (data || []).map(async (group) => {
          const { data: members } = await supabase
            .from('voip_group_members')
            .select('*')
            .eq('group_id', group.id)
            .eq('is_active', true);
          return { ...group, members: members || [] } as VoIPCallGroup;
        })
      );
      
      setGroups(groupsWithMembers);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  }, []);

  const initiateCall = async (
    callType: CallType,
    region: CallRegion,
    recipients: { phoneNumber: string; displayName?: string; userId?: string }[]
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Call the edge function to initiate the call
      const { data, error } = await supabase.functions.invoke('initiate-voip-call', {
        body: {
          callType,
          region,
          recipients,
        },
      });

      if (error) throw error;
      // The function returns 200 with success:false when the provider rejects.
      if (data && data.success === false) {
        throw new Error(data.error || 'The call provider rejected this call');
      }

      toast({
        title: 'Call Initiated',
        description: `Calling ${recipients.length} recipient(s)...`,
      });


      await fetchCalls();
      return data;
    } catch (error: any) {
      toast({
        title: 'Call Failed',
        description: error.message || 'Failed to initiate call',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const endCall = async (callId: string) => {
    try {
      const { error } = await supabase.functions.invoke('end-voip-call', {
        body: { callId },
      });

      if (error) throw error;

      toast({
        title: 'Call Ended',
        description: 'The call has been terminated.',
      });

      setActiveCall(null);
      await fetchCalls();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to end call',
        variant: 'destructive',
      });
    }
  };

  const createGroup = async (
    name: string,
    description: string,
    region: 'USA' | 'Nigeria' | (string & {}) | 'All',
    members: { phoneNumber: string; displayName?: string; userId?: string; region: CallRegion }[]
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: group, error: groupError } = await supabase
        .from('voip_call_groups')
        .insert({
          name,
          description,
          region,
          created_by: user.id,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add members
      const memberInserts = members.map((m) => ({
        group_id: group.id,
        phone_number: m.phoneNumber,
        display_name: m.displayName,
        user_id: m.userId,
        region: m.region,
      }));

      const { error: membersError } = await supabase
        .from('voip_group_members')
        .insert(memberInserts);

      if (membersError) throw membersError;

      toast({
        title: 'Group Created',
        description: `"${name}" group has been created with ${members.length} members.`,
      });

      await fetchGroups();
      return group;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create group',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('voip_call_groups')
        .update({ is_active: false })
        .eq('id', groupId);

      if (error) throw error;

      toast({
        title: 'Group Deleted',
        description: 'The call group has been removed.',
      });

      await fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete group',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchCalls(), fetchGroups()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchCalls, fetchGroups]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('voip_calls_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voip_calls' },
        () => fetchCalls()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voip_call_participants' },
        () => fetchCalls()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCalls]);

  return {
    calls,
    groups,
    isLoading,
    activeCall,
    setActiveCall,
    initiateCall,
    endCall,
    createGroup,
    deleteGroup,
    refreshCalls: fetchCalls,
    refreshGroups: fetchGroups,
  };
};
