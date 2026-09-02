import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRegion } from "@/contexts/RegionContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Shield, HeartHandshake, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "training" | "roadside_support" | "insurance" | string;
  price: number;
  currency: "USD" | "NGN" | (string & {}) | string;
  billing_interval: "monthly" | "yearly" | "weekly" | "daily" | string;
  region: "USA" | "Nigeria" | (string & {}) | string;
  eligible_roles: string[];
  is_active: boolean;
};

type ActiveSub = { plan_id: string; expires_at: string; plan_type: string };

const iconFor = (type: string) => {
  if (type === "training") return GraduationCap;
  if (type === "insurance") return HeartHandshake;
  return Shield;
};

const fmtPrice = (p: Plan) =>
  `${p.currency === "USD" ? "$" : p.currency === "NGN" ? "₦" : ""}${Number(p.price).toLocaleString()}`;

interface Props {
  planTypes?: Array<"training" | "roadside_support" | "insurance">;
  compact?: boolean;
  title?: string;
}

export const SubscriptionPlansPanel = ({ planTypes, compact = false, title }: Props) => {
  const { user } = useAuth();
  const { country } = useRegion();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [active, setActive] = useState<ActiveSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [plansRes, subsRes] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("is_active", true).eq("region", country),
      user
        ? supabase
            .from("user_subscriptions")
            .select("plan_id, expires_at, status, subscription_plans!inner(plan_type)")
            .eq("user_id", user.id)
            .eq("status", "active")
        : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    ]);
    if (plansRes.data) {
      let list = plansRes.data as Plan[];
      if (planTypes) list = list.filter((p) => planTypes.includes(p.plan_type as never));
      list.sort((a, b) => a.plan_type.localeCompare(b.plan_type));
      setPlans(list);
    }
    if (Array.isArray(subsRes.data)) {
      setActive(
        (subsRes.data as Array<{ plan_id: string; expires_at: string; subscription_plans: { plan_type: string } }>).map(
          (r) => ({ plan_id: r.plan_id, expires_at: r.expires_at, plan_type: r.subscription_plans.plan_type })
        )
      );
    }
    setLoading(false);
  }, [user, country, planTypes]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActive = (planType: string) => active.some((s) => s.plan_type === planType);
  const hasTrainingActive = () => hasActive("training");

  const subscribe = async (plan: Plan, provider?: "paystack" | "opay") => {
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    if (plan.plan_type === "insurance" && !hasTrainingActive()) {
      toast.error("Driver Training subscription required before Insurance");
      return;
    }
    setBusyPlan(plan.id);
    try {
      const callback_url = `${window.location.origin}/subscriptions/success?plan_id=${plan.id}`;
      const { data, error } = await supabase.functions.invoke("subscribe-to-plan", {
        body: { plan_id: plan.id, callback_url, provider },
      });
      if (error) throw error;
      const url = (data as { checkout_url?: string })?.checkout_url;
      const reference = (data as { reference?: string })?.reference;
      const usedProvider = (data as { provider?: string })?.provider ?? provider;
      if (!url || !reference || !usedProvider) throw new Error("Missing checkout details");
      sessionStorage.setItem(
        `sub_pending_${reference}`,
        JSON.stringify({ plan_id: plan.id, provider: usedProvider, reference })
      );
      window.location.href = url;
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to start checkout");
    } finally {
      setBusyPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading plans…
      </div>
    );
  }

  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">No plans available in {country}.</p>;
  }

  return (
    <div className="space-y-4">
      {title && <h3 className="text-lg font-semibold">{title}</h3>}
      <div className={`grid gap-4 ${compact ? "md:grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3"}`}>
        {plans.map((p) => {
          const Icon = iconFor(p.plan_type);
          const activeSub = active.find((s) => s.plan_type === p.plan_type);
          const isActive = !!activeSub;
          const insuranceBlocked = p.plan_type === "insurance" && !hasTrainingActive();
          return (
            <Card key={p.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <h4 className="font-semibold">{p.name}</h4>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{fmtPrice(p)}</span>
                <span className="text-muted-foreground text-sm">/ {p.billing_interval}</span>
              </div>
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{p.region}</Badge>
                <Badge variant="secondary">{p.eligible_roles.join(", ")}</Badge>
                {isActive && (
                  <Badge className="bg-green-100 text-green-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                  </Badge>
                )}
              </div>
              {isActive ? (
                <p className="text-xs text-muted-foreground">
                  Renews / expires {new Date(activeSub!.expires_at).toLocaleDateString()}
                </p>
              ) : insuranceBlocked ? (
                <p className="text-xs text-orange-600">
                  Subscribe to Driver Training first to unlock Insurance.
                </p>
              ) : null}
              {p.currency === "NGN" && !isActive ? (
                <div className="mt-auto space-y-2">
                  <p className="text-xs text-muted-foreground">Pay with</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      disabled={insuranceBlocked || busyPlan === p.id}
                      onClick={() => subscribe(p, "paystack")}
                    >
                      {busyPlan === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Paystack"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={insuranceBlocked || busyPlan === p.id}
                      onClick={() => subscribe(p, "opay")}
                    >
                      {busyPlan === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "OPay"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{fmtPrice(p)} / {p.billing_interval}</p>
                </div>
              ) : (
                <Button
                  className="mt-auto"
                  disabled={isActive || insuranceBlocked || busyPlan === p.id}
                  onClick={() => subscribe(p)}
                >
                  {busyPlan === p.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Redirecting…
                    </>
                  ) : isActive ? (
                    "Subscribed"
                  ) : (
                    `Subscribe for ${fmtPrice(p)}`
                  )}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SubscriptionPlansPanel;
