import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { VoIPCall } from '@/types/voip';

export type HubTab = 'call' | 'message' | 'history' | 'context';

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
}

const CommunicationsHubContext = createContext<CommunicationsHubContextType | undefined>(undefined);

export const CommunicationsHubProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>('call');
  const [prefillRecipient, setPrefillRecipient] = useState<HubRecipientPayload | null>(null);
  const [activeCall, setActiveCall] = useState<VoIPCall | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
    setIsMinimized(false);
  }, []);

  const openWithRecipient = useCallback((recipient: HubRecipientPayload) => {
    setPrefillRecipient(recipient);
    if (recipient.defaultAction === 'call') {
      setActiveTab('call');
    } else {
      setActiveTab('message');
    }
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

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
    }),
    [isOpen, toggleOpen, isMinimized, activeTab, prefillRecipient, openWithRecipient, clearPrefill, activeCall, unreadCount]
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
