import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, Users } from 'lucide-react';

type UserRow = { user_id: string; full_name: string | null; email: string | null; role: string | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assistantId: string | null;
  assistantName?: string | null;
  onChanged?: () => void;
}

export function AssistantUserAssignmentsDialog({ open, onOpenChange, assistantId, assistantName, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!assistantId) return;
    setLoading(true);
    try {
      const [{ data: roleRows }, { data: profiles }, { data: assignments, error }] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('profiles').select('user_id, full_name, email').order('full_name', { ascending: true }).limit(1000),
        supabase.from('admin_assistant_user_assignments').select('target_user_id').eq('assistant_id', assistantId),
      ]);
      if (error) throw error;

      const roleMap = new Map<string, string>();
      (roleRows || []).forEach(r => {
        if (r.role === 'driver' || r.role === 'owner') roleMap.set(r.user_id, r.role);
      });

      setUsers(
        (profiles || [])
          .filter(p => p.user_id !== assistantId && roleMap.has(p.user_id))
          .map(p => ({ ...p, role: roleMap.get(p.user_id) ?? null })),
      );
      setAssigned(new Set((assignments || []).map(a => a.target_user_id)));
    } catch (e: any) {
      toast.error('Failed to load assignments', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assistantId]);

  const toggle = async (userId: string, next: boolean) => {
    if (!assistantId) return;
    setPending(p => new Set(p).add(userId));
    try {
      if (next) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('admin_assistant_user_assignments')
          .upsert(
            { assistant_id: assistantId, target_user_id: userId, assigned_by: user?.id ?? null },
            { onConflict: 'assistant_id,target_user_id' },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_assistant_user_assignments')
          .delete()
          .eq('assistant_id', assistantId)
          .eq('target_user_id', userId);
        if (error) throw error;
      }
      setAssigned(prev => {
        const s = new Set(prev);
        next ? s.add(userId) : s.delete(userId);
        return s;
      });
      toast.success(next ? 'User assigned' : 'User unassigned');
      onChanged?.();
    } catch (e: any) {
      toast.error('Save failed', { description: e.message });
    } finally {
      setPending(p => {
        const s = new Set(p);
        s.delete(userId);
        return s;
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q));
  }, [users, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Assigned users
          </DialogTitle>
          <DialogDescription>
            Choose which drivers and owners {assistantName || 'this assistant'} can manage. Changes save immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
          <Badge variant="outline">{assigned.size} assigned</Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No matching drivers or owners.</p>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="space-y-2 pr-4">
              {filtered.map(u => {
                const isAssigned = assigned.has(u.user_id);
                const isPending = pending.has(u.user_id);
                return (
                  <div key={u.user_id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.full_name || 'Unnamed user'}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {u.role && <Badge variant="secondary" className="capitalize">{u.role}</Badge>}
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={v => toggle(u.user_id, !!v)}
                          aria-label={isAssigned ? 'Unassign user' : 'Assign user'}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
