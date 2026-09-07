/**
 * RentMaikar Backend API Gateway Client
 * 
 * Provides secure, authenticated communication between the React frontend
 * and the Express backend microservices. Automatically attaches active
 * Supabase Auth JWT tokens for protected requests, and leverages the
 * resilient BackendBridge engine to automatically call, listen, and respond
 * through staging.rentmaikar.com when direct contact is lost.
 */

import { backendBridge, BridgeStatusInfo, BidirectionalLinkTestResult, BridgeEventPacket } from "./backend-bridge";

export interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
  environment: string;
  direct_connection_bridge?: {
    enabled: boolean;
    mode: string;
    frontend: string;
    backend: string;
    listening_to_frontend: boolean;
  };
}

export interface DomainMappingResponse {
  status: string;
  domains: {
    frontendDomain: string;
    frontendOrigin: string;
    backendDomain: string;
    backendUrl: string;
    incomingMailDomain: string;
    outgoingMailDomain: string;
  };
  bridge_active?: boolean;
}

export interface CpaasSendMessageRequest {
  channel: "sms" | "whatsapp";
  recipient: string;
  message: string;
  region?: "USA" | "Nigeria";
  metadata?: Record<string, unknown>;
}

export interface CpaasSendMessageResponse {
  success: boolean;
  messageId?: string;
  status?: string;
  provider?: string;
  error?: string;
}

class BackendClient {
  public readonly bridge = backendBridge;

  /**
   * Health and readiness probe with automated failover to staging.rentmaikar.com
   */
  async checkHealth(): Promise<BackendHealthResponse> {
    return backendBridge.call<BackendHealthResponse>("/health", {
      method: "GET",
    });
  }

  /**
   * Get canonical platform domains configuration
   */
  async getDomains(): Promise<DomainMappingResponse> {
    return backendBridge.call<DomainMappingResponse>("/domains", {
      method: "GET",
    });
  }

  /**
   * Check Direct Connection Bridge status between rentmaikar.com and staging.rentmaikar.com
   */
  async checkBridgeStatus(): Promise<{
    enabled: boolean;
    listening: boolean;
    frontendDomain: string;
    backendDomain: string;
    mode?: string;
    activeListeners?: number;
    message?: string;
  }> {
    try {
      const data = await backendBridge.call<any>("/bridge/status", {
        method: "GET",
        timeoutMs: 6000,
      });

      return {
        enabled: Boolean(data.direct_connection_enabled),
        listening: Boolean(data.direct_connection_enabled),
        frontendDomain: data.frontend_domain || "rentmaikar.com",
        backendDomain: data.backend_domain || "staging.rentmaikar.com",
        mode: data.mode || "active",
        activeListeners: data.active_listeners || 0,
      };
    } catch (err: any) {
      return {
        enabled: false,
        listening: false,
        frontendDomain: "rentmaikar.com",
        backendDomain: "staging.rentmaikar.com",
        message: err.message,
      };
    }
  }

  /**
   * Send multi-channel message via CPaaS backend service
   */
  async sendCpaasMessage(req: CpaasSendMessageRequest): Promise<CpaasSendMessageResponse> {
    return backendBridge.call<CpaasSendMessageResponse>("/cpaas/send", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  /**
   * 1. CALL: Execute backend action through staging fallback if direct contact lost
   */
  async call<T = any>(endpoint: string, options?: any): Promise<T> {
    return backendBridge.call<T>(endpoint, options);
  }

  /**
   * 2. LISTEN: Subscribe to backend events streamed from staging.rentmaikar.com
   */
  listen(eventType: string, handler: (event: BridgeEventPacket) => void): () => void {
    return backendBridge.listen(eventType, handler);
  }

  /**
   * 3. RESPOND: Dispatch telemetry or acknowledgment response to staging.rentmaikar.com
   */
  async respond(correlationId: string, eventType: string, payload?: any): Promise<boolean> {
    return backendBridge.respond(correlationId, eventType, payload);
  }

  /**
   * Ping backend through staging.rentmaikar.com
   */
  async ping(): Promise<number> {
    return backendBridge.ping();
  }

  /**
   * Test complete bidirectional communication link (Call, Listen, Respond)
   */
  async testBidirectionalLink(): Promise<BidirectionalLinkTestResult> {
    return backendBridge.testBidirectionalLink();
  }

  /**
   * Get current bridge status info
   */
  getStatusInfo(): BridgeStatusInfo {
    return backendBridge.getStatusInfo();
  }

  /**
   * Diagnostic simulation toggle: simulate loss of direct contact
   */
  simulateLossOfContact(simulate: boolean): void {
    backendBridge.simulateLossOfContact(simulate);
  }
}

export const backendClient = new BackendClient();

