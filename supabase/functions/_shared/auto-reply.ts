// Shared auto-reply engine for the unified inbox.
// Evaluates admin-configured keyword rules against an inbound message and,
// when a rule matches, sends the configured reply on the same channel.

import { renderPlaceholders, resolvePlaceholderValues } from "./reply-placeholders.ts";

type AnySupabase = any;

interface AutoReplyContext {
  conversationId: string;
  content: string;
  channel: string; // sms | whatsapp | email
  region?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
}

interface AutoReplyRule {
  id: string;
  name: string;
  keywords: string[];
  match_type: string; // any | all | exact
  canned_reply_id: string | null;
  reply_body: string | null;
  channel: string | null;
  region: string | null;
  priority: number;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  trigger_count: number;
}

function matchedKeywords(rule: AutoReplyRule, text: string): string[] {
  const haystack = (text || "").toLowerCase().trim();
  if (!haystack) return [];
  const keywords = (rule.keywords || [])
    .map((k) => (k || "").toLowerCase().trim())
    .filter(Boolean);
  if (keywords.length === 0) return [];

  switch (rule.match_type) {
    case "exact":
      return keywords.filter((k) => haystack === k);
    case "all":
      return keywords.every((k) => haystack.includes(k)) ? keywords : [];
    case "any":
    default:
      return keywords.filter((k) => haystack.includes(k));
  }
}

function matches(rule: AutoReplyRule, text: string): boolean {
  return matchedKeywords(rule, text).length > 0;
}

/**
 * Returns true when an auto-reply was sent.
 * Never throws — auto-reply failures must not break webhook ingestion.
 */
export async function maybeAutoReply(
  supabase: AnySupabase,
  ctx: AutoReplyContext,
): Promise<boolean> {
  try {
    const { data: rules, error } = await supabase
      .from("inbox_auto_reply_rules")
      .select(
        "id,name,keywords,match_type,canned_reply_id,reply_body,channel,region,priority,cooldown_minutes,last_triggered_at,trigger_count",
      )
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (error || !rules || rules.length === 0) return false;

    const now = Date.now();

    const logAudit = async (row: Record<string, unknown>) => {
      try {
        await supabase.from("inbox_reply_audit").insert({
          conversation_id: ctx.conversationId,
          channel: ctx.channel,
          reply_type: "auto",
          ...row,
        });
      } catch (auditErr) {
        console.error("[auto-reply] audit log failed", auditErr);
      }
    };

    let rule: AutoReplyRule | undefined;
    let hits: string[] = [];

    for (const r of rules as AutoReplyRule[]) {
      if (r.channel && r.channel !== ctx.channel) continue;
      if (r.region && ctx.region && r.region !== ctx.region) continue;
      const keywordHits = matchedKeywords(r, ctx.content);
      if (keywordHits.length === 0) continue;

      if (r.last_triggered_at && r.cooldown_minutes > 0) {
        const elapsedMin = (now - new Date(r.last_triggered_at).getTime()) / 60000;
        if (elapsedMin < r.cooldown_minutes) {
          // Matched, but suppressed by cooldown — record it and keep scanning.
          await logAudit({
            rule_id: r.id,
            rule_name: r.name,
            matched_keywords: keywordHits,
            match_type: r.match_type,
            cooldown_minutes: r.cooldown_minutes,
            cooldown_status: "suppressed",
            cooldown_remaining_minutes: Number((r.cooldown_minutes - elapsedMin).toFixed(2)),
            canned_reply_id: r.canned_reply_id,
            delivered: false,
            error_message: "Suppressed by cooldown",
          });
          continue;
        }
      }

      rule = r;
      hits = keywordHits;
      break;
    }

    if (!rule) return false;

    let body = rule.reply_body || "";
    let cannedTitle: string | null = null;
    if (!body && rule.canned_reply_id) {
      const { data: canned } = await supabase
        .from("inbox_canned_replies")
        .select("body,title")
        .eq("id", rule.canned_reply_id)
        .maybeSingle();
      body = canned?.body || "";
      cannedTitle = canned?.title || null;
    }
    const rawBody = body;
    if (!body.trim()) {
      await logAudit({
        rule_id: rule.id,
        rule_name: rule.name,
        matched_keywords: hits,
        match_type: rule.match_type,
        cooldown_minutes: rule.cooldown_minutes,
        cooldown_status: "elapsed",
        canned_reply_id: rule.canned_reply_id,
        canned_reply_title: cannedTitle,
        delivered: false,
        error_message: "Rule matched but reply body was empty",
      });
      return false;
    }

    // Resolve dynamic placeholders ({{first_name}}, {{vehicle}}, ...) before sending.
    if (/\{\{\s*[a-z0-9_]+\s*\}\}/i.test(rawBody)) {
      const values = await resolvePlaceholderValues(supabase, ctx.conversationId);
      body = renderPlaceholders(rawBody, values);
    }

    const { data: inserted } = await supabase
      .from("inbox_messages")
      .insert({
        conversation_id: ctx.conversationId,
        channel: ctx.channel,
        content: body,
        sender_type: "admin",
        sender_name: "Rentmaikar Auto-Reply",
        is_read: true,
        metadata: { auto_reply_rule_id: rule.id, auto_reply_rule_name: rule.name },
      })
      .select("id")
      .maybeSingle();

    await supabase
      .from("inbox_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", ctx.conversationId);

    // Deliver on the originating channel.
    let delivered = false;
    let deliveryError: string | null = null;
    try {
      if ((ctx.channel === "sms" || ctx.channel === "whatsapp") && ctx.recipientPhone) {
        await supabase.functions.invoke("send-inbox-reply", {
          body: {
            conversationId: ctx.conversationId,
            messageContent: body,
            channel: ctx.channel,
            recipientPhone: ctx.recipientPhone,
            skipPersist: true,
          },
        });
        delivered = true;
      } else if (ctx.channel === "email" && ctx.recipientEmail) {
        await supabase.functions.invoke("send-email-reply", {
          body: {
            conversationId: ctx.conversationId,
            messageContent: body,
            recipientEmail: ctx.recipientEmail,
            skipPersist: true,
          },
        });
        delivered = true;
      } else {
        deliveryError = "No recipient address for channel";
      }
    } catch (deliveryErr) {
      deliveryError = deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr);
      console.error("[auto-reply] delivery failed", deliveryErr);
    }

    await supabase
      .from("inbox_auto_reply_rules")
      .update({
        last_triggered_at: new Date().toISOString(),
        trigger_count: (rule.trigger_count || 0) + 1,
      })
      .eq("id", rule.id);

    await logAudit({
      message_id: inserted?.id ?? null,
      rule_id: rule.id,
      rule_name: rule.name,
      matched_keywords: hits,
      match_type: rule.match_type,
      cooldown_minutes: rule.cooldown_minutes,
      cooldown_status: rule.cooldown_minutes > 0 ? "elapsed" : "not_applicable",
      canned_reply_id: rule.canned_reply_id,
      canned_reply_title: cannedTitle,
      body_preview: body.slice(0, 280),
      delivered,
      error_message: deliveryError,
    });

    return true;
  } catch (err) {
    console.error("[auto-reply] failed", err);
    return false;
  }
}
