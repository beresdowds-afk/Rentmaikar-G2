import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type FailureRow = {
  id: string;
  user_id: string;
  document_type: string;
  document_category: string | null;
  file_path: string;
  file_name: string | null;
  rejection_reason: string | null;
  vehicle_id: string | null;
  verified_at: string | null;
  updated_at: string;
  profile?: { full_name: string | null; email: string | null } | null;
};

export default function AdminDocumentFailuresPage() {
  const [rows, setRows] = useState<FailureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_documents")
      .select(
        "id,user_id,document_type,document_category,file_path,file_name,rejection_reason,vehicle_id,verified_at,updated_at"
      )
      .eq("status", "rejected")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      toast.error("Failed to load document failures");
      setLoading(false);
      return;
    }
    const list = (data ?? []) as FailureRow[];
    const userIds = Array.from(new Set(list.map((r) => r.user_id))).filter(Boolean);
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      const map = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      list.forEach((r) => (r.profile = map.get(r.user_id) ?? null));
    }
    setRows(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function openDocument(row: FailureRow) {
    setOpeningId(row.id);
    try {
      const { data, error } = await supabase.storage
        .from("user-documents")
        .createSignedUrl(row.file_path, 60 * 5);
      if (error || !data?.signedUrl) throw error ?? new Error("No URL");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(`Could not open document: ${e?.message ?? "unknown error"}`);
    } finally {
      setOpeningId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.document_type?.toLowerCase().includes(q) ||
        r.rejection_reason?.toLowerCase().includes(q) ||
        r.profile?.full_name?.toLowerCase().includes(q) ||
        r.profile?.email?.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-7 w-7 text-destructive" />
              Document Verification Failures
            </h1>
            <p className="text-muted-foreground mt-1">
              All rejected documents across users and vehicles.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search by user, email, doc type, or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              No document verification failures.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 font-medium">User</th>
                    <th className="p-3 font-medium">Document</th>
                    <th className="p-3 font-medium">Reason</th>
                    <th className="p-3 font-medium">Rejected</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 align-top">
                        <div className="font-medium">
                          {r.profile?.full_name ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.profile?.email ?? r.user_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{r.document_type}</Badge>
                          {r.document_category && (
                            <span className="text-xs text-muted-foreground">
                              {r.document_category}
                            </span>
                          )}
                        </div>
                        {r.file_name && (
                          <div className="text-xs text-muted-foreground mt-1 truncate max-w-[240px]">
                            {r.file_name}
                          </div>
                        )}
                      </td>
                      <td className="p-3 align-top max-w-md">
                        <span className="text-destructive">
                          {r.rejection_reason ?? "No reason recorded"}
                        </span>
                      </td>
                      <td className="p-3 align-top whitespace-nowrap text-muted-foreground">
                        {formatDistanceToNow(
                          new Date(r.verified_at ?? r.updated_at),
                          { addSuffix: true }
                        )}
                      </td>
                      <td className="p-3 align-top text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDocument(r)}
                          disabled={openingId === r.id}
                        >
                          {openingId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Open
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
