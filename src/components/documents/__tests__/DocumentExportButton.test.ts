// Unit tests for the pure helpers in DocumentExportButton plus a ZIP-bundling
// smoke test that exercises the same helpers used to write manifest.json,
// manifest.csv and the archived files. Component render isn't tested here —
// the module pulls in RegionContext/AuthContext/supabase and its behavior is
// covered by the helpers + a full-flow zip assembly below.

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  sanitize,
  archiveName,
  exportFilename,
  buildManifest,
  toCsv,
  type DocRow,
  type FileProgress,
} from "@/components/documents/DocumentExportButton";

const doc = (over: Partial<DocRow> = {}): DocRow => ({
  id: "doc-1",
  user_id: "user-1",
  document_type: "driver_license",
  document_category: "identity",
  file_path: "user-1/driver_license/original.pdf",
  file_name: "original.pdf",
  file_size: 1234,
  mime_type: "application/pdf",
  status: "verified",
  rejection_reason: null,
  vehicle_id: null,
  expires_at: null,
  created_at: "2026-07-13T09:00:00.000Z",
  ...over,
});

describe("sanitize", () => {
  it("keeps alphanumerics and replaces everything else with underscores", () => {
    expect(sanitize("hello world!.pdf")).toBe("hello_world_.pdf");
  });
  it("clamps overly long names to 180 chars", () => {
    const s = sanitize("a".repeat(400));
    expect(s.length).toBe(180);
  });
});

describe("archiveName", () => {
  it("prefixes with type + upload date and keeps original file name", () => {
    const name = archiveName(doc());
    expect(name).toBe("driver_license__2026-07-13__original.pdf");
  });
});

describe("exportFilename", () => {
  it("uses label + region + timestamp", () => {
    const name = exportFilename({
      label: "driver-jane",
      userId: "user-1",
      region: "US",
      stamp: "2026-07-13-09-00-00",
    });
    expect(name).toBe("rentmaikar-documents-driver-jane-US-2026-07-13-09-00-00.zip");
  });
  it("falls back to userId slice when no label given", () => {
    const name = exportFilename({
      userId: "abcdef1234567890",
      region: "NG",
      stamp: "2026-01-01-00-00-00",
    });
    expect(name).toBe("rentmaikar-documents-abcdef12-NG-2026-01-01-00-00-00.zip");
  });
});

describe("buildManifest", () => {
  const rows = [doc({ id: "d1" }), doc({ id: "d2", file_name: "back.pdf" })];
  const files: FileProgress[] = [
    { id: "d1", file_name: "original.pdf", document_type: "driver_license", size_bytes: 1234, status: "done", attempts: 1 },
    { id: "d2", file_name: "back.pdf", document_type: "driver_license", size_bytes: 999, status: "failed", attempts: 2, error: "HTTP 500" },
  ];
  const manifest = buildManifest({
    userId: "user-1", region: "US", exportedAt: "2026-07-13T10:00:00.000Z",
    files, docs: rows,
  });

  it("aggregates totals", () => {
    expect(manifest.totals).toEqual({ documents: 2, downloaded: 1, failed: 1 });
  });
  it("records download status, error and attempts per doc", () => {
    expect(manifest.documents[0]).toMatchObject({
      id: "d1", download_status: "done", download_error: null, attempts: 1,
      archive_path: "files/driver_license__2026-07-13__original.pdf",
    });
    expect(manifest.documents[1]).toMatchObject({
      id: "d2", download_status: "failed", download_error: "HTTP 500", attempts: 2,
    });
  });
  it("carries region + context fields", () => {
    expect(manifest.region).toBe("US");
    expect(manifest.user_id).toBe("user-1");
    expect(manifest.vehicle_id).toBeNull();
    expect(manifest.exported_at).toBe("2026-07-13T10:00:00.000Z");
  });
});

describe("toCsv", () => {
  it("emits header + escapes quotes/commas/newlines", () => {
    const csv = toCsv([
      { a: "x", b: "safe" },
      { a: 'has "quote"', b: "has, comma" },
      { a: "line\nbreak", b: null },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe("x,safe");
    expect(lines[2]).toBe('"has ""quote""","has, comma"');
    // embedded newline splits row 3 across two lines when we split on \n
    expect(lines[3]).toBe('"line');
    expect(lines[4]).toBe('break",');
  });
});

describe("zip bundling", () => {
  it("assembles files/, manifest.json, manifest.csv, README with expected contents", async () => {
    const rows = [doc({ id: "d1" })];
    const files: FileProgress[] = [{
      id: "d1", file_name: "original.pdf", document_type: "driver_license",
      size_bytes: 4, status: "done", attempts: 1,
    }];
    const zip = new JSZip();
    const filesDir = zip.folder("files")!;
    filesDir.file(archiveName(rows[0]), new Uint8Array([1, 2, 3, 4]));
    const manifest = buildManifest({
      userId: "user-1", region: "US", exportedAt: "2026-07-13T10:00:00.000Z",
      files, docs: rows,
    });
    zip.file("manifest.json", JSON.stringify(manifest));
    zip.file("manifest.csv", toCsv(manifest.documents as any));
    zip.file("README.txt", "hello");

    const bytes = await zip.generateAsync({ type: "uint8array" });
    expect(bytes.byteLength).toBeGreaterThan(0);

    const round = await JSZip.loadAsync(bytes);
    const names = Object.keys(round.files).sort();
    expect(names).toContain("manifest.json");
    expect(names).toContain("manifest.csv");
    expect(names).toContain("README.txt");
    expect(names).toContain("files/driver_license__2026-07-13__original.pdf");

    const manifestText = await round.file("manifest.json")!.async("string");
    const parsed = JSON.parse(manifestText);
    expect(parsed.totals.documents).toBe(1);
    expect(parsed.documents[0].id).toBe("d1");

    const csvText = await round.file("manifest.csv")!.async("string");
    expect(csvText.split("\n")[0]).toMatch(/id/);
    expect(csvText).toContain("d1");
  });
});
