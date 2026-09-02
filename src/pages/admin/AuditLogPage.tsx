import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, RefreshCw, Shield, ArrowLeft, Search, X, CalendarIcon, Filter } from "lucide-react";
import { format } from "date-fns";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { cn } from "@/lib/utils";

interface DeniedEntry {
  id: string;
  user_id: string | null;
  attempted_at: string;
  target_table: string;
  target_row_id: string | null;
  reason: string | null;
  attempted_fields: string[] | null;
  attempted_values: Record<string, unknown> | null;
  session_role: string | null;
}

const AuditLogPage = () => {
  const [entries, setEntries] = useState<DeniedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [reason, setReason] = useState("");
  const [userIdF, setUserIdF] = useState("");
  const [requestIdF, setRequestIdF] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("permission_denied_log")
      .select("*")
      .order("attempted_at", { ascending: false })
      .limit(1000);
    if (!error && data) setEntries(data as DeniedEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tables = useMemo(
    () => Array.from(new Set(entries.map((e) => e.target_table).filter(Boolean))).sort(),
    [entries]
  );
  const roles = useMemo(
    () => Array.from(new Set(entries.map((e) => e.session_role).filter(Boolean) as string[])).sort(),
    [entries]
  );

  const filtered = useMemo(() => entries.filter((e) => {
    if (tableFilter !== "all" && e.target_table !== tableFilter) return false;
    if (roleFilter !== "all" && e.session_role !== roleFilter) return false;
    if (reason && !e.reason?.toLowerCase().includes(reason.toLowerCase())) return false;
    if (userIdF && !e.user_id?.toLowerCase().includes(userIdF.toLowerCase())) return false;
    if (requestIdF && !e.target_row_id?.toLowerCase().includes(requestIdF.toLowerCase())) return false;
    if (action) {
      const a = action.toLowerCase();
      const hit = e.attempted_fields?.some((f) => f.toLowerCase().includes(a));
      if (!hit) return false;
    }
    if (dateFrom && new Date(e.attempted_at) < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (new Date(e.attempted_at) > end) return false;
    }
    return true;
  }), [entries, tableFilter, roleFilter, reason, userIdF, requestIdF, action, dateFrom, dateTo]);

  const clearFilters = () => {
    setTableFilter("all"); setRoleFilter("all");
    setReason(""); setUserIdF(""); setRequestIdF(""); setAction("");
    setDateFrom(undefined); setDateTo(undefined);
  };

  const activeCount = [
    tableFilter !== "all", roleFilter !== "all",
    !!reason, !!userIdF, !!requestIdF, !!action, !!dateFrom, !!dateTo,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2">
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" />Back to admin</Link>
            </Button>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-7 w-7 text-primary" />
              Security Audit Log
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Every RLS-denied update and blocked field change is recorded here. Latest 1,000 entries.
            </p>
          </div>
          <Button onClick={load} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Advanced filters
              {activeCount > 0 && <Badge variant="secondary" className="ml-1">{activeCount}</Badge>}
            </CardTitle>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />Clear
              </Button>
            )}
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Table</label>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tables</SelectItem>
                  {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Session role</label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Action / field</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="e.g. status, daily_rate" value={action} onChange={(e) => setAction(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Reason</label>
              <Input placeholder="Search reason text" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">User ID</label>
              <Input placeholder="uuid contains…" value={userIdF} onChange={(e) => setUserIdF(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Request / Row ID</label>
              <Input placeholder="target row id contains…" value={requestIdF} onChange={(e) => setRequestIdF(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateFrom ? format(dateFrom, "PPP") : "Any date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateTo ? format(dateTo, "PPP") : "Any date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Denied attempts <span className="text-muted-foreground font-normal">({filtered.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-2">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No entries match these filters.</div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((e) => (
                    <div key={e.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{e.target_table}</Badge>
                          {e.session_role && <Badge variant="secondary" className="text-xs">{e.session_role}</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(e.attempted_at), "MMM d, yyyy h:mm:ss a")}
                        </span>
                      </div>
                      {e.reason && <p className="text-sm">{e.reason}</p>}
                      {e.attempted_fields && e.attempted_fields.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {e.attempted_fields.map((f) => (
                            <Badge key={f} variant="destructive" className="text-[10px]">{f}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-2 gap-1">
                        <span>User: <code className="text-[11px]">{e.user_id ?? "—"}</code></span>
                        <span>Row: <code className="text-[11px]">{e.target_row_id ?? "—"}</code></span>
                      </div>
                      {e.attempted_values && Object.keys(e.attempted_values).length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">Attempted values</summary>
                          <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto text-[11px]">
                            {JSON.stringify(e.attempted_values, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default AuditLogPage;
