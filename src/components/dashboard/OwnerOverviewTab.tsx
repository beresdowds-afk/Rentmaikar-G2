import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownToLine,
  Camera,
  Car,
  CheckCircle2,
  FileText,
  Home,
  Plus,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useRegion } from '@/contexts/RegionContext';
import { useOwnerDashboard } from '@/hooks/useOwnerDashboard';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/payment-config';
import { format, startOfWeek, addWeeks, differenceInDays } from 'date-fns';

interface Props {
  onNavigateTab: (tab: string) => void;
}

interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  detail?: string;
  action?: { label: string; tab: string };
}

export function OwnerOverviewTab({ onNavigateTab }: Props) {
  const { user } = useAuth();
  const impersonation = useImpersonation();
  const targetId = impersonation?.role === 'owner' ? impersonation.viewAsUserId : user?.id;
  const { currency, country } = useRegion();
  const { vehicles, rentals, earnings, totalEarnings, availableBalance, activeRentals } = useOwnerDashboard();

  const [openIncidents, setOpenIncidents] = useState(0);
  const [pendingInspections, setPendingInspections] = useState(0);
  const [pendingRecalls, setPendingRecalls] = useState(0);
  const [expiringDocs, setExpiringDocs] = useState(0);
  const [lastPayoutAt, setLastPayoutAt] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    (async () => {
      const now = new Date().toISOString();
      const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const client = supabase as any;

      const inc = await client
        .from('vehicle_incidents')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', targetId)
        .in('status', ['reported', 'in_progress', 'acknowledged']);
      const insp = await client
        .from('weekly_inspection_reports')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', targetId)
        .not('submitted_at', 'is', null)
        .is('owner_reviewed_at', null);
      const recalls = await client
        .from('vehicle_recalls')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', targetId)
        .eq('status', 'pending');
      const docs = await client
        .from('user_documents')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetId)
        .not('expires_at', 'is', null)
        .lt('expires_at', in30)
        .gt('expires_at', now);
      const payout = await client
        .from('owner_payouts')
        .select('created_at')
        .eq('owner_id', targetId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setOpenIncidents(inc.count ?? 0);
      setPendingInspections(insp.count ?? 0);
      setPendingRecalls(recalls.count ?? 0);
      setExpiringDocs(docs.count ?? 0);
      setLastPayoutAt(payout?.data?.created_at ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  // Group earnings into weekly buckets (last 12 weeks)
  const weeklyChart = useMemo(() => {
    const buckets: Record<string, number> = {};
    const nowStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 11; i >= 0; i--) {
      const wk = addWeeks(nowStart, -i);
      buckets[format(wk, 'MMM d')] = 0;
    }
    earnings
      .filter((e) => e.status === 'paid')
      .forEach((e) => {
        const wk = startOfWeek(new Date(e.created_at), { weekStartsOn: 1 });
        const diff = differenceInDays(nowStart, wk) / 7;
        if (diff >= 0 && diff <= 11) {
          const key = format(wk, 'MMM d');
          buckets[key] = (buckets[key] ?? 0) + Number(e.amount);
        }
      });
    return Object.entries(buckets).map(([week, amount]) => ({ week, amount }));
  }, [earnings]);

  // Next Friday payout
  const nextPayoutDate = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d;
  }, []);

  const fleetHealth = useMemo(() => {
    const total = vehicles.length;
    const active = rentals.length;
    const idle = Math.max(0, total - active);
    return { total, active, idle };
  }, [vehicles, rentals]);

  const alerts: AlertItem[] = useMemo(() => {
    const items: AlertItem[] = [];
    if (pendingRecalls > 0) {
      items.push({
        id: 'recall',
        severity: 'critical',
        title: `${pendingRecalls} vehicle recall${pendingRecalls > 1 ? 's' : ''} awaiting approval`,
        action: { label: 'Review', tab: 'recalls' },
      });
    }
    if (openIncidents > 0) {
      items.push({
        id: 'inc',
        severity: 'warning',
        title: `${openIncidents} open incident${openIncidents > 1 ? 's' : ''} on your fleet`,
      });
    }
    if (pendingInspections > 0) {
      items.push({
        id: 'insp',
        severity: 'warning',
        title: `${pendingInspections} inspection report${pendingInspections > 1 ? 's' : ''} needs your review`,
        action: { label: 'Review', tab: 'inspections' },
      });
    }
    if (expiringDocs > 0) {
      items.push({
        id: 'docs',
        severity: 'warning',
        title: `${expiringDocs} document${expiringDocs > 1 ? 's' : ''} expiring within 30 days`,
        action: { label: 'Renew', tab: 'documents' },
      });
    }
    if (fleetHealth.total === 0) {
      items.push({
        id: 'empty',
        severity: 'info',
        title: 'You have no vehicles listed yet',
        action: { label: 'Add vehicle', tab: 'vehicles' },
      });
    }
    if (items.length === 0) {
      items.push({ id: 'ok', severity: 'success', title: 'Everything looks good — no action needed.' });
    }
    return items;
  }, [pendingRecalls, openIncidents, pendingInspections, expiringDocs, fleetHealth]);

  const severityBadge = (s: AlertItem['severity']) => {
    const map = {
      critical: 'bg-destructive text-destructive-foreground',
      warning: 'bg-warning text-warning-foreground',
      info: 'bg-primary/15 text-primary',
      success: 'bg-success/20 text-success-foreground',
    } as const;
    return map[s];
  };

  return (
    <div className="space-y-6">
      {/* Hero: earnings + payout */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Lifetime earnings</p>
                <p className="text-3xl font-display font-bold mt-1">{formatCurrency(totalEarnings, currency)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {country} · {fleetHealth.active}/{fleetHealth.total} vehicles active
                </p>
              </div>
              <Button size="lg" onClick={() => onNavigateTab('withdrawals')} disabled={availableBalance <= 0}>
                <ArrowDownToLine className="h-4 w-4 mr-2" />
                Request payout
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div>
                <p className="text-xs text-muted-foreground">Available balance</p>
                <p className="text-xl font-semibold">{formatCurrency(availableBalance, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next payout (Fri)</p>
                <p className="text-xl font-semibold">{format(nextPayoutDate, 'MMM d')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last payout</p>
                <p className="text-xl font-semibold">
                  {lastPayoutAt ? format(new Date(lastPayoutAt), 'MMM d') : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fleet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FleetStat label="Total vehicles" value={fleetHealth.total} accent="text-primary" />
            <FleetStat label="Currently rented" value={fleetHealth.active} accent="text-success" />
            <FleetStat label="Idle" value={fleetHealth.idle} accent="text-warning" />
          </CardContent>
        </Card>
      </div>

      {/* Weekly earnings chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weekly earnings — last 12 weeks</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v, currency).replace(/\.\d+/, '')}
              />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                formatter={(v: number) => formatCurrency(v, currency)}
              />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Action required */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Action Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50"
            >
              <div className="flex items-start gap-3 min-w-0">
                <Badge className={severityBadge(a.severity)}>{a.severity}</Badge>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  {a.detail && <p className="text-xs text-muted-foreground truncate">{a.detail}</p>}
                </div>
              </div>
              {a.action && (
                <Button size="sm" variant="ghost" onClick={() => onNavigateTab(a.action!.tab)}>
                  {a.action.label}
                </Button>
              )}
              {a.severity === 'success' && <CheckCircle2 className="h-4 w-4 text-success" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <QuickAction icon={Plus} label="Add vehicle" onClick={() => onNavigateTab('vehicles')} />
        <QuickAction icon={Camera} label="Review inspections" onClick={() => onNavigateTab('inspections')} />
        <QuickAction icon={Home} label="List for Rent-to-Own" onClick={() => onNavigateTab('rent-to-own')} />
        <QuickAction icon={ShieldCheck} label="Insurance" onClick={() => onNavigateTab('insurance')} />
      </div>
    </div>
  );
}

function FleetStat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${accent}`}>{value}</span>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Car;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md"
    >
      <Icon className="h-5 w-5 text-primary mb-3" />
      <p className="text-sm font-medium">{label}</p>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
