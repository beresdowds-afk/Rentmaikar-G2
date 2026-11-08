import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dbPool from "../../../backend/src/services/dbPool";
import * as evidenceHashService from "../../../backend/src/services/evidenceHashService";
import {
  handleFileUpload,
  handleGetFileUrl,
  type AuthContext,
  type FilePayload,
} from "../../../backend/src/services/fileUploadService";
import { supabaseBackendService } from "../../../backend/src/services/supabaseService";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VEHICLE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOCUMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RECONCILIATION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
const PDF = Buffer.from("%PDF-1.7\nfile");

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
        }],
        rowCount: 1,
      };
    }
    if (query.includes("FROM public.user_documents")) {
      return { rows: [{ id: DOCUMENT_ID, user_id: USER_ID, file_path: `${USER_ID}/driver_license/doc.pdf` }], rowCount: 1 };
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
  });

  afterEach(() => {
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
    harness.poolQuery.mockRejectedValueOnce(duplicateError);

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

  it("does not sign another user's private document path", async () => {
    const harness = createHarness();
    harness.poolQuery.mockResolvedValueOnce({
      rows: [{ id: DOCUMENT_ID, user_id: OTHER_USER_ID, file_path: `${OTHER_USER_ID}/driver_license/doc.pdf` }],
      rowCount: 1,
    });

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
        });
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
