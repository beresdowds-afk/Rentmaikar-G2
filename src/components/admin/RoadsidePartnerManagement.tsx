import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Truck, Phone, MapPin, Star, Clock } from "lucide-react";

interface RoadsidePartner {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  service_type: string;
  coverage_area: string;
  region: string;
  is_active: boolean;
  rating: number | null;
  response_time_minutes: number | null;
  notes: string | null;
}

const SERVICE_TYPES = [
  { value: "towing", label: "Towing" },
  { value: "tire_change", label: "Tire Change" },
  { value: "lockout", label: "Lockout Service" },
  { value: "fuel_delivery", label: "Fuel Delivery" },
  { value: "battery_jump", label: "Battery Jump Start" },
  { value: "general", label: "General" },
];

export const RoadsidePartnerManagement = () => {
  const [partners, setPartners] = useState<RoadsidePartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoadsidePartner | null>(null);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", service_type: "general", coverage_area: "",
    region: "USA", is_active: true, rating: 0, response_time_minutes: 30, notes: "",
  });

  useEffect(() => { fetchPartners(); }, []);

  const fetchPartners = async () => {
    const { data, error } = await supabase.from("roadside_partners").select("*").order("name");
    if (!error) setPartners(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone || !form.coverage_area) {
      toast.error("Name, phone, and coverage area are required");
      return;
    }

    const payload = {
      name: form.name, phone: form.phone, email: form.email || null,
      service_type: form.service_type, coverage_area: form.coverage_area,
      region: form.region, is_active: form.is_active,
      rating: form.rating, response_time_minutes: form.response_time_minutes,
      notes: form.notes || null,
    };

    if (editing) {
      const { error } = await supabase.from("roadside_partners").update(payload).eq("id", editing.id);
      if (error) toast.error("Failed to update partner"); else toast.success("Partner updated");
    } else {
      const { error } = await supabase.from("roadside_partners").insert(payload);
      if (error) toast.error("Failed to add partner"); else toast.success("Partner added");
    }

    setDialogOpen(false);
    resetForm();
    fetchPartners();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("roadside_partners").delete().eq("id", id);
    if (!error) { toast.success("Partner removed"); fetchPartners(); }
  };

  const openEdit = (p: RoadsidePartner) => {
    setEditing(p);
    setForm({
      name: p.name, phone: p.phone, email: p.email || "", service_type: p.service_type,
      coverage_area: p.coverage_area, region: p.region, is_active: p.is_active,
      rating: p.rating || 0, response_time_minutes: p.response_time_minutes || 30, notes: p.notes || "",
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", service_type: "general", coverage_area: "", region: "USA", is_active: true, rating: 0, response_time_minutes: 30, notes: "" });
  };

  const getServiceLabel = (type: string) => SERVICE_TYPES.find(s => s.value === type)?.label || type;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Truck className="h-5 w-5 text-orange-600" />
          <div>
            <h3 className="text-lg font-semibold">Roadside Support Partners</h3>
            <p className="text-sm text-muted-foreground">Manage partnered service providers for roadside assistance (USA only)</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Partner</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Partner" : "Add Roadside Partner"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div><Label>Company Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Phone *</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Service Type</Label>
                <Select value={form.service_type} onValueChange={v => setForm(p => ({ ...p, service_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Coverage Area *</Label><Input value={form.coverage_area} onChange={e => setForm(p => ({ ...p, coverage_area: e.target.value }))} placeholder="e.g. DMV Area, Maryland, Virginia" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Avg Response Time (min)</Label><Input type="number" value={form.response_time_minutes} onChange={e => setForm(p => ({ ...p, response_time_minutes: parseInt(e.target.value) || 0 }))} /></div>
                <div><Label>Rating (0-5)</Label><Input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={e => setForm(p => ({ ...p, rating: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Add Partner"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : partners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No roadside partners yet. Add your first partner.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {partners.map(p => (
            <div key={p.id} className={`p-4 rounded-lg border ${p.is_active ? "bg-card" : "bg-muted/50 opacity-60"}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">{p.name}</h4>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Edit2 className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {p.phone}</p>
                <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {p.coverage_area}</p>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <Badge variant="outline">{getServiceLabel(p.service_type)}</Badge>
                  {p.rating ? <span className="flex items-center gap-0.5 text-xs"><Star className="h-3 w-3 text-yellow-500" /> {p.rating}</span> : null}
                  {p.response_time_minutes ? <span className="flex items-center gap-0.5 text-xs"><Clock className="h-3 w-3" /> ~{p.response_time_minutes}min</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
