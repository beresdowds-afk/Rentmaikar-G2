/**
 * RentMaikar Storage Operation Contract
 *
 * Defines the controlled operation set and purpose specifications
 * shared across frontend and backend.
 */

export type StorageOperation = "upload-file" | "delete-file" | "get-file-url";

export type StoragePurpose = "user_document" | "vehicle_photo" | "rideshare_profile";

export interface PurposeConfig {
  bucket: string;
  isPublic: boolean;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  defaultSignedUrlExpirySeconds: number;
}

export const PURPOSE_CONFIGS: Record<StoragePurpose, PurposeConfig> = {
  user_document: {
    bucket: "user-documents",
    isPublic: false,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
    defaultSignedUrlExpirySeconds: 3600, // 1 hour
  },
  vehicle_photo: {
    bucket: "vehicle-photos",
    isPublic: true,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
    defaultSignedUrlExpirySeconds: 86400, // 24 hours (if signed)
  },
  rideshare_profile: {
    bucket: "user-documents",
    isPublic: false,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
    defaultSignedUrlExpirySeconds: 86400, // 24 hours
  },
};

// -------------------------------------------------------------
// Request Interfaces
// -------------------------------------------------------------

export interface UploadFileMetadata {
  purpose: StoragePurpose;
  // Specific to user_document
  documentType?: string;
  documentCategory?: "identification" | "vehicle";
  vehicleId?: string;
  expiresAt?: string;
  // Specific to vehicle_photo
  ownerId?: string;
  draftId?: string;
  isPrimary?: boolean;
  // Specific to rideshare_profile
  driverId?: string;
  weekStartDate?: string;
  platform?: string;
  currentRating?: number;
}

export interface UploadFileRequestParams extends UploadFileMetadata {
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface DeleteFileRequest {
  purpose: StoragePurpose;
  filePath?: string;
  fileUrl?: string;
  documentId?: string;
  vehicleId?: string;
  thumbnailPath?: string;
}

export interface GetFileUrlRequest {
  purpose: StoragePurpose;
  filePath?: string;
  fileUrl?: string;
  documentId?: string;
  expiresIn?: number;
}

// -------------------------------------------------------------
// Response Interfaces
// -------------------------------------------------------------

export interface StorageErrorResponse {
  ok: false;
  success: false;
  error: string;
  code?: string;
  status?: number;
}

export interface UploadFileResponse {
  ok: true;
  success: true;
  purpose: StoragePurpose;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  publicUrl?: string;
  signedUrl?: string;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  documentId?: string;
  submissionId?: string;
}

export interface DeleteFileResponse {
  ok: true;
  success: true;
  message: string;
  deletedPath?: string;
}

export interface GetFileUrlResponse {
  ok: true;
  success: true;
  url: string;
  isPublic: boolean;
  expiresAt?: string;
}
