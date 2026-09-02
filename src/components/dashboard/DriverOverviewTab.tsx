import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  CheckCircle2,
  CreditCard,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Wallet,
  Car,
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useRegion } from '@/contexts/RegionContext';
import { useDriverDashboard } from '@/hooks/useDriverDashboard';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/payment-config';
import { format, formatDistanceToNowStrict, differenceInHours } from 'date-fns';

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

export function DriverOverviewTab({ onNavigateTab }: Props) {
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const impersonation = useImpersonation();
  const targetId = impersonation?.role === 'driver' ? impersonation.viewAsUserId : user?.id;
  const { currency, country } = useRegion();
  const { activeRental, vehicle, payments, totalPaid, daysActive } = useDriverDashboard();

  const [inspectionDue, setInspectionDue] = useState<string | null>(null);
  const [expiringDocs, setExpiringDocs] = useState<number>(0);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [openIncidents, setOpenIncidents] = useState<number>(0);
  const [trainingComplete, setTrainingComplete] = useState<boolean>(false);

  useEffect(() => {
  if (!targetId) return;
  let cancelled = false;
  const loadDashboard = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const in30Days = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const [
        inspectionResult,
        docsResult,
        messagesResult,
        incidentsResult,
        trainingResult,
      ] = await Promise.all([
        supabase
          .from("weekly_inspection_reports")
          .select("week_start_date, submitted_at")
          .eq("driver_id", targetId)
          .is("submitted_at", null)
          .order("week_start_date", { ascending: true })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("user_documents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetId)
          .not("expires_at", "is", null)
          .gt("expires_at", now)
          .lt("expires_at", in30Days),

        supabase
          .from("inbox_messages")
          .select("id, inbox_conversations!inner(user_id)", { count: "exact", head: true })
          .eq("inbox_conversations.user_id", targetId)
          .neq("sender_type", "user")
          .is("read_at", null),

        (supabase as any)
          .from("vehicle_incidents")
          .select("id", { count: "exact", head: true })
          .eq("reporter_id", targetId)
          .in("status", [
            "reported",
            "acknowledged",
            "in_progress",
          ]),

        supabase
          .from("training_completions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetId),
      ]);

      if (cancelled) return;
      setLoading(false);
      [
        inspectionResult,
        docsResult,
        messagesResult,
        incidentsResult,
        trainingResult,
      ].forEach((result) => {
        if (result.error) {
          console.error(result.error);
        }
      });

      const weekStart = inspectionResult.data?.week_start_date;

      setInspectionDue(
        weekStart
          ? new Date(
              new Date(weekStart).getTime() +
                7 * 24 * 60 * 60 * 1000
            ).toISOString()
          : null
      );

      setExpiringDocs(docsResult.count ?? 0);
      setUnreadMessages(messagesResult.count ?? 0);
      setOpenIncidents(incidentsResult.count ?? 0);
      setTrainingComplete((trainingResult.count ?? 0) > 0);
    } catch (error) {
      console.error("Failed loading driver dashboard", error);
    }
  };

  loadDashboard();

  return () => {
    cancelled = true;
  };
}, [targetId]);

  const nextPayment = useMemo(() => {
    if (!activeRental) return null;
    const start = new Date(activeRental.start_date);
    const freq = activeRental.payment_frequency === 'daily' ? 1 : 7;
    const days = Math.floor((Date.now() - start.getTime()) / 86_400_000);
    const nextIdx = Math.ceil((days + 1) / freq);
    const nextDate = new Date(start.getTime() + nextIdx * freq * 86_400_000);
    return {
      date: nextDate,
      hoursLeft: differenceInHours(nextDate, new Date()),
      amount: Number(activeRental.daily_rate) * freq * 1.2,
    };
  }, [activeRental]);

  const chartData = useMemo(() => {
    return [...payments]
      .filter((p) => p.status === 'completed')
      .slice(0, 12)
      .reverse()
      .map((p, i) => ({
        idx: format(new Date(p.created_at), 'MMM d'),
        amount: Number(p.amount),
      }));
  }, [payments]);

  const alerts: AlertItem[] = useMemo(() => {
    const items: AlertItem[] = [];
    if (nextPayment && nextPayment.hoursLeft < 72) {
      items.push({
        id: 'pay',
        severity: nextPayment.hoursLeft < 24 ? 'critical' : 'warning',
        title: `Payment due ${formatDistanceToNowStrict(nextPayment.date, { addSuffix: true })}`,
        detail: `${formatCurrency(nextPayment.amount, currency)} · ${format(nextPayment.date, 'PPP')}`,
        action: { label: 'Pay now', tab: 'payments' },
      });
    }
    if (inspectionDue && new Date(inspectionDue) < new Date(Date.now() + 5 * 86_400_000)) {
      items.push({
        id: 'insp',
        severity: 'warning',
        title: 'Inspection report due',
        detail: format(new Date(inspectionDue), 'PPP'),
        action: { label: 'Start report', tab: 'inspection' },
      });
    }
    if (expiringDocs > 0) {
      items.push({
        id: 'doc',
        severity: 'warning',
        title: `${expiringDocs} document${expiringDocs > 1 ? 's' : ''} expiring within 30 days`,
        action: { label: 'Renew', tab: 'documents' },
      });
    }
    if (openIncidents > 0) {
      items.push({
        id: 'inc',
        severity: 'info',
        title: `${openIncidents} open incident${openIncidents > 1 ? 's' : ''}`,
        action: { label: 'Review', tab: 'incidents' },
      });
    }
    if (unreadMessages > 0) {
      items.push({
        id: 'msg',
        severity: 'info',
        title: `${unreadMessages} unread admin message${unreadMessages > 1 ? 's' : ''}`,
        action: { label: 'Open messages', tab: 'messages' },
      });
    }
    if (!trainingComplete) {
      items.push({
        id: 'train',
        severity: 'info',
        title: 'Complete driver training to unlock insurance',
        action: { label: 'Start training', tab: 'subscriptions' },
      });
    }
    if (items.length === 0) {
      items.push({ id: 'ok', severity: 'success', title: 'All clear — nothing needs your attention right now.' });
    }
    return items;
  }, [nextPayment, inspectionDue, expiringDocs, openIncidents, unreadMessages, trainingComplete, currency]);

  const severityBadge = (s: AlertItem['severity']) => {
    const map = {
      critical: 'bg-destructive text-destructive-foreground',
      warning: 'bg-warning text-warning-foreground',
      info: 'bg-primary/15 text-primary',
      success: 'bg-success/20 text-success-foreground',
    } as const;
    return map[s];
  };

  const paymentProgress = nextPayment
    ? Math.max(0, Math.min(100, 100 - (nextPayment.hoursLeft / 168) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Hero: countdown + KPIs */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Next payment</p>
                <p className="text-3xl font-display font-bold mt-1">
                  {nextPayment ? formatCurrency(nextPayment.amount, currency) : '—'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {nextPayment
                    ? `Due ${formatDistanceToNowStrict(nextPayment.date, { addSuffix: true })} · ${format(
                        nextPayment.date,
                        'PPP',
                      )}`
                    : 'No active rental'}
                </p>
              </div>
              <Button size="lg" onClick={() => onNavigateTab('payments')} disabled={!nextPayment}>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay now
              </Button>
            </div>
            {nextPayment && <Progress value={paymentProgress} className="h-2" />}
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div>
                <p className="text-xs text-muted-foreground">Days active</p>
                <p className="text-xl font-semibold">{daysActive}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total paid</p>
                <p className="text-xl font-semibold">{formatCurrency(totalPaid, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="text-xl font-semibold">{country}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent payments</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData}>
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number) => formatCurrency(v, currency)}
                  />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">No payments yet</p>
            )}
          </CardContent>
        </Card>
      </div>

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

      {/* Quick actions grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <QuickAction icon={Camera} label="Submit inspection" onClick={() => onNavigateTab('inspection')} />
        <QuickAction icon={FileText} label="View agreements" onClick={() => onNavigateTab('agreements')} />
        <QuickAction icon={ShieldCheck} label="Insurance & training" onClick={() => onNavigateTab('subscriptions')} />
        <QuickAction icon={MessageSquare} label="Open messages" onClick={() => onNavigateTab('messages')} />
      </div>

      {/* Active vehicle summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-4 w-4" /> Active Vehicle
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vehicle ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Make / Model</p>
                <p className="font-medium">{vehicle.make} {vehicle.model}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Year</p>
                <p className="font-medium">{vehicle.year}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Plate</p>
                <p className="font-medium">{vehicle.license_plate}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Frequency</p>
                <p className="font-medium capitalize">{activeRental?.payment_frequency ?? '—'}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <MapPin className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No active rental yet.</p>
              <Button size="sm" onClick={() => (window.location.href = '/catalogue/standard?filter=nearby')}>
                Browse vehicles near me
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof CreditCard;
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
