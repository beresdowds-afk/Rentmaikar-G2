import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { manychat } from "../marketing/manychatAdapter";
import { sentBackendClient } from "./sentClient";
import { supabaseBackendService } from "./supabaseService";

export type InboxSocialChannel =
  | "instagram"
  | "facebook_messenger"
  | "manychat"
  | "tiktok"
  | "linkedin"
  | "meta";

export interface InboxReplyInput {
  conversationId: string;
  messageContent: string;
  channel: string;
  recipientId?: string;
  recipientPhone?: string;
  attachments?: Array<{
    filename?: string;
    contentType?: string;
    size?: number;
    storagePath?: string;
    url: string;
  }>;
  metadata?: Record<string, unknown>;
  whatsappTemplateId?: string;
  whatsappTemplateLanguage?: string;
  whatsappTemplateParams?: unknown[];
}

export interface InboxReplyResult {
  success: boolean;
  provider?: string;
  channel: string;
  messageId?: string;
  status?: string;
  error?: string;
  automated?: boolean;
}

const SOCIAL_CHANNELS = new Set<InboxSocialChannel>([
  "instagram",
  "facebook_messenger",
  "manychat",
  "tiktok",
  "linkedin",
  "meta",
]);

function getAdminClient(): SupabaseClient {
  return supabaseBackendService.getAdminClient();
}

function normalizeChannel(channel: string): string {
  return String(channel || "").trim().toLowerCase();
}

async function updateInboxMessageDelivery(
  supabase: SupabaseClient,
  conversationId: string,
  messageContent: string,
  provider: string,
  messageId: string,
  status: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from("inbox_messages")
    .update({
      external_id: messageId,
      metadata: {
        ...metadata,
        provider,
        status,
        sent_at: new Date().toISOString(),
      },
    })
    .eq("conversation_id", conversationId)
    .eq("content", messageContent)
    .eq("sender_type", "admin")
    .is("external_id", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn(
      "[InboxReplyService] Failed to update inbox delivery metadata:",
      error.message,
    );
  }
}

/**
 * Dispatch an administrator's Platform Inbox reply.
 *
 * IMPORTANT:
 * - Email is deliberately NOT supported here.
 * - SMS/WhatsApp remain separate communication services.
 * - Social replies are dispatched through their actual social provider.
 */
export async function sendInboxReply(
  input: InboxReplyInput,
): Promise<InboxReplyResult> {
  const channel = normalizeChannel(input.channel);

  if (!input.conversationId) {
    return {
      success: false,
      channel,
      error: "conversationId is required",
    };
  }

  if (!input.messageContent?.trim()) {
    return {
      success: false,
      channel,
      error: "messageContent is required",
    };
  }

  // ------------------------------------------------------------
  // EMAIL IS INTENTIONALLY NOT PART OF THIS SERVICE.
  // ------------------------------------------------------------
  if (channel === "email") {
    return {
      success: false,
      channel,
      error:
        "Email is not supported by send-inbox-reply. Use the application email service.",
    };
  }

  const supabase = getAdminClient();

  try {
    const { data: conversation, error: conversationError } =
      await supabase
        .from("inbox_conversations")
        .select("id, region, metadata, channel")
        .eq("id", input.conversationId)
        .single();

    if (conversationError || !conversation) {
      throw new Error(
        conversationError?.message || "Inbox conversation not found",
      );
    }

    const metadata =
      (conversation.metadata as Record<string, unknown> | null) || {};

    // ============================================================
    // SOCIAL MEDIA DISPATCH
    // ============================================================

    if (SOCIAL_CHANNELS.has(channel as InboxSocialChannel)) {
      return await dispatchSocialReply({
        supabase,
        conversation,
        input,
        channel,
        metadata,
      });
    }

    // ============================================================
    // SMS / WHATSAPP
    //
    // Keep these on the established CPaaS service rather than
    // sending them through the Marketing Engine.
    // ============================================================

    if (channel === "sms" || channel === "whatsapp") {
      return {
        success: false,
        channel,
        error:
          "SMS/WhatsApp dispatch must use the established CPaaS messaging service; it is not part of the social Inbox dispatcher.",
      };
    }

    return {
      success: false,
      channel,
      error: `Unsupported Inbox reply channel: ${channel}`,
    };
  } catch (error: any) {
    console.error("[InboxReplyService] Dispatch failed:", error);

    return {
      success: false,
      channel,
      error: error?.message || "Inbox reply dispatch failed",
    };
  }
}

async function dispatchSocialReply({
  supabase,
  conversation,
  input,
  channel,
  metadata,
}: {
  supabase: SupabaseClient;
  conversation: any;
  input: InboxReplyInput;
  channel: string;
  metadata: Record<string, unknown>;
}): Promise<InboxReplyResult> {
  // ------------------------------------------------------------
  // MANYCHAT / META SOCIAL DM
  // ------------------------------------------------------------

  if (
    channel === "instagram" ||
    channel === "facebook_messenger" ||
    channel === "manychat" ||
    channel === "meta"
  ) {
    const subscriberId =
      input.recipientId ||
      (metadata.manychat_subscriber_id as string | undefined);

    if (!subscriberId) {
      throw new Error(
        "ManyChat subscriber ID is missing from the Inbox conversation",
      );
    }

    if (!manychat.isConfigured()) {
      throw new Error(
        "ManyChat is not configured. MANYCHAT_API_TOKEN is required.",
      );
    }

    const result = await manychat.sendContent(
      subscriberId,
      input.messageContent,
    );

    if (!result.ok) {
      throw new Error(
        result.error || "ManyChat social message delivery failed",
      );
    }

    const messageId =
      result.messageId || `manychat_${Date.now()}`;

    await updateInboxMessageDelivery(
      supabase,
      input.conversationId,
      input.messageContent,
      "manychat",
      messageId,
      "sent",
      {
        social_channel: channel,
        automated: false,
      },
    );

    return {
      success: true,
      channel,
      provider: "manychat",
      messageId,
      status: "sent",
      automated: false,
    };
  }

  // ------------------------------------------------------------
  // TIKTOK
  // ------------------------------------------------------------

  if (channel === "tiktok") {
    /*
     * IMPORTANT:
     * Do NOT fake a successful TikTok send.
     *
     * The current Marketing Engine has a TikTok advertising adapter,
     * but that does not by itself establish a TikTok direct-message
     * sending API.
     *
     * This branch must be connected only when the repository contains
     * an authenticated TikTok messaging adapter/API.
     */
    throw new Error(
      "TikTok Inbox messaging adapter is not currently implemented. Do not simulate delivery.",
    );
  }

  // ------------------------------------------------------------
  // LINKEDIN
  // ------------------------------------------------------------

  if (channel === "linkedin") {
    /*
     * The existing LinkedIn adapter is primarily a Campaign Manager /
     * advertising adapter. It must not be treated as a LinkedIn DM
     * transport without an authenticated messaging capability.
     */
    throw new Error(
      "LinkedIn Inbox messaging adapter is not currently implemented. Do not simulate delivery.",
    );
  }

  throw new Error(`Unsupported social channel: ${channel}`);
      }
