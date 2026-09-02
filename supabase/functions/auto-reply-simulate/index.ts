// Dry-run simulator for inbox auto-reply rules.
// Evaluates a hypothetical inbound message against the live rule set exactly
// like the webhook engine does — but never sends or logs anything.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { renderPlaceholders, resolvePlaceholderValues } from "../_shared/reply-placeholders.ts";

interface Rule {
  id: string;
  name: string;
  keywords: string[];
  match_type: string;
  canned_reply_id: string | null;
  reply_body: string | null;
  channel: string | null;
  region: string | null;
  priority: number;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  is_active: boolean;
}

function matchedKeywords(rule: Rule, text: string): string[] {
  const haystack = (text || "").toLowerCase().trim();
  if (!haystack) return [];
  const keywords = (rule.keywords || []).map((k) => (k || "").toLowerCase().trim()).filter(Boolean);
  if (keywords.length === 0) return [];
  switch (rule.match_type) {
    case "exact":
      return keywords.filter((k) => haystack === k);
    case "all":
      return keywords.every((k) => haystack.includes(k)) ? keywords : [];
    default:
      return keywords.filter((k) => haystack.includes(k));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.slice(7);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(url, service);

    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    // Authorization is decided in the database using the caller's own JWT.
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    const { data: isAssistant } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin_assistant",
    });
    if (!isAdmin && !isAssistant) return json({ error: "Forbidden" }, 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const content = typeof body.content === "string" ? body.content.slice(0, 2000) : "";
    const channel = typeof body.channel === "string" ? body.channel : "";
    const region = typeof body.region === "string" && body.region ? body.region : null;
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;

    if (!content.trim()) return json({ error: "content is required" }, 400);
    if (!["sms", "whatsapp", "email"].includes(channel)) {
      return json({ error: "channel must be sms, whatsapp or email" }, 400);
    }

    const { data: rulesData, error: rulesErr } = await admin
      .from("inbox_auto_reply_rules")
      .select(
        "id,name,keywords,match_type,canned_reply_id,reply_body,channel,region,priority,cooldown_minutes,last_triggered_at,is_active",
      )
      .order("priority", { ascending: true });

    if (rulesErr) return json({ error: rulesErr.message }, 500);

    const rules = (rulesData || []) as Rule[];
    const now = Date.now();

    let placeholderValues: Record<string, string | null | undefined> | null = null;
    if (conversationId) {
      placeholderValues = await resolvePlaceholderValues(admin, conversationId);
    }

    const evaluations: Array<Record<string, unknown>> = [];
    let winnerFound = false;

    for (const rule of rules) {
      const keywords = matchedKeywords(rule, content);
      const scopeMismatch =
        (rule.channel && rule.channel !== channel) ||
        (rule.region && region && rule.region !== region);

      if (!rule.is_active) {
        if (keywords.length > 0) {
          evaluations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            matchedKeywords: keywords,
            outcome: "paused",
            reason: "Rule is paused",
          });
        }
        continue;
      }

      if (scopeMismatch) {
        if (keywords.length > 0) {
          evaluations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            matchedKeywords: keywords,
            outcome: "out_of_scope",
            reason: `Scoped to ${rule.channel || "any channel"} / ${rule.region || "any region"}`,
          });
        }
        continue;
      }

      if (keywords.length === 0) continue;

      if (rule.last_triggered_at && rule.cooldown_minutes > 0) {
        const elapsedMin = (now - new Date(rule.last_triggered_at).getTime()) / 60000;
        if (elapsedMin < rule.cooldown_minutes) {
          evaluations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            matchedKeywords: keywords,
            outcome: "cooldown",
            reason: `Cooldown active — ${(rule.cooldown_minutes - elapsedMin).toFixed(1)} min remaining`,
          });
          continue;
        }
      }

      if (winnerFound) {
        evaluations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          matchedKeywords: keywords,
          outcome: "shadowed",
          reason: "A higher-priority rule already replied",
        });
        continue;
      }

      // Resolve the body exactly like the engine would.
      let replyBody = rule.reply_body || "";
      let cannedTitle: string | null = null;
      if (!replyBody && rule.canned_reply_id) {
        const { data: canned } = await admin
          .from("inbox_canned_replies")
          .select("body,title")
          .eq("id", rule.canned_reply_id)
          .maybeSingle();
        replyBody = canned?.body || "";
        cannedTitle = canned?.title || null;
      }

      if (!replyBody.trim()) {
        evaluations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          matchedKeywords: keywords,
          outcome: "empty_body",
          reason: "Rule matched but its reply body is empty — nothing would be sent",
        });
        continue;
      }

      const rendered = placeholderValues
        ? renderPlaceholders(replyBody, placeholderValues)
        : replyBody;

      winnerFound = true;
      evaluations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        priority: rule.priority,
        matchedKeywords: keywords,
        outcome: "would_send",
        cannedReplyTitle: cannedTitle,
        body: rendered,
        rawBody: replyBody,
        cooldownMinutes: rule.cooldown_minutes,
      });
    }

    return json({
      channel,
      region,
      content,
      placeholdersResolved: !!placeholderValues,
      wouldSend: winnerFound,
      evaluations,
    });
  } catch (err) {
    console.error("[auto-reply-simulate] failed", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
