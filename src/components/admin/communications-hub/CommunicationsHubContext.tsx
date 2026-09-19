import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { VoIPCall } from '@/types/voip';

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
