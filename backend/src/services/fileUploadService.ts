import crypto from "crypto";
import { decodeJwt } from "jose";
import path from "path";
import { supabaseBackendService } from "./supabaseService";
import { getDbPool } from "./dbPool";
import type { PoolClient } from "pg";
import { registerEvidenceArtifact } from "./evidenceHashService";
import {
  StoragePurpose,
  PURPOSE_CONFIGS,
  UploadFileMetadata,
  UploadFileResponse,
  DeleteFileRequest,
  DeleteFileResponse,
  GetFileUrlRequest,
  GetFileUrlResponse,
} from "./storageContract";

export interface FilePayload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AuthContext {
  userId: string;
  email?: string;
  role: string;
  roles?: string[];
  isAdmin: boolean;
}

export function validateSupabaseJwtClaims(
  token: string,
  expectedIssuer: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { subject: string } {
  if (!token || token.length > 16_384) {
    throw new Error("Invalid authentication session");
  }
  let claims: ReturnType<typeof decodeJwt>;
  try {
    claims = decodeJwt(token);
  } catch {
    throw new Error("Invalid authentication session");
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== expectedIssuer ||
    !audience.includes("authenticated") ||
    typeof claims.sub !== "string" ||
    !claims.sub.trim() ||
    typeof claims.exp !== "number" ||
    claims.exp <= nowSeconds ||
    (typeof claims.nbf === "number" && claims.nbf > nowSeconds)
  ) {
    throw new Error("Invalid authentication session");
  }
  return { subject: claims.sub };
}

export async function authenticateCaller(
  authorizationHeader: string | undefined
): Promise<AuthContext> {
  const token = String(authorizationHeader || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    const err = new Error("Authentication required");
    (err as any).statusCode = 401;
    throw err;
  }

  let subject: string;
  try {
    subject = validateSupabaseJwtClaims(
      token,
      `${supabaseBackendService.getUrl()}/auth/v1`,
    ).subject;
  } catch {
    const err = new Error("Invalid authentication session");
    (err as any).statusCode = 401;
    throw err;
  }

  const admin = supabaseBackendService.getAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);

  if (authError || !authData?.user?.id || authData.user.id !== subject) {
    const err = new Error("Invalid authentication session");
    (err as any).statusCode = 401;
    throw err;
  }

  const user = authData.user;
  const pool = getDbPool();
  if (!pool) {
    const err = new Error("Authorization service unavailable");
    (err as any).statusCode = 503;
    throw err;
  }
  const roleResult = await pool.query(
    `
      SELECT role
      FROM public.user_roles
      WHERE user_id = $1
      ORDER BY CASE role::text
        WHEN 'admin' THEN 0
        WHEN 'admin_assistant' THEN 1
        ELSE 2
      END
    `,
    [user.id]
  );
  const roles = roleResult.rows
    .map((row: { role: unknown }) => String(row.role || "").trim())
    .filter(Boolean);
  const role = roles[0] || "unassigned";
  const isAdmin = roles.some((assignedRole: string) =>
    assignedRole === "admin" || assignedRole === "admin_assistant"
  );

  return {
    userId: user.id,
    email: user.email,
    role,
    roles,
    isAdmin,
  };
}

const EXTENSION_BY_MIME: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};
const DOCUMENT_TYPES: Record<string, "identification" | "vehicle"> = {
  driver_license: "identification",
  drivers_license: "identification",
  national_id: "identification",
  police_report: "identification",
  nin: "identification",
  bvn: "identification",
  passport: "identification",
  rideshare_approval: "identification",
  vehicle_registration: "vehicle",
  vehicle_insurance: "vehicle",
  vin_inspection: "vehicle",
  roadworthiness: "vehicle",
  hackney_permit: "vehicle",
  vehicle_license: "vehicle",
};
const INSPECTION_PHOTO_SLOTS = new Set([
  "photo_front_view",
  "photo_back_view",
  "photo_driver_side",
  "photo_passenger_side",
  "photo_front_right_tyre",
  "photo_front_left_tyre",
  "photo_back_left_tyre",
  "photo_back_right_tyre",
  "photo_dashboard",
  "photo_interior",
]);
const MAX_SIGNED_URL_SECONDS = 15 * 60;

function uploadError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function sanitizeFileName(fileName: string): string {
  if (
    !fileName ||
    fileName.length > 255 ||
    /[\0-\x1f\x7f/\\]/.test(fileName) ||
    fileName.includes("..")
  ) {
    throw uploadError("Invalid file name");
  }
  const parsed = path.parse(fileName);
  const safeName = parsed.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
  return `${safeName || "file"}${parsed.ext.toLowerCase()}`;
}

function validateFile(file: FilePayload, purpose: StoragePurpose): {
  fileName: string;
  extension: string;
  mimeType: string;
  size: number;
  sha256: string;
} {
  const config = PURPOSE_CONFIGS[purpose];
  if (!file?.buffer?.length) throw uploadError("No file content received");
  const size = file.buffer.length;
  if (size > config.maxSizeBytes) {
    throw uploadError(
      `File size exceeds limit of ${config.maxSizeBytes / (1024 * 1024)} MB`,
    );
  }

  const fileName = sanitizeFileName(file.originalname);
  const extension = path.extname(fileName);
  const mimeType = String(file.mimetype || "").toLowerCase();
  if (
    !config.allowedMimeTypes.includes(mimeType) ||
    !EXTENSION_BY_MIME[mimeType]?.includes(extension)
  ) {
    throw uploadError("Invalid MIME type or file extension for this upload");
  }

  const bytes = file.buffer;
  const validSignature =
    mimeType === "image/jpeg"
      ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === "image/png"
        ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mimeType === "image/webp"
          ? bytes.length >= 12 &&
            bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          : mimeType === "application/pdf"
            ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
            : false;
  if (!validSignature) throw uploadError("File signature does not match the declared type");

  return {
    fileName,
    extension: mimeType === "image/jpeg" ? ".jpg" : extension,
    mimeType,
    size,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function hasExplicitAdminRole(auth: AuthContext): boolean {
  return auth.isAdmin &&
    (auth.roles || [auth.role]).some((role) => role === "admin" || role === "admin_assistant");
}

async function auditAdminUpload(
  pool: ReturnType<typeof getDbPool>,
  auth: AuthContext,
  vehicleId: string,
  purpose: string,
): Promise<void> {
  await auditAdminOverride(pool, auth, "vehicles", vehicleId, purpose);
}

async function auditAdminOverride(
  pool: ReturnType<typeof getDbPool>,
  auth: AuthContext,
  targetTable: string,
  targetId: string,
  purpose: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
       VALUES ($1, 'document_storage_admin_override', $2, $3, $4::jsonb)`,
      [auth.userId, targetTable, targetId, JSON.stringify({ purpose })],
    );
  } catch (error) {
    console.error("[fileUploadService] Admin upload audit failed:", error);
    throw uploadError("Administrator authorization could not be audited", 503);
  }
}

interface VerifiedVehicle {
  ownerId: string;
  driverAuthorized: boolean;
}

async function verifyVehicleAuthorization(
  pool: ReturnType<typeof getDbPool>,
  auth: AuthContext,
  vehicleId: string,
  purpose: string,
): Promise<VerifiedVehicle> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vehicleId)) {
    throw uploadError("A valid vehicle ID is required");
  }

  let result;
  try {
    result = await pool.query(
      `SELECT v.owner_id,
              EXISTS (
                SELECT 1 FROM public.rentals r
                 WHERE r.vehicle_id = v.id AND r.driver_id = $2
                   AND r.status::text IN ('active', 'ongoing', 'in_progress')
              ) OR EXISTS (
                SELECT 1 FROM public.legal_agreements la
                 WHERE la.vehicle_id = v.id AND la.driver_id = $2
                   AND la.status IN ('active', 'pending_signatures')
              ) AS driver_authorized
         FROM public.vehicles v
        WHERE v.id = $1
        LIMIT 1`,
      [vehicleId, auth.userId],
    );
  } catch (error) {
    console.error("[fileUploadService] Vehicle ownership lookup failed:", error);
    throw uploadError("Vehicle authorization could not be verified", 503);
  }

  const vehicle = result.rows[0];
  if (!vehicle) throw uploadError("Vehicle not found or not authorized", 403);
  const ownerId = String(vehicle.owner_id || "");
  const isOwner = ownerId === auth.userId;
  const isDriver = Boolean(vehicle.driver_authorized);
  if (hasExplicitAdminRole(auth)) {
    await auditAdminUpload(pool, auth, vehicleId, purpose);
    return { ownerId, driverAuthorized: isDriver };
  }
  const driverEvidence =
    purpose === "inspection_image" ||
    purpose === "damage_evidence" ||
    purpose === "rideshare_profile";
  if (!isOwner && !(driverEvidence && isDriver)) {
    throw uploadError("Not authorized for this vehicle", 403);
  }
  return { ownerId, driverAuthorized: isDriver };
}

function parseDate(value: string | undefined, field: string, defaultToToday = false): string {
  const date = value?.trim() || (defaultToToday ? new Date().toISOString().slice(0, 10) : "");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw uploadError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return date;
}

async function setReconciliationState(
  pool: ReturnType<typeof getDbPool>,
  reconciliationId: string,
  state: "registered" | "reconciliation_required" | "failed",
  message?: string,
): Promise<void> {
  await pool.query(
    `UPDATE public.storage_upload_reconciliation
        SET state = $2, last_error = $3, updated_at = now()
      WHERE id = $1`,
    [reconciliationId, state, message?.slice(0, 1000) || null],
  );
}

export async function handleFileUpload(
  auth: AuthContext,
  file: FilePayload,
  metadata: UploadFileMetadata,
  thumbnailFile?: FilePayload
): Promise<UploadFileResponse> {
  const purpose = metadata?.purpose;
  const config = PURPOSE_CONFIGS[purpose];
  if (!config) throw uploadError(`Unsupported storage purpose: '${purpose}'`);
  if (purpose === "user_document" && !String(metadata.documentType || "").trim()) {
    throw uploadError("documentType is required for user_document");
  }
  if ((purpose === "inspection_image" || purpose === "damage_evidence") && !String(metadata.vehicleId || "").trim()) {
    throw uploadError(`vehicleId is required for ${purpose}`);
  }

  const validated = validateFile(file, purpose);
  const admin = supabaseBackendService.getAdminClient();
  const pool = getDbPool();
  const nowKey = `${Date.now()}_${crypto.randomUUID()}`;
  const vehicleId = String(metadata.vehicleId || "").trim() || undefined;
  let verifiedVehicle: VerifiedVehicle | undefined;
  let filePath = "";
  let documentId: string | undefined;
  let submissionId: string | undefined;
  let publicUrl: string | undefined;
  let signedUrl: string | undefined;
  let thumbnailPath: string | undefined;
  let thumbnailUrl: string | undefined;
  let reconciliationId: string | undefined;
  let resourceKey = "";

  if (purpose === "user_document") {
    const documentType = String(metadata.documentType || "").trim();
    const documentCategory = metadata.documentCategory;
    if (!DOCUMENT_TYPES[documentType] || !documentCategory || DOCUMENT_TYPES[documentType] !== documentCategory) {
      throw uploadError("Document type and category are invalid");
    }
    if (documentCategory === "vehicle" && !vehicleId) {
      throw uploadError("vehicleId is required for vehicle documents");
    }
    if (vehicleId) {
      verifiedVehicle = await verifyVehicleAuthorization(pool, auth, vehicleId, purpose);
      if (!hasExplicitAdminRole(auth) && verifiedVehicle.ownerId !== auth.userId) {
        throw uploadError("Only the vehicle owner can upload vehicle documents", 403);
      }
    }
    if (metadata.expiresAt) parseDate(metadata.expiresAt, "expiresAt");
    resourceKey = documentType;
    filePath = `${verifiedVehicle?.ownerId || auth.userId}/${documentType}/${nowKey}${validated.extension}`;
  } else if (purpose === "vehicle_photo") {
    if (vehicleId) {
      verifiedVehicle = await verifyVehicleAuthorization(pool, auth, vehicleId, purpose);
      if (!hasExplicitAdminRole(auth) && verifiedVehicle.ownerId !== auth.userId) {
        throw uploadError("Not authorized to upload photos for this vehicle", 403);
      }
    }
    const draftId = String(metadata.draftId || "").trim();
    const targetId = vehicleId || draftId;
    if (!targetId || !/^[a-zA-Z0-9_-]{1,100}$/.test(targetId)) {
      throw uploadError("A valid draftId or vehicleId is required for vehicle photos");
    }
    filePath = `${verifiedVehicle?.ownerId || auth.userId}/${targetId}/${nowKey}${validated.extension}`;
  } else {
    if ((purpose === "inspection_image" || purpose === "damage_evidence") && !vehicleId) {
      throw uploadError(`vehicleId is required for ${purpose}`);
    }
    if (purpose === "rideshare_profile" && vehicleId) {
      verifiedVehicle = await verifyVehicleAuthorization(pool, auth, vehicleId, purpose);
      if (!hasExplicitAdminRole(auth) && !verifiedVehicle.driverAuthorized) {
        throw uploadError("Only an authorized driver can attach evidence to this vehicle", 403);
      }
    }
    if ((purpose === "inspection_image" || purpose === "damage_evidence") && vehicleId) {
      verifiedVehicle = await verifyVehicleAuthorization(pool, auth, vehicleId, purpose);
    }
    const ownerId = verifiedVehicle?.ownerId || auth.userId;
    if (purpose === "rideshare_profile") {
      const weekStartDate = parseDate(metadata.weekStartDate, "weekStartDate");
      resourceKey = weekStartDate;
      filePath = `${auth.userId}/${weekStartDate}/rideshare-profile_${nowKey}${validated.extension}`;
    } else if (purpose === "inspection_image") {
      const weekStartDate = parseDate(metadata.weekStartDate, "weekStartDate", true);
      const rawSlot = String(metadata.photoType || "photo_front_view");
      const slot = rawSlot.startsWith("photo_") ? rawSlot : `photo_${rawSlot}`;
      if (!INSPECTION_PHOTO_SLOTS.has(slot)) throw uploadError("Unsupported inspection photo type");
      resourceKey = `${weekStartDate}:${slot}`;
      filePath = `${auth.userId}/${vehicleId}/${weekStartDate}/${slot}_${nowKey}${validated.extension}`;
      metadata.photoType = slot;
      metadata.weekStartDate = weekStartDate;
    } else {
      const findingId = String(metadata.findingId || "").trim();
      if (findingId && !/^[a-zA-Z0-9_-]{1,100}$/.test(findingId)) {
        throw uploadError("Invalid findingId");
      }
      resourceKey = findingId || "damage";
      filePath = `${auth.userId}/${vehicleId}/damage/${findingId ? `finding_${findingId}` : "damage"}_${nowKey}${validated.extension}`;
    }

  }

  if (purpose !== "vehicle_photo") {
    const resourceType =
      purpose === "user_document" ? "user_document" :
      purpose === "rideshare_profile" ? "rideshare_profile_submission" :
      purpose === "inspection_image" ? "weekly_inspection_report" : "damage_evidence";
    const documentCategory =
      purpose === "user_document" ? metadata.documentCategory! :
      purpose === "inspection_image" || purpose === "damage_evidence" ? "vehicle" : "identification";
    let staged;
    try {
      staged = await pool.query(
      `INSERT INTO public.storage_upload_reconciliation (
         uploader_id, owner_id, vehicle_id, purpose, resource_type, resource_key,
         document_category, document_type, storage_bucket, storage_path,
         file_name, file_size, mime_type, content_sha256, review_status, state
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', 'pending_storage')
       RETURNING id`,
      [
        auth.userId,
        verifiedVehicle?.ownerId || auth.userId,
        vehicleId || null,
        purpose,
        resourceType,
        resourceKey,
        documentCategory,
        metadata.documentType || null,
        config.bucket,
        filePath,
        validated.fileName,
        validated.size,
        validated.mimeType,
        validated.sha256,
      ],
      );
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw uploadError("Duplicate evidence upload already exists", 409);
      }
      throw error;
    }
    reconciliationId = String(staged.rows[0]?.id || "");
    if (!reconciliationId) throw uploadError("Upload could not be durably staged", 503);
  }

  const validatedThumbnail =
    purpose === "vehicle_photo" && thumbnailFile
      ? validateFile(thumbnailFile, "vehicle_photo")
      : undefined;
  const upload = await admin.storage.from(config.bucket).upload(filePath, file.buffer, {
    contentType: validated.mimeType,
    upsert: false,
  });
  if (upload.error) {
    if (reconciliationId) {
      try {
        const cleanup = await admin.storage.from(config.bucket).remove([filePath]);
        await setReconciliationState(
          pool,
          reconciliationId,
          cleanup.error ? "reconciliation_required" : "failed",
          cleanup.error ? `${upload.error.message}; cleanup failed: ${cleanup.error.message}` : upload.error.message,
        );
      } catch (stateError) {
        console.error("[fileUploadService] Could not update failed upload state:", stateError);
      }
    }
    if (purpose === "vehicle_photo") {
      const cleanup = await admin.storage.from(config.bucket).remove([filePath]);
      if (cleanup.error) console.error("[fileUploadService] Vehicle photo cleanup failed:", cleanup.error);
    }
    throw uploadError(`Storage upload failed: ${upload.error.message}`, 502);
  }

  if (purpose === "vehicle_photo") {
    const basePath = filePath.slice(0, -validated.extension.length);
    publicUrl = admin.storage.from(config.bucket).getPublicUrl(filePath).data.publicUrl;
    if (thumbnailFile && validatedThumbnail) {
      thumbnailPath = `${basePath}-thumb${validatedThumbnail.extension}`;
      const thumbUpload = await admin.storage.from(config.bucket).upload(thumbnailPath, thumbnailFile.buffer, {
        contentType: validatedThumbnail.mimeType,
        upsert: false,
      });
      if (thumbUpload.error) {
        const cleanup = await admin.storage.from(config.bucket).remove([filePath, thumbnailPath]);
        if (cleanup.error) console.error("[fileUploadService] Vehicle photo cleanup failed:", cleanup.error);
        throw uploadError(`Thumbnail upload failed: ${thumbUpload.error.message}`, 502);
      }
      thumbnailUrl = admin.storage.from(config.bucket).getPublicUrl(thumbnailPath).data.publicUrl;
    }
  } else {
    let client: PoolClient | undefined;
    let evidenceSourceTable = "storage_upload_reconciliation";
    let evidenceSourceId = reconciliationId!;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      if (purpose === "user_document") {
        const documentOwnerId = verifiedVehicle?.ownerId || auth.userId;
        const docResult = await client.query(
          `INSERT INTO public.user_documents (
             user_id, document_type, document_category, file_path, file_name,
             file_size, mime_type, vehicle_id, expires_at, status,
             content_sha256, document_version, access_classification
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, 1, 'restricted')
           RETURNING id`,
          [
            documentOwnerId, metadata.documentType, metadata.documentCategory, filePath,
            validated.fileName, validated.size, validated.mimeType, vehicleId || null,
            metadata.expiresAt || null, validated.sha256,
          ],
        );
        documentId = String(docResult.rows[0]?.id || "");
        if (!documentId) throw new Error("Document metadata was not persisted");
        evidenceSourceTable = "user_documents";
        evidenceSourceId = documentId;
      } else if (purpose === "rideshare_profile") {
        const submission = await client.query(
          `INSERT INTO public.rideshare_profile_submissions (
             driver_id, vehicle_id, week_start_date, rating_screenshot_url,
             platform, current_rating
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (driver_id, week_start_date)
           DO UPDATE SET
             rating_screenshot_url = EXCLUDED.rating_screenshot_url,
             platform = COALESCE(EXCLUDED.platform, rideshare_profile_submissions.platform),
             current_rating = COALESCE(EXCLUDED.current_rating, rideshare_profile_submissions.current_rating),
             updated_at = now()
           RETURNING id`,
          [
            auth.userId, vehicleId || null, metadata.weekStartDate, filePath,
            metadata.platform || null, metadata.currentRating ?? null,
          ],
        );
        submissionId = String(submission.rows[0]?.id || "");
        if (!submissionId) throw new Error("Rideshare evidence metadata was not persisted");
        evidenceSourceTable = "rideshare_profile_submissions";
        evidenceSourceId = submissionId;
      } else if (purpose === "inspection_image") {
        const slot = String(metadata.photoType);
        const weekStartDate = String(metadata.weekStartDate);
        const reports = await client.query(
          `SELECT id, driver_id, owner_id, photo_timestamps
             FROM public.weekly_inspection_reports
            WHERE vehicle_id = $1 AND week_start_date = $2
            LIMIT 1 FOR UPDATE`,
          [vehicleId, weekStartDate],
        );
        const timestamp = new Date().toISOString();
        if (reports.rows[0]) {
          const report = reports.rows[0];
          if (
            !hasExplicitAdminRole(auth) &&
            String(report.driver_id) !== auth.userId &&
            verifiedVehicle?.ownerId !== auth.userId
          ) {
            throw uploadError("Not authorized to update this inspection report", 403);
          }
          const timestamps = {
            ...(report.photo_timestamps || {}),
            [slot]: timestamp,
          };
          await client.query(
            `UPDATE public.weekly_inspection_reports
                SET ${slot} = $1, photo_timestamps = $2, updated_at = now()
              WHERE id = $3`,
            [filePath, JSON.stringify(timestamps), report.id],
          );
          submissionId = String(report.id);
        } else {
          const report = await client.query(
            `INSERT INTO public.weekly_inspection_reports (
               vehicle_id, driver_id, owner_id, week_start_date, ${slot},
               photo_timestamps, status
             ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
             RETURNING id`,
            [
              vehicleId, auth.userId, verifiedVehicle?.ownerId || null,
              weekStartDate, filePath, JSON.stringify({ [slot]: timestamp }),
            ],
          );
          submissionId = String(report.rows[0]?.id || "");
        }
        if (!submissionId) throw new Error("Inspection evidence metadata was not persisted");
        evidenceSourceTable = "weekly_inspection_reports";
        evidenceSourceId = submissionId;
      }

      await client.query(
        `UPDATE public.storage_upload_reconciliation
            SET resource_id = $2, state = 'registered', last_error = NULL, updated_at = now()
          WHERE id = $1`,
        [reconciliationId, evidenceSourceId],
      );
      await registerEvidenceArtifact(
        {
          evidenceType: purpose === "inspection_image" || purpose === "damage_evidence" ? "inspection" : "document",
          sourceTable: evidenceSourceTable,
          sourceId: evidenceSourceId,
          storageBucket: config.bucket,
          storagePath: filePath,
          contentSha256: validated.sha256,
          capturedBy: auth.userId,
          metadata: {
            reconciliationId,
            purpose,
            resourceType:
              purpose === "user_document" ? "user_document" :
              purpose === "rideshare_profile" ? "rideshare_profile_submission" :
              purpose === "inspection_image" ? "weekly_inspection_report" : "damage_evidence",
            vehicleId: vehicleId || null,
            documentCategory:
              purpose === "user_document" ? metadata.documentCategory :
              purpose === "inspection_image" || purpose === "damage_evidence" ? "vehicle" : "identification",
            documentType: metadata.documentType || null,
            fileName: validated.fileName,
            fileSize: validated.size,
            mimeType: validated.mimeType,
            reviewStatus: "pending",
          },
        },
        client,
      );
      await client.query("COMMIT");
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch((rollbackError: unknown) =>
          console.error("[fileUploadService] Upload transaction rollback failed:", rollbackError),
        );
      }
      const cleanup = await admin.storage.from(config.bucket).remove([filePath]);
      const state = cleanup.error ? "reconciliation_required" : "failed";
      if (cleanup.error) {
        console.error("[fileUploadService] Failed upload cleanup requires reconciliation:", cleanup.error);
      }
      try {
        await setReconciliationState(
          pool,
          reconciliationId!,
          state,
          error instanceof Error ? error.message : "Evidence registration failed",
        );
      } catch (stateError) {
        console.error("[fileUploadService] Upload reconciliation state update failed:", stateError);
      }
      if ((error as { statusCode?: number })?.statusCode === 403) throw error;
      throw uploadError(
        cleanup.error
          ? "Evidence registration failed; the upload is queued for reconciliation"
          : "Evidence registration failed; the uploaded file was removed",
        503,
      );
    } finally {
      client?.release();
    }

    const signed = await admin.storage
      .from(config.bucket)
      .createSignedUrl(filePath, Math.min(config.defaultSignedUrlExpirySeconds, MAX_SIGNED_URL_SECONDS));
    if (signed.error || !signed.data?.signedUrl) {
      throw uploadError(`Failed to create authorized file URL: ${signed.error?.message || "unknown error"}`, 502);
    }
    signedUrl = signed.data.signedUrl;
  }

  return {
    ok: true,
    success: true,
    purpose,
    filePath,
    fileName: validated.fileName,
    fileSize: validated.size,
    mimeType: validated.mimeType,
    publicUrl,
    signedUrl,
    thumbnailPath,
    thumbnailUrl,
    documentId,
    submissionId,
  };
}

export async function handleDeleteFile(
  auth: AuthContext,
  params: DeleteFileRequest
): Promise<DeleteFileResponse> {
  const purpose = params.purpose;
  const config = PURPOSE_CONFIGS[purpose];

  if (!config) {
    const err = new Error(`Unsupported storage purpose: '${purpose}'`);
    (err as any).statusCode = 400;
    throw err;
  }

  const pool = getDbPool();

  if (purpose === "user_document") {
    if (!params.documentId) throw uploadError("documentId is required", 400);
    const docRes = await pool.query(
      `SELECT id, user_id, file_path, status, deleted_at
         FROM public.user_documents WHERE id = $1 LIMIT 1`,
      [params.documentId],
    );
    if (!docRes.rows[0] || docRes.rows[0].deleted_at) {
      throw uploadError("Document not found", 404);
    }
    const doc = docRes.rows[0];
    const isAdmin = hasExplicitAdminRole(auth);
    if (String(doc.user_id) !== auth.userId && !isAdmin) {
      throw uploadError("Not authorized to delete this document", 403);
    }
    if (doc.status !== "pending" && !isAdmin) {
      throw uploadError("Reviewed evidence cannot be deleted", 403);
    }
    if (isAdmin) {
      await auditAdminOverride(pool, auth, "user_documents", String(doc.id), "delete");
    }
    await pool.query(
      `UPDATE public.user_documents
          SET deleted_at = now(), deleted_by = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL`,
      [doc.id, auth.userId],
    );
    await pool.query(
      `UPDATE public.storage_upload_reconciliation
          SET state = 'revoked', updated_at = now()
        WHERE resource_type = 'user_document' AND resource_id = $1`,
      [doc.id],
    );

    return {
      ok: true,
      success: true,
      message: "Document access was revoked; evidence history was preserved",
      deletedPath: doc.file_path,
    };
  } else if (purpose === "vehicle_photo") {
    let targetPath = params.filePath;

    if (!targetPath && params.fileUrl) {
      const marker = `/${config.bucket}/`;
      const idx = params.fileUrl.indexOf(marker);
      if (idx !== -1) {
        targetPath = decodeURIComponent(
          params.fileUrl.slice(idx + marker.length).split("?")[0]
        );
      }
    }

    if (!targetPath) {
      throw uploadError("Either filePath or fileUrl is required", 400);
    }
    if (targetPath.includes("..") || targetPath.includes("\\") || targetPath.startsWith("/")) {
      throw uploadError("Invalid vehicle photo path", 400);
    }
    if (params.vehicleId) {
      const verified = await verifyVehicleAuthorization(pool, auth, params.vehicleId, "vehicle_photo_delete");
      let linkedToVehicle = targetPath.startsWith(`${verified.ownerId}/${params.vehicleId}/`);
      if (!linkedToVehicle) {
        try {
          const photos = await pool.query(
            `SELECT photo_urls FROM public.vehicles WHERE id = $1 LIMIT 1`,
            [params.vehicleId],
          );
          linkedToVehicle = Array.isArray(photos.rows[0]?.photo_urls) &&
            photos.rows[0].photo_urls.some((url: string) => url.includes(targetPath!));
        } catch (error) {
          console.error("[fileUploadService] Vehicle photo relationship lookup failed:", error);
          throw uploadError("Vehicle photo authorization could not be verified", 503);
        }
      }
      if (!linkedToVehicle) {
        throw uploadError("Vehicle photo does not belong to the requested vehicle", 403);
      }
    } else if (!targetPath.startsWith(`${auth.userId}/`) && !hasExplicitAdminRole(auth)) {
      throw uploadError("Not authorized to delete this vehicle photo", 403);
    } else if (hasExplicitAdminRole(auth)) {
      await auditAdminOverride(pool, auth, "storage.objects", targetPath, "vehicle_photo_delete");
    }
    const admin = supabaseBackendService.getAdminClient();
    const pathsToDelete = [targetPath];
    const thumbPath = targetPath.replace(/\.[^.]+$/, "-thumb.jpg");
    if (params.thumbnailPath && params.thumbnailPath !== thumbPath) {
      throw uploadError("Invalid thumbnail path", 400);
    }
    pathsToDelete.push(thumbPath);
    const { error: removeError } = await admin.storage.from(config.bucket).remove(pathsToDelete);
    if (removeError) throw uploadError(`Storage deletion failed: ${removeError.message}`, 502);

    if (params.vehicleId) {
      const vRes = await pool.query(
        `SELECT photo_urls FROM public.vehicles WHERE id = $1 LIMIT 1`,
        [params.vehicleId]
      );
      if (vRes.rowCount > 0 && Array.isArray(vRes.rows[0]?.photo_urls)) {
        const updated = vRes.rows[0].photo_urls.filter(
          (u: string) => !u.includes(targetPath!)
        );
        await pool.query(
          `UPDATE public.vehicles SET photo_urls = $2, updated_at = now() WHERE id = $1`,
          [params.vehicleId, updated]
        );
      }
    }

    return {
      ok: true,
      success: true,
      message: "Vehicle photo deleted successfully",
      deletedPath: targetPath,
    };
  } else if (purpose === "rideshare_profile" || purpose === "inspection_image" || purpose === "damage_evidence") {
    const targetPath = params.filePath || "";
    if (!targetPath.startsWith(`${auth.userId}/`) && !hasExplicitAdminRole(auth)) {
      throw uploadError("Not authorized to delete this inspection file", 403);
    }
    throw uploadError("Registered private evidence cannot be deleted", 403);
  }

  return {
    ok: true,
    success: true,
    message: "Operation completed",
  };
}

export async function handleGetFileUrl(
  auth: AuthContext,
  params: GetFileUrlRequest
): Promise<GetFileUrlResponse> {
  const purpose = params.purpose;
  const config = PURPOSE_CONFIGS[purpose];

  if (!config) {
    const err = new Error(`Unsupported storage purpose: '${purpose}'`);
    (err as any).statusCode = 400;
    throw err;
  }

  const pool = getDbPool();
  let targetPath = params.filePath;

  if (params.documentId) {
    if (purpose !== "user_document") throw uploadError("documentId is only valid for user documents");
    const docRes = await pool.query(
      `SELECT id, user_id, file_path, deleted_at
         FROM public.user_documents WHERE id = $1 LIMIT 1`,
      [params.documentId],
    );
    if (!docRes.rows[0] || docRes.rows[0].deleted_at) throw uploadError("Document not found", 404);
    const doc = docRes.rows[0];
    if (String(doc.user_id) !== auth.userId && !hasExplicitAdminRole(auth)) {
      throw uploadError("Not authorized to access this document", 403);
    }
    if (hasExplicitAdminRole(auth) && String(doc.user_id) !== auth.userId) {
      await auditAdminOverride(pool, auth, "user_documents", String(doc.id), "signed_url");
    }
    targetPath = doc.file_path;
  }

  if (!targetPath && params.fileUrl) {
    let url: URL;
    try {
      url = new URL(params.fileUrl);
    } catch {
      throw uploadError("Invalid file URL");
    }
    const markers = [
      `/storage/v1/object/public/${config.bucket}/`,
      `/storage/v1/object/sign/${config.bucket}/`,
      `/storage/v1/object/authenticated/${config.bucket}/`,
    ];
    const marker = markers.find((value) => url.pathname.includes(value));
    if (marker) {
      try {
        targetPath = decodeURIComponent(url.pathname.split(marker).slice(1).join(marker));
      } catch {
        throw uploadError("Invalid encoded storage path");
      }
    }
  }

  if (!targetPath) throw uploadError("filePath or documentId is required");
  if (targetPath.startsWith("/") || targetPath.includes("\\") || targetPath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw uploadError("Invalid storage path");
  }
  if (
    purpose === "user_document" &&
    !params.documentId &&
    !targetPath.startsWith(`${auth.userId}/`) &&
    !hasExplicitAdminRole(auth)
  ) {
    throw uploadError("Not authorized to access this file path", 403);
  }

  if (config.isPublic) {
    const admin = supabaseBackendService.getAdminClient();
    const publicUrl = admin.storage
      .from(config.bucket)
      .getPublicUrl(targetPath).data.publicUrl;
    return {
      ok: true,
      success: true,
      url: publicUrl,
      isPublic: true,
    };
  }

  const registered = await pool.query(
    `SELECT id, uploader_id, owner_id, vehicle_id, resource_type, resource_id
       FROM public.storage_upload_reconciliation
      WHERE storage_bucket = $1 AND storage_path = $2 AND state = 'registered'
      LIMIT 1`,
    [config.bucket, targetPath],
  );
  const artifact = registered.rows[0];
  if (purpose === "user_document") {
    const document = await pool.query(
      `SELECT id, user_id, deleted_at
         FROM public.user_documents
        WHERE file_path = $1 AND ($2::uuid IS NULL OR id = $2::uuid)
        LIMIT 1`,
      [targetPath, artifact?.resource_id || params.documentId || null],
    );
    if (!document.rows[0] || document.rows[0].deleted_at) throw uploadError("Document is not available", 404);
    if (String(document.rows[0].user_id) !== auth.userId && !hasExplicitAdminRole(auth)) {
      throw uploadError("Not authorized to access this document", 403);
    }
    if (hasExplicitAdminRole(auth) && String(document.rows[0].user_id) !== auth.userId) {
      await auditAdminOverride(pool, auth, "user_documents", String(document.rows[0].id), "signed_url");
    }
    if (!artifact && !params.documentId) {
      throw uploadError("Private document is not registered or available", 404);
    }
  } else if (!artifact) {
    throw uploadError("Private file is not registered or available", 404);
  } else if (hasExplicitAdminRole(auth)) {
    await auditAdminOverride(pool, auth, "storage_upload_reconciliation", String(artifact.id), "signed_url");
  } else if (String(artifact.uploader_id) !== auth.userId && String(artifact.owner_id || "") !== auth.userId) {
    if (artifact.vehicle_id) {
      await verifyVehicleAuthorization(pool, auth, String(artifact.vehicle_id), `${purpose}_read`);
    } else {
      throw uploadError("Not authorized to access this file path", 403);
    }
  }

  const expiresIn = params.expiresIn ?? config.defaultSignedUrlExpirySeconds;
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_SIGNED_URL_SECONDS) {
    throw uploadError(`expiresIn must be between 1 and ${MAX_SIGNED_URL_SECONDS} seconds`);
  }

  const admin = supabaseBackendService.getAdminClient();
  const { data: signedData, error: signErr } = await admin.storage
    .from(config.bucket)
    .createSignedUrl(targetPath, expiresIn);

  if (signErr || !signedData?.signedUrl) {
    throw uploadError(`Failed to create signed URL: ${signErr?.message || "unknown"}`, 502);
  }

  return {
    ok: true,
    success: true,
    url: signedData.signedUrl,
    isPublic: false,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}
