// Shared helper for logging messaging events to the messaging_events table

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type MessagingChannel = "sms" | "whatsapp" | "email" | "voip" | "push";
export type MessagingProvider = "twilio" | "termii" | "resend" | "sent";
export type MessagingDirection = "inbound" | "outbound";

export type MessagingEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "bounced"
  | "clicked"
  | "opened"
  | "unsubscribed"
  | "complained"
  | "rejected"
  | "deferred"
  | "blocked"
  | "opted_out"
  | "opted_in"
  | "received"
  | "forwarded"
  | "escalated"
  | "voicemail"
  | "ringing"
  | "in_progress"
  | "completed"
  | "busy"
  | "no_answer"
  | "canceled"
  | "recording_completed"
  | "recording_failed";

export interface MessagingEvent {
  channel: MessagingChannel;
  provider: MessagingProvider;
  event_type: MessagingEventType;
  direction?: MessagingDirection;
  recipient?: string;
  sender?: string;
  region?: string;
  provider_event_id?: string;
  provider_message_id?: string;
  conversation_id?: string;
  user_id?: string;
  message_id?: string;
  template_name?: string;
  error_code?: string;
  error_message?: string;
  raw_payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function logMessagingEvent(
  supabase: ReturnType<typeof createClient>,
  event: MessagingEvent,
): Promise<void> {
  try {
    await supabase.from("messaging_events").insert({
      channel: event.channel,
      provider: event.provider,
      event_type: event.event_type,
      direction: event.direction || "outbound",
      recipient: event.recipient,
      sender: event.sender,
      region: event.region || "USA",
      provider_event_id: event.provider_event_id,
      provider_message_id: event.provider_message_id,
      conversation_id: event.conversation_id,
      user_id: event.user_id,
      message_id: event.message_id,
      template_name: event.template_name,
      error_code: event.error_code,
      error_message: event.error_message,
      raw_payload: event.raw_payload || {},
      metadata: event.metadata || {},
    });
  } catch (err) {
    console.warn("[MessagingEvents] Failed to log event:", err);
  }
}

export async function logMessagingEvents(
  supabase: ReturnType<typeof createClient>,
  events: MessagingEvent[],
): Promise<void> {
  try {
    const rows = events.map((e) => ({
      channel: e.channel,
      provider: e.provider,
      event_type: e.event_type,
      direction: e.direction || "outbound",
      recipient: e.recipient,
      sender: e.sender,
      region: e.region || "USA",
      provider_event_id: e.provider_event_id,
      provider_message_id: e.provider_message_id,
      conversation_id: e.conversation_id,
      user_id: e.user_id,
      message_id: e.message_id,
      template_name: e.template_name,
      error_code: e.error_code,
      error_message: e.error_message,
      raw_payload: e.raw_payload || {},
      metadata: e.metadata || {},
    }));
    await supabase.from("messaging_events").insert(rows);
  } catch (err) {
    console.warn("[MessagingEvents] Failed to log batch events:", err);
  }
}
