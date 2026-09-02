import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Search, Trash2, ShieldAlert, UserX, History as HistoryIcon } from 'lucide-react';
import { useAssistantPermissions } from '@/hooks/useAssistantPermissions';

type Row = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  roles: string[];
};

const STAFF_ROLES = ['admin', 'admin_assistant', 'legal_support', 'iot_support', 'vehicle_support'];

export function UserDeletionPortal() {
  const { isFullAdmin, perms, loading: permsLoading } = useAssistantPermissions();
  const assistantCanDelete = !!(perms as Record<string, boolean> | null)?.can_delete_users;
  const canDeleteAnything = isFullAdmin || assistantCanDelete;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-deletion-directory'],
    queryFn: async (): Promise<Row[]> => {
      const [profRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email, phone'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (profRes.error) throw profRes.error;
      if (roleRes.error) throw roleRes.error;
      const roleMap = new Map<string, string[]>();
      (roleRes.data ?? []).forEach((r: { user_id: string; role: string }) => {
        roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
      });
      return (profRes.data ?? []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        roles: roleMap.get(p.user_id) ?? [],
      }));
    },
  });

  const { data: deletionLog, refetch: refetchLog } = useQuery({
    queryKey: ['user-deletion-audit-log'],
    queryFn: async () => {
      const { data: log, error } = await supabase
        .from('admin_audit_log')
        .select('id, admin_id, target_id, details, created_at')
        .eq('action', 'user_account_deleted')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (log ?? []) as Array<{
        id: string;
        admin_id: string | null;
        target_id: string | null;
        details: any;
        created_at: string;
      }>;
    },
  });



  const isDeletable = (row: Row) => {
    if (row.roles.length === 0) return isFullAdmin;
    if (isFullAdmin) return true;
    return assistantCanDelete && row.roles.every(r => r === 'driver' || r === 'owner');
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(row => {
      const matchesRole =
        roleFilter === 'all' ? true :
        roleFilter === 'staff' ? row.roles.some(r => STAFF_ROLES.includes(r)) :
        roleFilter === 'none' ? row.roles.length === 0 :
        row.roles.includes(roleFilter);
      if (!matchesRole) return false;
      if (!q) return true;
      return (
        row.full_name?.toLowerCase().includes(q) ||
        row.email?.toLowerCase().includes(q) ||
        row.phone?.toLowerCase().includes(q) ||
        row.user_id.toLowerCase().includes(q)
      );
    });
  }, [data, search, roleFilter, isFullAdmin, assistantCanDelete]);

  const selectableRows = rows.filter(isDeletable);
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => selected.includes(r.user_id));

  const toggle = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const toggleAll = () =>
    setSelected(allSelected ? [] : selectableRows.map(r => r.user_id));

  // Rows the user actually ticked, resolved against the freshest directory data.
  const selectedRows = useMemo(
    () => (data ?? []).filter(r => selected.includes(r.user_id)),
    [data, selected],
  );
  // Guardrail: anything selected that is no longer eligible (role changed, row
  // vanished, or permission scope no longer covers it) blocks the purge.
  const blockedRows = selectedRows.filter(r => !isDeletable(r));
  const missingSelections = selected.filter(id => !selectedRows.some(r => r.user_id === id));
  const guardrailBlocked = blockedRows.length > 0 || missingSelections.length > 0;

  const handleDelete = async () => {
    if (guardrailBlocked) {
      toast.error('Selection changed — review the summary before deleting.');
      return;
    }
    setDeleting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('admin-delete-users', {
        body: { userIds: selected, reason: reason || null },
      });
      if (error) throw error;
      const results = (res?.results ?? []) as Array<{ user_id: string; status: string; message?: string }>;
      const ok = results.filter(r => r.status === 'deleted').length;
      const failed = results.filter(r => r.status !== 'deleted');
      if (ok) toast.success(`${ok} account${ok === 1 ? '' : 's'} permanently deleted`);
      failed.forEach(f => toast.error(f.message || `Could not delete ${f.user_id}`));
      setSelected([]);
      setConfirmOpen(false);
      setConfirmText('');
      setReason('');
      await refetch();
      await refetchLog();
    } catch (e: any) {
      toast.error(e?.message || 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  };


  if (permsLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading permissions…</p>
        </div>
      </Card>
    );
  }

  if (!canDeleteAnything) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          You do not have permission to delete user accounts. Ask an admin to grant you the
          “Delete users” permission.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserX className="h-5 w-5" />
                Account Removal
              </CardTitle>
              <CardDescription>
                Search registrations by name or email and permanently remove accounts — singly or in bulk.
              </CardDescription>
            </div>
            <Button
              variant="destructive"
              disabled={selected.length === 0}
              onClick={() => setConfirmOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete selected ({selected.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isFullAdmin && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                As an admin assistant you can only delete driver and owner registrations. Admin,
                assistant and support staff accounts can only be deleted by a full admin.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone or user ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="driver">Drivers</SelectItem>
                <SelectItem value="owner">Owners</SelectItem>
                <SelectItem value="staff">Staff & assistants</SelectItem>
                <SelectItem value="none">No role assigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              disabled={selectableRows.length === 0}
              aria-label="Select all deletable accounts"
            />
            <span className="text-sm text-muted-foreground">
              Select all deletable results ({selectableRows.length} of {rows.length})
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading accounts…</p>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No matching accounts.</p>
          ) : (
            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-4">
                {rows.map(row => {
                  const deletable = isDeletable(row);
                  return (
                    <div
                      key={row.user_id}
                      className="flex items-center justify-between gap-4 rounded-md border p-3"
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          className="mt-1"
                          checked={selected.includes(row.user_id)}
                          disabled={!deletable}
                          onCheckedChange={() => toggle(row.user_id)}
                          aria-label={`Select ${row.full_name || row.email || row.user_id}`}
                        />
                        <div>
                          <p className="font-medium">{row.full_name || 'No name'}</p>
                          <p className="text-sm text-muted-foreground">{row.email || 'No email'}</p>
                          <p className="font-mono text-xs text-muted-foreground">{row.user_id}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {row.roles.length === 0 ? (
                          <Badge variant="outline">No role</Badge>
                        ) : (
                          row.roles.map(r => (
                            <Badge key={r} variant={STAFF_ROLES.includes(r) ? 'destructive' : 'secondary'}>
                              {r.replace(/_/g, ' ')}
                            </Badge>
                          ))
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled={!deletable}
                          onClick={() => { setSelected([row.user_id]); setConfirmOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="h-5 w-5" />
            Deletion history
          </CardTitle>
          <CardDescription>
            Audit trail of removed accounts — who deleted them, when, and which records were purged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!deletionLog || deletionLog.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No accounts have been deleted yet.</p>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="space-y-2 pr-4">
                {deletionLog.map(entry => {
                  const purged = entry.details?.purged;
                  const purgedEntries: Array<[string, number]> =
                    purged && typeof purged === 'object'
                      ? Object.entries(purged)
                          .filter(([, v]) => typeof v === 'number' && (v as number) > 0)
                          .map(([k, v]) => [k, v as number])
                      : [];
                  return (
                    <div key={entry.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {entry.details?.full_name || entry.details?.email || entry.target_id}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {entry.details?.email || 'No email'} ·{' '}
                        {(entry.details?.roles ?? []).join(', ') || 'no role'}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{entry.target_id}</p>
                      {entry.details?.reason && (
                        <p className="mt-1 text-sm">Reason: {entry.details.reason}</p>
                      )}
                      {purgedEntries.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {purgedEntries.map(([table, count]) => (
                            <Badge key={table} variant="outline" className="text-xs">
                              {table.replace(/_/g, ' ')}: {count}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!deleting) { setConfirmOpen(o); if (!o) setConfirmText(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {selected.length} account{selected.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases the sign-in account and every related record (applications, documents,
              rentals, payments, subscriptions). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-medium">Review before purging</div>
              <ScrollArea className="max-h-56">
                <div className="space-y-2 p-3">
                  {selectedRows.map(row => (
                    <div key={row.user_id} className="text-sm">
                      <p className="font-medium">{row.full_name || 'No name'}</p>
                      <p className="text-muted-foreground">{row.email || 'No email'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{row.user_id}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.roles.length === 0 ? (
                          <Badge variant="outline">No role</Badge>
                        ) : (
                          row.roles.map(r => (
                            <Badge key={r} variant={STAFF_ROLES.includes(r) ? 'destructive' : 'secondary'}>
                              {r.replace(/_/g, ' ')}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {guardrailBlocked && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  {blockedRows.length > 0
                    ? `${blockedRows.length} selected account${blockedRows.length === 1 ? '' : 's'} ` +
                      'no longer pass the role check for your permission level. '
                    : ''}
                  {missingSelections.length > 0
                    ? `${missingSelections.length} selection${missingSelections.length === 1 ? '' : 's'} could not be verified. `
                    : ''}
                  Close this dialog and re-select before deleting.
                </AlertDescription>
              </Alert>
            )}

            <Input
              placeholder="Reason (optional, saved to the audit log)"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <Input
              placeholder='Type DELETE to confirm'
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== 'DELETE' || deleting || guardrailBlocked || selectedRows.length === 0}
              onClick={e => { e.preventDefault(); handleDelete(); }}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
