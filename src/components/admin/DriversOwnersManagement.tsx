import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Car, User, Search, Loader2, Power, PowerOff, Link2, Unlink, Plus } from 'lucide-react';

type RoleKind = 'driver' | 'owner';

interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  role: RoleKind;
  linked_user_ids: string[];
}

interface AccountLink {
  id: string;
  user_a_id: string;
  user_b_id: string;
  link_type: string;
  notes: string | null;
}

export function DriversOwnersManagement() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'driver' | 'owner'>('all');
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Activation dialog
  const [actTarget, setActTarget] = useState<UserRow | null>(null);
  const [actReason, setActReason] = useState('');
  const [actLoading, setActLoading] = useState(false);

  // Link dialog
  const [linkOpenFor, setLinkOpenFor] = useState<UserRow | null>(null);
  const [linkPartnerId, setLinkPartnerId] = useState<string>('');
  const [linkType, setLinkType] = useState<string>('couple');
  const [linkNotes, setLinkNotes] = useState<string>('');
  const [linkLoading, setLinkLoading] = useState(false);

  // Client-side gate. The edge function is the source of truth, but hiding the
  // UI keeps unauthorized users from even seeing the controls.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthorized(false); return; }
      const { data: roleRows } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id);
      const roles = (roleRows || []).map((r: any) => r.role);
      if (roles.includes('admin')) { setAuthorized(true); return; }
      if (roles.includes('admin_assistant')) {
        const { data: perm } = await supabase
          .from('admin_assistant_permissions')
          .select('can_manage_users').eq('user_id', user.id).maybeSingle();
        setAuthorized(!!perm?.can_manage_users);
        return;
      }
      setAuthorized(false);
    })();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: linkRows, error: lErr }] =
        await Promise.all([
          supabase.from('profiles').select('user_id, full_name, email, phone, is_active'),
          supabase.from('user_roles').select('user_id, role').in('role', ['driver', 'owner']),
          supabase.from('account_links').select('id, user_a_id, user_b_id, link_type, notes'),
        ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      if (lErr) throw lErr;

      const linksData = (linkRows || []) as AccountLink[];
      setLinks(linksData);

      const linkedByUser = new Map<string, string[]>();
      for (const l of linksData) {
        linkedByUser.set(l.user_a_id, [...(linkedByUser.get(l.user_a_id) || []), l.user_b_id]);
        linkedByUser.set(l.user_b_id, [...(linkedByUser.get(l.user_b_id) || []), l.user_a_id]);
      }

      const byUser = new Map<string, any>();
      (profiles || []).forEach((p: any) => byUser.set(p.user_id, p));
      const out: UserRow[] = [];
      for (const r of (roles || []) as any[]) {
        const p = byUser.get(r.user_id);
        if (!p) continue;
        out.push({
          user_id: r.user_id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          is_active: p.is_active ?? true,
          role: r.role,
          linked_user_ids: linkedByUser.get(r.user_id) || [],
        });
      }
      setRows(out);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load drivers & owners', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows
      .filter(r => tab === 'all' || r.role === tab)
      .filter(r => !q ||
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.includes(q));
  }, [rows, tab, search]);

  const nameById = (uid: string) => {
    const r = rows.find(x => x.user_id === uid);
    return r?.full_name || r?.email || uid.slice(0, 8);
  };

  const submitActivation = async () => {
    if (!actTarget) return;
    if (actReason.trim().length < 5) {
      toast.error('A reason of at least 5 characters is required');
      return;
    }
    setActLoading(true);
    try {
      const nextActive = !actTarget.is_active;
      const { data, error } = await supabase.functions.invoke('admin-set-user-active', {
        body: { target_user_id: actTarget.user_id, active: nextActive, reason: actReason.trim() },
      });
      if (error || (data && (data as any).error)) throw new Error(error?.message || (data as any).error);
      toast.success(`${nextActive ? 'Activated' : 'Deactivated'} ${actTarget.full_name || actTarget.email}`,
        { description: (data as any)?.message });
      setActTarget(null);
      setActReason('');
      await fetchAll();
    } catch (err: any) {
      toast.error('Could not update activation', { description: err.message });
    } finally {
      setActLoading(false);
    }
  };

  const submitLink = async () => {
    if (!linkOpenFor || !linkPartnerId) return;
    setLinkLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [a, b] = [linkOpenFor.user_id, linkPartnerId].sort();
      const { error } = await supabase.from('account_links').insert({
        user_a_id: a,
        user_b_id: b,
        link_type: linkType,
        notes: linkNotes || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success('Accounts linked');
      setLinkOpenFor(null);
      setLinkPartnerId('');
      setLinkNotes('');
      await fetchAll();
    } catch (err: any) {
      toast.error('Failed to link accounts', { description: err.message });
    } finally {
      setLinkLoading(false);
    }
  };

  const unlink = async (userA: string, userB: string) => {
    try {
      const link = links.find(l =>
        (l.user_a_id === userA && l.user_b_id === userB) ||
        (l.user_a_id === userB && l.user_b_id === userA));
      if (!link) return;
      const { error } = await supabase.from('account_links').delete().eq('id', link.id);
      if (error) throw error;
      toast.success('Link removed');
      await fetchAll();
    } catch (err: any) {
      toast.error('Failed to unlink', { description: err.message });
    }
  };

  const partnerOptions = useMemo(() => {
    if (!linkOpenFor) return [];
    return rows.filter(r =>
      r.user_id !== linkOpenFor.user_id &&
      !linkOpenFor.linked_user_ids.includes(r.user_id));
  }, [rows, linkOpenFor]);

  const RoleBadge = ({ role }: { role: RoleKind }) =>
    <Badge variant={role === 'owner' ? 'default' : 'secondary'} className="gap-1">
      {role === 'owner' ? <Car className="h-3 w-3" /> : <User className="h-3 w-3" />}
      {role === 'owner' ? 'Owner' : 'Driver'}
    </Badge>;

  return (
    <>
      {authorized === false && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Access restricted</CardTitle>
            <CardDescription>
              Only admins or admin assistants with the “Manage users” permission can open this portal.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {authorized !== false && (<>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Drivers &amp; Owners
              </CardTitle>
              <CardDescription>
                Activate, deactivate, or link (couple) driver and owner accounts. Status changes cascade to linked accounts on both dashboards.
              </CardDescription>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
              <TabsTrigger value="driver">Drivers ({rows.filter(r => r.role === 'driver').length})</TabsTrigger>
              <TabsTrigger value="owner">Owners ({rows.filter(r => r.role === 'owner').length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {loading ? (
                <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  No accounts match your filters.
                </div>
              ) : (
                <ScrollArea className="h-[560px]">
                  <div className="space-y-2 pr-4">
                    {filtered.map(r => (
                      <div key={r.user_id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{r.full_name || 'No name'}</span>
                            <RoleBadge role={r.role} />
                            <Badge variant={r.is_active ? 'outline' : 'destructive'}>
                              {r.is_active ? 'Active' : 'Deactivated'}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground truncate">{r.email || '—'} {r.phone ? `• ${r.phone}` : ''}</div>
                          {r.linked_user_ids.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                              <Link2 className="h-3 w-3 text-primary" />
                              <span className="text-muted-foreground">Linked with:</span>
                              {r.linked_user_ids.map(uid => (
                                <Badge key={uid} variant="secondary" className="gap-1">
                                  {nameById(uid)}
                                  <button
                                    onClick={() => unlink(r.user_id, uid)}
                                    className="ml-1 text-destructive hover:opacity-70"
                                    title="Remove link"
                                  >
                                    <Unlink className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setLinkOpenFor(r); setLinkPartnerId(''); setLinkType('couple'); setLinkNotes(''); }}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Link
                          </Button>
                          <Button
                            variant={r.is_active ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => { setActTarget(r); setActReason(''); }}
                          >
                            {r.is_active ? <><PowerOff className="h-4 w-4 mr-1" /> Deactivate</> : <><Power className="h-4 w-4 mr-1" /> Activate</>}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Activation dialog */}
      <Dialog open={!!actTarget} onOpenChange={(open) => !open && setActTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actTarget?.is_active ? <PowerOff className="h-5 w-5 text-destructive" /> : <Power className="h-5 w-5 text-primary" />}
              {actTarget?.is_active ? 'Deactivate account' : 'Activate account'}
            </DialogTitle>
            <DialogDescription>
              {actTarget?.is_active
                ? `Deactivating ${actTarget?.full_name || actTarget?.email} blocks their sign-in and hides their dashboard on every admin view. Any linked/couple accounts will also be deactivated automatically.`
                : `Reactivating ${actTarget?.full_name || actTarget?.email} restores their sign-in and dashboard. Any linked/couple accounts will also be reactivated.`}
            </DialogDescription>
          </DialogHeader>
          {actTarget && (
            <div className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="text-sm font-medium">
                {actTarget.is_active ? 'Will be deactivated' : 'Will be activated'} ({1 + actTarget.linked_user_ids.length} account{actTarget.linked_user_ids.length ? 's' : ''}):
              </div>
              <ul className="text-sm space-y-1">
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Primary</Badge>
                  <span>{actTarget.full_name || actTarget.email}</span>
                  <RoleBadge role={actTarget.role} />
                </li>
                {actTarget.linked_user_ids.map(uid => {
                  const partner = rows.find(x => x.user_id === uid);
                  return (
                    <li key={uid} className="flex items-center gap-2">
                      <Badge variant="secondary">Linked</Badge>
                      <span>{nameById(uid)}</span>
                      {partner && <RoleBadge role={partner.role} />}
                    </li>
                  );
                })}
              </ul>
              {actTarget.linked_user_ids.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Linked accounts stay in sync — the same status will apply on their dashboard.
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="do-reason">Reason (required, ≥ 5 chars)</Label>
            <Textarea
              id="do-reason"
              value={actReason}
              onChange={e => setActReason(e.target.value)}
              placeholder={actTarget?.is_active ? 'e.g. Unpaid balance, verification lapsed…' : 'e.g. Balance cleared, verification restored…'}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActTarget(null)}>Cancel</Button>
            <Button
              variant={actTarget?.is_active ? 'destructive' : 'default'}
              disabled={actLoading || actReason.trim().length < 5}
              onClick={submitActivation}
            >
              {actLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {actTarget?.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link dialog */}
      <Dialog open={!!linkOpenFor} onOpenChange={(open) => !open && setLinkOpenFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Link couple / partner account
            </DialogTitle>
            <DialogDescription>
              Linking two accounts keeps their activation status in sync. Deactivating one deactivates the other — and vice versa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Primary account</Label>
              <div className="text-sm p-2 rounded bg-muted">
                {linkOpenFor?.full_name || linkOpenFor?.email} • {linkOpenFor?.role}
              </div>
            </div>
            <div>
              <Label>Partner account</Label>
              <Select value={linkPartnerId} onValueChange={setLinkPartnerId}>
                <SelectTrigger><SelectValue placeholder="Choose driver or owner…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {partnerOptions.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {(p.full_name || p.email)} — {p.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Link type</Label>
              <Select value={linkType} onValueChange={setLinkType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="couple">Couple / Spouse</SelectItem>
                  <SelectItem value="family">Family</SelectItem>
                  <SelectItem value="business">Business partner</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={linkNotes} onChange={e => setLinkNotes(e.target.value)} rows={2} placeholder="Optional context…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpenFor(null)}>Cancel</Button>
            <Button onClick={submitLink} disabled={!linkPartnerId || linkLoading}>
              {linkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
              Link accounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>)}
    </>
  );
}
