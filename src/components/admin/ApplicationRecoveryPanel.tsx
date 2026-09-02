// Admin panel: recovery & recycle queue for rejected registration applications.
// - "Recover" reopens the same application (status -> needs_info) so the
//   applicant can fix what was wrong.
// - "Recycle" clones the rejected application into a fresh pending one,
//   linked back to the original via recovered_from_application_id.
// Applicant appeals (application_recovery_requests) are surfaced inline.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RotateCcw, Recycle, RefreshCw, MessageSquareWarning, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

type RecoveryStatus = 'none' | 'eligible' | 'requested' | 'recovered' | 'recycled';

interface RejectedApp {
  id: string;
  application_type: string;
  first_name: string;
  last_name: string;
  email: string;
  city: string | null;
  country: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  recovery_status: RecoveryStatus;
  recycle_count: number | null;
}

interface AppealDoc {
  path: string;
  name: string;
}

interface RecoveryRequest {
  id: string;
  application_id: string;
  reason: string;
  status: string;
  created_at: string;
  documents?: AppealDoc[] | null;
}

const badgeFor: Record<RecoveryStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  eligible: 'bg-amber-100 text-amber-800',
  requested: 'bg-blue-100 text-blue-800',
  recovered: 'bg-emerald-100 text-emerald-800',
  recycled: 'bg-purple-100 text-purple-800',
};

export default function ApplicationRecoveryPanel() {
  const qc = useQueryClient();
  const [action, setAction] = useState<{ app: RejectedApp; kind: 'recover' | 'recycle' } | null>(null);
  const [notes, setNotes] = useState('');

  const { data: apps = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['rejected-applications-recovery'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, application_type, first_name, last_name, email, city, country, rejection_reason, reviewed_at, created_at, recovery_status, recycle_count')
        .eq('status', 'rejected')
        .order('reviewed_at', { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as RejectedApp[];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['application-recovery-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('application_recovery_requests')
        .select('id, application_id, reason, status, created_at, documents')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecoveryRequest[];
    },
  });

  const openRequestFor = (appId: string) => requests.find((r) => r.application_id === appId);

  const mutate = useMutation({
    mutationFn: async ({ app, kind, note }: { app: RejectedApp; kind: 'recover' | 'recycle'; note: string }) => {
      const fn = kind === 'recover' ? 'recover_application' : 'recycle_application';
      const { data, error } = await (supabase.rpc as any)(fn, {
        _app_id: app.id,
        _notes: note.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.kind === 'recover'
          ? 'Application reopened for more information'
          : 'A fresh application was created from the rejected one',
      );
      setAction(null);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['rejected-applications-recovery'] });
      qc.invalidateQueries({ queryKey: ['application-recovery-requests'] });
      qc.invalidateQueries({ queryKey: ['applications'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Action failed'),
  });

  const decline = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase.rpc as any)('decline_application_recovery', {
        _request_id: requestId,
        _notes: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Appeal declined');
      qc.invalidateQueries({ queryKey: ['application-recovery-requests'] });
      qc.invalidateQueries({ queryKey: ['rejected-applications-recovery'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not decline appeal'),
  });

  return (
    <Card data-testid="application-recovery-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Recycle className="h-5 w-5" />
            Recovery &amp; recycle ({apps.length})
            {requests.length > 0 && (
              <Badge className="bg-blue-100 text-blue-800">{requests.length} appeal{requests.length > 1 ? 's' : ''}</Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Every rejected application — past and future — stays recoverable. Reopen it in place, or
          recycle it into a brand-new pending application without asking the applicant to start over.
        </p>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading rejected applications…</div>
        ) : apps.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No rejected applications.</div>
        ) : (
          <ul className="space-y-2">
            {apps.map((app) => {
              const req = openRequestFor(app.id);
              return (
                <li key={app.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {app.first_name} {app.last_name}
                        <span className="ml-2 text-xs text-muted-foreground capitalize">{app.application_type}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {app.email}
                        {app.city ? ` · ${app.city}` : ''}
                        {app.reviewed_at ? ` · rejected ${format(new Date(app.reviewed_at), 'PP')}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${badgeFor[app.recovery_status ?? 'none']}`}>
                        {(app.recovery_status ?? 'none').replace('_', ' ')}
                      </Badge>
                      {(app.recycle_count ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[10px]">recycled ×{app.recycle_count}</Badge>
                      )}
                    </div>
                  </div>

                  {app.rejection_reason && (
                    <p className="text-xs text-red-600 bg-red-50 rounded p-2">{app.rejection_reason}</p>
                  )}

                  {req && (
                    <div className="text-xs bg-blue-50 text-blue-800 rounded p-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <MessageSquareWarning className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="flex-1">Applicant appeal: {req.reason}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => decline.mutate(req.id)}
                          disabled={decline.isPending}
                        >
                          Decline
                        </Button>
                      </div>
                      {(req.documents ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pl-5">
                          {(req.documents ?? []).map((doc) => (
                            <Button
                              key={doc.path}
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={async () => {
                                const { data } = await supabase.storage
                                  .from('appeal-documents')
                                  .createSignedUrl(doc.path, 300);
                                if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              {doc.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}


                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setAction({ app, kind: 'recover' }); setNotes(''); }}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Recover
                    </Button>
                    <Button size="sm" onClick={() => { setAction({ app, kind: 'recycle' }); setNotes(''); }}>
                      <Recycle className="h-3.5 w-3.5 mr-1.5" /> Recycle
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === 'recover' ? 'Recover application' : 'Recycle application'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {action?.kind === 'recover'
                ? 'The application returns to "Needs info" with the rejection cleared, so the applicant can supply what was missing.'
                : 'A new pending application is created with all details copied over, linked back to the rejected one.'}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="recovery-notes">Review note (optional)</Label>
              <Textarea
                id="recovery-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What should the applicant fix or what changed?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              onClick={() => action && mutate.mutate({ app: action.app, kind: action.kind, note: notes })}
              disabled={mutate.isPending}
            >
              {mutate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {action?.kind === 'recover' ? 'Recover' : 'Recycle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
