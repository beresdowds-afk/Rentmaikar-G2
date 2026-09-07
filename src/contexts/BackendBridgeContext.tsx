import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  backendBridge,
  ConnectionState,
  BridgeStatusInfo,
  BridgeEventPacket,
  BidirectionalLinkTestResult,
  BackendCallOptions,
} from "@/lib/backend-bridge";

interface BackendBridgeContextValue {
  connectionState: ConnectionState;
  isFallbackActive: boolean;
  isDisconnected: boolean;
  statusInfo: BridgeStatusInfo;
  latencyMs: number | null;
  lastHeartbeat: string | null;
  recentEvents: BridgeEventPacket[];
  isSimulatedLoss: boolean;
  autoDisconnectEnabled: boolean;
  autoDisconnectTriggerCount: number;
  lastAutoDisconnectTrigger: any;
  call: <T = any>(endpoint: string, options?: BackendCallOptions) => Promise<T>;
  listen: (eventType: string, handler: (event: BridgeEventPacket) => void) => () => void;
  respond: (correlationId: string, eventType: string, payload?: any) => Promise<boolean>;
  ping: () => Promise<number>;
  testLink: () => Promise<BidirectionalLinkTestResult>;
  simulateLossOfContact: (simulate: boolean) => void;
  toggleConnection: (enable: boolean, reason?: string, operator?: string) => Promise<boolean>;
  regenerateFrontendPackages: () => Promise<{ success: boolean; message: string; packages?: Record<string, string> }>;
  setAutoDisconnectOnFrontendTraffic: (enabled: boolean) => Promise<boolean>;
  simulateFrontendCall: (path?: string, method?: string) => Promise<{ success: boolean; bridgeActive: boolean; triggerCount: number; message: string; details?: any }>;
  clearRecentEvents: () => void;
}

export const BackendBridgeContext = createContext<BackendBridgeContextValue | null>(null);

export const BackendBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [statusInfo, setStatusInfo] = useState<BridgeStatusInfo>(() => backendBridge.getStatusInfo());
  const [recentEvents, setRecentEvents] = useState<BridgeEventPacket[]>([]);
  const [isSimulatedLoss, setIsSimulatedLoss] = useState(false);

  useEffect(() => {
    // Subscribe to connection state changes
    const unsubscribeState = backendBridge.onStateChange((_, info) => {
      setStatusInfo(info);
      setIsSimulatedLoss(backendBridge.isSimulatingLossOfContact());
    });

    // Subscribe to all bridge events to keep a live packet log in context
    const unsubscribeEvents = backendBridge.listen("*", (packet) => {
      setRecentEvents((prev) => [packet, ...prev.slice(0, 49)]);
    });

    return () => {
      unsubscribeState();
      unsubscribeEvents();
    };
  }, []);

  const call = useCallback(<T = any,>(endpoint: string, options?: BackendCallOptions) => {
    return backendBridge.call<T>(endpoint, options);
  }, []);

  const listen = useCallback((eventType: string, handler: (event: BridgeEventPacket) => void) => {
    return backendBridge.listen(eventType, handler);
  }, []);

  const respond = useCallback((correlationId: string, eventType: string, payload?: any) => {
    return backendBridge.respond(correlationId, eventType, payload);
  }, []);

  const ping = useCallback(() => {
    return backendBridge.ping();
  }, []);

  const testLink = useCallback(() => {
    return backendBridge.testBidirectionalLink();
  }, []);

  const simulateLossOfContact = useCallback((simulate: boolean) => {
    backendBridge.simulateLossOfContact(simulate);
    setIsSimulatedLoss(simulate);
    setStatusInfo(backendBridge.getStatusInfo());
  }, []);

  const toggleConnection = useCallback(
    async (enable: boolean, reason?: string, operator?: string) => {
      const ok = await backendBridge.toggleConnection(enable, reason, operator);
      setStatusInfo(backendBridge.getStatusInfo());
      return ok;
    },
    []
  );

  const regenerateFrontendPackages = useCallback(() => {
    return backendBridge.regenerateFrontendPackages();
  }, []);

  const setAutoDisconnectOnFrontendTraffic = useCallback(async (enabled: boolean) => {
    const ok = await backendBridge.setAutoDisconnectOnFrontendTraffic(enabled);
    setStatusInfo(backendBridge.getStatusInfo());
    return ok;
  }, []);

  const simulateFrontendCall = useCallback(async (path?: string, method?: string) => {
    const res = await backendBridge.simulateFrontendCall(path, method);
    setStatusInfo(backendBridge.getStatusInfo());
    return res;
  }, []);

  const clearRecentEvents = useCallback(() => {
    setRecentEvents([]);
  }, []);

  const value: BackendBridgeContextValue = {
    connectionState: statusInfo.state,
    isFallbackActive: statusInfo.isFallbackActive,
    isDisconnected: statusInfo.isDisconnected,
    statusInfo,
    latencyMs: statusInfo.latencyMs,
    lastHeartbeat: statusInfo.lastHeartbeat,
    recentEvents,
    isSimulatedLoss,
    autoDisconnectEnabled: statusInfo.autoDisconnectOnFrontendTraffic,
    autoDisconnectTriggerCount: statusInfo.autoDisconnectTriggerCount,
    lastAutoDisconnectTrigger: statusInfo.lastAutoDisconnectTrigger,
    call,
    listen,
    respond,
    ping,
    testLink,
    simulateLossOfContact,
    toggleConnection,
    regenerateFrontendPackages,
    setAutoDisconnectOnFrontendTraffic,
    simulateFrontendCall,
    clearRecentEvents,
  };

  return (
    <BackendBridgeContext.Provider value={value}>
      {children}
    </BackendBridgeContext.Provider>
  );
};
export type { BackendBridgeContextValue };
