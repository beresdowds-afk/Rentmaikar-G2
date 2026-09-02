import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ScrollText, Search, X } from 'lucide-react';

interface Props {
  applicationId: string;
}

interface AuditRow {
  id: string;
  action: string;
  actor_id: string | null;
  actor_role: string | null;
  changed: any;
  details: any;
  created_at: string;
}

const RANGE_OPTIONS: { value: string; label: string; hours: number | null }[] = [
  { value: 'all', label: 'All time', hours: null },
  { value: '24h', label: 'Last 24 hours', hours: 24 },
  { value: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { value: '30d', label: 'Last 30 days', hours: 24 * 30 },
];

export const ApplicationAuditLog = ({ applicationId }: Props) => {
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState('');
  const [rangeFilter, setRangeFilter] = useState<string>('all');
  const [textFilter, setTextFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['application_audit_log', applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('application_audit_log')
        .select('id, action, actor_id, actor_role, changed, details, created_at')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AuditRow[];
    },
  });

  const actionTypes = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((r) => set.add(r.action));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const range = RANGE_OPTIONS.find((r) => r.value === rangeFilter);
    const cutoff =
      range?.hours != null ? Date.now() - range.hours * 3600_000 : null;
    const actorNeedle = actorFilter.trim().toLowerCase();
    const textNeedle = textFilter.trim().toLowerCase();
    return data.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false;
      if (cutoff && new Date(row.created_at).getTime() < cutoff) return false;
      if (
        actorNeedle &&
        !(row.actor_id ?? '').toLowerCase().includes(actorNeedle) &&
        !(row.actor_role ?? '').toLowerCase().includes(actorNeedle)
      ) {
        return false;
      }
      if (textNeedle) {
        const hay = JSON.stringify(row.changed ?? {}) + ' ' + JSON.stringify(row.details ?? {});
        if (!hay.toLowerCase().includes(textNeedle)) return false;
      }
      return true;
    });
  }, [data, actionFilter, actorFilter, rangeFilter, textFilter]);

  const hasActiveFilters =
    actionFilter !== 'all' || rangeFilter !== 'all' || !!actorFilter || !!textFilter;

  const resetFilters = () => {
    setActionFilter('all');
    setActorFilter('');
    setRangeFilter('all');
    setTextFilter('');
  };

  return (
    <section className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold flex items-center gap-2">
          <ScrollText className="h-4 w-4" /> Audit trail
        </h4>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={resetFilters} className="h-7 text-xs gap-1">
            <X className="h-3 w-3" /> Clear filters
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Search changes / details"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Input
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          placeholder="Actor id or role"
          className="h-8 text-xs"
        />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionTypes.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rangeFilter} onValueChange={setRangeFilter}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">Unable to load audit log.</div>
      ) : !data?.length ? (
        <div className="text-sm text-muted-foreground">No audit entries yet.</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No entries match the current filters.
        </div>
      ) : (
        <>
          <div className="text-[11px] text-muted-foreground">
            Showing {filtered.length} of {data.length} entries
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {filtered.map((row) => (
              <div key={row.id} className="p-2 rounded border bg-muted/40 text-xs">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {row.action}
                  </Badge>
                  {row.actor_role && (
                    <Badge variant="secondary" className="text-[10px]">
                      {row.actor_role}
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {format(new Date(row.created_at), 'MMM dd, yyyy HH:mm:ss')}
                  </span>
                </div>
                {row.actor_id && (
                  <div className="text-muted-foreground truncate">Actor: {row.actor_id}</div>
                )}
                {row.changed && Object.keys(row.changed || {}).length > 0 && (
                  <pre className="whitespace-pre-wrap break-all text-[11px] mt-1">
                    {JSON.stringify(row.changed, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default ApplicationAuditLog;
