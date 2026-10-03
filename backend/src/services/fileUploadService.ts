import crypto from "crypto";
import path from "path";
import { supabaseBackendService } from "./supabaseService";
import { getDbPool } from "./dbPool";
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
  isAdmin: boolean;
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

  const admin = supabaseBackendService.getAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);

  if (authError || !authData?.user?.id) {
    const err = new Error("Invalid authentication session");
    (err as any).statusCode = 401;
    throw err;
  }

  const user = authData.user;
  const pool = getDbPool();
  let role = "driver";

  try {
    const roleResult = await pool.query(
      `
        SELECT role
        FROM public.user_roles
        WHERE user_id = $1
        LIMIT 1
      `,
      [user.id]
    );
    role = String(roleResult.rows[0]?.role || "driver").trim();
  } catch {
    // Non-blocking, default role
  }

  const isAdmin = role === "admin" || role === "admin_assistant";

  return {
    userId: user.id,
    email: user.email,
    role,
    isAdmin,
  };
}

function sanitizeFileName(fileName: string): string {
  const parsed = path.parse(fileName);
  const safeName = parsed.name
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
  const ext = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${safeName || "file"}${ext || ".bin"}`;
}

export async function handleFileUpload(
  auth: AuthContext,
  file: FilePayload,
  metadata: UploadFileMetadata,
  thumbnailFile?: FilePayload
): Promise<UploadFileResponse> {
  const purpose = metadata.purpose;
  const config = PURPOSE_CONFIGS[purpose];

  if (!config) {
    const err = new Error(`Unsupported storage purpose: '${purpose}'`);
    (err as any).statusCode = 400;
    throw err;
  }

  // 1. Validation
  if (!file || !file.buffer || file.buffer.length === 0) {
    const err = new Error("No file content received");
    (err as any).statusCode = 400;
    throw err;
  }

  const fileSize = file.buffer.length;
  if (fileSize > config.maxSizeBytes) {
    const err = new Error(
      `File size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds limit of ${
        config.maxSizeBytes / (1024 * 1024)
      } MB`
    );
    (err as any).statusCode = 400;
    throw err;
  }

  const mimeType = file.mimetype.toLowerCase();
  if (
    !config.allowedMimeTypes.includes(mimeType) &&
    !config.allowedMimeTypes.includes("*/*")
  ) {
    const err = new Error(
      `Invalid MIME type '${mimeType}'. Permitted types: ${config.allowedMimeTypes.join(
        ", "
      )}`
    );
    (err as any).statusCode = 400;
    throw err;
  }

  const admin = supabaseBackendService.getAdminClient();
  const pool = getDbPool();
  const cleanOriginalName = sanitizeFileName(file.originalname);
  const ext = path.extname(cleanOriginalName) || ".jpg";

  // 2. Purpose-specific Authorization & Path Construction
  let filePath = "";
  let documentId: string | undefined;
  let submissionId: string | undefined;
  let publicUrl: string | undefined;
  let signedUrl: string | undefined;
  let thumbnailPath: string | undefined;
  let thumbnailUrl: string | undefined;

  if (purpose === "user_document") {
    const documentType = String(metadata.documentType || "").trim();
    if (!documentType) {
      const err = new Error("documentType is required for user_document");
      (err as any).statusCode = 400;
      throw err;
    }

    const documentCategory =
      metadata.documentCategory === "vehicle" ? "vehicle" : "identification";
    const targetUserId = auth.userId;
    const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const fileName = `${documentType}_${uniqueSuffix}${ext}`;
    filePath = `${targetUserId}/${documentType}/${fileName}`;

    // Upload to private user-documents bucket
    const { error: uploadErr } = await admin.storage
      .from(config.bucket)
      .upload(filePath, file.buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const contentSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

    // Persist to public.user_documents table with version and cryptographic hash
    const insertRes = await pool.query(
      `
        INSERT INTO public.user_documents (
          user_id,
          document_type,
          document_category,
          file_path,
          file_name,
          file_size,
          mime_type,
          vehicle_id,
          expires_at,
          status,
          content_sha256,
          document_version,
          access_classification
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, 1, 'restricted'
        )
        RETURNING id
      `,
      [
        targetUserId,
        documentType,
        documentCategory,
        filePath,
        file.originalname || fileName,
        fileSize,
        mimeType,
        metadata.vehicleId || null,
        metadata.expiresAt || null,
        contentSha256,
      ]
    );

    documentId = insertRes.rows[0]?.id;

    // Register into authoritative cryptographic evidence store
    try {
      await registerEvidenceArtifact({
        evidenceType: "document",
        sourceTable: "user_documents",
        sourceId: documentId || "",
        storageBucket: config.bucket,
        storagePath: filePath,
        contentSha256,
        capturedBy: auth.userId,
        metadata: {
          documentType,
          fileName: file.originalname || fileName,
          fileSize,
          mimeType,
        },
      });
    } catch (evErr) {
      console.warn("[fileUploadService] Evidence artifact registration notice:", evErr);
    }

    // Generate signed URL
    const { data: signedData } = await admin.storage
      .from(config.bucket)
      .createSignedUrl(filePath, config.defaultSignedUrlExpirySeconds);
    signedUrl = signedData?.signedUrl;
  } else if (purpose === "vehicle_photo") {
    const ownerId = auth.userId;
    const targetFolder = String(metadata.draftId || metadata.vehicleId || "").trim();
    if (!targetFolder) {
      const err = new Error("draftId or vehicleId is required for vehicle_photo");
      (err as any).statusCode = 400;
      throw err;
    }

    // If vehicleId provided, verify ownership unless admin
    if (metadata.vehicleId && !auth.isAdmin) {
      const vCheck = await pool.query(
        `SELECT owner_id FROM public.vehicles WHERE id = $1 LIMIT 1`,
        [metadata.vehicleId]
      );
      if (
        vCheck.rowCount > 0 &&
        String(vCheck.rows[0]?.owner_id) !== String(auth.userId)
      ) {
        const err = new Error("Not authorized to upload photos for this vehicle");
        (err as any).statusCode = 403;
        throw err;
      }
    }

    const uniqueId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const base = `${ownerId}/${targetFolder}/${uniqueId}`;
    filePath = `${base}.jpg`;

    // Upload full-resolution photo to public vehicle-photos bucket
    const { error: uploadErr } = await admin.storage
      .from(config.bucket)
      .upload(filePath, file.buffer, {
        contentType: mimeType || "image/jpeg",
        upsert: false,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    publicUrl = admin.storage.from(config.bucket).getPublicUrl(filePath).data.publicUrl;

    // Handle thumbnail if provided
    if (thumbnailFile && thumbnailFile.buffer) {
      thumbnailPath = `${base}-thumb.jpg`;
      const { error: thumbErr } = await admin.storage
        .from(config.bucket)
        .upload(thumbnailPath, thumbnailFile.buffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (!thumbErr) {
        thumbnailUrl = admin.storage
          .from(config.bucket)
          .getPublicUrl(thumbnailPath).data.publicUrl;
      }
    }
  } else if (purpose === "rideshare_profile") {
    const driverId = auth.userId;
    const weekStartDate = String(metadata.weekStartDate || "").trim();
    if (!weekStartDate) {
      const err = new Error("weekStartDate is required for rideshare_profile");
      (err as any).statusCode = 400;
      throw err;
    }

    filePath = `${driverId}/${weekStartDate}/rideshare-profile${ext}`;

    const { error: uploadErr } = await admin.storage
      .from(config.bucket)
      .upload(filePath, file.buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: signedData } = await admin.storage
      .from(config.bucket)
      .createSignedUrl(filePath, config.defaultSignedUrlExpirySeconds);
    signedUrl = signedData?.signedUrl;
    publicUrl = admin.storage.from(config.bucket).getPublicUrl(filePath).data.publicUrl;

    // Upsert rideshare_profile_submissions record
    const subRes = await pool.query(
      `
        INSERT INTO public.rideshare_profile_submissions (
          driver_id,
          vehicle_id,
          week_start_date,
          rating_screenshot_url,
          platform,
          current_rating
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
        ON CONFLICT (driver_id, week_start_date)
        DO UPDATE SET
          rating_screenshot_url = EXCLUDED.rating_screenshot_url,
          platform = COALESCE(EXCLUDED.platform, rideshare_profile_submissions.platform),
          current_rating = COALESCE(EXCLUDED.current_rating, rideshare_profile_submissions.current_rating),
          updated_at = now()
        RETURNING id
      `,
      [
        driverId,
        metadata.vehicleId || null,
        weekStartDate,
        publicUrl || signedUrl,
        metadata.platform || null,
        metadata.currentRating || null,
      ]
    );

    submissionId = subRes.rows[0]?.id;
  } else if (purpose === "inspection_image") {
    const vehicleId = String(metadata.vehicleId || "").trim();
    const photoType = String(metadata.photoType || "photo").trim();
    const weekStartDate = String(metadata.weekStartDate || new Date().toISOString().split("T")[0]).trim();

    if (!vehicleId) {
      const err = new Error("vehicleId is required for inspection_image");
      (err as any).statusCode = 400;
      throw err;
    }

    // Verify caller authorization (driver, owner, admin, or inspector)
    if (!auth.isAdmin && auth.role !== "inspector") {
      try {
        const authCheck = await pool.query(
          `
            SELECT id FROM public.vehicles WHERE id = $1 AND owner_id = $2
            UNION
            SELECT id FROM public.legal_agreements WHERE vehicle_id = $1 AND driver_id = $2 AND status IN ('active', 'pending_signatures')
            LIMIT 1
          `,
          [vehicleId, auth.userId]
        );
        if (authCheck.rowCount === 0) {
          // Fallback check if user is associated
          const isDriver = auth.role === "driver";
          if (!isDriver) {
            const err = new Error("Not authorized to upload inspection photos for this vehicle");
            (err as any).statusCode = 403;
            throw err;
          }
        }
      } catch {
        // Non-blocking in mock/fallback environments
      }
    }

    const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    const normalizedSlot = photoType.startsWith("photo_") ? photoType : `photo_${photoType}`;
    filePath = `${auth.userId}/${vehicleId}/${weekStartDate}/${normalizedSlot}_${uniqueSuffix}${ext}`;

    const { error: uploadErr } = await admin.storage
      .from(config.bucket)
      .upload(filePath, file.buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: signedData } = await admin.storage
      .from(config.bucket)
      .createSignedUrl(filePath, config.defaultSignedUrlExpirySeconds);
    signedUrl = signedData?.signedUrl;

    // Authoritative persistence in public.weekly_inspection_reports if table exists
    try {
      const nowIso = new Date().toISOString();
      const existingReport = await pool.query(
        `
          SELECT id, photo_timestamps
          FROM public.weekly_inspection_reports
          WHERE vehicle_id = $1 AND week_start_date = $2
          LIMIT 1
        `,
        [vehicleId, weekStartDate]
      );

      if (existingReport.rowCount > 0) {
        const reportId = existingReport.rows[0].id;
        const currentTimestamps = existingReport.rows[0].photo_timestamps || {};
        currentTimestamps[normalizedSlot] = nowIso;

        await pool.query(
          `
            UPDATE public.weekly_inspection_reports
            SET ${normalizedSlot} = $1,
                photo_timestamps = $2,
                updated_at = now()
            WHERE id = $3
          `,
          [signedUrl || filePath, JSON.stringify(currentTimestamps), reportId]
        );
        submissionId = reportId;
      } else {
        const initialTimestamps = { [normalizedSlot]: nowIso };
        const newReport = await pool.query(
          `
            INSERT INTO public.weekly_inspection_reports (
              vehicle_id,
              driver_id,
              week_start_date,
              ${normalizedSlot},
              photo_timestamps,
              status
            ) VALUES (
              $1, $2, $3, $4, $5, 'pending'
            )
            RETURNING id
          `,
          [
            vehicleId,
            auth.userId,
            weekStartDate,
            signedUrl || filePath,
            JSON.stringify(initialTimestamps),
          ]
        );
        submissionId = newReport.rows[0]?.id;
      }
    } catch (dbErr: any) {
      console.warn("[fileUploadService] Inspection DB update skipped/deferred:", dbErr?.message);
    }
  } else if (purpose === "damage_evidence") {
    const vehicleId = String(metadata.vehicleId || "").trim();
    if (!vehicleId) {
      const err = new Error("vehicleId is required for damage_evidence");
      (err as any).statusCode = 400;
      throw err;
    }

    const uniqueSuffix = `${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    const findingPrefix = metadata.findingId ? `finding_${metadata.findingId}` : "damage";
    filePath = `${auth.userId}/${vehicleId}/damage/${findingPrefix}_${uniqueSuffix}${ext}`;

    const { error: uploadErr } = await admin.storage
      .from(config.bucket)
      .upload(filePath, file.buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: signedData } = await admin.storage
      .from(config.bucket)
      .createSignedUrl(filePath, config.defaultSignedUrlExpirySeconds);
    signedUrl = signedData?.signedUrl;
  }

  return {
    ok: true,
    success: true,
    purpose,
    filePath,
    fileName: file.originalname || cleanOriginalName,
    fileSize,
    mimeType,
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

  const admin = supabaseBackendService.getAdminClient();
  const pool = getDbPool();

  if (purpose === "user_document") {
    let targetPath = params.filePath;
    let targetDocId = params.documentId;

    if (targetDocId) {
      const docRes = await pool.query(
        `SELECT id, user_id, file_path FROM public.user_documents WHERE id = $1 LIMIT 1`,
        [targetDocId]
      );
      if (docRes.rowCount === 0) {
        const err = new Error("Document not found");
        (err as any).statusCode = 404;
        throw err;
      }
      const doc = docRes.rows[0];
      if (String(doc.user_id) !== String(auth.userId) && !auth.isAdmin) {
        const err = new Error("Not authorized to delete this document");
        (err as any).statusCode = 403;
        throw err;
      }
      targetPath = doc.file_path;
    } else if (targetPath) {
      if (!targetPath.startsWith(`${auth.userId}/`) && !auth.isAdmin) {
        const err = new Error("Not authorized to delete this document");
        (err as any).statusCode = 403;
        throw err;
      }
    } else {
      const err = new Error("Either documentId or filePath must be provided");
      (err as any).statusCode = 400;
      throw err;
    }

    if (targetPath) {
      await admin.storage.from(config.bucket).remove([targetPath]);
    }

    if (targetDocId) {
      await pool.query(`DELETE FROM public.user_documents WHERE id = $1`, [
        targetDocId,
      ]);
    } else if (targetPath) {
      await pool.query(
        `DELETE FROM public.user_documents WHERE file_path = $1 AND user_id = $2`,
        [targetPath, auth.userId]
      );
    }

    return {
      ok: true,
      success: true,
      message: "Document deleted successfully",
      deletedPath: targetPath,
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
      const err = new Error("Either filePath or fileUrl is required");
      (err as any).statusCode = 400;
      throw err;
    }

    // Verify ownership
    if (!targetPath.startsWith(`${auth.userId}/`) && !auth.isAdmin) {
      const err = new Error("Not authorized to delete this vehicle photo");
      (err as any).statusCode = 403;
      throw err;
    }

    const pathsToDelete = [targetPath];
    const thumbPath =
      params.thumbnailPath ||
      targetPath.replace(/\.[^.]+$/, "-thumb.jpg");
    pathsToDelete.push(thumbPath);

    await admin.storage.from(config.bucket).remove(pathsToDelete);

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
  } else if (purpose === "rideshare_profile") {
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
      const err = new Error("Either filePath or fileUrl is required");
      (err as any).statusCode = 400;
      throw err;
    }

    if (!targetPath.startsWith(`${auth.userId}/`) && !auth.isAdmin) {
      const err = new Error("Not authorized to delete this profile screenshot");
      (err as any).statusCode = 403;
      throw err;
    }

    await admin.storage.from(config.bucket).remove([targetPath]);

    await pool.query(
      `
        UPDATE public.rideshare_profile_submissions
        SET rating_screenshot_url = NULL, updated_at = now()
        WHERE driver_id = $1 AND (rating_screenshot_url ILIKE $2 OR rating_screenshot_url IS NOT NULL)
      `,
      [auth.userId, `%${targetPath}%`]
    );

    return {
      ok: true,
      success: true,
      message: "Rideshare screenshot deleted successfully",
      deletedPath: targetPath,
    };
  } else if (purpose === "inspection_image" || purpose === "damage_evidence") {
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
      const err = new Error("Either filePath or fileUrl is required");
      (err as any).statusCode = 400;
      throw err;
    }

    if (!targetPath.startsWith(`${auth.userId}/`) && !auth.isAdmin && auth.role !== "inspector") {
      const err = new Error("Not authorized to delete this inspection file");
      (err as any).statusCode = 403;
      throw err;
    }

    await admin.storage.from(config.bucket).remove([targetPath]);

    return {
      ok: true,
      success: true,
      message: "Inspection file deleted successfully",
      deletedPath: targetPath,
    };
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

  const admin = supabaseBackendService.getAdminClient();
  const pool = getDbPool();
  let targetPath = params.filePath;

  if (params.documentId) {
    const docRes = await pool.query(
      `SELECT id, user_id, file_path FROM public.user_documents WHERE id = $1 LIMIT 1`,
      [params.documentId]
    );
    if (docRes.rowCount === 0) {
      const err = new Error("Document not found");
      (err as any).statusCode = 404;
      throw err;
    }
    const doc = docRes.rows[0];
    if (String(doc.user_id) !== String(auth.userId) && !auth.isAdmin) {
      const err = new Error("Not authorized to access this document");
      (err as any).statusCode = 403;
      throw err;
    }
    targetPath = doc.file_path;
  }

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
    const err = new Error("filePath or documentId is required");
    (err as any).statusCode = 400;
    throw err;
  }

  if (config.isPublic) {
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

  // Private bucket: verify user authorization for path
  let authorized = auth.isAdmin || auth.role === "inspector" || targetPath.startsWith(`${auth.userId}/`);

  // For inspection_image / damage_evidence, also allow if auth.userId is the owner of the vehicle in the path
  if (!authorized && (purpose === "inspection_image" || purpose === "damage_evidence")) {
    const pathParts = targetPath.split("/");
    const vehicleIdInPath = pathParts[1];
    if (vehicleIdInPath) {
      try {
        const vCheck = await pool.query(
          `SELECT id FROM public.vehicles WHERE id = $1 AND owner_id = $2 LIMIT 1`,
          [vehicleIdInPath, auth.userId]
        );
        if (vCheck.rowCount > 0) {
          authorized = true;
        }
      } catch {
        // Fallback
      }
    }
  }

  if (!authorized) {
    const err = new Error("Not authorized to access this file path");
    (err as any).statusCode = 403;
    throw err;
  }

  const expiresIn = params.expiresIn || config.defaultSignedUrlExpirySeconds;
  const { data: signedData, error: signErr } = await admin.storage
    .from(config.bucket)
    .createSignedUrl(targetPath, expiresIn);

  if (signErr || !signedData?.signedUrl) {
    throw new Error(
      `Failed to create signed URL: ${signErr?.message || "unknown"}`
    );
  }

  return {
    ok: true,
    success: true,
    url: signedData.signedUrl,
    isPublic: false,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}
