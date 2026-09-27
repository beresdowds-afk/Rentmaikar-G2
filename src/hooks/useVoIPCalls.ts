import { useState, useEffect, useCallback } from 'react';
import { backendBridge } from '@/lib/backend-bridge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { VoIPCall, VoIPCallParticipant, VoIPCallGroup, VoIPGroupMember, CallRegion, CallType } from '@/types/voip';

export const useVoIPCalls = () => {
  const ACTIVE_CALL_STATUSES = new Set([
  'pending',
  'ringing',
  'in-progress',
]);

const TERMINAL_CALL_STATUSES = new Set([
  'completed',
  'failed',
  'busy',
  'no-answer',
  'canceled',
]);

const isActiveCallRecord = (call: VoIPCall): boolean => {
  if (!call.call_sid) return false;
  if (call.ended_at) return false;

  return ACTIVE_CALL_STATUSES.has(call.status);
};

const isTerminalCallRecord = (call: VoIPCall): boolean => {
  if (call.ended_at) return true;

  return TERMINAL_CALL_STATUSES.has(call.status);
};
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

      const callsWithParticipants = await Promise.all(
        (data || []).map(async (call) => {
          const { data: participants } = await supabase
            .from('voip_call_participants')
            .select('*')
            .eq('call_id', call.id);

          return {
            ...call,
            participants: participants || [],
          } as VoIPCall;
        })
      );

      let reconciledCalls = callsWithParticipants;

      /*
       * IMPORTANT:
       * The database is the local record, not the final authority for
       * whether a call is currently active.
       *
       * Any call which looks active locally must be verified against
       * Twilio through the Cloud Run backend before it is allowed to
       * become frontend active-call state.
       */
      const locallyActiveCalls = callsWithParticipants.filter(
        isActiveCallRecord
      );

      if (locallyActiveCalls.length > 0) {
        const verificationResults = await Promise.all(
          locallyActiveCalls.map(async (call) => {
            try {
              const result =
                await backendBridge.invokeEdgeFunction(
                  'get-voip-call-status',
                  {
                    callId: call.id,
                    callSid: call.call_sid,
                  },
                  {
                    method: 'POST',
                    timeoutMs: 10000,
                    skipRetry: true,
                  }
                );

              if (result.error || !result.data?.success) {
                return {
                  callId: call.id,
                  verified: false,
                  active: false,
                };
              }

              return {
                callId: call.id,
                verified: true,
                active: Boolean(result.data.active),
                providerStatus: result.data.providerStatus,
              };
            } catch (error) {
              console.warn(
                `[VoIP] Failed to verify provider state for call ${call.id}:`,
                error
              );

              return {
                callId: call.id,
                verified: false,
                active: false,
              };
            }
          })
        );

        const verificationMap = new Map(
          verificationResults.map((result) => [
            result.callId,
            result,
          ])
        );

        reconciledCalls = callsWithParticipants.map((call) => {
          const verification = verificationMap.get(call.id);

          if (!verification?.verified) {
            return call;
          }

          if (!verification.active) {
            return {
              ...call,
              status:
                verification.providerStatus &&
                TERMINAL_CALL_STATUSES.has(
                  verification.providerStatus
                )
                  ? verification.providerStatus
                  : 'completed',
              ended_at: call.ended_at || new Date().toISOString(),
            } as VoIPCall;
          }

          if (verification.providerStatus === 'in-progress') {
            return {
              ...call,
              status: 'in-progress',
            } as VoIPCall;
          }

          return {
            ...call,
            status: 'ringing',
          } as VoIPCall;
        });
      }

      setCalls(reconciledCalls);

      const verifiedActiveCalls = reconciledCalls.filter((call) => {
        const wasLocallyActive = locallyActiveCalls.some(
          (candidate) => candidate.id === call.id
        );

        return wasLocallyActive && isActiveCallRecord(call);
      });

      setActiveCall(
        verifiedActiveCalls.length > 0
          ? verifiedActiveCalls[0]
          : null
      );
    } catch (error: any) {
      console.error('Error fetching VoIP calls:', error);
    }
  }, []);

  const initiateCall = async (
    callType: CallType,
    region: CallRegion,
    recipients: {
      phoneNumber: string;
      displayName?: string;
      userId?: string;
    }[]
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Not authenticated');
      }

      if (!recipients.length) {
        throw new Error('At least one recipient is required');
      }

      const bridgeRes = await backendBridge.invokeEdgeFunction(
        'initiate-voip-call',
        {
          callType,
          region,
          recipients,
        },
        {
          method: 'POST',
          timeoutMs: 20000,
          skipRetry: true,
        }
      );

      if (bridgeRes.error) {
        throw bridgeRes.error;
      }

      const data = bridgeRes.data;

      if (!data?.success) {
        throw new Error(
          data?.message ||
            data?.error ||
            'The backend did not confirm call initiation'
        );
      }

      toast({
        title: 'Call Initiated',
        description: `Calling ${recipients.length} recipient(s)...`,
      });

      try {
        window.dispatchEvent(
          new CustomEvent('comms_activity_update', {
            detail: {
              type: 'voip_call',
              action: 'initiated',
              callId: data.callId,
            },
          })
        );
      } catch {
        /* ignore browser event failures */
      }

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

  const endCall = async (callId: string): Promise<boolean> => {
  try {
    const call = calls.find((item) => item.id === callId);

        const bridgeRes = await backendBridge.invokeEdgeFunction(
      'end-voip-call',
      {
        callId,
        callSid: call?.call_sid ?? undefined,
      },
      {
        method: 'POST',
        timeoutMs: 15000,
        skipRetry: true,
      }
    );

    if (bridgeRes.error) {
      throw bridgeRes.error;
    }

    const data = bridgeRes.data;

    // Termination is successful ONLY when the authoritative server
    // explicitly confirms success:true.
    if (!data?.success) {
      throw new Error(
        data?.message ||
          data?.error ||
          'The provider did not confirm call termination'
      );
    }

    toast({
      title: 'Call Ended',
      description: 'The call has been terminated.',
    });

    try {
      window.dispatchEvent(
        new CustomEvent('comms_activity_update', {
          detail: { type: 'voip_call', action: 'ended', callId },
        })
      );
    } catch {
      /* ignore */
    }

    setActiveCall(null);
    await fetchCalls();

    return true;
  } catch (error: any) {
    toast({
      title: 'Error',
      description: error.message || 'Failed to end call',
      variant: 'destructive',
    });

    return false;
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
