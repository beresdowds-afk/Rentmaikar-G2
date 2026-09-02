import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, ExternalLink, Search, Users, Car } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

type Row = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  access_level: string | null;
  registration_stage: string | null;
};

async function loadUsers(role: 'driver' | 'owner', search: string): Promise<Row[]> {
  const client = supabase as any;
  let q = client
    .from('user_roles')
    .select('user_id, profiles!inner(full_name, email, created_at, access_level, registration_stage)')
    .eq('role', role)
    .limit(30);
  const { data } = await q;
  const rows: Row[] = (data ?? []).map((r: any) => ({
    user_id: r.user_id,
    full_name: r.profiles?.full_name ?? null,
    email: r.profiles?.email ?? null,
    created_at: r.profiles?.created_at ?? null,
    access_level: r.profiles?.access_level ?? null,
    registration_stage: r.profiles?.registration_stage ?? null,
  }));
  const s = search.trim().toLowerCase();
  return s
    ? rows.filter(
        (r) =>
          (r.full_name ?? '').toLowerCase().includes(s) ||
          (r.email ?? '').toLowerCase().includes(s),
      )
    : rows;
}

export function UserOversightPanel() {
  const [tab, setTab] = useState<'driver' | 'owner'>('driver');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    loadUsers(tab, search)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [tab, search]);

  const accentIcon = tab === 'driver' ? Users : Car;
  const Icon = accentIcon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          User Oversight — Impersonate & Inspect
        </CardTitle>
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'driver' | 'owner')}>
          <TabsList>
            <TabsTrigger value="driver">Drivers</TabsTrigger>
            <TabsTrigger value="owner">Owners</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No {tab}s found.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border">
                {rows.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.full_name || <span className="text-muted-foreground italic">unnamed</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{r.email ?? r.user_id.slice(0, 8)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.access_level && (
                        <Badge variant={r.access_level === 'full' ? 'default' : 'secondary'} className="text-[10px]">
                          {r.access_level}
                        </Badge>
                      )}
                      {r.created_at && (
                        <span className="text-xs text-muted-foreground hidden md:inline">
                          {format(new Date(r.created_at), 'MMM d, yyyy')}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/impersonate/${tab}/${r.user_id}`)}
                        className="gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        View dashboard
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
