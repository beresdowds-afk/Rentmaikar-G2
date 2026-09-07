import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Users, Car } from 'lucide-react';

type UserRow = { user_id: string; full_name: string | null; email: string | null; role: string | null };
type VehicleRow = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  status: string | null;
  pickup_city: string | null;
};

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
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [assignedVehicles, setAssignedVehicles] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');

  const load = async () => {
    if (!assistantId) return;
    setLoading(true);
    try {
      const [
        { data: roleRows },
        { data: profiles },
        { data: assignments, error },
        { data: vehicleRows, error: vehicleError },
        { data: vehicleAssignments, error: vehicleAssignmentError },
      ] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('profiles').select('user_id, full_name, email').order('full_name', { ascending: true }).limit(1000),
        supabase.from('admin_assistant_user_assignments').select('target_user_id').eq('assistant_id', assistantId),
        supabase
          .from('vehicles')
          .select('id, make, model, year, license_plate, status, pickup_city')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('admin_assistant_vehicle_assignments').select('vehicle_id').eq('assistant_id', assistantId),
      ]);
      if (error) throw error;
      if (vehicleError) throw vehicleError;
      if (vehicleAssignmentError) throw vehicleAssignmentError;

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
      setVehicles((vehicleRows || []) as VehicleRow[]);
      setAssignedVehicles(new Set((vehicleAssignments || []).map(a => a.vehicle_id)));
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

  const toggleVehicle = async (vehicleId: string, next: boolean) => {
    if (!assistantId) return;
    setPending(p => new Set(p).add(vehicleId));
    try {
      if (next) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('admin_assistant_vehicle_assignments')
          .upsert(
            { assistant_id: assistantId, vehicle_id: vehicleId, assigned_by: user?.id ?? null },
            { onConflict: 'assistant_id,vehicle_id' },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_assistant_vehicle_assignments')
          .delete()
          .eq('assistant_id', assistantId)
          .eq('vehicle_id', vehicleId);
        if (error) throw error;
      }
      setAssignedVehicles(prev => {
        const s = new Set(prev);
        next ? s.add(vehicleId) : s.delete(vehicleId);
        return s;
      });
      toast.success(next ? 'Vehicle assigned' : 'Vehicle unassigned');
      onChanged?.();
    } catch (e: any) {
      toast.error('Save failed', { description: e.message });
    } finally {
      setPending(p => {
        const s = new Set(p);
        s.delete(vehicleId);
        return s;
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q));
  }, [users, search]);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(v =>
      `${v.make ?? ''} ${v.model ?? ''} ${v.year ?? ''} ${v.license_plate ?? ''} ${v.pickup_city ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [vehicles, vehicleSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Assignments
          </DialogTitle>
          <DialogDescription>
            Choose which drivers, owners and vehicles {assistantName || 'this assistant'} can manage. Changes save immediately.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="users">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" /> Drivers &amp; owners
              <Badge variant="outline">{assigned.size}</Badge>
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-2">
              <Car className="h-4 w-4" /> Vehicles
              <Badge variant="outline">{assignedVehicles.size}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-3">
            <Input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading users…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No matching drivers or owners.</p>
            ) : (
              <ScrollArea className="h-[380px]">
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
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-3">
            <Input
              placeholder="Search vehicles by make, model, plate or city…"
              value={vehicleSearch}
              onChange={e => setVehicleSearch(e.target.value)}
            />
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading vehicles…
              </div>
            ) : filteredVehicles.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No matching vehicles.</p>
            ) : (
              <ScrollArea className="h-[380px]">
                <div className="space-y-2 pr-4">
                  {filteredVehicles.map(v => {
                    const isAssigned = assignedVehicles.has(v.id);
                    const isPending = pending.has(v.id);
                    return (
                      <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unnamed vehicle'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[v.license_plate, v.pickup_city].filter(Boolean).join(' • ') || 'No plate on file'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {v.status && <Badge variant="secondary" className="capitalize">{v.status}</Badge>}
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Checkbox
                              checked={isAssigned}
                              onCheckedChange={val => toggleVehicle(v.id, !!val)}
                              aria-label={isAssigned ? 'Unassign vehicle' : 'Assign vehicle'}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
