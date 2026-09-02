import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRegion } from '@/contexts/RegionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Eye, FileText } from 'lucide-react';

type AgreementRegion = 'USA' | 'Nigeria' | (string & {});

interface LegalAgreementTemplate {
  id: string;
  template_key: string;
  region: AgreementRegion;
  title: string;
  version: string;
  content: string;
  is_active: boolean;
  updated_at: string;
}

/**
 * Admin-only preview of the latest ACTIVE vehicle_rental template exactly as
 * onboarding users see it. Useful before flipping a new version to active.
 */
export default function AdminLegalTemplatePreviewPage() {
  const { country } = useRegion();
  const [region, setRegion] = useState<AgreementRegion>(country === 'Nigeria' ? 'Nigeria' : 'USA');
  const [template, setTemplate] = useState<LegalAgreementTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTemplate(null);
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from('legal_agreement_templates')
        .select('*')
        .eq('agreement_type', 'vehicle_rental')
        .eq('region', region)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      setLoading(false);
      if (err) return setError(err.message);
      const latest = (data ?? [])[0] as LegalAgreementTemplate | undefined;
      if (!latest) return setError(`No active vehicle_rental template published for ${region}.`);
      setTemplate(latest);
    })();
    return () => {
      cancelled = true;
    };
  }, [region]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Admin Preview · Vehicle Rental Agreement</h1>
              <p className="text-sm text-muted-foreground">
                Verify how the latest approved template renders for onboarding users before publishing.
              </p>
            </div>
          </div>
          <Select value={region} onValueChange={(v) => setRegion(v as AgreementRegion)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USA">USA</SelectItem>
              <SelectItem value="Nigeria">Nigeria</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 mt-1 text-muted-foreground" />
              <div>
                <CardTitle>{template?.title ?? 'Loading template…'}</CardTitle>
                <CardDescription>
                  {template
                    ? `Version ${template.version} • Region ${template.region} • Updated ${new Date(template.updated_at).toLocaleString()}`
                    : 'Fetching the latest active template.'}
                </CardDescription>
              </div>
            </div>
            {template && (
              <div className="flex gap-2">
                <Badge variant="default">Active</Badge>
                <Badge variant="secondary">v{template.version}</Badge>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}
            {!loading && error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Preview unavailable</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {!loading && template && (
              <ScrollArea className="h-[540px] rounded-md border bg-card p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {template.content}
                </pre>
              </ScrollArea>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => window.print()} disabled={!template}>
                Print / Save PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
