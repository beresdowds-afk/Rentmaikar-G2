import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  fetchSmsConsentAudit,
  smsConsentRecordsToCsv,
  downloadTextFile,
  type SmsConsentRecord,
  type SmsConsentType,
} from '@/lib/sms-consent';

/**
 * SMS consent audit trail (A2P 10DLC evidence).
 *
 * Shows exactly when each user opted in or out, from which screen, and which
 * keyword/timing disclosure version was on screen at that moment. Exportable as
 * CSV or JSON for the Twilio/TCR resubmission evidence pack.
 */
export default function AdminSmsConsentAuditPage() {
  const [records, setRecords] = useState<SmsConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [consentType, setConsentType] = useState<SmsConsentType | 'all'>('all');
  const [granted, setGranted] = useState<'all' | 'granted' | 'withdrawn'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { records: rows, error } = await fetchSmsConsentAudit({
      search,
      consentType,
      granted,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    });
    if (error) {
      toast({ title: 'Could not load consent audit', description: error, variant: 'destructive' });
    }
    setRecords(rows);
    setLoading(false);
  }, [search, consentType, granted, from, to]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const optIns = records.filter((r) => r.granted).length;
    return { total: records.length, optIns, optOuts: records.length - optIns };
  }, [records]);

  const stamp = new Date().toISOString().slice(0, 10);

  const exportCsv = () => {
    if (!records.length) return;
    downloadTextFile(`rentmaikar-sms-consent-audit-${stamp}.csv`, smsConsentRecordsToCsv(records));
    toast({ title: 'CSV exported', description: `${records.length} consent records downloaded.` });
  };

  const exportJson = () => {
    if (!records.length) return;
    downloadTextFile(
      `rentmaikar-sms-consent-audit-${stamp}.json`,
      JSON.stringify({ exported_at: new Date().toISOString(), records }, null, 2),
      'application/json;charset=utf-8',
    );
    toast({ title: 'JSON exported', description: `${records.length} consent records downloaded.` });
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          SMS consent audit trail
        </h1>
        <p className="text-muted-foreground text-sm">
          Every opt-in and opt-out with the exact keyword and timing disclosure that was on
          screen. Export for the A2P 10DLC resubmission evidence pack.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            {stats.total} records · {stats.optIns} opt-ins · {stats.optOuts} opt-outs
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="consentSearch">Phone or source page</Label>
            <Input
              id="consentSearch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="+1555… or driver-registration"
            />
          </div>
          <div className="space-y-2">
            <Label>Consent type</Label>
            <Select value={consentType} onValueChange={(v) => setConsentType(v as SmsConsentType | 'all')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Decision</Label>
            <Select value={granted} onValueChange={(v) => setGranted(v as 'all' | 'granted' | 'withdrawn')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="granted">Opted in</SelectItem>
                <SelectItem value="withdrawn">Opted out</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="fromDate">From</Label>
              <Input id="fromDate" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="toDate">To</Label>
              <Input id="toDate" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-5 flex flex-wrap gap-2">
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Apply filters
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!records.length}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" onClick={exportJson} disabled={!records.length}>
              <Download className="w-4 h-4 mr-2" /> Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Records</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading consent records…
            </div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No consent records match these filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp (UTC)</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Captured on</TableHead>
                  <TableHead>Disclosure</TableHead>
                  <TableHead>Program</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 250).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                    </TableCell>
                    <TableCell className="text-xs">{r.phone_number ?? '—'}</TableCell>
                    <TableCell className="capitalize text-xs">{r.consent_type}</TableCell>
                    <TableCell>
                      <Badge variant={r.granted ? 'default' : 'secondary'}>
                        {r.granted ? 'Opted in' : 'Opted out'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.source}
                      {r.page_url && (
                        <span className="block text-muted-foreground truncate max-w-[220px]">{r.page_url}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.disclosure_version}</TableCell>
                    <TableCell className="text-xs">{r.program_version ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {records.length > 250 && (
            <p className="text-xs text-muted-foreground pt-3">
              Showing the 250 most recent of {records.length} matching records. Exports include all of them.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
