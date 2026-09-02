import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KeyRound, RefreshCw, ShieldCheck, Undo2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useCredentialVerification } from '@/hooks/useCredentialVerification';
import { friendlySecretError, secretErrorDescription } from "@/lib/secret-errors";

interface CredentialVersion {
  id: string;
  api_key_masked: string;
  api_secret_masked: string;
  status: string;
  verified_at: string | null;
  verification_result: { status?: number | null; detail?: string } | null;
  notes: string | null;
  created_at: string;
  activated_at: string | null;
  retired_at: string | null;
}

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'active') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'verified') return 'secondary';
  return 'outline';
};

type PendingAction =
  | { kind: 'stage' }
  | { kind: 'activate'; versionId: string; masked: string }
  | { kind: 'rollback' }
  | null;

export function EmqxSecretRotationPanel() {
  const [loading, setLoading] = useState(false);
  const { verifyAfterSave } = useCredentialVerification();
  const [busy, setBusy] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState<CredentialVersion[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ ok: boolean; detail: string } | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('emqx-secret-rotation', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ action: 'status' });
      setHistory(data.history ?? []);
      setSource(data.source ?? null);
    } catch (e) {
      toast({ title: 'Could not load rotation status', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { refresh(); }, [refresh]);

  const runProbe = async () => {
    setBusy('probe');
    try {
      const data = await call({ action: 'probe' });
      setProbe({ ok: Boolean(data.success), detail: data.result?.detail ?? '' });
      toast({
        title: data.success ? 'EMQX reachable' : 'EMQX unreachable',
        description: data.result?.detail?.slice(0, 160),
        variant: data.success ? 'default' : 'destructive',
      });
    } catch (e) {
      toast({ title: 'Probe failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const doStage = async () => {
    setBusy('stage');
    try {
      const staged = await call({ action: 'stage', apiKey, apiSecret, notes });
      setApiKey(''); setApiSecret(''); setNotes('');
      const verified = await call({ action: 'verify', versionId: staged.versionId });
      setHistory(verified.history ?? staged.history ?? []);
      toast({
        title: verified.success ? 'Credentials staged and verified' : 'Credentials staged but failed live check',
        description: verified.success
          ? 'Review the masked values, then activate to switch traffic over.'
          : verified.result?.detail?.slice(0, 160),
        variant: verified.success ? 'default' : 'destructive',
      });
    } catch (e) {
      const friendly = friendlySecretError(e, 'EMQX');
      toast({ title: friendly.title, description: secretErrorDescription(friendly), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const doActivate = async (versionId: string) => {
    setBusy(versionId);
    try {
      const data = await call({ action: 'activate', versionId });
      setHistory(data.history ?? []);
      toast({ title: 'New EMQX credentials active', description: 'Verifying the broker connection…' });
      await runProbe();
      await verifyAfterSave('emqx');
    } catch (e) {
      const friendly = friendlySecretError(e, 'EMQX');
      toast({ title: friendly.title, description: secretErrorDescription(friendly), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const doRollback = async () => {
    setBusy('rollback');
    try {
      const data = await call({ action: 'rollback' });
      setHistory(data.history ?? []);
      toast({ title: 'Rolled back', description: 'The previous EMQX credentials are active again.' });
      await runProbe();
      await verifyAfterSave('emqx');
    } catch (e) {
      const friendly = friendlySecretError(e, 'EMQX');
      toast({ title: friendly.title, description: secretErrorDescription(friendly), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const confirmPending = async () => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.kind === 'stage') await doStage();
    if (action.kind === 'activate') await doActivate(action.versionId);
    if (action.kind === 'rollback') await doRollback();
  };

  const hasRollbackTarget = history.some((h) => h.status === 'previous');
  const activeVersion = history.find((h) => h.status === 'active');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              EMQX secret rotation
            </CardTitle>
            <CardDescription>
              Stage new broker credentials, verify them against the live EMQX API, then activate — with one-click rollback.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              source: {source ?? '—'}
            </Badge>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={runProbe} disabled={busy === 'probe'}>
              <ShieldCheck className="h-4 w-4 mr-1" />
              Test connection
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {probe && (
          <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${probe.ok ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
            {probe.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" /> : <XCircle className="h-4 w-4 mt-0.5 text-destructive" />}
            <span className="text-muted-foreground">{probe.detail || (probe.ok ? 'Connection healthy' : 'Connection failed')}</span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="emqx-key">New EMQX_API_KEY</Label>
            <Input id="emqx-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="Paste the new API key" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emqx-secret">New EMQX_API_SECRET</Label>
            <Input id="emqx-secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="new-password" placeholder="Paste the new API secret" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="emqx-notes">Rotation note (optional)</Label>
            <Input id="emqx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. quarterly rotation" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setPending({ kind: 'stage' })}
            disabled={!apiKey.trim() || !apiSecret.trim() || busy === 'stage'}
          >
            Stage &amp; verify
          </Button>
          <Button
            variant="outline"
            onClick={() => setPending({ kind: 'rollback' })}
            disabled={!hasRollbackTarget || busy === 'rollback'}
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Roll back to previous
          </Button>
        </div>

        <Separator />

        <div>
          <p className="text-sm font-medium mb-2">
            Version history{activeVersion ? ` — active key ${activeVersion.api_key_masked}` : ''}
          </p>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Staged</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No rotations yet — the broker is using the environment secrets.
                    </TableCell>
                  </TableRow>
                )}
                {history.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.api_key_masked}</TableCell>
                    <TableCell><Badge variant={statusVariant(v.status)}>{v.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.verified_at ? new Date(v.verified_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {v.status === 'verified' ? (
                        <Button
                          size="sm"
                          disabled={busy === v.id}
                          onClick={() => setPending({ kind: 'activate', versionId: v.id, masked: v.api_key_masked })}
                        >
                          Activate
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {v.status === 'failed' ? v.verification_result?.detail?.slice(0, 40) ?? 'failed' : '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === 'stage' && 'Stage new EMQX credentials?'}
              {pending?.kind === 'activate' && 'Activate these credentials?'}
              {pending?.kind === 'rollback' && 'Roll back to previous credentials?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'stage' &&
                'The values are encrypted in the vault and immediately tested against the live EMQX management API. Nothing switches over until you activate.'}
              {pending?.kind === 'activate' &&
                `All telemetry and command traffic will use ${pending.masked} from now on. The current version is retained so you can roll back instantly.`}
              {pending?.kind === 'rollback' &&
                'The most recently retired credential version becomes active again. Use this if live updates stop recovering after a rotation.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default EmqxSecretRotationPanel;
