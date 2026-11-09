import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dbPool from "../../../backend/src/services/dbPool";
import * as evidenceHashService from "../../../backend/src/services/evidenceHashService";
import {
  handleFileUpload,
  handleDeleteFile,
  handleGetFileUrl,
  processDocumentLifecycle,
  type AuthContext,
  type FilePayload,
} from "../../../backend/src/services/fileUploadService";
import { supabaseBackendService } from "../../../backend/src/services/supabaseService";
import { isRetentionExpired } from "../../../backend/src/services/documentLifecycleService";
import * as licenceRecognition from "../../../backend/src/services/licenceExpiryRecognition";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VEHICLE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOCUMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RECONCILIATION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

const caller: AuthContext = {
  userId: USER_ID,
  role: "owner",
  roles: ["owner"],
  isAdmin: false,
};

function file(
  name = "license.pdf",
  mimetype = "application/pdf",
  buffer = PDF,
): FilePayload {
  return { originalname: name, mimetype, buffer, size: buffer.length };
}

function createHarness() {
  const poolQuery = vi.fn(async (query: string) => {
    if (query.includes("FROM public.vehicles")) {
      return { rows: [{ owner_id: USER_ID, driver_authorized: false }], rowCount: 1 };
    }
    if (query.includes("INSERT INTO public.storage_upload_reconciliation")) {
      return { rows: [{ id: RECONCILIATION_ID }], rowCount: 1 };
    }
    if (query.includes("FROM public.storage_upload_reconciliation")) {
      return {
        rows: [{
          id: RECONCILIATION_ID,
          uploader_id: USER_ID,
          owner_id: USER_ID,
          vehicle_id: null,
          resource_type: "user_document",
          resource_id: DOCUMENT_ID,
          lifecycle_state: "submitted_for_review",
          scan_status: "clean",
        }],
        rowCount: 1,
      };
    }
    if (query.includes("FROM public.user_documents")) {
      return {
        rows: [{
          id: DOCUMENT_ID,
          user_id: USER_ID,
          file_path: `${USER_ID}/driver_license/doc.pdf`,
          lifecycle_state: "submitted_for_review",
          scan_status: "clean",
          retention_until: null,
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  const transactionQuery = vi.fn(async (query: string) => {
    if (query.includes("INSERT INTO public.user_documents")) {
      return { rows: [{ id: DOCUMENT_ID }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const client = {
    query: transactionQuery,
    release: vi.fn(),
  };
  const pool = {
    query: poolQuery,
    connect: vi.fn(async () => client),
  };
  const bucket = {
    upload: vi.fn(async () => ({ data: { path: "stored" }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: "https://signed.example.test/file?token=short" },
      error: null,
    })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://public.example.test/file" } })),
  };
  const admin = { storage: { from: vi.fn(() => bucket) } };

  vi.spyOn(dbPool, "getDbPool").mockReturnValue(pool as never);
  vi.spyOn(supabaseBackendService, "getAdminClient").mockReturnValue(admin as never);
  vi.spyOn(evidenceHashService, "registerEvidenceArtifact").mockResolvedValue({
    id: "artifact-id",
    contentSha256: "hash",
    custodyHash: "custody",
  });

  return { pool, poolQuery, client, transactionQuery, bucket };
}

describe("authoritative private file uploads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DOCUMENT_SCANNER_URL = "https://scanner.example.test/scan";
    process.env.DOCUMENT_SCANNER_TOKEN = "test-scanner-token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ verdict: "clean", scanner: "test-scanner" }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DOCUMENT_SCANNER_URL;
    delete process.env.DOCUMENT_SCANNER_TOKEN;
    vi.restoreAllMocks();
  });

  it("rejects a vehicle-document upload by a different user before storage", async () => {
    const harness = createHarness();
    harness.poolQuery.mockResolvedValueOnce({
      rows: [{ owner_id: OTHER_USER_ID, driver_authorized: false }],
      rowCount: 1,
    });

    await expect(handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "vehicle_registration",
      documentCategory: "vehicle",
      vehicleId: VEHICLE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.bucket.upload).not.toHaveBeenCalled();
  });

  it("rejects a missing vehicle and fails closed on ownership lookup errors", async () => {
    const missing = createHarness();
    missing.poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "vehicle_registration",
      documentCategory: "vehicle",
      vehicleId: VEHICLE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(missing.bucket.upload).not.toHaveBeenCalled();

    const failedLookup = createHarness();
    failedLookup.poolQuery.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "vehicle_registration",
      documentCategory: "vehicle",
      vehicleId: VEHICLE_ID,
    })).rejects.toMatchObject({ statusCode: 503 });
    expect(failedLookup.bucket.upload).not.toHaveBeenCalled();
  });

  it("removes an uploaded object and returns failure when evidence registration fails", async () => {
    const harness = createHarness();
    vi.spyOn(evidenceHashService, "registerEvidenceArtifact")
      .mockRejectedValueOnce(new Error("registry unavailable"));

    await expect(handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    })).rejects.toMatchObject({ statusCode: 503 });

    expect(harness.bucket.upload).toHaveBeenCalledOnce();
    expect(harness.bucket.remove).toHaveBeenCalledOnce();
    expect(harness.transactionQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(harness.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET state = $2"),
      [RECONCILIATION_ID, "failed", "registry unavailable"],
    );
    expect(harness.transactionQuery).not.toHaveBeenCalledWith("COMMIT");
  });

  it("does not accept duplicate document evidence after a content-key conflict", async () => {
    const harness = createHarness();
    const duplicateError = Object.assign(new Error("duplicate key"), { code: "23505" });
    harness.poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(duplicateError);

    await expect(handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(harness.bucket.upload).not.toHaveBeenCalled();
  });

  it("rejects path traversal and mismatched or forged file signatures", async () => {
    const harness = createHarness();
    await expect(handleFileUpload(caller, file("../../private.pdf"), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    })).rejects.toThrow(/Invalid file name/i);
    await expect(handleFileUpload(caller, file("image.jpg", "image/jpeg", PDF), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    })).rejects.toThrow(/signature/i);
    expect(harness.bucket.upload).not.toHaveBeenCalled();
  });

  it("rejects malformed documents even when the declared signature matches", async () => {
    const harness = createHarness();
    await expect(handleFileUpload(caller, file("broken.pdf", "application/pdf", Buffer.from("%PDF-1.7 broken")), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    })).rejects.toThrow(/Malformed/i);
    expect(harness.bucket.upload).not.toHaveBeenCalled();
  });

  it("rejects infected documents and never creates a signed URL", async () => {
    const harness = createHarness();
    const recognize = vi.spyOn(licenceRecognition, "recognizeLicenceExpiry");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ verdict: "infected", scanner: "test-scanner" }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const result = await handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    });

    expect(result.lifecycleState).toBe("rejected");
    expect(result.scanStatus).toBe("infected");
    expect(result.signedUrl).toBeUndefined();
    expect(harness.bucket.createSignedUrl).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
  });

  it("keeps documents quarantined and unsigned when the malware scanner is unavailable", async () => {
    const harness = createHarness();
    const recognize = vi.spyOn(licenceRecognition, "recognizeLicenceExpiry");
    delete process.env.DOCUMENT_SCANNER_URL;
    delete process.env.DOCUMENT_SCANNER_TOKEN;

    const result = await handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    });

    expect(result.lifecycleState).toBe("quarantined");
    expect(result.scanStatus).toBe("unavailable");
    expect(result.signedUrl).toBeUndefined();
    expect(harness.bucket.createSignedUrl).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
  });

  it("submits a clean document for review and increments its immutable version", async () => {
    const harness = createHarness();
    vi.spyOn(licenceRecognition, "recognizeLicenceExpiry")
      .mockResolvedValue({ status: "recognized", date: "2030-10-25" });
    const result = await handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    });

    expect(result.lifecycleState).toBe("submitted_for_review");
    expect(result.scanStatus).toBe("clean");
    expect(result.signedUrl).toContain("https://signed.example.test");
    expect(harness.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET suggested_expiry_date = $2"),
      [DOCUMENT_ID, "2030-10-25", "recognized"],
    );
    expect(harness.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(MAX(document_version), 0) + 1"),
      expect.any(Array),
    );
    expect(harness.transactionQuery).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`user_document:${USER_ID}:driver_license:`],
    );
  });

  it("records OCR failure without treating it as a verified expiry or failing the upload", async () => {
    const harness = createHarness();
    vi.spyOn(licenceRecognition, "recognizeLicenceExpiry")
      .mockResolvedValue({ status: "error", date: null });
    const result = await handleFileUpload(caller, file(), {
      purpose: "user_document",
      documentType: "driver_license",
      documentCategory: "identification",
    });
    expect(result.lifecycleState).toBe("submitted_for_review");
    expect(harness.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET suggested_expiry_date = $2"),
      [DOCUMENT_ID, null, "error"],
    );
  });

  it("does not expire documents under active legal holds or disputes", () => {
    const expiredAt = new Date(Date.now() - 60_000);
    expect(isRetentionExpired(expiredAt, false, false)).toBe(true);
    expect(isRetentionExpired(expiredAt, true, false)).toBe(false);
    expect(isRetentionExpired(expiredAt, false, true)).toBe(false);
  });

  it("archives expired documents, removes their storage objects, and retains audit history", async () => {
    const harness = createHarness();
    harness.poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: DOCUMENT_ID,
          file_path: `${USER_ID}/driver_license/expired.pdf`,
          retention_until: new Date(Date.now() - 60_000).toISOString(),
        }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [{ id: DOCUMENT_ID }], rowCount: 1 } as never);

    const result = await processDocumentLifecycle();

    expect(result.archived).toBe(1);
    expect(harness.bucket.remove).toHaveBeenCalledWith([
      `${USER_ID}/driver_license/expired.pdf`,
    ]);
    expect(harness.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("'retention_archived'"),
      expect.any(Array),
    );
  });

  it("denies signed URLs for retention-expired documents", async () => {
    const harness = createHarness();
    harness.poolQuery.mockResolvedValueOnce({
      rows: [{
        id: DOCUMENT_ID,
        user_id: USER_ID,
        file_path: `${USER_ID}/driver_license/doc.pdf`,
        lifecycle_state: "verified",
        scan_status: "clean",
        retention_until: new Date(Date.now() - 60_000).toISOString(),
      }],
      rowCount: 1,
    } as never);
    await expect(handleGetFileUrl(caller, {
      purpose: "user_document",
      documentId: DOCUMENT_ID,
    })).rejects.toMatchObject({ statusCode: 404 });
    expect(harness.bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects unauthorized document deletion", async () => {
    const harness = createHarness();
    harness.poolQuery.mockResolvedValueOnce({
      rows: [{ id: DOCUMENT_ID, user_id: OTHER_USER_ID, file_path: "other/file.pdf", status: "pending" }],
      rowCount: 1,
    } as never);
    await expect(handleDeleteFile(caller, {
      purpose: "user_document",
      documentId: DOCUMENT_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.bucket.remove).not.toHaveBeenCalled();
  });

  it("preserves documents under legal hold from user deletion", async () => {
    const harness = createHarness();
    harness.poolQuery
      .mockResolvedValueOnce({
        rows: [{ id: DOCUMENT_ID, user_id: USER_ID, file_path: "user/document.pdf", status: "pending" }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [{ id: "hold-id" }], rowCount: 1 } as never);
    await expect(handleDeleteFile(caller, {
      purpose: "user_document",
      documentId: DOCUMENT_ID,
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(harness.bucket.remove).not.toHaveBeenCalled();
  });

  it("does not sign another user's private document path", async () => {
    const harness = createHarness();
    harness.poolQuery.mockResolvedValueOnce({
      rows: [{ id: DOCUMENT_ID, user_id: OTHER_USER_ID, file_path: `${OTHER_USER_ID}/driver_license/doc.pdf` }],
      rowCount: 1,
    } as never);

    await expect(handleGetFileUrl(caller, {
      purpose: "user_document",
      documentId: DOCUMENT_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it("limits private signed URLs to 15 minutes after verifying document ownership", async () => {
    const harness = createHarness();
    await expect(handleGetFileUrl(caller, {
      purpose: "user_document",
      documentId: DOCUMENT_ID,
      expiresIn: 901,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(harness.bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a registered private document only for its owner", async () => {
    const harness = createHarness();
    const result = await handleGetFileUrl(caller, {
      purpose: "user_document",
      documentId: DOCUMENT_ID,
      expiresIn: 900,
    });

    expect(result.isPublic).toBe(false);
    expect(result.url).toContain("https://signed.example.test");
    expect(harness.bucket.createSignedUrl).toHaveBeenCalledWith(
      `${USER_ID}/driver_license/doc.pdf`,
      900,
    );
  });

  it("audits an administrator exception and stores the vehicle owner as document owner", async () => {
    const harness = createHarness();
    const administrator: AuthContext = {
      userId: OTHER_USER_ID,
      role: "admin",
      roles: ["admin"],
      isAdmin: true,
    };

    const response = await handleFileUpload(administrator, file(), {
      purpose: "user_document",
      documentType: "vehicle_registration",
      documentCategory: "vehicle",
      vehicleId: VEHICLE_ID,
    });

    expect(response.ok).toBe(true);
    expect(harness.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("document_storage_admin_override"),
      [OTHER_USER_ID, "vehicles", VEHICLE_ID, JSON.stringify({ purpose: "user_document" })],
    );
    expect(harness.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.user_documents"),
      expect.arrayContaining([USER_ID]),
    );
    expect(response.publicUrl).toBeUndefined();
    expect(response.signedUrl).toContain("https://signed.example.test");
  });

  it("makes evidence registration idempotent for a duplicate storage path", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("pg_advisory_xact_lock")
      ? { rows: [], rowCount: 1 }
      : {
          rows: [{
            id: "existing",
            content_sha256: "same-hash",
            custody_hash: "existing-custody",
            source_table: "user_documents",
            source_id: DOCUMENT_ID,
            captured_by: USER_ID,
          }],
          rowCount: 1,
        } as never);
    const result = await evidenceHashService.registerEvidenceArtifact(
      {
        evidenceType: "document",
        sourceTable: "user_documents",
        sourceId: DOCUMENT_ID,
        storageBucket: "user-documents",
        storagePath: `${USER_ID}/driver_license/doc.pdf`,
        contentSha256: "same-hash",
        capturedBy: USER_ID,
      },
      { query } as never,
    );

    expect(result.id).toBe("existing");
    expect(query).toHaveBeenCalledTimes(2);
  });
});
