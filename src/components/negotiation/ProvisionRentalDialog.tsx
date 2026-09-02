import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { PriceNegotiation } from '@/hooks/usePriceNegotiations';

interface Props {
  negotiation: PriceNegotiation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProvisioned?: () => void;
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const ProvisionRentalDialog = ({ negotiation, open, onOpenChange, onProvisioned }: Props) => {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState(toLocalInput(now));
  const [endDate, setEndDate] = useState(toLocalInput(weekAhead));
  const [frequency, setFrequency] = useState<'weekly' | 'daily'>('weekly');
  const [pickup, setPickup] = useState('');
  const [returnLoc, setReturnLoc] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!negotiation) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_provision_rental_from_negotiation', {
        _negotiation_id: negotiation.id,
        _start_date: new Date(startDate).toISOString(),
        _end_date: new Date(endDate).toISOString(),
        _payment_frequency: frequency,
        _pickup_location: pickup || null,
        _return_location: returnLoc || null,
      });
      if (error) throw error;
      const res = data as any;
      toast.success('Rental & billing provisioned', {
        description: `Deposit ${res?.currency} ${res?.deposit_amount} + Rental ${res?.currency} ${res?.rental_amount} (${res?.period_days} days).`,
      });
      onProvisioned?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Provisioning failed', { description: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Provision rental & billing
          </DialogTitle>
          <DialogDescription>
            Creates the rental record, a security deposit invoice, and the first rental invoice from the
            locked daily rate {negotiation ? `(${negotiation.currency} ${negotiation.final_daily_rate}/day)` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start</Label>
              <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Payment frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as 'daily' | 'weekly')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="daily">Daily (+10% surcharge policy)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Pickup location</Label>
              <Input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Vehicle default" />
            </div>
            <div className="space-y-1">
              <Label>Return location</Label>
              <Input value={returnLoc} onChange={(e) => setReturnLoc(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !negotiation}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Provisioning…</> : 'Provision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
