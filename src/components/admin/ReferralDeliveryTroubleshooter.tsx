import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FailureRow {
  applicant_key: string;
  applicant_label: string;
  total: number;
  by_channel: Record<string, { sent: number; failed: number; last_error?: string; last_at?: string }>;
}

/**
 * Admin troubleshooting: summarizes notify-referees delivery per applicant/channel
 * using messaging_events.
 */
export function ReferralDeliveryTroubleshooter() {
  const { data, isLoading } = useQuery({
    queryKey: ["notify-referees-events"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("messaging_events")
        .select("*")
        .or("template_name.ilike.%referee%,event_type.ilike.%referee%")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  // Aggregate by applicant + channel
  const rows: FailureRow[] = (() => {
    const map = new Map<string, FailureRow>();
    for (const ev of data ?? []) {
      const meta: any = ev.metadata ?? {};
      const applicantKey =
        meta.applicant_id ?? meta.application_id ?? meta.driver_id ?? ev.user_id ?? ev.recipient ?? "unknown";
      const applicantLabel =
        meta.applicant_name ?? meta.email ?? ev.recipient ?? applicantKey;
      const channel = ev.channel ?? "unknown";
      const et = (ev.event_type ?? "").toLowerCase();
      const isFailure = et.includes("fail") || et.includes("error") || et.includes("bounce") || !!ev.error_message;
      const isSent = et.includes("sent") || et.includes("delivered") || et === "delivery";

      let row = map.get(applicantKey);
      if (!row) {
        row = { applicant_key: applicantKey, applicant_label: applicantLabel, total: 0, by_channel: {} };
        map.set(applicantKey, row);
      }
      row.total++;
      const c = row.by_channel[channel] ?? { sent: 0, failed: 0 };
      if (isFailure) {
        c.failed++;
        c.last_error = ev.error_message ?? meta.error ?? c.last_error;
        c.last_at = ev.created_at;
      } else if (isSent) c.sent++;
      row.by_channel[channel] = c;
    }
    return [...map.values()]
      .filter((r) => Object.values(r.by_channel).some((c) => c.failed > 0))
      .sort((a, b) => {
        const af = Object.values(a.by_channel).reduce((s, c) => s + c.failed, 0);
        const bf = Object.values(b.by_channel).reduce((s, c) => s + c.failed, 0);
        return bf - af;
      });
  })();


  const totalEvents = data?.length ?? 0;
  const totalFailures = rows.reduce(
    (s, r) => s + Object.values(r.by_channel).reduce((x, c) => x + c.failed, 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Referee Notification Troubleshooter
        </CardTitle>
        <CardDescription>
          Per-applicant, per-channel delivery failures from <code>notify-referees</code> over the last 7 days.
          Powered by <code>messaging_events</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Events (7d): {totalEvents}</Badge>
          <Badge variant={totalFailures > 0 ? "destructive" : "secondary"}>Failures: {totalFailures}</Badge>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : rows.length === 0 ? (
          <Alert>
            <AlertDescription>No delivery failures in the last 7 days. All referee notifications delivered.</AlertDescription>
          </Alert>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>SMS</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Last failure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const cell = (ch: string) => {
                  const c = r.by_channel[ch];
                  if (!c) return <span className="text-xs text-muted-foreground">—</span>;
                  return (
                    <div className="text-xs">
                      <div className="flex gap-1">
                        <Badge variant="secondary">{c.sent} ok</Badge>
                        {c.failed > 0 && <Badge variant="destructive">{c.failed} fail</Badge>}
                      </div>
                      {c.last_error && <div className="mt-1 text-muted-foreground truncate max-w-[180px]" title={c.last_error}>{c.last_error}</div>}
                    </div>
                  );
                };
                const worst = Object.values(r.by_channel)
                  .filter((c) => c.last_at)
                  .sort((a, b) => (b.last_at! > a.last_at! ? 1 : -1))[0];
                return (
                  <TableRow key={r.applicant_key}>
                    <TableCell className="text-xs">{r.applicant_label}</TableCell>
                    <TableCell>{cell("email")}</TableCell>
                    <TableCell>{cell("sms")}</TableCell>
                    <TableCell>{cell("whatsapp")}</TableCell>
                    <TableCell className="text-xs">
                      {worst?.last_at ? formatDistanceToNow(new Date(worst.last_at), { addSuffix: true }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
