import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import type { VoIPCall } from '@/types/voip';
import { supabase } from '@/integrations/supabase/client';

export type HubTab = 'call' | 'console' | 'editor' | 'bulk' | 'history' | 'context' | 'message';

export interface HubRecipientPayload {
  name: string;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
  userId?: string | null;
  defaultAction?: 'call' | 'message';
  defaultChannel?: 'sms' | 'whatsapp' | 'email' | 'in_app';
  subject?: string;
  suggestedBody?: string;
}

export interface HubBulkPayload {
  audienceRole?: string | null;
  recipients?: any[];
  channel?: 'sms' | 'whatsapp' | 'email' | 'in_app';
  subject?: string;
  body?: string;
}

interface CommunicationsHubContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  isMinimized: boolean;
  setIsMinimized: (min: boolean) => void;
  activeTab: HubTab;
  setActiveTab: (tab: HubTab) => void;
  prefillRecipient: HubRecipientPayload | null;
  openWithRecipient: (recipient: HubRecipientPayload) => void;
  clearPrefill: () => void;
  activeCall: VoIPCall | null;
  setActiveCall: (call: VoIPCall | null) => void;
  unreadCount: number;
  setUnreadCount: (count: number) => void;

  // Synchronized Message Console & Editor
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  openMessageConsole: (conversationId?: string | null) => void;
  openMessageEditor: (payload?: Partial<HubRecipientPayload>) => void;

  // Bulk Messaging Engine
  bulkAudienceRole: string | null;
  setBulkAudienceRole: (role: string | null) => void;
  bulkRecipients: any[];
  setBulkRecipients: React.Dispatch<React.SetStateAction<any[]>>;
  openBulkMessaging: (audienceRole?: string | null, recipients?: any[], defaultChannel?: 'sms' | 'whatsapp' | 'email' | 'in_app') => void;
}

const CommunicationsHubContext = createContext<CommunicationsHubContextType | undefined>(undefined);

export const CommunicationsHubProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>('call');
  const [prefillRecipient, setPrefillRecipient] = useState<HubRecipientPayload | null>(null);
  const [activeCall, setActiveCall] = useState<VoIPCall | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Synchronized Message Console & Editor
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Bulk Messaging Engine
  const [bulkAudienceRole, setBulkAudienceRole] = useState<string | null>(null);
  const [bulkRecipients, setBulkRecipients] = useState<any[]>([]);

  // Active VoIP Call Realtime Sync across Call Center & Hub
  const syncActiveCall = useCallback(async () => {
    try {
      const { data: ongoingCalls } = await supabase
  .from('voip_calls')
  .select('*')
  .in('status', ['ringing', 'in-progress'])
  .not('call_sid', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1);

      if (ongoingCalls && ongoingCalls.length > 0) {
        const call = ongoingCalls[0];
        const { data: participants } = await supabase
          .from('voip_call_participants')
          .select('*')
          .eq('call_id', call.id);

        setActiveCall({
          ...call,
          participants: participants || [],
        } as VoIPCall);
      } else {
        setActiveCall((prev) => {
          if (prev && (prev.status === 'in-progress' || prev.status === 'ringing')) {
            return null;
          }
          return prev;
        });
      }
    } catch (e) {
      console.warn('Error syncing active call in HubContext:', e);
    }
  }, []);

  // Unread Count Sync across Messages and Inboxes
  const syncUnreadCount = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('inbox_conversations')
        .select('unread_count')
        .is('archived_at', null);

      if (data) {
        const total = data.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        setUnreadCount(total);
      }
    } catch (e) {
      console.warn('Error syncing unread messages count:', e);
    }
  }, []);

  useEffect(() => {
    syncActiveCall();
    syncUnreadCount();

    // Listen to Supabase realtime events
    const channel = supabase
      .channel('comms_hub_global_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voip_calls' },
        () => syncActiveCall()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_conversations' },
        () => syncUnreadCount()
      )
      .subscribe();

    const handleCustomEvent = () => {
      syncActiveCall();
      syncUnreadCount();
    };

    window.addEventListener('comms_activity_update', handleCustomEvent);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('comms_activity_update', handleCustomEvent);
    };
  }, [syncActiveCall, syncUnreadCount]);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
    setIsMinimized(false);
  }, []);

  const openWithRecipient = useCallback((recipient: HubRecipientPayload) => {
    setPrefillRecipient(recipient);
    if (recipient.defaultAction === 'call') {
      setActiveTab('call');
    } else {
      setActiveTab('editor');
    }
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const openMessageConsole = useCallback((conversationId?: string | null) => {
    if (conversationId) {
      setSelectedConversationId(conversationId);
    }
    setActiveTab('console');
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const openMessageEditor = useCallback((payload?: Partial<HubRecipientPayload>) => {
    if (payload) {
      setPrefillRecipient({
        name: payload.name || '',
        phone: payload.phone || null,
        email: payload.email || null,
        role: payload.role || null,
        userId: payload.userId || null,
        defaultChannel: payload.defaultChannel || 'email',
        subject: payload.subject || '',
        suggestedBody: payload.suggestedBody || '',
        defaultAction: 'message',
      });
    }
    setActiveTab('editor');
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const openBulkMessaging = useCallback((audienceRole?: string | null, recipients?: any[], defaultChannel?: 'sms' | 'whatsapp' | 'email' | 'in_app') => {
    if (audienceRole) {
      setBulkAudienceRole(audienceRole);
    }
    if (recipients && Array.isArray(recipients)) {
      setBulkRecipients(recipients);
    }
    if (defaultChannel && prefillRecipient) {
      setPrefillRecipient((prev) => prev ? { ...prev, defaultChannel } : null);
    }
    setActiveTab('bulk');
    setIsOpen(true);
    setIsMinimized(false);
  }, [prefillRecipient]);

  const clearPrefill = useCallback(() => {
    setPrefillRecipient(null);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      toggleOpen,
      isMinimized,
      setIsMinimized,
      activeTab,
      setActiveTab,
      prefillRecipient,
      openWithRecipient,
      clearPrefill,
      activeCall,
      setActiveCall,
      unreadCount,
      setUnreadCount,
      selectedConversationId,
      setSelectedConversationId,
      openMessageConsole,
      openMessageEditor,
      bulkAudienceRole,
      setBulkAudienceRole,
      bulkRecipients,
      setBulkRecipients,
      openBulkMessaging,
    }),
    [
      isOpen,
      toggleOpen,
      isMinimized,
      activeTab,
      prefillRecipient,
      openWithRecipient,
      clearPrefill,
      activeCall,
      unreadCount,
      selectedConversationId,
      openMessageConsole,
      openMessageEditor,
      bulkAudienceRole,
      bulkRecipients,
      openBulkMessaging,
    ]
  );

  return (
    <CommunicationsHubContext.Provider value={value}>
      {children}
    </CommunicationsHubContext.Provider>
  );
};

export const useCommunicationsHub = (): CommunicationsHubContextType => {
  const context = useContext(CommunicationsHubContext);
  if (!context) {
    throw new Error('useCommunicationsHub must be used within a CommunicationsHubProvider');
  }
  return context;
};

export const useCommunicationsHubSafe = (): CommunicationsHubContextType | null => {
  return useContext(CommunicationsHubContext) || null;
};
