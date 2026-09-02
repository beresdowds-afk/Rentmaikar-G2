import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

const EVENT_TYPES = ["all", "tour_start", "tour_step_view", "tour_complete"] as const;
const COUNTRIES = ["all", "USA", "Nigeria"] as const;

interface EventRow {
  id: string;
  event_type: string;
  tour_name: string;
  country: string;
  step_id: string | null;
  step_index: number | null;
  total_steps: number | null;
  user_id: string | null;
  created_at: string;
}

function isoDaysAgo(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function TourAnalyticsPage() {
  const [eventType, setEventType] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [tourName, setTourName] = useState<string>("");
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(isoDaysAgo(0));
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("tour_analytics_events")
      .select("*")
      .gte("created_at", `${startDate}T00:00:00Z`)
      .lte("created_at", `${endDate}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (eventType !== "all") q = q.eq("event_type", eventType);
    if (country !== "all") q = q.eq("country", country);
    if (tourName.trim()) q = q.eq("tour_name", tourName.trim());
    const { data, error } = await q;
    setLoading(false);
    if (error) return;
    setRows((data ?? []) as EventRow[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const summary = useMemo(() => {
    const s = { total: rows.length, starts: 0, views: 0, completes: 0, byCountry: {} as Record<string, number> };
    rows.forEach(r => {
      if (r.event_type === "tour_start") s.starts++;
      else if (r.event_type === "tour_step_view") s.views++;
      else if (r.event_type === "tour_complete") s.completes++;
      s.byCountry[r.country] = (s.byCountry[r.country] || 0) + 1;
    });
    return s;
  }, [rows]);

  const chartData = useMemo(() => {
    const map: Record<string, { date: string; start: number; view: number; complete: number }> = {};
    rows.forEach(r => {
      const d = r.created_at.slice(0, 10);
      map[d] ??= { date: d, start: 0, view: 0, complete: 0 };
      if (r.event_type === "tour_start") map[d].start++;
      else if (r.event_type === "tour_step_view") map[d].view++;
      else if (r.event_type === "tour_complete") map[d].complete++;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Onboarding Tour Analytics</h1>
        <p className="text-muted-foreground text-sm">Track tour starts, step views, and completions by country and date.</p>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label>Event</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tour name</Label>
            <Input value={tourName} onChange={e => setTourName(e.target.value)} placeholder="e.g. landing" />
          </div>
          <div>
            <Label>From</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={load} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Apply
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total events</div><div className="text-2xl font-bold">{summary.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Starts</div><div className="text-2xl font-bold">{summary.starts}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Step views</div><div className="text-2xl font-bold">{summary.views}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Completes</div><div className="text-2xl font-bold">{summary.completes}</div></Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="text-sm font-semibold mb-2">Daily activity</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="start" fill="#10B981" name="Starts" />
              <Bar dataKey="view" fill="#3B82F6" name="Views" />
              <Bar dataKey="complete" fill="#8B5CF6" name="Completes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="text-sm font-semibold mb-2">By country</div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(summary.byCountry).map(([c, n]) => (
            <Badge key={c} variant="secondary">{c}: {n}</Badge>
          ))}
          {Object.keys(summary.byCountry).length === 0 && <span className="text-xs text-muted-foreground">No events in range</span>}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Tour</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>User</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 200).map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{r.event_type}</Badge></TableCell>
                <TableCell>{r.tour_name}</TableCell>
                <TableCell>{r.country}</TableCell>
                <TableCell className="text-xs">{r.step_id ?? "-"} {r.step_index != null && r.total_steps != null ? `(${r.step_index + 1}/${r.total_steps})` : ""}</TableCell>
                <TableCell className="text-xs">{r.user_id?.slice(0, 8) ?? "anon"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">No events match filters</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {rows.length > 200 && <div className="p-2 text-xs text-muted-foreground text-center">Showing first 200 of {rows.length} events</div>}
      </Card>
    </div>
  );
}
