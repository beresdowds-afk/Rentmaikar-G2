// ════════════════════════════════════════════════════════════
// Case intake — turns any inbound customer interaction into a case.
//
// Every inbound SMS/WhatsApp message on the public messaging number
// (+1 608 548 9220, Sent.dm) and every inbound call is attached to a
// `support_cases` record so the admin panel and the customer portal show one
// continuous history per customer.
// ════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface CaseMessageIntake {
  channel: "sms" | "whatsapp";
  region: string;
  /** Customer number (E.164). */
  from: string;
  /** Public alias the customer wrote to. */
  to: string;
  body: string;
  mediaUrl?: string | null;
  providerMessageId?: string | null;
}

export interface CaseIntakeResult {
  conversationId: string | null;
  caseId: string | null;
}

/** Find the profile behind a phone number, if the customer is registered. */
async function profileForPhone(supabase: Supa, phone: string) {
  if (!phone) return null;
  const { data } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .eq("phone", phone)
    .maybeSingle();
  return data ?? null;
}

/**
 * Upsert the inbox thread for this customer/channel, store the message and
 * make sure a case exists for it. Never throws — intake must not break the
 * webhook that calls it.
 */
export async function intakeCaseMessage(
  supabase: Supa,
  msg: CaseMessageIntake,
): Promise<CaseIntakeResult> {
  try {
    const phone = (msg.from || "").replace(/^whatsapp:/i, "").trim();
    if (!phone) return { conversationId: null, caseId: null };

    const profile = await profileForPhone(supabase, phone);
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("inbox_conversations")
      .select("id, case_id")
      .eq("user_phone", phone)
      .eq("channel", msg.channel)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string | null = existing?.id ?? null;

    if (conversationId) {
      await supabase
        .from("inbox_conversations")
        .update({ last_message_at: now, status: "open", updated_at: now })
        .eq("id", conversationId);
    } else {
      const { data: created, error } = await supabase
        .from("inbox_conversations")
        .insert({
          channel: msg.channel,
          region: msg.region,
          user_phone: phone,
          user_id: profile?.user_id ?? null,
          user_name: profile?.full_name ?? null,
          user_email: profile?.email ?? null,
          status: "open",
          subject: `${msg.channel === "whatsapp" ? "WhatsApp" : "SMS"} from ${phone}`,
          last_message_at: now,
        })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[case-intake] conversation insert failed:", error.message);
        return { conversationId: null, caseId: null };
      }
      conversationId = created?.id ?? null;
    }

    if (!conversationId) return { conversationId: null, caseId: null };

    const { error: msgError } = await supabase.from("inbox_messages").insert({
      conversation_id: conversationId,
      channel: msg.channel,
      sender_type: "user",
      sender_id: profile?.user_id ?? null,
      sender_name: profile?.full_name ?? phone,
      content: msg.body || (msg.mediaUrl ? "(attachment)" : "(no text)"),
      external_id: msg.providerMessageId ?? null,
      metadata: {
        public_alias: msg.to,
        media_url: msg.mediaUrl ?? null,
        provider: "sent",
      },
    });
    if (msgError) console.error("[case-intake] message insert failed:", msgError.message);

    const { data: caseId, error: caseError } = await supabase.rpc("case_for_conversation", {
      p_conversation_id: conversationId,
      p_channel: msg.channel,
      p_subject: null,
    });
    if (caseError) {
      console.error("[case-intake] case_for_conversation failed:", caseError.message);
      return { conversationId, caseId: null };
    }

    // Keep the customer identity on the case fresh.
    if (caseId) {
      await supabase
        .from("support_cases")
        .update({
          customer_phone: phone,
          customer_user_id: profile?.user_id ?? null,
          customer_name: profile?.full_name ?? null,
          customer_email: profile?.email ?? null,
        })
        .eq("id", caseId)
        .is("customer_phone", null);
    }

    return { conversationId, caseId: (caseId as string) ?? null };
  } catch (e) {
    console.error("[case-intake] unexpected failure:", e);
    return { conversationId: null, caseId: null };
  }
}
