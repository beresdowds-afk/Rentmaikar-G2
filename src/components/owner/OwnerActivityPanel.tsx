import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Banknote, CreditCard, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MessageRow {
  id: string;
  created_at: string;
  subject: string | null;
  last_message_at: string | null;
  channel: string | null;
  status: string | null;
}

interface PayoutRow {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  provider: string | null;
}

interface PaymentRow {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  owner_share_amount: number | null;
}

const statusTone = (status: string) =>
  ['completed', 'success', 'delivered', 'paid'].includes(status.toLowerCase())
    ? 'default'
    : ['failed', 'rejected', 'cancelled'].includes(status.toLowerCase())
      ? 'destructive'
      : 'secondary';

/**
 * Consolidated owner activity view: recent conversations, withdrawal requests
 * and vehicle payments in one place, all scoped to the signed-in owner by RLS.
 */
export default function OwnerActivityPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [conv, po, pay] = await Promise.all([
        supabase
          .from('inbox_conversations')
          .select('id, created_at, subject, last_message_at, channel, status')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(10),
        supabase
          .from('owner_payouts')
          .select('id, created_at, amount, currency, status, provider')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('payments')
          .select('id, created_at, amount, currency, status, owner_share_amount')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      if (!active) return;
      setMessages((conv.data ?? []) as MessageRow[]);
      setPayouts((po.data ?? []) as PayoutRow[]);
      setPayments((pay.data ?? []) as PaymentRow[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your activity…
      </div>
    );
  }

  const money = (amount: number, currency: string) =>
    `${currency === 'NGN' ? '₦' : '$'}${Number(amount ?? 0).toLocaleString()}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Messages
          </CardTitle>
          <CardDescription>Your recent conversations with support</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="rounded border border-border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{m.subject ?? 'Conversation'}</span>
                {m.status && <Badge variant="secondary">{m.status}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {m.channel ?? 'in-app'} ·{' '}
                {format(new Date(m.last_message_at ?? m.created_at), 'd MMM yyyy, HH:mm')}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4" /> Withdrawals
          </CardTitle>
          <CardDescription>Payout requests and their status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {payouts.length === 0 && (
            <p className="text-sm text-muted-foreground">No withdrawals yet.</p>
          )}
          {payouts.map((p) => (
            <div key={p.id} className="rounded border border-border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{money(p.amount, p.currency)}</span>
                <Badge variant={statusTone(p.status)}>{p.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.provider ?? 'bank'} · {format(new Date(p.created_at), 'd MMM yyyy, HH:mm')}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Payments
          </CardTitle>
          <CardDescription>Rental payments on your vehicles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {payments.length === 0 && (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          )}
          {payments.map((p) => (
            <div key={p.id} className="rounded border border-border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{money(p.amount, p.currency)}</span>
                <Badge variant={statusTone(p.status)}>{p.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Your share {money(p.owner_share_amount ?? 0, p.currency)} ·{' '}
                {format(new Date(p.created_at), 'd MMM yyyy, HH:mm')}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
