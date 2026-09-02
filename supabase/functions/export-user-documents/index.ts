// Server-side document export.
// Builds a ZIP of all documents for a target user (optionally scoped to a vehicle),
// uploads it to the private `document-exports` bucket, records the export in
// `document_export_audit`, and returns a short-lived signed URL for download.
//
// Authorization:
//   - Signed-in users may export ONLY their own documents.
//   - Admins & admin assistants may export any user/vehicle.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, tryAcquireConcurrency, releaseConcurrency, tooMany } from "../_shared/rate-limit.ts";

// Per-user quotas — tight enough to protect Storage + edge-function budget,
// loose enough for normal admin batch exports.
const RATE_LIMIT_PER_MINUTE = 6;
const MAX_CONCURRENT_PER_USER = 2;

const Body = z.object({
  target_user_id: z.string().uuid(),
  vehicle_id: z.string().uuid().optional(),
  label: z.string().max(120).optional(),
  region: z.enum(["US", "NG"]).optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

function toCsv(rows: Record<string, unknown>[]): string {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { target_user_id, vehicle_id, label, region } = parsed.data;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt
      ? await supa.auth.getUser(jwt)
      : { data: { user: null } as any };
    if (!userData?.user) return json(401, { error: "unauthorized" });
    const exporterId = userData.user.id;

    // Rate limit + concurrency: prevent runaway calls from a single exporter.
    const rl = await checkRateLimit(exporterId, "export-user-documents", RATE_LIMIT_PER_MINUTE);
    if (!rl.allowed) {
      return tooMany(rl.retry_after_seconds, {
        message: `Please wait ${rl.retry_after_seconds}s before requesting another export.`,
      });
    }
    if (!tryAcquireConcurrency(exporterId, MAX_CONCURRENT_PER_USER)) {
      return tooMany(15, { message: "You already have an export in progress. Please wait for it to finish." });
    }

    try {
      // AuthZ: self OR admin. Admin assistants only for users explicitly
      // assigned to them (assistant_can_access_user), never the whole userbase.
      let allowed = exporterId === target_user_id;
      if (!allowed) {
        const { data: roles } = await supa.from("user_roles")
          .select("role").eq("user_id", exporterId)
          .in("role", ["admin", "admin_assistant"] as any);
        const roleList = (roles ?? []).map((r: any) => r.role);
        if (roleList.includes("admin")) {
          allowed = true;
        } else if (roleList.includes("admin_assistant")) {
          const { data: assignment } = await supa
            .from("admin_assistant_user_assignments")
            .select("id")
            .eq("assistant_id", exporterId)
            .eq("target_user_id", target_user_id)
            .limit(1);
          allowed = !!(assignment && assignment.length > 0);
        }

      }
      if (!allowed) return json(403, { error: "forbidden" });


    // Load rows
    let q = supa.from("user_documents").select("*").eq("user_id", target_user_id);
    if (vehicle_id) q = q.eq("vehicle_id", vehicle_id);
    const { data: rows, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    if (!rows || rows.length === 0) return json(404, { error: "no documents to export" });

    const zip = new JSZip();
    const filesDir = zip.folder("files")!;
    const manifest: Record<string, unknown>[] = [];
    const perFile: { id: string; ok: boolean; error?: string }[] = [];
    let downloaded = 0, failed = 0;

    for (const r of rows as any[]) {
      const safeName = sanitize(
        `${r.document_type}__${String(r.created_at).slice(0, 10)}__${r.file_name}`,
      );
      const row: Record<string, unknown> = {
        id: r.id,
        document_type: r.document_type,
        category: r.document_category,
        status: r.status,
        file_name: r.file_name,
        mime_type: r.mime_type,
        size_bytes: r.file_size,
        vehicle_id: r.vehicle_id,
        expires_at: r.expires_at,
        uploaded_at: r.created_at,
        rejection_reason: r.rejection_reason,
        archive_path: `files/${safeName}`,
      };
      const { data: blob, error: dlErr } = await supa.storage
        .from("user-documents").download(r.file_path);
      if (dlErr || !blob) {
        row.download_error = dlErr?.message ?? "download failed";
        failed++;
        perFile.push({ id: r.id, ok: false, error: String(row.download_error) });
      } else {
        const buf = new Uint8Array(await blob.arrayBuffer());
        filesDir.file(safeName, buf);
        downloaded++;
        perFile.push({ id: r.id, ok: true });
      }
      manifest.push(row);
    }

    const exportedAt = new Date().toISOString();
    const manifestObj = {
      exported_at: exportedAt,
      exporter_id: exporterId,
      target_user_id,
      vehicle_id: vehicle_id ?? null,
      region: region ?? null,
      totals: { documents: rows.length, downloaded, failed },
      documents: manifest,
    };
    zip.file("manifest.json", JSON.stringify(manifestObj, null, 2));
    zip.file("manifest.csv", toCsv(manifest));
    zip.file("README.txt",
      `Rentmaikar document export\nExported: ${exportedAt}\n` +
      `Exporter: ${exporterId}\nTarget user: ${target_user_id}` +
      `${vehicle_id ? "\nVehicle: " + vehicle_id : ""}\n` +
      `Region: ${region ?? "n/a"}\n` +
      `Documents: ${rows.length} (downloaded ${downloaded}, failed ${failed})\n\n` +
      `See manifest.json / manifest.csv for full details.\n`,
    );

    const zipBuf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const stamp = exportedAt.slice(0, 19).replace(/[T:]/g, "-");
    const labelPart = sanitize(label ?? `user-${target_user_id.slice(0, 8)}`);
    const storagePath = `${exporterId}/${target_user_id}/${stamp}-${labelPart}.zip`;

    const { error: upErr } = await supa.storage.from("document-exports").upload(
      storagePath, zipBuf, { contentType: "application/zip", upsert: false },
    );
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await supa.storage
      .from("document-exports").createSignedUrl(storagePath, 3600);
    if (signErr) throw signErr;

    // Audit
    await supa.from("document_export_audit").insert({
      exporter_id: exporterId,
      target_user_id,
      vehicle_id: vehicle_id ?? null,
      document_ids: (rows as any[]).map((r) => r.id),
      document_count: rows.length,
      source: "server",
      status: failed === 0 ? "completed" : "partial",
      region: region ?? null,
      zip_size_bytes: zipBuf.byteLength,
      storage_path: storagePath,
      metadata: { downloaded, failed, per_file: perFile },
    });

      return json(200, {
        ok: true,
        download_url: signed?.signedUrl,
        storage_path: storagePath,
        filename: `rentmaikar-documents-${labelPart}-${region ?? "ALL"}-${stamp}.zip`,
        totals: { documents: rows.length, downloaded, failed },
        per_file: perFile,
        expires_in: 3600,
      });
    } finally {
      releaseConcurrency(exporterId);
    }
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
