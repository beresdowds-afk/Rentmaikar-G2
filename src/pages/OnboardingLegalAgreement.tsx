import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import rentmaikarLogo from '@/assets/rentmaikar-logo.jpg';
import { buildAgreementValues, renderAgreementTemplate } from '@/lib/agreement-template';

type AgreementRegion = 'USA' | 'Nigeria' | (string & {});

interface LegalAgreementTemplate {
  id: string;
  template_key: string;
  agreement_type: string;
  region: AgreementRegion;
  title: string;
  version: string;
  content: string;
  is_active: boolean;
  updated_at: string;
}

interface AcceptanceReceipt {
  templateId: string;
  title: string;
  version: string;
  region: AgreementRegion;
  acceptedAt: string;
}

const AGREEMENT_TYPE = 'vehicle_rental';

const OnboardingLegalAgreement = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { country } = useRegion();
  const region: AgreementRegion = country === 'Nigeria' ? 'Nigeria' : 'USA';

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<LegalAgreementTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previousAcceptedVersion, setPreviousAcceptedVersion] = useState<string | null>(null);
  const [reAcceptRequired, setReAcceptRequired] = useState(false);
  const [receipt, setReceipt] = useState<AcceptanceReceipt | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setReceipt(null);
      const { data, error: err } = await (supabase as any)
        .from('legal_agreement_templates')
        .select('*')
        .eq('agreement_type', AGREEMENT_TYPE)
        .eq('region', region)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (cancelled) return;
      if (err) {
        setLoading(false);
        setError(err.message);
        return;
      }
      const latest = (data ?? [])[0] as LegalAgreementTemplate | undefined;
      if (!latest) {
        setLoading(false);
        setError(`No approved ${region} legal agreement template is published yet.`);
        return;
      }
      setTemplate(latest);

      // Check whether the user needs to (re-)accept the latest active version.
      if (user) {
        const { data: needData } = await (supabase as any).rpc(
          'needs_latest_agreement_acceptance',
          { _agreement_type: AGREEMENT_TYPE, _region: region },
        );
        const row = Array.isArray(needData) ? needData[0] : needData;
        const acceptedTemplateId: string | null = row?.accepted_template_id ?? null;
        const needs: boolean = row?.needs ?? true;

        if (!cancelled && acceptedTemplateId && acceptedTemplateId !== latest.id) {
          const { data: prev } = await (supabase as any)
            .from('legal_agreement_templates')
            .select('version')
            .eq('id', acceptedTemplateId)
            .maybeSingle();
          if (!cancelled && prev) setPreviousAcceptedVersion(prev.version as string);
        }
        if (!cancelled) setReAcceptRequired(Boolean(needs && acceptedTemplateId));
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [region, user]);

  // Placeholders are resolved with what we already know about the signed-in
  // user; the rest render as blanks until a vehicle is matched and the
  // personalized, signable copy is generated.
  const rendered = useMemo(
    () =>
      renderAgreementTemplate(
        template?.content ?? '',
        buildAgreementValues({
          driver: {
            name: (user?.user_metadata as Record<string, string> | undefined)?.full_name ?? null,
            email: user?.email ?? null,
          },
          owner: {},
          vehicle: {},
          region,
        }),
      ),
    [template, user, region],
  );

  const handleAccept = async () => {
    if (!template || !user) return;
    setSubmitting(true);
    try {
      const { error: insErr } = await (supabase as any)
        .from('legal_agreement_acceptances')
        .insert({
          user_id: user.id,
          template_id: template.id,
          template_key: template.template_key,
          agreement_type: template.agreement_type,
          region: template.region,
          version: template.version,
          title: template.title,
          user_agent: navigator.userAgent,
        });
      // Unique(user_id, template_id) — repeated accepts are treated as success.
      if (insErr && !/duplicate|unique/i.test(insErr.message)) {
        throw insErr;
      }

      const { error: rpcErr } = await supabase.rpc('advance_registration_stage', {
        _target: 'documents_submitted',
      });
      if (rpcErr && !/already/i.test(rpcErr.message)) {
        console.warn('Stage advance warning:', rpcErr.message);
      }

      setReceipt({
        templateId: template.id,
        title: template.title,
        version: template.version,
        region: template.region,
        acceptedAt: new Date().toISOString(),
      });
      setReAcceptRequired(false);
      setPreviousAcceptedVersion(null);
      toast.success('Agreement accepted', {
        description: `Saved "${template.title}" v${template.version}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Could not record acceptance', { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!template) return;
    // Use the browser print pipeline to save the rendered agreement as PDF —
    // avoids shipping a heavy PDF library and honours the CMS content verbatim.
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
    if (!w) {
      toast.error('Pop-up blocked', {
        description: 'Allow pop-ups for Rentmaikar to save a PDF copy.',
      });
      return;
    }
    const safeTitle = template.title.replace(/[<>]/g, '');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle} v${template.version}</title>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:780px;margin:32px auto;padding:0 24px;color:#111;}
        header{border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:20px;}
        h1{font-size:22px;margin:0;}
        .meta{color:#4b5563;font-size:13px;margin-top:4px;}
        pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.55;}
        footer{margin-top:32px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:8px;}
        @media print { body{margin:0;} }
      </style></head><body>
      <header>
        <img src="${rentmaikarLogo}" alt="RentMaiKar" style="height:44px;object-fit:contain;margin-bottom:8px"/>
        <h1>${safeTitle}</h1>
        <div class="meta">Version ${template.version} · Region: ${template.region} · Retrieved ${new Date().toLocaleString()}</div>
      </header>
      <pre>${rendered.replace(/</g, '&lt;')}</pre>
      <footer>Rentmaikar rental agreement — for reference. A personalized signable copy is generated when a vehicle is matched to you.</footer>
      <script>window.onload=()=>{window.focus();window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <img src={rentmaikarLogo} alt="RentMaiKar" className="mx-auto h-12 object-contain" />
          <h1 className="text-2xl md:text-3xl font-bold">Rental Agreement</h1>
          <p className="text-muted-foreground">
            Review the latest approved Rentmaikar rental agreement for {region} before continuing.
          </p>
        </div>

        {reAcceptRequired && previousAcceptedVersion && (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Updated agreement — re-acceptance required</AlertTitle>
            <AlertDescription>
              You previously accepted version {previousAcceptedVersion}. A newer version
              {template ? ` (v${template.version})` : ''} is now active for {region} and must
              be re-accepted before you can continue.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{template?.title ?? 'Loading agreement…'}</CardTitle>
              <CardDescription>
                {template
                  ? `Version ${template.version} • Region: ${template.region}`
                  : 'Fetching the latest approved template from the Content CMS.'}
              </CardDescription>
            </div>
            {template && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">Active</Badge>
                <Badge variant="secondary">v{template.version}</Badge>
                <Button size="sm" variant="outline" onClick={handleDownloadPdf}>
                  <Download className="h-4 w-4 mr-1" />
                  Download PDF
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}

            {!loading && error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Agreement unavailable</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!loading && template && !receipt && (
              <>
                <ScrollArea className="h-[420px] rounded-md border bg-card p-4">
                  <div ref={contentRef}>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {rendered}
                    </pre>
                  </div>
                </ScrollArea>

                <div className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id="accept-agreement"
                    checked={accepted}
                    onCheckedChange={(value) => setAccepted(value === true)}
                  />
                  <label htmlFor="accept-agreement" className="text-sm leading-relaxed cursor-pointer">
                    I have read and agree to the terms of the {template.title} (version {template.version}).
                    I understand a personalized copy will be generated for signing when a vehicle is matched to me.
                  </label>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <Button variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
                    Back
                  </Button>
                  <Button onClick={handleAccept} disabled={!accepted || submitting} aria-busy={submitting}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Accept &amp; continue
                  </Button>
                </div>
              </>
            )}

            {receipt && (
              <div
                data-testid="acceptance-receipt"
                className="rounded-md border border-green-500/40 bg-green-500/5 p-5 space-y-3"
              >
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">Acceptance recorded</h2>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Template</dt>
                    <dd className="font-medium">{receipt.title}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Version</dt>
                    <dd className="font-medium">v{receipt.version} · {receipt.region}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Effective</dt>
                    <dd className="font-medium">{new Date(receipt.acceptedAt).toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleDownloadPdf}>
                    <Download className="h-4 w-4 mr-1" /> Download signed copy
                  </Button>
                  <Button onClick={() => navigate('/onboarding-redirect', { replace: true })}>
                    Continue onboarding <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingLegalAgreement;
