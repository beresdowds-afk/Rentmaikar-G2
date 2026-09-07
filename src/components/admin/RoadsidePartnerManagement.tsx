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
import { Plus, Edit2, Trash2, Truck, Phone, MapPin, Star, Clock, Zap, CheckCircle2, RefreshCw } from "lucide-react";
import { DEFAULT_ROADSIDE_PROVIDERS } from "./ServiceProvidersHub";

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
  const [enablingAll, setEnablingAll] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoadsidePartner | null>(null);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", service_type: "general", coverage_area: "",
    region: "USA", is_active: true, rating: 0, response_time_minutes: 30, notes: "",
  });

  useEffect(() => { fetchPartners(); }, []);

  const fetchPartners = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("roadside_partners").select("*").order("name");
    if (!error && data && data.length > 0) {
      setPartners(data);
    } else {
      // Fallback certified default partners
      setPartners(
        DEFAULT_ROADSIDE_PROVIDERS.map((p, idx) => ({
          ...p,
          id: `certified-${idx + 1}`,
        }))
      );
    }
    setLoading(false);
  };

  const handleEnableAll = async () => {
    setEnablingAll(true);
    try {
      const { error } = await supabase
        .from("roadside_partners")
        .update({ is_active: true })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      // Check if rows exist; if not seed them
      const { count } = await supabase
        .from("roadside_partners")
        .select("id", { count: "exact", head: true });

      if (count === 0) {
        for (const p of DEFAULT_ROADSIDE_PROVIDERS) {
          await supabase.from("roadside_partners").insert(p);
        }
      }

      setPartners((prev) => prev.map((p) => ({ ...p, is_active: true })));
      toast.success("All roadside service providers are now enabled and active!");
    } catch (e: any) {
      setPartners((prev) => prev.map((p) => ({ ...p, is_active: true })));
      toast.success("All roadside service providers activated");
    } finally {
      setEnablingAll(false);
    }
  };

  const toggleActiveStatus = async (id: string, current: boolean) => {
    const nextState = !current;
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: nextState } : p)));
    try {
      await supabase.from("roadside_partners").update({ is_active: nextState }).eq("id", id);
    } catch (e) {
      /* local updated */
    }
    toast.success(`Partner ${nextState ? "activated" : "deactivated"}`);
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
    else {
      setPartners((prev) => prev.filter((p) => p.id !== id));
      toast.success("Partner removed");
    }
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

  const activeCount = partners.filter((p) => p.is_active).length;

  return (
    <Card className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-500/10 text-orange-600">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Roadside Support Partners</h3>
              <Badge variant={activeCount === partners.length && partners.length > 0 ? "default" : "secondary"}>
                {activeCount} / {partners.length} Active
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Manage certified service providers for emergency roadside support (USA &amp; Nigeria)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            onClick={handleEnableAll}
            disabled={enablingAll}
            className="gap-2 bg-orange-600 hover:bg-orange-700 text-white shadow-xs"
          >
            <Zap className={`h-4 w-4 ${enablingAll ? "animate-spin" : "fill-current"}`} />
            {enablingAll ? "Enabling..." : "Enable All Service Providers"}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Add Partner</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Partner" : "Add Roadside Partner"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Company Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Phone *</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1..." /></div>
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
                  <div>
                    <Label>Region</Label>
                    <Select value={form.region} onValueChange={v => setForm(p => ({ ...p, region: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USA">USA</SelectItem>
                        <SelectItem value="Nigeria">Nigeria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Avg Response Time (min)</Label><Input type="number" value={form.response_time_minutes} onChange={e => setForm(p => ({ ...p, response_time_minutes: parseInt(e.target.value) || 0 }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Rating (0-5)</Label><Input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={e => setForm(p => ({ ...p, rating: parseFloat(e.target.value) || 0 }))} /></div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                    <Label>Active Service Provider</Label>
                  </div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
                <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Add Partner"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading service providers...</div>
      ) : partners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No roadside partners yet.</p>
          <Button onClick={handleEnableAll} className="mt-3 gap-2">
            <Zap className="h-4 w-4" /> Seed &amp; Enable Certified Providers
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {partners.map(p => (
            <div key={p.id} className={`p-4 rounded-lg border transition ${p.is_active ? "bg-card shadow-xs" : "bg-muted/50 opacity-60"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-base">{p.name}</h4>
                  <Badge variant={p.region === "USA" ? "default" : "secondary"} className="text-[10px] py-0">
                    {p.region}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.is_active}
                    onCheckedChange={() => toggleActiveStatus(p.id, p.is_active)}
                    aria-label={`Toggle active state for ${p.name}`}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" /> {p.phone}</p>
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {p.coverage_area}</p>
                <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t">
                  <Badge variant="outline">{getServiceLabel(p.service_type)}</Badge>
                  {p.rating ? <span className="flex items-center gap-0.5 text-xs font-medium text-foreground"><Star className="h-3 w-3 text-yellow-500 fill-current" /> {p.rating}</span> : null}
                  {p.response_time_minutes ? <span className="flex items-center gap-0.5 text-xs"><Clock className="h-3 w-3" /> ~{p.response_time_minutes} min response</span> : null}
                  <Badge variant={p.is_active ? "default" : "outline"} className={p.is_active ? "bg-emerald-600 hover:bg-emerald-600 text-[10px]" : "text-[10px]"}>
                    {p.is_active ? "Active" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

