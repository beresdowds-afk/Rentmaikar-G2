import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Save, Trash2, IdCard } from "lucide-react";
import { toast } from "sonner";
import type { GovIdOption } from "@/lib/government-id";

type Role = "driver" | "owner" | "referee" | "proxy" | "admin_assistant" | "support_staff";

const ROLES: { value: Role; label: string }[] = [
  { value: "driver", label: "Driver" },
  { value: "owner", label: "Owner" },
  { value: "referee", label: "Driver referee" },
  { value: "proxy", label: "Payment proxy" },
  { value: "admin_assistant", label: "Admin assistant" },
  { value: "support_staff", label: "Support staff" },
];

/** Persona id-class catalogue admins can pick from. */
const CATALOG: GovIdOption[] = [
  { code: "dl", label: "Driver's licence" },
  { code: "id", label: "National / state ID card" },
  { code: "pp", label: "Passport" },
  { code: "pc", label: "Permanent resident card" },
  { code: "mid", label: "Military ID" },
  { code: "vid", label: "Voter's card" },
  { code: "cid", label: "Consular ID" },
  { code: "hic", label: "Health insurance card" },
];

interface RuleRow {
  id?: string;
  country_code: string;
  subject_role: Role;
  accepted_classes: GovIdOption[];
  requires_drivers_license: boolean;
  is_active: boolean;
  notes: string | null;
}

function blankRow(country: string, role: Role): RuleRow {
  return {
    country_code: country,
    subject_role: role,
    accepted_classes: role === "driver" ? [CATALOG[0]] : [CATALOG[0], CATALOG[1], CATALOG[2]],
    requires_drivers_license: role === "driver",
    is_active: true,
    notes: null,
  };
}

export default function PersonaIdClassSettings() {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [country, setCountry] = useState<string>("US");
  const [newCountry, setNewCountry] = useState("");

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("persona_id_class_rules")
      .select("*")
      .order("country_code");
    setLoading(false);
    if (error) { toast.error(`Failed to load rules: ${error.message}`); return; }
    setRows((data ?? []).map((r: any) => ({
      id: r.id,
      country_code: r.country_code,
      subject_role: r.subject_role,
      accepted_classes: Array.isArray(r.accepted_classes) ? r.accepted_classes : [],
      requires_drivers_license: !!r.requires_drivers_license,
      is_active: r.is_active !== false,
      notes: r.notes ?? null,
    })));
  }

  useEffect(() => { refresh(); }, []);

  const countries = useMemo(() => {
    const set = new Set(rows.map((r) => r.country_code.toUpperCase()));
    set.add("US"); set.add("NG");
    return Array.from(set).sort();
  }, [rows]);

  const visible: RuleRow[] = useMemo(
    () => ROLES.map((r) =>
      rows.find((x) => x.country_code.toUpperCase() === country && x.subject_role === r.value)
      ?? blankRow(country, r.value)),
    [rows, country],
  );

  function patch(role: Role, p: Partial<RuleRow>) {
    setRows((prev) => {
      const idx = prev.findIndex(
        (x) => x.country_code.toUpperCase() === country && x.subject_role === role,
      );
      if (idx === -1) return [...prev, { ...blankRow(country, role), ...p }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...p };
      return next;
    });
  }

  function toggleClass(row: RuleRow, opt: GovIdOption) {
    const has = row.accepted_classes.some((c) => c.code === opt.code);
    const accepted = has
      ? row.accepted_classes.filter((c) => c.code !== opt.code)
      : [...row.accepted_classes, opt];
    patch(row.subject_role, { accepted_classes: accepted });
  }

  async function save(row: RuleRow) {
    if (row.accepted_classes.length === 0) {
      toast.error("Select at least one accepted ID type");
      return;
    }
    setSaving(row.subject_role);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("persona_id_class_rules")
      .upsert({
        country_code: row.country_code.toUpperCase(),
        subject_role: row.subject_role,
        accepted_classes: row.accepted_classes as any,
        requires_drivers_license: row.requires_drivers_license,
        is_active: row.is_active,
        notes: row.notes,
        updated_by: auth?.user?.id ?? null,
      } as any, { onConflict: "country_code,subject_role" });
    setSaving(null);
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    toast.success(`Saved ${row.country_code.toUpperCase()} · ${row.subject_role}`);
    refresh();
  }

  async function remove(row: RuleRow) {
    if (!row.id) return;
    const { error } = await supabase.from("persona_id_class_rules").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rule removed — defaults now apply");
    refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IdCard className="h-4 w-4" /> Accepted government ID types
          </CardTitle>
          <CardDescription>
            Configure which ID classes Persona accepts per region and role. Changes take effect
            immediately — no function redeploy needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Region</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Add region (ISO code)</Label>
            <div className="flex gap-2">
              <Input
                className="w-28"
                value={newCountry}
                maxLength={4}
                placeholder="GH"
                onChange={(e) => setNewCountry(e.target.value.toUpperCase())}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const c = newCountry.trim().toUpperCase();
                  if (c.length < 2) { toast.error("Enter a valid country code"); return; }
                  setRows((p) => [...p, blankRow(c, "driver")]);
                  setCountry(c);
                  setNewCountry("");
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
        </div>
      ) : (
        <div className="grid gap-4">
          {visible.map((row) => (
            <Card key={row.subject_role}>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">
                  {ROLES.find((r) => r.value === row.subject_role)?.label}
                  {!row.id && <Badge variant="outline" className="ml-2">default</Badge>}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {row.id && (
                    <Button variant="ghost" size="sm" onClick={() => remove(row)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" onClick={() => save(row)} disabled={saving === row.subject_role}>
                    {saving === row.subject_role
                      ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      : <Save className="h-4 w-4 mr-1" />}
                    Save
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {CATALOG.map((opt) => {
                    const active = row.accepted_classes.some((c) => c.code === opt.code);
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        onClick={() => toggleClass(row, opt)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={row.requires_drivers_license}
                    onCheckedChange={(v) => patch(row.subject_role, { requires_drivers_license: v })}
                  />
                  <span className="text-xs text-muted-foreground">
                    Driver's licence mandatory (upload required before an inquiry starts)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={(v) => patch(row.subject_role, { is_active: v })}
                  />
                  <span className="text-xs text-muted-foreground">
                    Rule active (off = fall back to platform defaults)
                  </span>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Internal notes (optional)"
                  value={row.notes ?? ""}
                  onChange={(e) => patch(row.subject_role, { notes: e.target.value })}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
