import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PersonaAttemptsAudit from "@/components/admin/PersonaAttemptsAudit";


type InquiryRow = {
  id: string;
  user_id: string;
  subject_type: string;
  subject_ref: string | null;
  inquiry_id: string | null;
  template_id: string | null;
  region: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  raw_payload: Record<string, unknown> | null;
};

const USER_ROLES = [
  { value: "all", label: "All roles" },
  { value: "driver", label: "Driver" },
  { value: "owner", label: "Owner" },
  { value: "driver_referee", label: "Driver's referee" },
  { value: "driver_payment_proxy", label: "Payment proxy" },
  { value: "admin_assistant", label: "Admin assistant" },
  { value: "support_staff", label: "Support staff" },
  { value: "unassigned", label: "Unassigned / legacy" },
];

const STATUSES = ["all", "created", "pending", "approved", "declined", "needs_review", "expired"] as const;

const roleTag = (row: InquiryRow): string | null => {
  const rp = (row.raw_payload ?? {}) as Record<string, unknown>;
  const tag = (rp.user_role as string | undefined) ?? null;
  if (tag) return tag;
  const sr = (rp.subject_role as string | undefined) ?? null;
  return sr;
};

const roleLabel: Record<string, string> = {
  driver: "Driver",
  owner: "Owner",
  driver_referee: "Driver's referee",
  referee: "Driver's referee",
  driver_payment_proxy: "Payment proxy",
  proxy: "Payment proxy",
  admin_assistant: "Admin assistant",
  support_staff: "Support staff",
};

export default function AdminPersonaInquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [region, setRegion] = useState<string>("all");
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("persona_inquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (status !== "all") query = query.eq("status", status);
    if (region !== "all") query = query.eq("region", region);
    if (role !== "all" && role !== "unassigned") {
      // filter both possible spellings in raw_payload.user_role and subject_role
      const aliases: Record<string, string[]> = {
        driver: ["driver"],
        owner: ["owner"],
        driver_referee: ["driver_referee", "referee"],
        driver_payment_proxy: ["driver_payment_proxy", "proxy"],
        admin_assistant: ["admin_assistant"],
        support_staff: ["support_staff"],
      };
      const list = aliases[role] ?? [role];
      const or = list
        .flatMap((v) => [
          `raw_payload->>user_role.eq.${v}`,
          `raw_payload->>subject_role.eq.${v}`,
        ])
        .join(",");
      query = query.or(or);
    }
    if (role === "unassigned") {
      query = query.is("raw_payload->>user_role", null);
    }
    const { data, error } = await query;
    if (error) console.warn("persona_inquiries load failed", error);
    setRows((data ?? []) as InquiryRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [role, status, region]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      [r.user_id, r.inquiry_id, r.subject_ref, r.template_id, r.region]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const regions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.region).filter(Boolean))) as string[],
    [rows],
  );

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Persona Inquiries</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="inquiries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
          <TabsTrigger value="attempts">Attempt audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="attempts">
          <PersonaAttemptsAudit />
        </TabsContent>

        <TabsContent value="inquiries" className="space-y-4">


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search user id, inquiry id, subject ref, template id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue placeholder="User role" /></SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger><SelectValue placeholder="Region" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Inquiry ID</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const tag = roleTag(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {tag
                        ? <Badge variant="secondary">{roleLabel[tag] ?? tag}</Badge>
                        : <span className="text-muted-foreground text-xs">unassigned</span>}
                    </TableCell>
                    <TableCell><Badge>{r.status}</Badge></TableCell>
                    <TableCell>{r.region ?? "—"}</TableCell>
                    <TableCell>{r.subject_type}{r.subject_ref ? `:${r.subject_ref.slice(0, 8)}` : ""}</TableCell>
                    <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-mono text-xs">{r.inquiry_id ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.template_id?.slice(0, 12) ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading…" : "No inquiries match the current filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>

  );
}
