import { Check, Circle, XCircle, Clock, ShieldCheck, PenLine, CreditCard, Ban, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { proxy: any }

type StepState = "done" | "current" | "todo" | "failed";

export function ProxyStatusTimeline({ proxy }: Props) {
  if (!proxy) return null;

  const isRejected = proxy.admin_review_status === "rejected" || proxy.status === "revoked";
  const isExpiredOrUsed = proxy.status === "expired" || proxy.status === "used";

  const steps: { key: string; label: string; icon: any; ts?: string | null; state: StepState; hint?: string }[] = [
    {
      key: "submitted",
      label: "Request submitted",
      icon: Circle,
      ts: proxy.created_at,
      state: "done",
    },
    {
      key: "identity",
      label: "Identity verified",
      icon: ShieldCheck,
      ts: proxy.identity_verified_at,
      state: proxy.identity_status === "verified" ? "done"
        : proxy.identity_status === "failed" ? "failed"
        : proxy.identity_status === "submitted" ? "current"
        : "todo",
      hint: proxy.identity_status === "submitted" ? "Awaiting Persona result" : undefined,
    },
    {
      key: "consent",
      label: "Consent signed",
      icon: PenLine,
      ts: proxy.consent_signed_at,
      state: proxy.consent_status === "signed" ? "done"
        : proxy.consent_status === "rejected" ? "failed"
        : proxy.identity_status === "verified" ? "current" : "todo",
    },
    {
      key: "admin_review",
      label: "Admin review",
      icon: HelpCircle,
      ts: proxy.admin_reviewed_at,
      state: proxy.admin_review_status === "approved" ? "done"
        : proxy.admin_review_status === "rejected" ? "failed"
        : proxy.consent_status === "signed" ? "current" : "todo",
      hint: proxy.admin_review_notes ?? undefined,
    },
    {
      key: "card",
      label: "Card activated",
      icon: CreditCard,
      ts: proxy.activated_at,
      state: proxy.status === "active" ? "done"
        : proxy.card_token ? "current"
        : proxy.admin_review_status === "approved" ? "current"
        : "todo",
      hint: proxy.card_last4 ? `${proxy.card_brand ?? "Card"} •••• ${proxy.card_last4}` : undefined,
    },
  ];

  if (isRejected) {
    steps.push({
      key: "revoked", label: proxy.admin_review_status === "rejected" ? "Rejected" : "Revoked",
      icon: Ban, ts: proxy.revoked_at ?? proxy.admin_reviewed_at, state: "failed",
      hint: proxy.revoke_reason ?? proxy.admin_review_notes,
    });
  } else if (isExpiredOrUsed) {
    steps.push({
      key: "expired", label: proxy.status === "used" ? "Fully used" : "Expired",
      icon: Clock, ts: proxy.expired_at, state: "failed",
      hint: proxy.use_type === "one_time" ? "One-time consent" : `${proxy.uses_count}/${proxy.max_uses ?? "∞"} uses`,
    });
  }

  return (
    <ol className="relative border-s border-border pl-6 space-y-4">
      {steps.map((s) => {
        const Icon = s.icon;
        const color =
          s.state === "done" ? "bg-primary text-primary-foreground border-primary"
          : s.state === "current" ? "bg-secondary text-secondary-foreground border-primary animate-pulse"
          : s.state === "failed" ? "bg-destructive text-destructive-foreground border-destructive"
          : "bg-muted text-muted-foreground border-border";
        return (
          <li key={s.key} className="relative">
            <span className={cn("absolute -start-9 flex h-6 w-6 items-center justify-center rounded-full border-2", color)}>
              {s.state === "done" ? <Check className="h-3 w-3" />
                : s.state === "failed" ? <XCircle className="h-3 w-3" />
                : <Icon className="h-3 w-3" />}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="text-sm font-medium">{s.label}</p>
              {s.ts && <p className="text-xs text-muted-foreground">{new Date(s.ts).toLocaleString()}</p>}
            </div>
            {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
          </li>
        );
      })}
    </ol>
  );
}
