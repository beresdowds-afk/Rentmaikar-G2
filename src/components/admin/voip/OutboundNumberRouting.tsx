import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PhoneOutgoing, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const ANY_ROLE = '__any__';

const ROLES = [
  'admin',
  'admin_assistant',
  'legal_support',
  'iot_support',
  'vehicle_support',
  'insurance_support',
] as const;

const REGIONS = ['All', 'USA', 'Nigeria'] as const;

type StaffRole = (typeof ROLES)[number];

interface OutboundNumber {
  id: string;
  phone_number: string;
  label: string;
  region: string;
  role: StaffRole | null;
  priority: number;
  is_active: boolean;
  is_default: boolean;
}

const emptyDraft = {
  phone_number: '',
  label: '',
  region: 'All' as string,
  role: ANY_ROLE as string,
  priority: 100,
};

/**
 * Admin control for which Twilio number staff dial out with. Rules are matched
 * by role first, then region, then the default flag and priority.
 */
export const OutboundNumberRouting = () => {
  const [rows, setRows] = useState<OutboundNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('voip_outbound_numbers')
      .select('*')
      .order('priority', { ascending: true });
    if (error) {
      toast({ title: 'Could not load numbers', description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []) as OutboundNumber[]);
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const addRule = async () => {
    const phone = draft.phone_number.replace(/[^\d+]/g, '');
    if (!/^\+\d{8,15}$/.test(phone)) {
      toast({ title: 'Enter a valid number', description: 'Use international format, e.g. +13806003018.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from('voip_outbound_numbers').insert([{
      phone_number: phone,
      label: draft.label.trim() || phone,
      region: draft.region,
      role: draft.role === ANY_ROLE ? null : (draft.role as StaffRole),
      priority: Number(draft.priority) || 100,
    }]);
    setIsSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    setDraft(emptyDraft);
    toast({ title: 'Routing rule added' });
    void load();
  };

  const patch = async (id: string, updates: Partial<OutboundNumber>) => {
    const { error } = await supabase.from('voip_outbound_numbers').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('voip_outbound_numbers').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Routing rule removed' });
    void load();
  };

  const makeDefault = async (id: string) => {
    await Promise.all(
      rows.filter(r => r.is_default && r.id !== id).map(r =>
        supabase.from('voip_outbound_numbers').update({ is_default: false }).eq('id', r.id),
      ),
    );
    await patch(id, { is_default: true });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <PhoneOutgoing className="h-5 w-5" />
            Outbound number routing
          </CardTitle>
          <CardDescription>
            Choose which Twilio number staff call out from, by staff role and region.
            The most specific active rule wins.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add rule */}
        <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="obn-number">Twilio number</Label>
            <Input
              id="obn-number"
              placeholder="+13806003018"
              value={draft.phone_number}
              onChange={(e) => setDraft({ ...draft, phone_number: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="obn-label">Label</Label>
            <Input
              id="obn-label"
              placeholder="Staff dial-out"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Region</Label>
            <Select value={draft.region} onValueChange={(v) => setDraft({ ...draft, region: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Staff role</Label>
            <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_ROLE}>Any role</SelectItem>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full gap-2" onClick={() => void addRule()} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>

        {/* Rules table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  No routing rules yet — staff calls use the platform dial-out number.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                <TableCell>{r.label}</TableCell>
                <TableCell><Badge variant="outline">{r.region}</Badge></TableCell>
                <TableCell className="text-sm">
                  {r.role ? r.role.replace(/_/g, ' ') : <span className="text-muted-foreground">Any</span>}
                </TableCell>
                <TableCell>
                  {r.is_default ? (
                    <Badge>Default</Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => void makeDefault(r.id)}>
                      Set default
                    </Button>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(checked) => void patch(r.id, { is_active: checked })}
                  />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => void remove(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default OutboundNumberRouting;
