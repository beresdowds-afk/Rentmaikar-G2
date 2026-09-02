// Region-aware document export.
// Two modes:
//   • Client mode (default): downloads each file via short-lived signed URLs,
//     zips in the browser, and offers the ZIP directly. Great for small/medium
//     batches; nothing is proxied through an edge function.
//   • Server mode: invokes the `export-user-documents` edge function which
//     builds the ZIP server-side, uploads to the private `document-exports`
//     bucket, and returns a signed download link. Best for large batches or
//     admin exports that must be recorded as server-generated.
//
// Both modes:
//   • Show a live per-file progress dialog (queued → downloading → done/failed).
//   • Allow retrying individual failed files without redoing successful ones.
//   • Write a `document_export_audit` row so we know who exported which docs
//     for whom, when, and via which flow.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Loader2, RefreshCw, CheckCircle2, XCircle, Clock, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRegion } from "@/contexts/RegionContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveZipBlob } from "@/lib/native-save";

export interface DocRow {
  id: string;
  user_id: string;
  document_type: string;
  document_category: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  status: string;
  rejection_reason: string | null;
  vehicle_id: string | null;
  expires_at: string | null;
  created_at: string;
}

type FileStatus = "queued" | "downloading" | "done" | "failed";
export interface FileProgress {
  id: string;
  file_name: string;
  document_type: string;
  size_bytes: number | null;
  status: FileStatus;
  attempts: number;
  error?: string;
  blob?: Blob;
  archive_path?: string;
}

interface Props {
  /** User whose documents to export. */
  userId: string;
  /** Restrict to a single vehicle. */
  vehicleId?: string;
  /** Human label for the zip filename. */
  label?: string;
  variant?: "default" | "outline" | "ghost";
  /** Optional preloaded rows to skip a round-trip. */
  docs?: DocRow[];
  /** Server mode uses the edge function to build the ZIP. */
  serverSide?: boolean;
  /** Button label override. */
  buttonLabel?: string;
}

// ---- helpers ----
export function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}
export function archiveName(r: Pick<DocRow, "document_type" | "created_at" | "file_name">) {
  return sanitize(`${r.document_type}__${r.created_at.slice(0, 10)}__${r.file_name}`);
}
export function exportFilename(opts: {
  label?: string; userId: string; region: "US" | "NG"; stamp?: string;
}) {
  const stamp = opts.stamp ?? new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const label = opts.label ?? opts.userId.slice(0, 8);
  return `rentmaikar-documents-${label}-${opts.region}-${stamp}.zip`;
}
export function buildManifest(opts: {
  userId: string; vehicleId?: string; region: "US" | "NG"; exportedAt: string;
  files: FileProgress[]; docs: DocRow[];
}) {
  const docMap = new Map(opts.docs.map((d) => [d.id, d] as const));
  const documents = opts.files.map((f) => {
    const d = docMap.get(f.id)!;
    return {
      id: d.id,
      document_type: d.document_type,
      category: d.document_category,
      status: d.status,
      file_name: d.file_name,
      mime_type: d.mime_type,
      size_bytes: d.file_size,
      vehicle_id: d.vehicle_id,
      expires_at: d.expires_at,
      uploaded_at: d.created_at,
      rejection_reason: d.rejection_reason,
      archive_path: f.archive_path ?? `files/${archiveName(d)}`,
      download_status: f.status,
      download_error: f.error ?? null,
      attempts: f.attempts,
    };
  });
  const downloaded = opts.files.filter((f) => f.status === "done").length;
  const failed = opts.files.filter((f) => f.status === "failed").length;
  return {
    exported_at: opts.exportedAt,
    user_id: opts.userId,
    vehicle_id: opts.vehicleId ?? null,
    region: opts.region,
    totals: { documents: opts.files.length, downloaded, failed },
    documents,
  };
}
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(rows.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k)); return set;
  }, new Set<string>()));
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/** Fetch one file into a Blob using a signed URL.
 *  Auto-refreshes the signed URL once on 400/403 (expired signature) and retries. */
export async function fetchSignedFile(
  path: string,
  createSigned: (p: string) => Promise<{ url: string | null; error?: string | null }>,
): Promise<Blob> {
  async function once(): Promise<Response> {
    const { url, error } = await createSigned(path);
    if (!url) throw new Error(error || "no signed url");
    return await fetch(url);
  }
  let res = await once();
  if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 403)) {
    // Signed URL likely expired — mint a fresh one and try once more.
    res = await once();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

/** Fetch the server-generated ZIP with automatic signed-URL refresh + one retry.
 *  Called by the "Download ZIP" button after a server export completes. */
export async function fetchServerZipWithRefresh(opts: {
  initialUrl: string;
  storagePath: string;
  refresh: (path: string) => Promise<string>;
}): Promise<Blob> {
  let res = await fetch(opts.initialUrl);
  if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 403)) {
    const fresh = await opts.refresh(opts.storagePath);
    res = await fetch(fresh);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

export const DocumentExportButton = ({
  userId, vehicleId, label, variant = "outline", docs, serverSide, buttonLabel,
}: Props) => {
  const { country } = useRegion();
  const { user } = useAuth();
  const region: "US" | "NG" = country === "Nigeria" ? "NG" : "US";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<DocRow[]>([]);
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [serverResult, setServerResult] = useState<{ url: string; filename: string; storagePath?: string } | null>(null);
  const [zipReady, setZipReady] = useState<{ blob: Blob; filename: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totals = useMemo(() => {
    const done = files.filter((f) => f.status === "done").length;
    const failed = files.filter((f) => f.status === "failed").length;
    const pct = files.length ? Math.round(((done + failed) / files.length) * 100) : 0;
    return { done, failed, total: files.length, pct };
  }, [files]);

  async function signOne(path: string) {
    const { data, error } = await supabase.storage
      .from("user-documents").createSignedUrl(path, 3600);
    return { url: data?.signedUrl ?? null, error: error?.message ?? null };
  }

  async function loadRows(): Promise<DocRow[]> {
    if (docs?.length) return docs;
    let q = supabase.from("user_documents").select("*").eq("user_id", userId);
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return (data as DocRow[]) ?? [];
  }

  async function writeAudit(source: "client" | "server", opts: {
    docIds: string[]; status: string; zipBytes?: number; storagePath?: string; error?: string;
    meta?: Record<string, unknown>;
  }) {
    if (!user) return;
    try {
      await supabase.from("document_export_audit").insert([{
        exporter_id: user.id,
        target_user_id: userId,
        vehicle_id: vehicleId ?? null,
        document_ids: opts.docIds,
        document_count: opts.docIds.length,
        source,
        status: opts.status,
        region,
        zip_size_bytes: opts.zipBytes ?? null,
        storage_path: opts.storagePath ?? null,
        error: opts.error ?? null,
        metadata: (opts.meta ?? {}) as any,
      }] as any);
    } catch { /* audit is best-effort */ }
  }

  async function downloadSingle(fp: FileProgress, row: DocRow): Promise<FileProgress> {
    try {
      setFiles((cur) => cur.map((x) => x.id === fp.id ? { ...x, status: "downloading", attempts: x.attempts + 1 } : x));
      const blob = await fetchSignedFile(row.file_path, signOne);
      const updated: FileProgress = {
        ...fp, status: "done", blob, archive_path: `files/${archiveName(row)}`,
        error: undefined, attempts: fp.attempts + 1,
      };
      setFiles((cur) => cur.map((x) => x.id === fp.id ? updated : x));
      return updated;
    } catch (e) {
      const updated: FileProgress = {
        ...fp, status: "failed", error: (e as Error).message, attempts: fp.attempts + 1,
      };
      setFiles((cur) => cur.map((x) => x.id === fp.id ? updated : x));
      return updated;
    }
  }

  async function runClient() {
    setErrorMsg(null); setBusy(true); setZipReady(null); setServerResult(null);
    try {
      const loaded = await loadRows();
      if (!loaded.length) { toast.error("No documents to export."); setBusy(false); setOpen(false); return; }
      setRows(loaded);
      const initial: FileProgress[] = loaded.map((r) => ({
        id: r.id, file_name: r.file_name, document_type: r.document_type,
        size_bytes: r.file_size, status: "queued", attempts: 0,
      }));
      setFiles(initial);

      const results: FileProgress[] = [];
      for (let i = 0; i < loaded.length; i++) {
        const done = await downloadSingle(initial[i], loaded[i]);
        results.push(done);
      }
      await finalizeZip(loaded, results);
    } catch (e) {
      setErrorMsg((e as Error).message);
      toast.error("Export failed: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    if (!rows.length) return;
    setBusy(true); setZipReady(null);
    const rowMap = new Map(rows.map((r) => [r.id, r] as const));
    const current = files;
    const results: FileProgress[] = [];
    for (const fp of current) {
      if (fp.status === "failed") {
        const row = rowMap.get(fp.id)!;
        results.push(await downloadSingle(fp, row));
      } else {
        results.push(fp);
      }
    }
    await finalizeZip(rows, results);
    setBusy(false);
  }

  async function finalizeZip(loaded: DocRow[], results: FileProgress[]) {
    const zip = new JSZip();
    const filesDir = zip.folder("files")!;
    for (const f of results) {
      if (f.status === "done" && f.blob) {
        const row = loaded.find((r) => r.id === f.id)!;
        filesDir.file(archiveName(row), f.blob);
      }
    }
    const exportedAt = new Date().toISOString();
    const manifest = buildManifest({
      userId, vehicleId, region, exportedAt, files: results, docs: loaded,
    });
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("manifest.csv", toCsv(manifest.documents as any));
    zip.file("README.txt",
      `Rentmaikar document export\nExported: ${exportedAt}\nRegion: ${region}\n` +
      `User: ${userId}${vehicleId ? "\nVehicle: " + vehicleId : ""}\n` +
      `Documents: ${manifest.totals.documents} (downloaded ${manifest.totals.downloaded}, failed ${manifest.totals.failed})\n\n` +
      `See manifest.json / manifest.csv for full details.\n`);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const filename = exportFilename({ label, userId, region });
    setZipReady({ blob, filename });

    const failed = results.filter((r) => r.status === "failed").length;
    await writeAudit("client", {
      docIds: results.filter((r) => r.status === "done").map((r) => r.id),
      status: failed === 0 ? "completed" : "partial",
      zipBytes: blob.size,
      meta: {
        total: results.length, downloaded: manifest.totals.downloaded, failed,
        per_file: results.map((r) => ({ id: r.id, status: r.status, attempts: r.attempts, error: r.error })),
      },
    });

    if (failed === 0) toast.success(`Ready to download (${manifest.totals.downloaded} document(s)).`);
    else toast.warning(`${failed} file(s) failed — retry or download partial ZIP.`);
  }

  async function saveClientZip() {
    if (!zipReady) return;
    const res = await saveZipBlob(zipReady.blob, zipReady.filename);
    if (res.platform !== "web") toast.success("Saved to Documents");
  }

  async function runServer() {
    setErrorMsg(null); setBusy(true); setZipReady(null); setServerResult(null);
    try {
      // Prime the progress dialog with the doc list so users see per-file state
      const loaded = await loadRows();
      if (!loaded.length) { toast.error("No documents to export."); setBusy(false); setOpen(false); return; }
      setRows(loaded);
      setFiles(loaded.map((r) => ({
        id: r.id, file_name: r.file_name, document_type: r.document_type,
        size_bytes: r.file_size, status: "queued", attempts: 0,
      })));

      const { data, error } = await supabase.functions.invoke("export-user-documents", {
        body: { target_user_id: userId, vehicle_id: vehicleId, label, region },
      });
      if (error) throw error;

      const per: Array<{ id: string; ok: boolean; error?: string }> = data?.per_file ?? [];
      setFiles((cur) => cur.map((f) => {
        const p = per.find((x) => x.id === f.id);
        if (!p) return f;
        return { ...f, status: p.ok ? "done" : "failed", error: p.error, attempts: 1 };
      }));

      if (data?.download_url) {
        setServerResult({ url: data.download_url, filename: data.filename, storagePath: data.storage_path });
        const failed = data?.totals?.failed ?? 0;
        if (failed === 0) toast.success(`Server export ready (${data?.totals?.downloaded} doc(s)).`);
        else toast.warning(`Server export ready — ${failed} file(s) failed (see manifest).`);
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
      await writeAudit("server", { docIds: [], status: "error", error: (e as Error).message });
      toast.error("Export failed: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function start() {
    setOpen(true);
    setFiles([]); setRows([]); setZipReady(null); setServerResult(null); setErrorMsg(null);
    if (serverSide) void runServer(); else void runClient();
  }

  const statusIcon: Record<FileStatus, JSX.Element> = {
    queued: <Clock className="h-4 w-4 text-muted-foreground" />,
    downloading: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    done: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    failed: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <>
      <Button size="sm" variant={variant} onClick={start} disabled={busy}>
        {busy
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Packaging…</>
          : <><Download className="h-4 w-4 mr-2" /> {buttonLabel ?? "Export documents (ZIP)"}</>}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Document export
            </DialogTitle>
            <DialogDescription>
              {serverSide ? "Server-generated ZIP" : "Bundling documents in your browser"}
              {" · "}Region {region}
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <div className="text-sm text-destructive">{errorMsg}</div>
          )}

          {files.length > 0 && (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{totals.done}/{totals.total} done{totals.failed ? ` · ${totals.failed} failed` : ""}</span>
                  <span>{totals.pct}%</span>
                </div>
                <Progress value={totals.pct} />
              </div>

              <ScrollArea className="h-64 rounded-md border">
                <ul className="divide-y">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 p-2 text-sm">
                      {statusIcon[f.status]}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{f.file_name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {f.document_type}
                          {f.attempts > 0 ? ` · attempt ${f.attempts}` : ""}
                          {f.error ? ` · ${f.error}` : ""}
                        </div>
                      </div>
                      <Badge variant={
                        f.status === "done" ? "default" :
                        f.status === "failed" ? "destructive" : "secondary"
                      } className="capitalize">{f.status}</Badge>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex gap-2">
              {totals.failed > 0 && !serverSide && (
                <Button size="sm" variant="outline" onClick={retryFailed} disabled={busy}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Retry failed ({totals.failed})
                </Button>
              )}
              {totals.failed > 0 && serverSide && (
                <Button size="sm" variant="outline" onClick={runServer} disabled={busy}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Re-run export
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Close
              </Button>
              {zipReady && !serverSide && (
                <Button size="sm" onClick={saveClientZip}>
                  <Download className="h-4 w-4 mr-2" /> Download ZIP
                </Button>
              )}
              {serverResult && (
                <Button size="sm" onClick={async () => {
                  try {
                    const blob = await fetchServerZipWithRefresh({
                      initialUrl: serverResult.url,
                      storagePath: serverResult.storagePath ?? "",
                      refresh: async (path) => {
                        const { data, error } = await supabase.functions.invoke("refresh-export-download-url", {
                          body: { storage_path: path },
                        });
                        if (error) throw error;
                        // Keep local state in sync so subsequent clicks reuse the fresh URL.
                        setServerResult((s) => s ? { ...s, url: data.download_url } : s);
                        return data.download_url as string;
                      },
                    });
                    const res = await saveZipBlob(blob, serverResult.filename);
                    if (res.platform !== "web") toast.success("Saved to Documents");
                  } catch (e) {
                    toast.error("Download failed: " + (e as Error).message);
                  }
                }}>
                  <Download className="h-4 w-4 mr-2" /> Download ZIP
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DocumentExportButton;
