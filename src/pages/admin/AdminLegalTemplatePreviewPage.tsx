/**
 * Admin-only preview of the latest ACTIVE vehicle_rental template exactly as
 * onboarding users see it. Useful before flipping a new version to active.
 */
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRegion } from '@/contexts/RegionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AlertTriangle, 
  Eye, 
  FileText, 
  RefreshCw, 
  CheckCircle2, 
  Radio, 
  ShieldAlert, 
  Sparkles,
  ArrowRight,
  SendHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  extractDisruptionClauseFromTemplate, 
  saveSyncedDisruptionPolicy, 
  DEFAULT_SERVICE_DISRUPTION_CLAUSES 
} from '@/lib/onboarding-sync';
import { useSyncedDisruptionPolicy } from '@/hooks/useSyncedDisruptionPolicy';
import { ServiceDisruptionOnboardingCard } from '@/components/onboarding/ServiceDisruptionOnboardingCard';

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
 * onboarding users see it. Includes auto-sync capability to push updated
 * Service Disruption and Call-In terms into Driver and Owner onboarding wizards.
 */
export default function AdminLegalTemplatePreviewPage() {
  const { country } = useRegion();
  const [region, setRegion] = useState<AgreementRegion>(country === 'Nigeria' ? 'Nigeria' : 'USA');
  const [template, setTemplate] = useState<LegalAgreementTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [previewWizardRole, setPreviewWizardRole] = useState<'driver' | 'owner'>('driver');

  const { policy: currentSyncedPolicy } = useSyncedDisruptionPolicy(region === 'Nigeria' ? 'Nigeria' : 'USA');

  const loadTemplate = async () => {
    setLoading(true);
    setError(null);
    setTemplate(null);
    const { data, error: err } = await (supabase as any)
      .from('legal_agreement_templates')
      .select('*')
      .eq('agreement_type', 'vehicle_rental')
      .eq('region', region)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    setLoading(false);
    if (err) return setError(err.message);
    const latest = (data ?? [])[0] as LegalAgreementTemplate | undefined;
    if (!latest) return setError(`No active vehicle_rental template published for ${region}.`);
    setTemplate(latest);
  };

  useEffect(() => {
    loadTemplate();
  }, [region]);

  const disruptionAnalysis = useMemo(() => {
    if (!template) return { found: false, clauseText: '' };
    return extractDisruptionClauseFromTemplate(template.content, region === 'Nigeria' ? 'Nigeria' : 'USA');
  }, [template, region]);

  const isSyncedWithOnboarding = useMemo(() => {
    if (!template || !currentSyncedPolicy) return false;
    return currentSyncedPolicy.version === template.version &&
           currentSyncedPolicy.region === region;
  }, [template, currentSyncedPolicy, region]);

  const handleAutoSync = async () => {
    if (!template) return;
    setSyncing(true);
    try {
      const reg = region === 'Nigeria' ? 'Nigeria' : 'USA';
      const targetClause = disruptionAnalysis.found
        ? disruptionAnalysis.clauseText
        : DEFAULT_SERVICE_DISRUPTION_CLAUSES[reg].rawClauseText;

      const updated = saveSyncedDisruptionPolicy(reg, {
        version: template.version,
        rawClauseText: targetClause,
        policySummary: DEFAULT_SERVICE_DISRUPTION_CLAUSES[reg].policySummary,
        clauses: DEFAULT_SERVICE_DISRUPTION_CLAUSES[reg].clauses,
        syncedBy: 'Admin Legal Management',
      });

      // If the template in the database didn't have the section, offer to update the template content
      if (!disruptionAnalysis.found) {
        const appendedContent = `${template.content.trim()}\n\n${targetClause}`;
        await (supabase as any)
          .from('legal_agreement_templates')
          .update({ content: appendedContent, updated_at: new Date().toISOString() })
          .eq('id', template.id);
        await loadTemplate();
      }

      toast.success('Service Disruption terms auto-synced!', {
        description: `Synced template v${template.version} (${reg}) directly to new Driver and Owner onboarding wizards.`,
      });
    } catch (err: any) {
      toast.error('Sync failed', { description: err?.message || 'Could not auto-sync' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Admin Preview · Vehicle Rental Agreement</h1>
              <p className="text-sm text-muted-foreground">
                Verify approved templates and auto-sync updated service disruption terms into driver &amp; owner onboarding.
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

        {/* Auto-Sync to Onboarding Wizard Control Panel */}
        <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-background to-background">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Auto-Sync Service Disruption to Onboarding Wizards
                    {isSyncedWithOnboarding ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> In Sync (v{currentSyncedPolicy.version})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Pending Sync
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Broadcasts the stationary ignition restriction safety rule, 36h/72h default limits, and 24h call-in mandate to new drivers and vehicle owners.
                  </CardDescription>
                </div>
              </div>

              <Button
                onClick={handleAutoSync}
                disabled={loading || syncing || !template}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-2 shrink-0 shadow-sm"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Synchronizing…' : 'Auto-Sync to Onboarding'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-1 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-2.5 rounded-lg border bg-card/60">
                <span className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Target: Driver Onboarding
                </span>
                <p className="text-muted-foreground text-[11px]">
                  Surfaces the 4-pillar policy card and acknowledgement checkbox prior to vehicle booking and pickup.
                </p>
              </div>
              <div className="p-2.5 rounded-lg border bg-card/60">
                <span className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Target: Owner Onboarding
                </span>
                <p className="text-muted-foreground text-[11px]">
                  Educates owners on automated asset protection, remote stationary disablement, and 24h call-in safeguards.
                </p>
              </div>
              <div className="p-2.5 rounded-lg border bg-card/60">
                <span className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Target: Master Agreement
                </span>
                <p className="text-muted-foreground text-[11px]">
                  Enforces legally binding clause 3 across electronic contracts and PDF exports under {region} jurisdiction.
                </p>
              </div>
            </div>

            {/* Live Onboarding Card Preview Tab */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Live Preview of Synced Component in Onboarding Flow:
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={previewWizardRole === 'driver' ? 'default' : 'outline'}
                    onClick={() => setPreviewWizardRole('driver')}
                    className="h-6 text-[11px] px-2"
                  >
                    Driver View
                  </Button>
                  <Button
                    size="sm"
                    variant={previewWizardRole === 'owner' ? 'default' : 'outline'}
                    onClick={() => setPreviewWizardRole('owner')}
                    className="h-6 text-[11px] px-2"
                  >
                    Owner View
                  </Button>
                </div>
              </div>
              <ServiceDisruptionOnboardingCard
                role={previewWizardRole}
                region={region === 'Nigeria' ? 'Nigeria' : 'USA'}
                interactive={false}
              />
            </div>
          </CardContent>
        </Card>

        {/* Full Agreement Preview Card */}
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
              <ScrollArea className="h-[500px] rounded-md border bg-card p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {template.content}
                </pre>
              </ScrollArea>
            )}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Last synced to onboarding wizard: {new Date(currentSyncedPolicy.syncedAt).toLocaleString()} (v{currentSyncedPolicy.version})
              </p>
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

