import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CreditCard, Users, GraduationCap, Shield, CheckCircle, XCircle, Clock,
  Search, FileSignature, Receipt, Ban, HeartPulse,
} from "lucide-react";

interface SubscriptionPlan {
  id: string; name: string; description: string | null;
  plan_type: string; price: number; currency: string;
  billing_interval: string; region: string; eligible_roles: string[]; is_active: boolean;
}
interface UserSubscription {
  id: string; user_id: string; plan_id: string; status: string;
  started_at: string; expires_at: string;
  payment_reference: string | null; payment_method: string | null; auto_renew: boolean;
}
interface Profile { user_id: string; email: string | null; full_name: string | null; }
interface SignatureAudit {
  id: string; agreement_type: string; agreement_id: string;
  actor_id: string | null; actor_role: string; action: string;
  old_status: string | null; new_status: string | null;
  changed_columns: string[] | null; created_at: string;
}
interface PaymentRow {
  id: string; driver_id: string | null; amount: number | null; currency: string | null;
  status: string | null; payment_method: string | null; transaction_id: string | null;
  created_at: string;
}


const PLAN_META: Record<string, { label: string; icon: any; accent: string }> = {
  training:         { label: "Driver Training",   icon: GraduationCap, accent: "text-blue-600" },
  insurance:        { label: "Insurance",         icon: HeartPulse,    accent: "text-emerald-600" },
  roadside_support: { label: "Roadside Support",  icon: Shield,        accent: "text-orange-600" },
};

export const SubscriptionManagement = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  // troubleshooting search
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userSubs, setUserSubs] = useState<UserSubscription[]>([]);
  const [userSigs, setUserSigs] = useState<SignatureAudit[]>([]);
  const [userPayments, setUserPayments] = useState<PaymentRow[]>([]);

  // cancel dialog
  const [cancelTarget, setCancelTarget] = useState<UserSubscription | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [plansRes, subsRes] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("plan_type").order("region"),
      supabase.from("user_subscriptions").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    if (plansRes.data) setPlans(plansRes.data as SubscriptionPlan[]);
    if (subsRes.data) {
      setSubscriptions(subsRes.data as UserSubscription[]);
      const ids = Array.from(new Set(subsRes.data.map(s => s.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles")
          .select("user_id, email, full_name").in("user_id", ids);
        const map: Record<string, Profile> = {};
        (profs || []).forEach(p => { map[p.user_id] = p as Profile; });
        setProfilesById(map);
      }
    }
    setLoading(false);
  };

  const togglePlanStatus = async (plan: SubscriptionPlan) => {
    const { error } = await supabase.from("subscription_plans")
      .update({ is_active: !plan.is_active }).eq("id", plan.id);
    if (error) return toast.error("Failed to update plan");
    toast.success(`${plan.name} ${plan.is_active ? "deactivated" : "activated"}`);
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: !p.is_active } : p));
  };

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data, error } = await supabase.from("profiles")
      .select("user_id, email, full_name")
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(25);
    setSearching(false);
    if (error) return toast.error("Search failed");
    setSearchResults((data || []) as Profile[]);
  };

  const openUser = async (p: Profile) => {
    setSelectedUser(p);
    const [subs, sigs, pays] = await Promise.all([
      supabase.from("user_subscriptions").select("*").eq("user_id", p.user_id).order("created_at", { ascending: false }),
      supabase.from("agreement_signature_audit").select("*").eq("actor_id", p.user_id).order("created_at", { ascending: false }).limit(50),
      supabase.from("payments").select("id, driver_id, amount, currency, status, payment_method, transaction_id, created_at")
        .eq("driver_id", p.user_id).order("created_at", { ascending: false }).limit(50),

    ]);
    setUserSubs((subs.data || []) as UserSubscription[]);
    setUserSigs((sigs.data || []) as SignatureAudit[]);
    setUserPayments((pays.data || []) as PaymentRow[]);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    const { data, error } = await supabase.rpc("admin_cancel_subscription", {
      _subscription_id: cancelTarget.id, _reason: cancelReason || null,
    });
    setCancelling(false);
    if (error) return toast.error(error.message || "Cancel failed");
    const cascaded = (data as any)?.[0]?.cascaded_ids?.length || 0;
    toast.success(cascaded
      ? `Subscription cancelled. Also ended ${cascaded} dependent insurance sub(s).`
      : "Subscription cancelled with immediate effect.");
    setCancelTarget(null); setCancelReason("");
    fetchData();
    if (selectedUser) openUser(selectedUser);
  };

  const statusIcon = (s: string) => s === "active"
    ? <CheckCircle className="h-4 w-4 text-green-500" />
    : s === "cancelled" || s === "expired"
      ? <XCircle className="h-4 w-4 text-red-500" />
      : <Clock className="h-4 w-4 text-yellow-500" />;

  const plansByType = useMemo(() => {
    const g: Record<string, SubscriptionPlan[]> = {};
    plans.forEach(p => { (g[p.plan_type] ||= []).push(p); });
    return g;
  }, [plans]);

  const activeCounts = useMemo(() => {
    const c: Record<string, number> = { training: 0, insurance: 0, roadside_support: 0 };
    subscriptions.forEach(s => {
      if (s.status !== "active") return;
      const p = plans.find(pl => pl.id === s.plan_id);
      if (p && c[p.plan_type] !== undefined) c[p.plan_type]++;
    });
    return c;
  }, [subscriptions, plans]);

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;

  const renderSubRow = (sub: UserSubscription) => {
    const plan = plans.find(p => p.id === sub.plan_id);
    const prof = profilesById[sub.user_id];
    return (
      <div key={sub.id} className="flex items-center justify-between p-4 rounded-lg border">
        <div className="flex items-center gap-3 min-w-0">
          {statusIcon(sub.status)}
          <div className="min-w-0">
            <p className="font-medium truncate">{plan?.name || "Unknown Plan"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {prof?.full_name || prof?.email || sub.user_id.slice(0, 8)} • Expires {new Date(sub.expires_at).toLocaleDateString()}
              {sub.payment_reference ? ` • Ref ${sub.payment_reference.slice(0, 12)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sub.status === "active" ? "default" : "secondary"}>{sub.status}</Badge>
          {sub.auto_renew && <Badge variant="outline" className="text-xs">Auto-renew</Badge>}
          {sub.status === "active" && (
            <Button variant="destructive" size="sm" onClick={() => setCancelTarget(sub)}>
              <Ban className="h-3.5 w-3.5 mr-1" />Cancel
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <div><p className="text-sm text-muted-foreground">Total Plans</p><p className="text-xl font-bold">{plans.length}</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            <div><p className="text-sm text-muted-foreground">Active Training</p><p className="text-xl font-bold">{activeCounts.training}</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <HeartPulse className="h-5 w-5 text-emerald-600" />
            <div><p className="text-sm text-muted-foreground">Active Insurance</p><p className="text-xl font-bold">{activeCounts.insurance}</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-orange-600" />
            <div><p className="text-sm text-muted-foreground">Active Roadside</p><p className="text-xl font-bold">{activeCounts.roadside_support}</p></div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plans">Plan Toggles</TabsTrigger>
          <TabsTrigger value="subscribers">Subscribers ({subscriptions.length})</TabsTrigger>
          <TabsTrigger value="troubleshoot">User Troubleshooting</TabsTrigger>
        </TabsList>

        {/* Regional plan on/off */}
        <TabsContent value="plans">
          <div className="space-y-6">
            {(["training", "insurance", "roadside_support"] as const).map((type) => {
              const meta = PLAN_META[type]; const Icon = meta.icon;
              const list = plansByType[type] || [];
              return (
                <Card key={type} className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Icon className={`h-5 w-5 ${meta.accent}`} />
                    <h3 className="text-lg font-semibold">{meta.label}</h3>
                    <Badge variant="secondary">Per-region activation</Badge>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No {meta.label} plans configured.</p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {list.map(plan => (
                        <div key={plan.id}
                             className={`p-4 rounded-lg border-2 ${plan.is_active ? "border-primary/30 bg-primary/5" : "border-muted bg-muted/50 opacity-70"}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{plan.region === "USA" ? "🇺🇸" : "🇳🇬"}</span>
                              <h4 className="font-semibold">{plan.region}</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{plan.is_active ? "Active" : "Off"}</span>
                              <Switch checked={plan.is_active} onCheckedChange={() => togglePlanStatus(plan)} />
                            </div>
                          </div>
                          <div className="flex items-baseline gap-1 mb-2">
                            <span className="text-2xl font-bold">
                              {plan.currency === "USD" ? "$" : "₦"}{plan.price.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground text-sm">/ {plan.billing_interval}</span>
                          </div>
                          {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                          <div className="mt-2"><Badge variant="outline" className="text-xs">{plan.eligible_roles.join(", ")}</Badge></div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="subscribers">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Subscriptions</h3>
            {subscriptions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>No subscriptions yet.</p>
              </div>
            ) : (
              <div className="space-y-3">{subscriptions.map(renderSubRow)}</div>
            )}
          </Card>
        </TabsContent>

        {/* Troubleshoot: search users, view subs + signatures + payments */}
        <TabsContent value="troubleshoot">
          <Card className="p-6 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search users by email or name…"
                  value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && runSearch()} />
              </div>
              <Button onClick={runSearch} disabled={searching}>Search</Button>
            </div>

            {searchResults.length > 0 && !selectedUser && (
              <div className="space-y-2">
                {searchResults.map(r => (
                  <button key={r.user_id} onClick={() => openUser(r)}
                    className="w-full text-left p-3 rounded border hover:bg-muted transition">
                    <p className="font-medium">{r.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.email} · {r.user_id.slice(0, 8)}</p>
                  </button>
                ))}
              </div>
            )}

            {selectedUser && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{selectedUser.full_name || selectedUser.email}</p>
                    <p className="text-xs text-muted-foreground">{selectedUser.email} · {selectedUser.user_id}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(null); setUserSubs([]); setUserSigs([]); setUserPayments([]); }}>
                    Clear
                  </Button>
                </div>

                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2"><CreditCard className="h-4 w-4" />Subscriptions ({userSubs.length})</h4>
                  {userSubs.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> :
                    <div className="space-y-2">{userSubs.map(renderSubRow)}</div>}
                </div>

                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2"><FileSignature className="h-4 w-4" />Signature Log ({userSigs.length})</h4>
                  {userSigs.length === 0 ? <p className="text-sm text-muted-foreground">No signature activity.</p> : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {userSigs.map(s => (
                        <div key={s.id} className="text-xs p-2 rounded border flex justify-between gap-2">
                          <span>
                            <Badge variant="outline" className="mr-2">{s.actor_role}</Badge>
                            {s.action} · {s.agreement_type} · {s.old_status || "—"} → {s.new_status || "—"}
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2"><Receipt className="h-4 w-4" />Payments ({userPayments.length})</h4>
                  {userPayments.length === 0 ? <p className="text-sm text-muted-foreground">No payments.</p> : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {userPayments.map(p => (
                        <div key={p.id} className="text-xs p-2 rounded border flex justify-between gap-2">
                          <span>
                            <Badge variant={p.status === "completed" || p.status === "success" ? "default" : "secondary"} className="mr-2">{p.status || "—"}</Badge>
                            {p.currency} {Number(p.amount || 0).toLocaleString()} · {p.payment_method || "—"} · {p.transaction_id?.slice(0, 16) || "—"}
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">{new Date(p.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription immediately?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends the subscription right now (expiry set to today, auto-renew off).
              {cancelTarget && plans.find(p => p.id === cancelTarget.plan_id)?.plan_type === "training" && (
                <span className="block mt-2 text-destructive font-medium">
                  This is a Training plan. Any active Insurance subscription in the same region will also be cancelled, because Insurance requires active Training.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Reason (for audit log)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep active</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? "Cancelling…" : "Cancel now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
