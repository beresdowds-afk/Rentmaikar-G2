import { supabase } from "@/integrations/supabase/client";
import {
  UploadFileResponse,
  DeleteFileRequest,
  DeleteFileResponse,
  GetFileUrlRequest,
  GetFileUrlResponse,
} from "@/types/storageContract";

export interface UploadUserDocumentOptions {
  file: File | Blob;
  fileName?: string;
  documentType: string;
  category?: "identification" | "vehicle";
  vehicleId?: string;
  expiresAt?: string;
}

export interface UploadVehiclePhotoOptions {
  file: File | Blob;
  fileName?: string;
  thumbnailFile?: File | Blob;
  draftId?: string;
  vehicleId?: string;
  isPrimary?: boolean;
}

export interface UploadRideshareProfileOptions {
  file: File | Blob;
  fileName?: string;
  weekStartDate: string;
  vehicleId?: string;
  platform?: string;
  currentRating?: number;
}

/**
 * Uploads a user identification or vehicle document through the authoritative backend.
 */
export async function uploadUserDocument(
  options: UploadUserDocumentOptions
): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append(
    "file",
    options.file,
    options.fileName || (options.file instanceof File ? options.file.name : "document.pdf")
  );
  formData.append("purpose", "user_document");
  formData.append("documentType", options.documentType);
  formData.append("documentCategory", options.category || "identification");
  if (options.vehicleId) formData.append("vehicleId", options.vehicleId);
  if (options.expiresAt) formData.append("expiresAt", options.expiresAt);

  const { data, error } = await supabase.functions.invoke("upload-file", {
    body: formData,
  });

  if (error) {
    throw error;
  }
  return data as UploadFileResponse;
}

/**
 * Uploads a vehicle photo and optional thumbnail through the authoritative backend.
 */
export async function uploadVehiclePhoto(
  options: UploadVehiclePhotoOptions
): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append(
    "file",
    options.file,
    options.fileName || (options.file instanceof File ? options.file.name : "photo.jpg")
  );
  if (options.thumbnailFile) {
    formData.append("thumbnail", options.thumbnailFile, "thumb.jpg");
  }
  formData.append("purpose", "vehicle_photo");
  if (options.draftId) formData.append("draftId", options.draftId);
  if (options.vehicleId) formData.append("vehicleId", options.vehicleId);
  if (options.isPrimary) formData.append("isPrimary", "true");

  const { data, error } = await supabase.functions.invoke("upload-file", {
    body: formData,
  });

  if (error) {
    throw error;
  }
  return data as UploadFileResponse;
}

/**
 * Uploads a driver rideshare profile screenshot through the authoritative backend.
 */
export async function uploadRideshareProfile(
  options: UploadRideshareProfileOptions
): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append(
    "file",
    options.file,
    options.fileName || (options.file instanceof File ? options.file.name : "rideshare-profile.jpg")
  );
  formData.append("purpose", "rideshare_profile");
  formData.append("weekStartDate", options.weekStartDate);
  if (options.vehicleId) formData.append("vehicleId", options.vehicleId);
  if (options.platform) formData.append("platform", options.platform);
  if (options.currentRating !== undefined && !isNaN(options.currentRating)) {
    formData.append("currentRating", String(options.currentRating));
  }

  const { data, error } = await supabase.functions.invoke("upload-file", {
    body: formData,
  });

  if (error) {
    throw error;
  }
  return data as UploadFileResponse;
}

/**
 * Deletes an uploaded file through the authoritative backend.
 */
export async function deleteUploadedFile(
  params: DeleteFileRequest
): Promise<DeleteFileResponse> {
  const { data, error } = await supabase.functions.invoke("delete-file", {
    body: params,
  });

  if (error) {
    throw error;
  }
  return data as DeleteFileResponse;
}

/**
 * Generates or retrieves an authorized file URL (public or signed) through the backend.
 */
export async function getUploadedFileUrl(
  params: GetFileUrlRequest
): Promise<GetFileUrlResponse> {
  const { data, error } = await supabase.functions.invoke("get-file-url", {
    body: params,
  });

  if (error) {
    throw error;
  }
  return data as GetFileUrlResponse;
}
