import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { UploadDropZone } from '@/components/ui/upload-drop-zone';
import { Loader2, FileText, X, Gavel, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const BUCKET = 'appeal-documents';

interface AppealDoc {
  path: string;
  name: string;
  size?: number;
  type?: string;
}

interface Appeal {
  id: string;
  application_id: string;
  application_type: string | null;
  application_status: string | null;
  rejection_reason: string | null;
  reason: string;
  documents: AppealDoc[] | null;
  status: string;
  resolution_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface RejectedApp {
  id: string;
  application_type: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Under review', variant: 'secondary' },
  recovered: { label: 'Appeal accepted — application reopened', variant: 'default' },
  recycled: { label: 'Appeal accepted — new application created', variant: 'default' },
  declined: { label: 'Appeal declined', variant: 'destructive' },
};

export function ApplicationAppealPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rejected, setRejected] = useState<RejectedApp[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState<AppealDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [appsRes, appealsRes] = await Promise.all([
      supabase
        .from('applications')
        .select('id, application_type, rejection_reason, reviewed_at, created_at')
        .eq('user_id', user.id)
        .eq('status', 'rejected')
        .order('created_at', { ascending: false }),
      (supabase as any).rpc('my_application_appeals'),
    ]);

    setRejected(((appsRes.data as any[]) ?? []) as RejectedApp[]);
    setAppeals((((appealsRes as any)?.data as any[]) ?? []) as Appeal[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openAppealAppIds = useMemo(
    () => new Set(appeals.filter((a) => a.status === 'open').map((a) => a.application_id)),
    [appeals],
  );

  const appealable = useMemo(
    () => rejected.filter((a) => !openAppealAppIds.has(a.id)),
    [rejected, openAppealAppIds],
  );

  useEffect(() => {
    if (!selectedAppId && appealable.length > 0) setSelectedAppId(appealable[0].id);
    if (selectedAppId && !appealable.some((a) => a.id === selectedAppId)) {
      setSelectedAppId(appealable[0]?.id ?? null);
    }
  }, [appealable, selectedAppId]);

  const handleUpload = async (files: File[]) => {
    if (!user?.id) return;
    if (docs.length + files.length > 10) {
      toast.error('You can attach at most 10 supporting documents');
      return;
    }
    setUploading(true);
    try {
      const uploaded: AppealDoc[] = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
        const path = `${user.id}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });
        if (error) throw error;
        uploaded.push({ path, name: file.name, size: file.size, type: file.type });
      }
      setDocs((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} document${uploaded.length > 1 ? 's' : ''} attached`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (doc: AppealDoc) => {
    await supabase.storage.from(BUCKET).remove([doc.path]);
    setDocs((prev) => prev.filter((d) => d.path !== doc.path));
  };

  const openDoc = async (doc: AppealDoc) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Could not open document');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const submitAppeal = async () => {
    if (!selectedAppId) return;
    if (reason.trim().length < 10) {
      toast.error('Please describe why your registration should be reconsidered (min 10 characters)');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc('request_application_recovery', {
        _app_id: selectedAppId,
        _reason: reason.trim(),
        _documents: docs,
      });
      if (error) throw error;
      toast.success('Appeal submitted — our review team will get back to you.');
      setReason('');
      setDocs([]);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not submit your appeal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading appeals…
        </CardContent>
      </Card>
    );
  }

  if (rejected.length === 0 && appeals.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-primary" />
          Registration appeals
        </CardTitle>
        <CardDescription>
          Appeal a rejected registration with supporting documents, and track the review outcome here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {appealable.length > 0 && (
          <div className="space-y-4">
            {appealable.length > 1 && (
              <div className="space-y-2">
                <Label>Which application are you appealing?</Label>
                <div className="flex flex-wrap gap-2">
                  {appealable.map((a) => (
                    <Button
                      key={a.id}
                      type="button"
                      size="sm"
                      variant={selectedAppId === a.id ? 'default' : 'outline'}
                      onClick={() => setSelectedAppId(a.id)}
                    >
                      {(a.application_type ?? 'application').toString()} ·{' '}
                      {new Date(a.created_at).toLocaleDateString()}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const app = appealable.find((a) => a.id === selectedAppId);
              return app?.rejection_reason ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    <span className="font-medium">Reason for rejection: </span>
                    {app.rejection_reason}
                  </AlertDescription>
                </Alert>
              ) : null;
            })()}

            <div className="space-y-2">
              <Label htmlFor="appeal-reason">Why should we reconsider?</Label>
              <Textarea
                id="appeal-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain what has changed or what was misunderstood, and reference the documents you attached."
                rows={5}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">{reason.length}/2000 characters</p>
            </div>

            <div className="space-y-2">
              <Label>Supporting documents (optional, up to 10)</Label>
              <UploadDropZone
                multiple
                isUploading={uploading}
                disabled={uploading || submitting}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                maxSizeMB={10}
                label="Attach documents"
                onFilesSelected={handleUpload}
              />
              {docs.length > 0 && (
                <ul className="space-y-2 pt-2">
                  {docs.map((d) => (
                    <li
                      key={d.path}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDoc(d)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button onClick={submitAppeal} disabled={submitting || uploading || !selectedAppId}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit appeal
            </Button>
          </div>
        )}

        {appeals.length > 0 && (
          <>
            {appealable.length > 0 && <Separator />}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Appeal history</h3>
              {appeals.map((a) => {
                const meta = STATUS_STYLES[a.status] ?? { label: a.status, variant: 'outline' as const };
                const attached = (a.documents ?? []) as AppealDoc[];
                return (
                  <div key={a.id} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium capitalize">
                        {(a.application_type ?? 'Registration').toString()} appeal
                      </span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submitted {new Date(a.created_at).toLocaleString()}
                      {a.reviewed_at ? ` · Reviewed ${new Date(a.reviewed_at).toLocaleString()}` : ''}
                    </p>
                    <p className="text-sm">{a.reason}</p>
                    {a.resolution_notes && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Reviewer notes: </span>
                        {a.resolution_notes}
                      </p>
                    )}
                    {attached.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {attached.map((d) => (
                          <Button
                            key={d.path}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openDoc(d)}
                          >
                            <Download className="mr-2 h-3 w-3" />
                            {d.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ApplicationAppealPanel;
