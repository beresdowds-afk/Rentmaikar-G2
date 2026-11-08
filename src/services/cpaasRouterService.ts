import { SentChannel } from "@/integrations/sent/types";
import { supabase } from "@/integrations/supabase/client";

export type CPaaSProvider = "sent" | "twilio" | "termii" ;

export interface CPaaSConfig {
  primaryProvider: CPaaSProvider;
  enableFailover: boolean;
  fallbackProvider: CPaaSProvider;
  sandboxMode: boolean;
  defaultSenderId: string;
  channelRouting: {
    sms: CPaaSProvider;
    whatsapp: CPaaSProvider;
    rcs: CPaaSProvider;
  };
}

const STORAGE_KEY = "rentmaikar_cpaas_config";

const DEFAULT_CONFIG: CPaaSConfig = {
  primaryProvider: "sent",
  enableFailover: true,
  // Twilio is voice-only (no messaging approval) — messaging failover is Sent.
  fallbackProvider: "sent",
  sandboxMode: false,
  defaultSenderId: "Rentmaikar",
  channelRouting: {
    sms: "sent",
    whatsapp: "sent",
    rcs: "sent",
  },
};

export interface UnifiedMessagePayload {
  to: string | string[];
  message?: string;
  channel?: "sms" | "whatsapp" | "rcs";
  templateId?: string;
  templateParams?: Record<string, string | number>;
  notificationType?: string;
  customSenderId?: string;
  metadata?: Record<string, any>;
  /** Public media URLs (WhatsApp/RCS only). */
  mediaUrls?: string[];
  /** @deprecated Provider selection is enforced by the server-side sender. */
  providerOverride?: CPaaSProvider;

}

export interface UnifiedMessageResult {
  success: boolean;
  provider: CPaaSProvider;
  messageId: string;
  channel: string;
  status: string;
  recipient: string;
  timestamp: string;
  error?: string;
  failoverTriggered?: boolean;
}

export class CPaaSRouterService {
  private config: CPaaSConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  getConfig(): CPaaSConfig {
    return { ...this.config };
  }

  saveConfig(newConfig: Partial<CPaaSConfig>): CPaaSConfig {
    this.config = { ...this.config, ...newConfig };
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch (e) {
        console.error("Failed to save CPaaS config to localStorage", e);
      }
    }
    return this.config;
  }

  private loadConfig(): CPaaSConfig {
    if (typeof window !== "undefined") {
      try {
        const item = localStorage.getItem(STORAGE_KEY);
        if (item) {
          return { ...DEFAULT_CONFIG, ...JSON.parse(item) };
        }
      } catch (e) {
        console.error("Failed to load CPaaS config from localStorage", e);
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Determine the optimal CPaaS provider for this dispatch
   */
  resolveProvider(
    _destinationPhone: string,
    _channel: SentChannel,
    _override?: CPaaSProvider,
  ): CPaaSProvider {
    return "sent";
  }

  /**
   * Universal message dispatcher across Sent, Twilio, and Termii
   */
  async sendMessage(payload: UnifiedMessagePayload): Promise<UnifiedMessageResult> {
    const rawTo = Array.isArray(payload.to) ? payload.to[0] : payload.to;
    const formattedTo = rawTo.startsWith("+") ? rawTo : `+${rawTo.replace(/[^0-9]/g, "")}`;
    const channel: SentChannel = payload.channel || "sms";

    try {
      return await this.dispatchViaSent(formattedTo, channel, payload);
    } catch {
      return {
        success: false,
        provider: "sent",
        messageId: "",
        channel,
        status: "failed",
        recipient: formattedTo,
        timestamp: new Date().toISOString(),
        error: "Message dispatch failed",
      };
    }
  }

  private async dispatchViaSent(
    to: string, 
    channel: SentChannel, 
    payload: UnifiedMessagePayload
  ): Promise<UnifiedMessageResult> {
    // Sent.dm is dispatched server-side (the API key never reaches the browser).
    const isWa = channel === "whatsapp";
    const { data, error } = await supabase.functions.invoke("send-sms-notification", {
      body: {
        phone: to,
        channel: isWa ? "whatsapp" : "sms",
        notificationType: payload.notificationType || "general",
        customMessage: payload.message,
        sandbox: this.config.sandboxMode,
        ...(isWa && payload.templateId
          ? {
              whatsappTemplateId: payload.templateId,
              whatsappTemplateParams: payload.templateParams,
            }
          : {}),
        ...(isWa && payload.mediaUrls?.length ? { mediaUrls: payload.mediaUrls } : {}),
        metadata: payload.metadata,
      },
    });


    if (error) throw error;
    if (data && data.success === false) throw new Error(data.error || "Sent.dm dispatch failed");

    const provider = data?.provider;
    const messageId = data?.messageId;
    if (
      !["sent", "twilio", "termii"].includes(provider) ||
      typeof messageId !== "string" ||
      !messageId.trim()
    ) {
      throw new Error("SMS service returned an invalid dispatch result");
    }

    if (data?.sandbox) {
      return {
        success: false,
        provider,
        messageId,
        channel: data?.channel || channel,
        status: "sandbox",
        recipient: to,
        timestamp: new Date().toISOString(),
        error: "Sandbox dispatch did not send an external message",
      };
    }

    return {
      success: true,
      provider,
      messageId,
      channel: data?.channel || channel,
      status: "accepted",
      recipient: to,
      timestamp: new Date().toISOString(),
    };
  }
}

export const cpaasRouter = new CPaaSRouterService();
