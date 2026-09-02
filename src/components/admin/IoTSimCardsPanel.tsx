import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Info } from "lucide-react";

interface SimCard {
  id: string;
  iccid: string;
  msisdn: string | null;
  provider: string;
  status: string;
  data_usage_mb: number | null;
  data_limit_mb: number | null;
  last_session_at: string | null;
}

export function IoTSimCardsPanel() {
  const [sims, setSims] = useState<SimCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("iot_sim_cards")
        .select("id, iccid, msisdn, provider, status, data_usage_mb, data_limit_mb, last_session_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setSims((data as SimCard[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>IoT SIM Cards (Hologram)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Hologram integration is stubbed. Add <code>HOLOGRAM_API_KEY</code> and{" "}
            <code>HOLOGRAM_ORG_ID</code> secrets to activate SIM provisioning, usage sync, and
            suspend/resume actions. The <code>hologram-sync</code> cron job will start populating this
            table once configured.
          </AlertDescription>
        </Alert>

        {loading ? (
          <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : sims.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SIM cards recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ICCID</TableHead>
                <TableHead>MSISDN</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usage (MB)</TableHead>
                <TableHead>Last Session</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sims.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.iccid}</TableCell>
                  <TableCell>{s.msisdn || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{s.provider}</Badge></TableCell>
                  <TableCell><Badge>{s.status}</Badge></TableCell>
                  <TableCell>
                    {s.data_usage_mb ?? 0}
                    {s.data_limit_mb ? ` / ${s.data_limit_mb}` : ""}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.last_session_at ? new Date(s.last_session_at).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
