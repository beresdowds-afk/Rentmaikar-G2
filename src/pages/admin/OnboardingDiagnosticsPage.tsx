import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, RefreshCw, Loader2, Stethoscope, AlertTriangle } from 'lucide-react';

interface Check {
  kind: 'rpc' | 'column' | 'smoke';
  name: string;
  ok: boolean;
  error?: string;
}

interface DiagnosticsResult {
  generated_at: string;
  actor_id: string;
  checks: Check[];
}

const OnboardingDiagnosticsPage = () => {
  const query = useQuery({
    queryKey: ['onboarding-diagnostics'],
    queryFn: async (): Promise<DiagnosticsResult> => {
      const { data, error } = await supabase.rpc('onboarding_diagnostics' as never);
      if (error) throw error;
      return data as unknown as DiagnosticsResult;
    },
  });

  const { rpcs, columns, smokes, failing } = useMemo(() => {
    const checks = query.data?.checks ?? [];
    return {
      rpcs: checks.filter((c) => c.kind === 'rpc'),
      columns: checks.filter((c) => c.kind === 'column'),
      smokes: checks.filter((c) => c.kind === 'smoke'),
      failing: checks.filter((c) => !c.ok),
    };
  }, [query.data]);

  const renderRow = (c: Check) => (
    <div key={`${c.kind}:${c.name}`} className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0">
      <div className="flex items-start gap-2 min-w-0">
        {c.ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <code className="text-sm break-all">{c.name}</code>
          {c.error && (
            <p className="text-xs text-destructive mt-1 break-all">{c.error}</p>
          )}
        </div>
      </div>
      <Badge variant={c.ok ? 'secondary' : 'destructive'} className="shrink-0">
        {c.ok ? 'OK' : 'FAIL'}
      </Badge>
    </div>
  );

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Onboarding diagnostics</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Re-run
        </Button>
      </div>

      {query.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Diagnostics failed to run</AlertTitle>
          <AlertDescription>
            <code className="block text-xs mt-1 break-all">{(query.error as Error)?.message}</code>
          </AlertDescription>
        </Alert>
      )}

      {failing.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{failing.length} check(s) failing</AlertTitle>
          <AlertDescription className="space-y-1">
            {failing.map((f) => (
              <div key={`${f.kind}:${f.name}`} className="text-sm">
                <strong>{f.kind}</strong> · <code>{f.name}</code>
                {f.error && <> — <span className="text-xs">{f.error}</span></>}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>RPCs</CardTitle>
          <CardDescription>Server-side functions required by registration & onboarding.</CardDescription>
        </CardHeader>
        <CardContent>{rpcs.map(renderRow)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schema columns</CardTitle>
          <CardDescription>Columns the RPCs read/write. A missing column is the usual cause of onboarding crashes.</CardDescription>
        </CardHeader>
        <CardContent>{columns.map(renderRow)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live smoke test</CardTitle>
          <CardDescription>Executes <code>get_my_registration_progress()</code> and shows the raw SQL error if it fails.</CardDescription>
        </CardHeader>
        <CardContent>{smokes.map(renderRow)}</CardContent>
      </Card>

      {query.data && (
        <p className="text-xs text-muted-foreground text-center">
          Generated {new Date(query.data.generated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default OnboardingDiagnosticsPage;
