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
  destinationPhone: string,
  channel: SentChannel,
  override?: CPaaSProvider
): CPaaSProvider {
  /*
   * Normal production routing:
   *
   * REGION → CHANNEL → SENT.dm PRIMARY
   *
   * Region determines fallback eligibility, not the primary provider.
   *
   * Explicit providerOverride remains available for controlled
   * diagnostics/testing and existing administrative flows.
   */

  if (override && override !== "auto") {
    return override;
  }

  // Existing channel configuration must never silently replace
  // the universal SENT.dm primary policy.
  if (channel === "sms" || channel === "whatsapp") {
    return "sent";
  }

  if (this.config.primaryProvider === "sent") {
    return "sent";
  }

  return "sent";
}

  /**
   * Universal message dispatcher across Sent, Twilio, and Termii
   */
  async sendMessage(payload: UnifiedMessagePayload): Promise<UnifiedMessageResult> {
    const rawTo = Array.isArray(payload.to) ? payload.to[0] : payload.to;
    const formattedTo = rawTo.startsWith("+") ? rawTo : `+${rawTo.replace(/[^0-9]/g, "")}`;
    const channel: SentChannel = payload.channel || "sms";
    const selectedProvider = this.resolveProvider(formattedTo, channel, payload.providerOverride);

    try {
      if (selectedProvider === "sent") {
        return await this.dispatchViaSent(formattedTo, channel, payload);
      } else if (selectedProvider === "twilio") {
        return await this.dispatchViaTwilio(formattedTo, channel, payload);
      } else if (selectedProvider === "termii") {
        return await this.dispatchViaTermii(formattedTo, channel, payload);
      } else {
        // Default to Sent.dm global CPaaS
        return await this.dispatchViaSent(formattedTo, channel, payload);
      }
    } catch (err: any) {
      console.warn(`[CPaaSRouter] Provider ${selectedProvider} failed:`, err);

      // Handle Failover if enabled
      if (this.config.enableFailover) {
        const fallback = await this.getFallbackProvider(
  selectedProvider,
  formattedTo,
  channel
);
        if (fallback && fallback !== selectedProvider) {
          console.info(`[CPaaSRouter] Triggering automatic failover from ${selectedProvider} to ${fallback}`);
          try {
            let fallbackResult: UnifiedMessageResult;
            if (fallback === "sent") {
              fallbackResult = await this.dispatchViaSent(formattedTo, channel, payload);
            } else if (fallback === "twilio") {
              fallbackResult = await this.dispatchViaTwilio(formattedTo, channel, payload);
            } else {
              fallbackResult = await this.dispatchViaTermii(formattedTo, channel, payload);
            }
            return {
              ...fallbackResult,
              failoverTriggered: true,
            };
          } catch (failoverErr: any) {
            console.error(`[CPaaSRouter] Failover to ${fallback} also failed:`, failoverErr);
          }
        }
      }

      return {
        success: false,
        provider: selectedProvider,
        messageId: `err_${Date.now()}`,
        channel,
        status: "failed",
        recipient: formattedTo,
        timestamp: new Date().toISOString(),
        error: err.message || "Message dispatch failed",
      };
    }
  }

  private async getFallbackProvider(
  current: CPaaSProvider,
  destinationPhone: string,
  channel: SentChannel,
): Promise<CPaaSProvider | null> {
  // SENT.dm is the universal primary for SMS/WhatsApp.
  // If an explicitly selected secondary provider fails, return to SENT.dm.
  if (current !== "sent") {
    return "sent";
  }

  if (channel !== "sms" && channel !== "whatsapp") {
    return null;
  }

  const normalized = destinationPhone.trim().replace(/\s+/g, "");

  /*
   * Canonical region resolution:
   *
   * get_allowed_regions() is the existing Region Builder-backed authority.
   * This code only consumes its phone_prefix values; it does not maintain
   * a communications-specific country list.
   */
  const { data: regions, error: regionError } =
    await supabase.rpc("get_allowed_regions");

  if (regionError || !Array.isArray(regions)) {
    console.warn(
      "[CPaaSRouter] Canonical region resolution failed:",
      regionError,
    );
    return null;
  }

  const matchedRegion = regions
    .filter((region: any) => {
      const prefix = String(region?.phone_prefix || "").trim();
      return prefix.length > 0 && normalized.startsWith(prefix);
    })
    .sort(
      (a: any, b: any) =>
        String(b?.phone_prefix || "").length -
        String(a?.phone_prefix || "").length,
    )[0];

  /*
   * Unresolved destination remains unresolved.
   * NEVER convert it to USA.
   */
  if (!matchedRegion) {
    return null;
  }

  const prefix = String(matchedRegion.phone_prefix || "").trim();

  /*
   * communication_providers is the existing canonical provider registry.
   * It determines the configured regional fallback.
   */
  const { data: configuredProvider, error: providerError } =
    await supabase
      .from("communication_providers")
      .select("sms_provider, whatsapp_provider, is_active")
      .eq("country_code_prefix", prefix)
      .eq("is_active", true)
      .maybeSingle();

  if (providerError || !configuredProvider) {
    if (providerError) {
      console.warn(
        "[CPaaSRouter] Provider configuration lookup failed:",
        providerError,
      );
    }

    return null;
  }

  const configured =
    channel === "whatsapp"
      ? configuredProvider.whatsapp_provider
      : configuredProvider.sms_provider;

  if (
    configured === "twilio" ||
    configured === "termii"
  ) {
    return configured;
  }

  /*
   * If configuration points to SENT.dm, there is no distinct fallback.
   * Never invent another provider.
   */
  return null;
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
        providerOverride: "sent",
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

    return {
      success: true,
      provider: "sent",
      messageId: data?.messageId || `sent_${Date.now()}`,
      channel: data?.channel || channel,
      status: "delivered",
      recipient: to,
      timestamp: new Date().toISOString(),
    };
  }


  private async dispatchViaTwilio(
    to: string, 
    channel: SentChannel, 
    payload: UnifiedMessagePayload
  ): Promise<UnifiedMessageResult> {
    const { data, error } = await supabase.functions.invoke("send-sms-notification", {
      body: {
        phone: to,
        channel: channel === "whatsapp" ? "whatsapp" : "sms",
        notificationType: payload.notificationType || "general",
        customMessage: payload.message,
        providerOverride: "twilio",
        sandbox: this.config.sandboxMode,
        metadata: payload.metadata,
      },
    });

    if (error) throw error;

    return {
      success: true,
      provider: "twilio",
      messageId: data?.sid || `tw_${Date.now()}`,
      channel,
      status: "delivered",
      recipient: to,
      timestamp: new Date().toISOString(),
    };
  }

  private async dispatchViaTermii(
    to: string, 
    channel: SentChannel, 
    payload: UnifiedMessagePayload
  ): Promise<UnifiedMessageResult> {
    const { data, error } = await supabase.functions.invoke("send-sms-notification", {
      body: {
        phone: to,
        channel: channel === "whatsapp" ? "whatsapp" : "sms",
        notificationType: payload.notificationType || "general",
        customMessage: payload.message,
        provider: "termii",
        providerOverride: "termii",
        sandbox: this.config.sandboxMode,
        metadata: payload.metadata,
      },
    });

    if (error) throw error;

    return {
      success: true,
      provider: "termii",
      messageId: data?.message_id || `tm_${Date.now()}`,
      channel,
      status: "delivered",
      recipient: to,
      timestamp: new Date().toISOString(),
    };
  }
}

export const cpaasRouter = new CPaaSRouterService();
