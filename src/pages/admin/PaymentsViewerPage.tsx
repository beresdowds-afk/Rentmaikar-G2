import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, CreditCard, ArrowLeft, ExternalLink, Search } from "lucide-react";
import { format } from "date-fns";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

interface PaymentRow {
  id: string;
  rental_id: string | null;
  driver_id: string;
  owner_id: string;
  vehicle_id: string;
  amount: number;
  currency: string;
  payment_frequency: string;
  payment_method: string | null;
  status: string;
  processed_at: string | null;
  created_at: string;
  driver: { full_name: string | null; email: string | null } | null;
  rental: { status: string; region: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-green-500",
  paid: "bg-green-500",
  pending: "bg-yellow-500",
  failed: "bg-red-500",
  refunded: "bg-gray-500",
};

const sel = (s: string): string => s;

const PaymentsViewerPage = () => {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payments")
      .select(sel(`
        id, rental_id, driver_id, owner_id, vehicle_id,
        amount, currency, payment_frequency, payment_method,
        status, processed_at, created_at,
        driver:profiles!payments_driver_id_fkey(full_name, email),
        rental:rentals!payments_rental_id_fkey(status, region)
      `))
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<PaymentRow[]>();
    if (!error && data) setRows(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (!q) return true;
    const n = q.toLowerCase();
    return (
      p.id.toLowerCase().includes(n) ||
      p.rental_id?.toLowerCase().includes(n) ||
      p.driver_id.toLowerCase().includes(n) ||
      p.driver?.full_name?.toLowerCase().includes(n) ||
      p.driver?.email?.toLowerCase().includes(n) ||
      p.payment_method?.toLowerCase().includes(n)
    );
  }), [rows, q, status]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" />Back to admin</Link>
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-primary" />
            Payments
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Latest 200 rental payments. Click any row to open the driver-facing receipt.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Filters</CardTitle>
            <Button onClick={load} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search id, driver, method…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Payments <span className="text-muted-foreground font-normal">({filtered.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-2">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No payments.</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((p) => {
                    const canLink = !!p.rental_id;
                    const href = canLink ? `/rentals/${p.rental_id}/payments/${p.id}` : "#";
                    return (
                      <div key={p.id} className="p-4 border rounded-lg flex items-start justify-between gap-3 hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`${STATUS_COLORS[p.status] ?? "bg-gray-400"} text-white text-[10px]`}>
                              {p.status}
                            </Badge>
                            <span className="font-medium">
                              {p.currency} {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <Badge variant="outline" className="text-[10px]">{p.payment_frequency}</Badge>
                            {p.payment_method && <Badge variant="secondary" className="text-[10px]">{p.payment_method}</Badge>}
                            {p.rental?.region && <Badge variant="outline" className="text-[10px]">{p.rental.region}</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {p.driver?.full_name ?? p.driver?.email ?? p.driver_id}
                          </p>
                          <div className="text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-2 gap-1">
                            <span>Payment: <code className="text-[11px]">{p.id}</code></span>
                            <span>Rental: <code className="text-[11px]">{p.rental_id ?? "—"}</code></span>
                            <span>Created: {format(new Date(p.created_at), "MMM d, yyyy h:mm a")}</span>
                            {p.processed_at && <span>Processed: {format(new Date(p.processed_at), "MMM d, yyyy h:mm a")}</span>}
                          </div>
                        </div>
                        <Button asChild variant="outline" size="sm" disabled={!canLink}>
                          <Link to={href} aria-label={`Open receipt for payment ${p.id}`}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentsViewerPage;
