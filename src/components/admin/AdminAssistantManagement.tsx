import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ShieldCheck, Loader2, Pencil, Trash2, UserPlus, KeyRound, Users } from 'lucide-react';
import { AssistantUserAssignmentsDialog } from './AssistantUserAssignmentsDialog';

export const PERMISSION_GROUPS: Array<{
  label: string;
  items: Array<{ key: PermissionKey; label: string; description: string }>;
}> = [
  {
    label: 'Users & Access',
    items: [
      { key: 'can_view_users', label: 'View users', description: 'Read the platform user directory.' },
      { key: 'can_manage_users', label: 'Manage users', description: 'Edit profiles and toggle active status.' },
      { key: 'can_approve_applications', label: 'Approve / reject registrations', description: 'Approve or reject driver & owner registration applications.' },
      { key: 'can_view_audit_log', label: 'View audit log', description: 'Read admin & role audit history.' },
      { key: 'can_delete_users', label: 'Delete users', description: 'Permanently delete driver & owner registrations (staff accounts stay admin-only).' },
    ],
  },
  {
    label: 'Fleet & Rentals',
    items: [
      { key: 'can_view_vehicles', label: 'View vehicles', description: 'Read vehicle inventory.' },
      { key: 'can_manage_vehicles', label: 'Manage vehicles', description: 'Approve, edit, or deactivate vehicles.' },
      { key: 'can_view_rentals', label: 'View rentals', description: 'Read rental agreements & status.' },
      { key: 'can_manage_rentals', label: 'Manage rentals', description: 'Modify rental agreements.' },
    ],
  },
  {
    label: 'Payments',
    items: [
      { key: 'can_view_payments', label: 'View payments', description: 'Read payment history & payouts.' },
      { key: 'can_manage_payments', label: 'Manage payments', description: 'Trigger refunds, retries, and payouts.' },
    ],
  },
  {
    label: 'Support & IoT',
    items: [
      { key: 'can_view_support_tasks', label: 'View support tasks', description: 'Read the support task portal.' },
      { key: 'can_manage_support_tasks', label: 'Manage support tasks', description: 'Assign or resolve support tasks.' },
      { key: 'can_view_iot', label: 'View IoT hub', description: 'Read telemetry, alerts, fleet health.' },
      { key: 'can_manage_iot', label: 'Manage IoT hub', description: 'Configure alert rules & retention.' },
    ],
  },
  {
    label: 'Communications & Content',
    items: [
      { key: 'can_view_communications', label: 'View communications', description: 'Read inbox, calls, email logs.' },
      { key: 'can_send_communications', label: 'Send communications', description: 'Send emails, SMS, and call requests.' },
      { key: 'can_view_reports', label: 'View reports', description: 'Read analytics & marketing dashboards.' },
      { key: 'can_manage_content', label: 'Manage content', description: 'Edit FAQs, training, and policies.' },
    ],
  },
];

export type PermissionKey =
  | 'can_view_users' | 'can_manage_users' | 'can_approve_applications'
  | 'can_view_vehicles' | 'can_manage_vehicles'
  | 'can_view_rentals' | 'can_manage_rentals'
  | 'can_view_payments' | 'can_manage_payments'
  | 'can_view_support_tasks' | 'can_manage_support_tasks'
  | 'can_view_iot' | 'can_manage_iot'
  | 'can_view_communications' | 'can_send_communications'
  | 'can_view_reports' | 'can_manage_content'
  | 'can_view_audit_log' | 'can_delete_users';

type PermissionRecord = { id: string; user_id: string; notes: string | null } & Record<PermissionKey, boolean>;
type AssistantRow = PermissionRecord & { full_name: string | null; email: string | null };

const EMPTY_PERMS: Record<PermissionKey, boolean> = {
  can_view_users: false, can_manage_users: false, can_approve_applications: false,
  can_view_vehicles: false, can_manage_vehicles: false,
  can_view_rentals: false, can_manage_rentals: false,
  can_view_payments: false, can_manage_payments: false,
  can_view_support_tasks: false, can_manage_support_tasks: false,
  can_view_iot: false, can_manage_iot: false,
  can_view_communications: false, can_send_communications: false,
  can_view_reports: false, can_manage_content: false,
  can_view_audit_log: false, can_delete_users: false,
};

export function AdminAssistantManagement() {
  const [assistants, setAssistants] = useState<AssistantRow[]>([]);
  const [candidateUsers, setCandidateUsers] = useState<Array<{ user_id: string; email: string | null; full_name: string | null; hasRole?: boolean }>>([]);
  const [candidateSearch, setCandidateSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssistantRow | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [perms, setPerms] = useState<Record<PermissionKey, boolean>>(EMPTY_PERMS);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', full_name: '', phone: '' });
  const [assignFor, setAssignFor] = useState<AssistantRow | null>(null);
  const [assignCounts, setAssignCounts] = useState<Record<string, number>>({});

  const loadAssignmentCounts = async () => {
    const { data } = await supabase
      .from('admin_assistant_user_assignments')
      .select('assistant_id');
    const counts: Record<string, number> = {};
    (data || []).forEach(r => { counts[r.assistant_id] = (counts[r.assistant_id] || 0) + 1; });
    setAssignCounts(counts);
  };

  useEffect(() => { loadAssignmentCounts(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('admin_assistant_permissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const ids = (rows || []).map(r => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids)
        : { data: [] as any[] };
      const pmap = new Map((profiles || []).map(p => [p.user_id, p]));

      setAssistants((rows || []).map(r => ({
        ...(r as any),
        full_name: pmap.get(r.user_id)?.full_name ?? null,
        email: pmap.get(r.user_id)?.email ?? null,
      })));

      // Candidate pool = every platform user without an assistant permission
      // row yet. Picking one and saving elevates them to `admin_assistant`
      // (the role is upserted in `save`), so admins can promote existing
      // users — not just users who already hold the role.
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id, role');
      const assistantRoleIds = new Set(
        (roleRows || []).filter(r => r.role === 'admin_assistant').map(r => r.user_id),
      );

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name', { ascending: true })
        .limit(500);

      setCandidateUsers(
        (allProfiles || [])
          .filter(p => !ids.includes(p.user_id))
          .map(p => ({ ...p, hasRole: assistantRoleIds.has(p.user_id) })),
      );

    } catch (e: any) {
      toast.error('Failed to load admin assistants', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setSelectedUserId('');
    setNotes('');
    setPerms(EMPTY_PERMS);
    setDialogOpen(true);
  };

  const openEdit = (row: AssistantRow) => {
    setEditing(row);
    setSelectedUserId(row.user_id);
    setNotes(row.notes || '');
    const next = { ...EMPTY_PERMS };
    (Object.keys(EMPTY_PERMS) as PermissionKey[]).forEach(k => { next[k] = !!row[k]; });
    setPerms(next);
    setDialogOpen(true);
  };

  const togglePerm = (key: PermissionKey) => setPerms(p => ({ ...p, [key]: !p[key] }));
  const setAll = (val: boolean) => setPerms(Object.fromEntries(Object.keys(EMPTY_PERMS).map(k => [k, val])) as Record<PermissionKey, boolean>);

  const save = async () => {
    if (!selectedUserId) {
      toast.error('Select a user');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { user_id: selectedUserId, notes: notes || null, granted_by: user?.id, ...perms };

      if (editing) {
        const { error } = await supabase
          .from('admin_assistant_permissions')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        // Ensure role is set on user_roles (idempotent)
        await supabase.from('user_roles')
          .upsert({ user_id: selectedUserId, role: 'admin_assistant' as any }, { onConflict: 'user_id,role' });
        const { error } = await supabase
          .from('admin_assistant_permissions')
          .insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? 'Permissions updated' : 'Admin assistant configured');
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast.error('Save failed', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (row: AssistantRow) => {
    if (!confirm(`Revoke Admin Assistant access for ${row.full_name || row.email}?`)) return;
    try {
      await supabase.from('admin_assistant_permissions').delete().eq('id', row.id);
      await supabase.from('user_roles').delete().eq('user_id', row.user_id).eq('role', 'admin_assistant' as any);
      toast.success('Access revoked');
      await load();
    } catch (e: any) {
      toast.error('Failed to revoke', { description: e.message });
    }
  };

  const grantedCount = (row: AssistantRow) =>
    (Object.keys(EMPTY_PERMS) as PermissionKey[]).filter(k => row[k]).length;

  const filtered = assistants.filter(a =>
    !search ||
    a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            Admin Assistants
          </h3>
          <p className="text-sm text-muted-foreground">
            Delegate specific admin capabilities. Assistants only see what you enable here.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search assistants..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full md:w-64"
          />
          <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Create New User
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Assistant
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading assistants…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No admin assistants configured yet.</p>
          <p className="text-sm">Click "Add Assistant" to grant scoped access.</p>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-3 pr-4">
            {filtered.map(row => (
              <Card key={row.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold">{row.full_name || 'Unnamed user'}</div>
                    <div className="text-sm text-muted-foreground">{row.email}</div>
                    {row.notes && <p className="text-xs text-muted-foreground italic mt-1">{row.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="gap-1">
                      <KeyRound className="h-3 w-3" /> {grantedCount(row)} permissions
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => setAssignFor(row)} className="gap-1">
                      <Users className="h-3.5 w-3.5" /> Users ({assignCounts[row.user_id] ?? 0})
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(row)} className="gap-1">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => revoke(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      <AssistantUserAssignmentsDialog
        open={!!assignFor}
        onOpenChange={(v) => { if (!v) setAssignFor(null); }}
        assistantId={assignFor?.user_id ?? null}
        assistantName={assignFor?.full_name || assignFor?.email}
        onChanged={loadAssignmentCounts}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit assistant permissions' : 'Add admin assistant'}</DialogTitle>
            <DialogDescription>
              Toggle only the areas this assistant should be able to access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!editing && (
              <div className="space-y-2">
                <Label>User</Label>
                <Input
                  placeholder="Search by name or email…"
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                />
                {candidateUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No eligible users found. Create one via <em>Create New User</em>.
                  </p>
                ) : (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger><SelectValue placeholder="Pick a user" /></SelectTrigger>
                    <SelectContent>
                      {candidateUsers
                        .filter(u => {
                          const q = candidateSearch.trim().toLowerCase();
                          if (!q) return true;
                          return `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q);
                        })
                        .slice(0, 100)
                        .map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>
                            {u.full_name || u.email} — {u.email}
                            {u.hasRole ? '' : ' (will be elevated to Admin Assistant)'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Saving grants the selected user the Admin Assistant role along with the
                  permissions below.
                </p>
              </div>

            )}

            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAll(true)}>Grant all</Button>
                <Button size="sm" variant="outline" onClick={() => setAll(false)}>Clear all</Button>
              </div>
            </div>

            <div className="space-y-4">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.label} className="rounded-lg border p-3 space-y-3">
                  <div className="text-sm font-semibold">{group.label}</div>
                  <div className="grid gap-3">
                    {group.items.map(item => (
                      <div key={item.key} className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{item.label}</div>
                          <div className="text-xs text-muted-foreground">{item.description}</div>
                        </div>
                        <Switch
                          checked={perms[item.key]}
                          onCheckedChange={() => togglePerm(item.key)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="assistant-notes">Notes (optional)</Label>
              <Input
                id="assistant-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Covers Lagos operations Mon-Fri"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !selectedUserId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Update permissions' : 'Grant access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new admin assistant</DialogTitle>
            <DialogDescription>
              Creates an auth account, assigns the "admin_assistant" role, and emails a password-reset link so
              they can set their password. You can then grant scoped permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cu-name">Full name</Label>
              <Input id="cu-name" value={newUser.full_name} onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-email">Email</Label>
              <Input id="cu-email" type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-phone">Phone (optional, international format)</Label>
              <Input id="cu-phone" value={newUser.phone} onChange={e => setNewUser(u => ({ ...u, phone: e.target.value }))} placeholder="+15551234567" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={creating || !newUser.email || !newUser.full_name}
              onClick={async () => {
                setCreating(true);
                try {
                  const { data, error } = await supabase.functions.invoke('admin-create-user', {
                    body: {
                      email: newUser.email.trim(),
                      full_name: newUser.full_name.trim(),
                      role: 'admin_assistant',
                      phone: newUser.phone.trim() || undefined,
                    },
                  });
                  if (error) throw error;
                  if ((data as any)?.error) throw new Error((data as any).error);
                  const newUserId = (data as any)?.user_id as string | undefined;
                  toast.success('Admin assistant created', {
                    description: (data as any)?.message ?? 'Password-reset email sent.',
                  });
                  setCreateOpen(false);
                  setNewUser({ email: '', full_name: '', phone: '' });
                  await load();
                  // Immediately open the permissions editor for the new assistant
                  // so the admin can grant can_manage_users and other capabilities.
                  if (newUserId) {
                    setEditing(null);
                    setSelectedUserId(newUserId);
                    setNotes('');
                    setPerms({ ...EMPTY_PERMS });
                    setDialogOpen(true);
                    toast.info('Grant capabilities', {
                      description: 'Choose which admin areas this new assistant can access, then save.',
                    });
                  }
                } catch (e: any) {
                  toast.error('Failed to create user', { description: e.message });
                } finally {
                  setCreating(false);
                }
              }}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminAssistantManagement;
