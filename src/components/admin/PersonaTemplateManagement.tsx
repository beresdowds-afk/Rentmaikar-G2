import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCcw, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

interface TemplateRow {
  id: string;
  country_code: string;
  inquiry_template_id: string | null;
  environment_id: string | null;
  auto_generated: boolean;
  is_active: boolean;
  provision_status: string;
  provision_error: string | null;
  provisioned_at: string | null;
}

export default function PersonaTemplateManagement() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyCountry, setBusyCountry] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<TemplateRow>>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("persona_region_templates")
      .select("*")
      .order("country_code");
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function provision(country: string) {
    setBusyCountry(country);
    const { error } = await supabase.functions.invoke("persona-provision-template", {
      body: { country_code: country },
    });
    if (error) toast.error(error.message);
    else toast.success(`Template provisioned for ${country}`);
    setBusyCountry(null);
    load();
  }

  async function saveRow(row: TemplateRow) {
    const patch = edits[row.id] ?? {};
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase
      .from("persona_region_templates")
      .update(patch)
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Saved ${row.country_code}`);
      setEdits((e) => { const c = { ...e }; delete c[row.id]; return c; });
      load();
    }
  }

  const setField = (id: string, field: keyof TemplateRow, value: any) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Persona Region Templates</CardTitle>
            <CardDescription>Identity-verification templates per region. New regions auto-queue for provisioning.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Country</TableHead>
                <TableHead>Template ID</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const e = edits[r.id] ?? {};
                const merged = { ...r, ...e };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.country_code}</TableCell>
                    <TableCell>
                      <Input
                        value={merged.inquiry_template_id ?? ""}
                        placeholder="itmpl_..."
                        onChange={(ev) => setField(r.id, "inquiry_template_id", ev.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={merged.environment_id ?? ""}
                        placeholder="env_..."
                        onChange={(ev) => setField(r.id, "environment_id", ev.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.provision_status === "ready" ? "default" : r.provision_status === "error" ? "destructive" : "secondary"}>
                        {r.provision_status}
                      </Badge>
                      {r.auto_generated && <Badge variant="outline" className="ml-1">auto</Badge>}
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={merged.is_active}
                        onChange={(ev) => setField(r.id, "is_active", ev.target.checked)}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {edits[r.id] && (
                        <Button size="sm" onClick={() => saveRow(r)}>Save</Button>
                      )}
                      <Button
                        size="sm" variant="outline"
                        disabled={busyCountry === r.country_code}
                        onClick={() => provision(r.country_code)}
                      >
                        {busyCountry === r.country_code
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><Zap className="h-4 w-4 mr-1" /> Auto-provision</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No regions yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
