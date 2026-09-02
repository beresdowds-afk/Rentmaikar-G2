import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logMessagingEvent } from "../_shared/messaging-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
), c => c.charCodeAt(0));

// Conversion link patterns
const CONVERSION_PATTERNS = [
  /\/dashboard/i,
  /\/payment/i,
  /\/register/i,
  /\/upload/i,
  /\/subscribe/i,
];

function isConversionLink(link: string): boolean {
  return CONVERSION_PATTERNS.some(p => p.test(link));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Expected paths after function name:
  // /email-tracking/open/{messageId}/pixel.png
  // /email-tracking/click/{messageId}?url=...&recipient=...
  // POST /email-tracking  { action: "bounce"|"complaint"|"metrics"|"suppression_check" }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  // ─── GET: Open Tracking Pixel ───
  if (req.method === "GET" && pathParts.includes("open")) {
    const messageIdIdx = pathParts.indexOf("open") + 1;
    const messageId = pathParts[messageIdIdx] || url.searchParams.get("mid");
    const recipient = url.searchParams.get("r") || "unknown";

    if (messageId) {
      try {
        await supabase.from("email_opens").insert({
          message_id: messageId,
          recipient: decodeURIComponent(recipient),
          ip_address: ip,
          user_agent: userAgent,
        });

        // Update email_logs delivered status
        await supabase
          .from("email_logs")
          .update({ delivered_at: new Date().toISOString(), status: "delivered" })
          .eq("message_id", messageId)
          .is("delivered_at", null);

        // Log open event
        await logMessagingEvent(supabase, {
          channel: 'email',
          provider: 'resend',
          event_type: 'opened',
          direction: 'outbound',
          recipient: decodeURIComponent(recipient),
          provider_message_id: messageId,
          metadata: { ip, user_agent: userAgent },
        });
      } catch (e) {
        console.error("Open tracking error:", e);
      }
    }

    return new Response(TRACKING_PIXEL, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  }

  // ─── GET: Click Tracking Redirect ───
  if (req.method === "GET" && pathParts.includes("click")) {
    const messageIdIdx = pathParts.indexOf("click") + 1;
    const messageId = pathParts[messageIdIdx] || url.searchParams.get("mid");
    const targetUrl = url.searchParams.get("url");
    const recipient = url.searchParams.get("r") || "unknown";

    if (messageId && targetUrl) {
      try {
        await supabase.from("email_clicks").insert({
          message_id: messageId,
          recipient: decodeURIComponent(recipient),
          link: targetUrl,
          is_conversion: isConversionLink(targetUrl),
        });

        await logMessagingEvent(supabase, {
          channel: 'email',
          provider: 'resend',
          event_type: 'clicked',
          direction: 'outbound',
          recipient: decodeURIComponent(recipient),
          provider_message_id: messageId,
          metadata: { link: targetUrl, is_conversion: isConversionLink(targetUrl) },
        });
      } catch (e) {
        console.error("Click tracking error:", e);
      }
    }

    // Redirect to actual URL
    const redirectTo = targetUrl || "https://rentmaikar.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }

  // ─── POST: Webhook Events & Metrics ───
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // ── Bounce Webhook ──
      if (action === "bounce") {
        const { messageId, recipient, bounceType, details } = body;
        if (!messageId || !recipient || !bounceType) {
          return new Response(JSON.stringify({ error: "Missing messageId, recipient, bounceType" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase.from("email_bounces").insert({
          message_id: messageId,
          recipient,
          bounce_type: bounceType,
          details: details || null,
        });

        // Update email_logs
        await supabase
          .from("email_logs")
          .update({ status: "bounced", failed_at: new Date().toISOString(), error: `Bounce: ${bounceType}` })
          .eq("message_id", messageId);

        // Hard bounces → suppression list
        if (bounceType === "hard" || bounceType === "permanent") {
          await supabase.from("email_suppression_list").upsert(
            { email: recipient.toLowerCase(), reason: `Hard bounce: ${bounceType}`, source_message_id: messageId },
            { onConflict: "email" }
          );
        }

        // Update analytics
        await upsertAnalytics(supabase, "bounce", "bounced");

        await logMessagingEvent(supabase, {
          channel: 'email',
          provider: 'resend',
          event_type: 'bounced',
          direction: 'outbound',
          recipient,
          provider_message_id: messageId,
          error_message: `Bounce: ${bounceType}`,
          metadata: { bounce_type: bounceType, details },
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Complaint Webhook ──
      if (action === "complaint") {
        const { messageId, recipient, complaintType } = body;
        if (!messageId || !recipient) {
          return new Response(JSON.stringify({ error: "Missing messageId, recipient" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase.from("email_complaints").insert({
          message_id: messageId,
          recipient,
          complaint_type: complaintType || "spam",
        });

        // Always suppress complained recipients
        await supabase.from("email_suppression_list").upsert(
          { email: recipient.toLowerCase(), reason: `Complaint: ${complaintType || "spam"}`, source_message_id: messageId },
          { onConflict: "email" }
        );

        // Update email_logs
        await supabase
          .from("email_logs")
          .update({ status: "complained" })
          .eq("message_id", messageId);

        await upsertAnalytics(supabase, "complaint", "complained");

        await logMessagingEvent(supabase, {
          channel: 'email',
          provider: 'resend',
          event_type: 'complained',
          direction: 'outbound',
          recipient,
          provider_message_id: messageId,
          metadata: { complaint_type: complaintType || "spam" },
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Suppression Check ──
      if (action === "check_suppression") {
        const { email } = body;
        if (!email) {
          return new Response(JSON.stringify({ error: "Missing email" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: entry } = await supabase
          .from("email_suppression_list")
          .select("*")
          .eq("email", email.toLowerCase())
          .eq("is_active", true)
          .maybeSingle();

        return new Response(JSON.stringify({ suppressed: !!entry, entry }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Metrics Query ──
      if (action === "metrics") {
        const { startDate, endDate, groupBy = "date" } = body;
        if (!startDate || !endDate) {
          return new Response(JSON.stringify({ error: "Missing startDate, endDate" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get sent count from email_logs
        const { data: logs } = await supabase
          .from("email_logs")
          .select("id, message_id, template, category, status, sent_at")
          .gte("created_at", startDate)
          .lte("created_at", endDate);

        const { data: opens } = await supabase
          .from("email_opens")
          .select("message_id")
          .gte("opened_at", startDate)
          .lte("opened_at", endDate);

        const { data: clicks } = await supabase
          .from("email_clicks")
          .select("message_id, is_conversion")
          .gte("clicked_at", startDate)
          .lte("clicked_at", endDate);

        const { data: bounces } = await supabase
          .from("email_bounces")
          .select("message_id")
          .gte("bounced_at", startDate)
          .lte("bounced_at", endDate);

        const { data: complaints } = await supabase
          .from("email_complaints")
          .select("message_id")
          .gte("complained_at", startDate)
          .lte("complained_at", endDate);

        const totalSent = logs?.filter(l => l.status === "sent" || l.status === "delivered").length || 0;
        const uniqueOpens = new Set(opens?.map(o => o.message_id) || []).size;
        const uniqueClicks = new Set(clicks?.map(c => c.message_id) || []).size;
        const totalBounces = bounces?.length || 0;
        const totalComplaints = complaints?.length || 0;
        const conversions = clicks?.filter(c => c.is_conversion).length || 0;

        const metrics = {
          totalSent,
          uniqueOpens,
          uniqueClicks,
          totalBounces,
          totalComplaints,
          conversions,
          openRate: totalSent > 0 ? (uniqueOpens / totalSent * 100).toFixed(2) + "%" : "0%",
          clickRate: totalSent > 0 ? (uniqueClicks / totalSent * 100).toFixed(2) + "%" : "0%",
          bounceRate: totalSent > 0 ? (totalBounces / totalSent * 100).toFixed(2) + "%" : "0%",
          complaintRate: totalSent > 0 ? (totalComplaints / totalSent * 100).toFixed(2) + "%" : "0%",
          conversionRate: uniqueClicks > 0 ? (conversions / uniqueClicks * 100).toFixed(2) + "%" : "0%",
        };

        return new Response(JSON.stringify({ metrics }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unknown action: ${action}`);
    } catch (error) {
      console.error("Email tracking error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Not found", { status: 404 });
});

// ─── Analytics Upsert Helper ───
async function upsertAnalytics(supabase: any, category: string, status: string) {
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("email_analytics")
    .select("id, count")
    .eq("date", today)
    .eq("category", category)
    .eq("status", status)
    .maybeSingle();

  if (existing) {
    await supabase.from("email_analytics").update({ count: existing.count + 1 }).eq("id", existing.id);
  } else {
    await supabase.from("email_analytics").insert({ date: today, category, status, count: 1 });
  }
}
