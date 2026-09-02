// deno-lint-ignore-file no-explicit-any
/**
 * Owner withdrawal notification service.
 *
 * Covers the full withdrawal lifecycle — from the moment an owner initiates a
 * withdrawal to the point the payout is confirmed (or fails) by the PSP:
 *
 *   requested        -> authorization created, risk checks ran
 *   pending_approval -> flagged for second-admin (dual) authorization
 *   approved         -> an admin approved the authorization
 *   rejected         -> an admin rejected the authorization
 *   submitted        -> transfer handed to Paystack/PayPal
 *   completed        -> PSP confirmed the money left / settled
 *   failed           -> PSP or platform rejected the transfer
 *
 * Fan-out per project comms policy: email is mandatory, plus ONE of
 * WhatsApp/SMS (owner preference), plus an in-app message and web push.
 * Admins get an `admin_notifications` row for events that need attention.
 *
 * Never throws — notification failures must not break a money movement.
 */
import { resendSendEmail, resendFrom } from "./resend-gateway.ts";
import { sendWebPushToUser, webPushConfigured } from "./web-push.ts";

export type WithdrawalNotifyEvent =
  | "requested"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "submitted"
  | "completed"
  | "failed";

export interface WithdrawalNotifyInput {
  event: WithdrawalNotifyEvent;
  ownerId: string;
  amount: number;
  currency: string;
  provider?: "paystack" | "paypal" | "opay" | string | null;
  payoutId?: string | null;
  authorizationId?: string | null;
  destination?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WithdrawalNotifyResult {
  ok: boolean;
  event: WithdrawalNotifyEvent;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  in_app: boolean;
  push: number;
  admin_notified: number;
  errors: string[];
}

const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://rentmaikar.com";

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function copyFor(input: WithdrawalNotifyInput): {
  title: string;
  line: string;
  adminTitle?: string;
} {
  const money = formatAmount(Number(input.amount ?? 0), input.currency);
  const dest = input.destination ? ` to ${input.destination}` : "";
  switch (input.event) {
    case "requested":
      return {
        title: "Withdrawal request received",
        line: `We received your withdrawal request of ${money}${dest}. Security checks are running now.`,
      };
    case "pending_approval":
      return {
        title: "Withdrawal awaiting approval",
        line: `Your withdrawal of ${money} needs approval from our team before it can be released. We will notify you as soon as it is reviewed.`,
        adminTitle: "Withdrawal awaiting second-admin approval",
      };
    case "approved":
      return {
        title: "Withdrawal approved",
        line: `Your withdrawal of ${money} has been approved and is being sent${dest}.`,
      };
    case "rejected":
      return {
        title: "Withdrawal declined",
        line: `Your withdrawal of ${money} was declined.${input.reason ? ` Reason: ${input.reason}.` : ""} You can start a new request or contact support.`,
      };
    case "submitted":
      return {
        title: "Withdrawal in progress",
        line: `Your withdrawal of ${money} has been submitted${dest}. Funds typically arrive within 1 business day.`,
      };
    case "completed":
      return {
        title: "Withdrawal paid",
        line: `Your withdrawal of ${money} has been paid${dest}. Thank you for partnering with RentMaikar.`,
      };
    case "failed":
      return {
        title: "Withdrawal failed",
        line: `Your withdrawal of ${money} could not be completed.${input.reason ? ` Reason: ${input.reason}.` : ""} The amount has been returned to your available balance.`,
        adminTitle: "Owner withdrawal failed",
      };
  }
}

/** Events that always page the admin team. */
const ADMIN_EVENTS: WithdrawalNotifyEvent[] = ["pending_approval", "failed"];

export async function notifyWithdrawalEvent(
  supabase: any,
  input: WithdrawalNotifyInput,
): Promise<WithdrawalNotifyResult> {
  const result: WithdrawalNotifyResult = {
    ok: true,
    event: input.event,
    email: false,
    sms: false,
    whatsapp: false,
    in_app: false,
    push: 0,
    admin_notified: 0,
    errors: [],
  };

  const { title, line, adminTitle } = copyFor(input);
  const link = `${APP_URL}/owner-dashboard?tab=earnings`;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, notification_email, notification_sms, notification_whatsapp")
      .eq("user_id", input.ownerId)
      .maybeSingle();

    const firstName = String(profile?.full_name ?? "").split(" ")[0] || "there";
    const bodyText = `Hi ${firstName}, ${line}`;

    // 1) Email — mandatory channel.
    if (profile?.email) {
      try {
        const html = `
          <div style="font-family:Inter,Arial,sans-serif;color:#0A1628">
            <h2 style="color:#10B981;margin:0 0 12px">${title}</h2>
            <p style="font-size:15px;line-height:1.6">${bodyText}</p>
            <p style="font-size:13px;color:#5b6b7c">
              Reference: ${input.payoutId ?? input.authorizationId ?? "—"}
            </p>
            <p><a href="${link}" style="background:#10B981;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">View your earnings</a></p>
          </div>`;
        const res = await resendSendEmail({
          from: resendFrom("RentMaikar <noreply@rentmaikar.com>"),
          to: [profile.email],
          subject: `${title} — ${formatAmount(Number(input.amount ?? 0), input.currency)}`,
          html,
        });
        result.email = res.ok;
        if (!res.ok) result.errors.push(`email:${res.status}`);
      } catch (e) {
        result.errors.push(`email:${e instanceof Error ? e.message : "error"}`);
      }
    }

    // 2) Exactly one of WhatsApp / SMS, honouring the owner's preference.
    if (profile?.phone) {
      const channel: "whatsapp" | "sms" | null = profile.notification_whatsapp
        ? "whatsapp"
        : profile.notification_sms
        ? "sms"
        : null;
      if (channel) {
        try {
          const { data, error } = await supabase.functions.invoke("send-sms-notification", {
            headers: { "x-internal-secret": Deno.env.get("CRON_SECRET") ?? "" },
            body: {
              phone: profile.phone,
              channel,
              notificationType: "general",
              customMessage: `RentMaikar: ${line}`,
            },
          });
          const sent = !error && (data?.success === true || data?.ok === true);
          if (channel === "whatsapp") result.whatsapp = sent;
          else result.sms = sent;
          if (!sent) result.errors.push(`${channel}:${error?.message ?? data?.error ?? "not sent"}`);
        } catch (e) {
          result.errors.push(`${channel}:${e instanceof Error ? e.message : "error"}`);
        }
      }
    }

    // 3) In-app message (complementary channel, readable in web + PWA).
    try {
      const { error } = await supabase.from("in_app_messages").insert({
        recipient_id: input.ownerId,
        subject: title,
        body: bodyText,
        category: "withdrawal",
        link_url: link,
        metadata: {
          event: input.event,
          payout_id: input.payoutId ?? null,
          authorization_id: input.authorizationId ?? null,
          provider: input.provider ?? null,
          amount: input.amount,
          currency: input.currency,
          ...(input.metadata ?? {}),
        },
      });
      result.in_app = !error;
      if (error) result.errors.push(`in_app:${error.message}`);
    } catch (e) {
      result.errors.push(`in_app:${e instanceof Error ? e.message : "error"}`);
    }

    // 4) Web push to every opted-in browser/PWA.
    if (webPushConfigured()) {
      try {
        const push = await sendWebPushToUser(supabase, input.ownerId, {
          title,
          body: line,
          url: link,
          tag: `withdrawal:${input.payoutId ?? input.authorizationId ?? input.event}`,
          data: { event: input.event },
        });
        result.push = push.sent;
      } catch (e) {
        result.errors.push(`push:${e instanceof Error ? e.message : "error"}`);
      }
    }

    // 5) Admin fan-out for events that need staff attention.
    if (ADMIN_EVENTS.includes(input.event)) {
      try {
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const rows = (admins ?? []).map((a: { user_id: string }) => ({
          recipient_id: a.user_id,
          related_user_id: input.ownerId,
          kind: `withdrawal_${input.event}`,
          title: adminTitle ?? title,
          body: `${profile?.full_name ?? "Owner"} — ${line}`,
          metadata: {
            payout_id: input.payoutId ?? null,
            authorization_id: input.authorizationId ?? null,
            amount: input.amount,
            currency: input.currency,
            provider: input.provider ?? null,
          },
        }));
        if (rows.length > 0) {
          const { error } = await supabase.from("admin_notifications").insert(rows);
          if (error) result.errors.push(`admin:${error.message}`);
          else result.admin_notified = rows.length;
        }
      } catch (e) {
        result.errors.push(`admin:${e instanceof Error ? e.message : "error"}`);
      }
    }
  } catch (e) {
    result.ok = false;
    result.errors.push(e instanceof Error ? e.message : "unknown error");
  }

  if (result.errors.length > 0) {
    console.error("[withdrawal-notify]", input.event, input.ownerId, result.errors);
  }
  return result;
}
