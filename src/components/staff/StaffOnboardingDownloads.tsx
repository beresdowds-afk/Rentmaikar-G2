import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRegion } from '@/contexts/RegionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, FileText, GraduationCap, Map, Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type OnboardingItem = {
  id: string;
  kind: 'agreement' | 'training' | 'tour';
  title: string;
  subtitle: string;
  region: string | null;
  filename: string;
  body: string;
};

const downloadBlob = (filename: string, body: string, type = 'text/markdown;charset=utf-8') => {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';

/** Content rows store regions inconsistently ("all", "NG", "USA"), so normalise before filtering. */
const REGION_ALIASES: Record<string, string[]> = {
  Nigeria: ['nigeria', 'ng', 'nga'],
  USA: ['usa', 'us', 'united states'],
};

const matchesRegion = (region: string | null, country: string) => {
  if (!region) return true;
  const value = region.trim().toLowerCase();
  if (!value || value === 'all' || value === 'global') return true;
  if (value === country.toLowerCase()) return true;
  return (REGION_ALIASES[country] ?? []).includes(value);
};

const kindMeta = {
  agreement: { label: 'Agreement', icon: FileText },
  training: { label: 'Training', icon: GraduationCap },
  tour: { label: 'Tour guide', icon: Map },
} as const;

/**
 * Onboarding download centre for staff dashboards.
 * Surfaces the onboarding pack (agreements, training scripts, guided tours)
 * so admins, assistants and support staff never leave the installed admin PWA.
 */
export const StaffOnboardingDownloads = () => {
  const { country } = useRegion();
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['staff-onboarding-downloads', country],
    queryFn: async (): Promise<OnboardingItem[]> => {
      const [agreements, training, tours] = await Promise.all([
        supabase
          .from('legal_agreement_templates')
          .select('id, title, agreement_type, version, region, content')
          .eq('is_active', true)
          .order('title'),
        supabase
          .from('training_modules')
          .select('id, title, description, module_order, script_content, region, duration_minutes')
          .eq('is_active', true)
          .order('module_order'),
        supabase
          .from('tour_step_configs')
          .select('id, tour_name, country, steps')
          .eq('is_active', true)
          .order('tour_name'),
      ]);

      const firstError = agreements.error || training.error || tours.error;
      if (firstError) throw firstError;

      const items: OnboardingItem[] = [];

      (agreements.data ?? []).forEach((row) => {
        items.push({
          id: `agreement-${row.id}`,
          kind: 'agreement',
          title: row.title,
          subtitle: `${row.agreement_type} · v${row.version}`,
          region: row.region ?? null,
          filename: `${slug(row.title)}-v${row.version}.md`,
          body: `# ${row.title}\n\nType: ${row.agreement_type}\nVersion: ${row.version}\nRegion: ${row.region ?? 'All regions'}\n\n---\n\n${row.content ?? ''}\n`,
        });
      });

      (training.data ?? []).forEach((row) => {
        items.push({
          id: `training-${row.id}`,
          kind: 'training',
          title: row.title,
          subtitle: `Module ${row.module_order}${row.duration_minutes ? ` · ${row.duration_minutes} min` : ''}`,
          region: row.region ?? null,
          filename: `training-${slug(row.title)}.md`,
          body: `# ${row.title}\n\n${row.description ?? ''}\n\n---\n\n${row.script_content ?? ''}\n`,
        });
      });

      (tours.data ?? []).forEach((row) => {
        items.push({
          id: `tour-${row.id}`,
          kind: 'tour',
          title: row.tour_name,
          subtitle: `${Array.isArray(row.steps) ? row.steps.length : 0} steps`,
          region: row.country ?? null,
          filename: `tour-${slug(row.tour_name)}.json`,
          body: JSON.stringify(row.steps ?? [], null, 2),
        });
      });

      return items;
    },
    staleTime: 60_000,
  });

  const items = useMemo(() => {
    if (!data) return [];
    return data.filter((item) => matchesRegion(item.region, country));
  }, [data, country]);

  const handleDownload = (item: OnboardingItem) => {
    try {
      downloadBlob(
        item.filename,
        item.body,
        item.filename.endsWith('.json') ? 'application/json;charset=utf-8' : undefined,
      );
      toast.success(`Downloaded ${item.filename}`);
    } catch {
      toast.error('Download failed. Please try again.');
    }
  };

  const handleDownloadAll = () => {
    if (!items.length) return;
    setBusy(true);
    try {
      const bundle = items
        .map((item) => `\n\n<!-- ${item.filename} -->\n\n${item.body}`)
        .join('\n\n---\n');
      downloadBlob(
        `rentmaikar-onboarding-pack-${slug(country)}.md`,
        `# Rentmaikar onboarding pack — ${country}\n\nGenerated ${new Date().toISOString()}\n${bundle}`,
      );
      toast.success('Onboarding pack downloaded');
    } catch {
      toast.error('Could not build the onboarding pack.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="staff-onboarding-downloads">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" />
            Onboarding downloads
          </CardTitle>
          <CardDescription>
            Agreements, training scripts and guided tours for {country}. Available inside the installed app.
          </CardDescription>
        </div>
        <Button size="sm" onClick={handleDownloadAll} disabled={busy || !items.length} className="gap-2 shrink-0">
          <Download className="h-4 w-4" />
          Download pack
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Could not load onboarding items.
            </span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No onboarding items published for {country} yet.
          </p>
        )}

        {items.map((item) => {
          const meta = kindMeta[item.kind];
          const Icon = meta.icon;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {meta.label}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => handleDownload(item)}
                  aria-label={`Download ${item.title}`}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default StaffOnboardingDownloads;
