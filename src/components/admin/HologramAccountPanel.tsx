import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Building2, Wallet, Tags } from "lucide-react";
import { toast } from "sonner";

const invoke = async (action: string) => {
  const { data, error } = await supabase.functions.invoke("hologram-admin", { body: { action } });
  if (error) throw new Error(error.message);
  return data as { ok?: boolean; org_id?: string | null; body?: { data?: unknown } };
};

type Plan = { id?: number; name?: string; description?: string; amount?: number; zone?: string; data?: number };
type Org = { id?: number; name?: string; role?: string };
type Tag = { id?: number; name?: string; devices?: number };

export function HologramAccountPanel() {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [acct, o, p, t] = await Promise.all([
        invoke("account").catch(() => null),
        invoke("list_orgs").catch(() => null),
        invoke("list_plans").catch(() => null),
        invoke("list_tags").catch(() => null),
      ]);
      setOrgId(acct?.org_id ?? null);
      setMe((acct?.body?.data as Record<string, unknown>) ?? null);
      setOrgs(((o?.body?.data as Org[]) ?? []).filter(Boolean));
      setPlans(((p?.body?.data as Plan[]) ?? []).filter(Boolean));
      setTags(((t?.body?.data as Tag[]) ?? []).filter(Boolean));
    } catch (e) {
      toast.error("Could not load Hologram account", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading account…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Account</CardTitle>
            <CardDescription>Authenticated Hologram user for this integration.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Name: </span>{String(me?.name ?? me?.first ?? "—")}</p>
            <p><span className="text-muted-foreground">Email: </span>{String(me?.email ?? "—")}</p>
            <p><span className="text-muted-foreground">Configured org ID: </span><code>{orgId ?? "—"}</code></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" /> Organizations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {orgs.length === 0 ? <p className="text-muted-foreground">None returned.</p> : orgs.map(o => (
              <div key={o.id} className="flex items-center justify-between">
                <span>{o.name} <code className="text-xs text-muted-foreground">#{o.id}</code></span>
                {String(o.id) === String(orgId) && <Badge>active</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Available data plans</CardTitle>
          <CardDescription>Use a plan ID when activating or changing a SIM plan.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {plans.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No plans returned for this organization.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Included data</TableHead>
                  <TableHead>Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell>{p.name || p.description || "—"}</TableCell>
                    <TableCell>{p.zone || "—"}</TableCell>
                    <TableCell>{p.data ? `${(p.data / 1_000_000).toFixed(0)} MB` : "—"}</TableCell>
                    <TableCell>{typeof p.amount === "number" ? `$${(p.amount / 100).toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Tags className="h-4 w-4" /> Device tags</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {tags.length === 0
            ? <p className="text-sm text-muted-foreground">No tags defined.</p>
            : tags.map(t => <Badge key={t.id} variant="outline">{t.name}</Badge>)}
        </CardContent>
      </Card>
    </div>
  );
}
