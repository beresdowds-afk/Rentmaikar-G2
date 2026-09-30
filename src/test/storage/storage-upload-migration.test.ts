import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PURPOSE_CONFIGS,
  StoragePurpose,
} from "../../types/storageContract";
import * as fileUploadApi from "../../lib/file-upload-api";
import * as fileUploadService from "../../../backend/src/services/fileUploadService";
import fs from "fs";
import path from "path";

describe("RentMaikar Storage Operation & File Upload Migration Test Suite", () => {
  describe("1. Contract Specifications & Limits", () => {
    it("defines strict purpose configs for user_document, vehicle_photo, and rideshare_profile", () => {
      expect(PURPOSE_CONFIGS.user_document).toBeDefined();
      expect(PURPOSE_CONFIGS.vehicle_photo).toBeDefined();
      expect(PURPOSE_CONFIGS.rideshare_profile).toBeDefined();

      // user_document rules
      expect(PURPOSE_CONFIGS.user_document.bucket).toBe("user-documents");
      expect(PURPOSE_CONFIGS.user_document.isPublic).toBe(false);
      expect(PURPOSE_CONFIGS.user_document.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(PURPOSE_CONFIGS.user_document.allowedMimeTypes).toContain("application/pdf");
      expect(PURPOSE_CONFIGS.user_document.allowedMimeTypes).toContain("image/jpeg");

      // vehicle_photo rules
      expect(PURPOSE_CONFIGS.vehicle_photo.bucket).toBe("vehicle-photos");
      expect(PURPOSE_CONFIGS.vehicle_photo.isPublic).toBe(true);
      expect(PURPOSE_CONFIGS.vehicle_photo.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(PURPOSE_CONFIGS.vehicle_photo.allowedMimeTypes).not.toContain("application/pdf");

      // rideshare_profile rules
      expect(PURPOSE_CONFIGS.rideshare_profile.bucket).toBe("user-documents");
      expect(PURPOSE_CONFIGS.rideshare_profile.maxSizeBytes).toBe(5 * 1024 * 1024);
    });
  });

  describe("2. Server-side fileUploadService Validation & Security", () => {
    it("rejects unsupported storage purposes", async () => {
      const auth = { userId: "user-123", role: "driver", isAdmin: false };
      const file = {
        buffer: Buffer.from("test"),
        originalname: "test.jpg",
        mimetype: "image/jpeg",
        size: 4,
      };

      await expect(
        fileUploadService.handleFileUpload(auth, file, { purpose: "unsupported" as any })
      ).rejects.toThrow(/Unsupported storage purpose/i);
    });

    it("rejects files exceeding maximum size limits", async () => {
      const auth = { userId: "user-123", role: "driver", isAdmin: false };
      const oversizeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const file = {
        buffer: oversizeBuffer,
        originalname: "big.pdf",
        mimetype: "application/pdf",
        size: oversizeBuffer.length,
      };

      await expect(
        fileUploadService.handleFileUpload(auth, file, {
          purpose: "user_document",
          documentType: "driver_license",
        })
      ).rejects.toThrow(/exceeds limit/i);
    });

    it("rejects disallowed MIME types for vehicle photos (e.g. PDF)", async () => {
      const auth = { userId: "user-123", role: "owner", isAdmin: false };
      const file = {
        buffer: Buffer.from("pdf-content"),
        originalname: "doc.pdf",
        mimetype: "application/pdf",
        size: 11,
      };

      await expect(
        fileUploadService.handleFileUpload(auth, file, {
          purpose: "vehicle_photo",
          draftId: "draft-1",
        })
      ).rejects.toThrow(/Invalid MIME type/i);
    });

    it("requires documentType for user_document uploads", async () => {
      const auth = { userId: "user-123", role: "driver", isAdmin: false };
      const file = {
        buffer: Buffer.from("image"),
        originalname: "photo.jpg",
        mimetype: "image/jpeg",
        size: 5,
      };

      await expect(
        fileUploadService.handleFileUpload(auth, file, {
          purpose: "user_document",
        })
      ).rejects.toThrow(/documentType is required/i);
    });
  });

  describe("3. Frontend file-upload-api Contract & Functionality", () => {
    it("exports all authoritative upload functions", () => {
      expect(typeof fileUploadApi.uploadUserDocument).toBe("function");
      expect(typeof fileUploadApi.uploadVehiclePhoto).toBe("function");
      expect(typeof fileUploadApi.uploadRideshareProfile).toBe("function");
      expect(typeof fileUploadApi.deleteUploadedFile).toBe("function");
      expect(typeof fileUploadApi.getUploadedFileUrl).toBe("function");
    });
  });

  describe("4. Catch-all Gateway & Interceptor Registration", () => {
    it("registers upload-file, delete-file, and get-file-url in client LOCAL_GATEWAY_FUNCTIONS", () => {
      const clientPath = path.resolve(process.cwd(), "src/integrations/supabase/client.ts");
      const clientContent = fs.readFileSync(clientPath, "utf8");

      expect(clientContent).toContain('"upload-file"');
      expect(clientContent).toContain('"delete-file"');
      expect(clientContent).toContain('"get-file-url"');
      expect(clientContent).toContain("isFormData");
    });

    it("registers upload-file, delete-file, and get-file-url in backend AUTHORITATIVE_BACKEND_FUNCTIONS", () => {
      const functionsPath = path.resolve(process.cwd(), "backend/src/routes/functions.ts");
      const functionsContent = fs.readFileSync(functionsPath, "utf8");

      expect(functionsContent).toContain('"upload-file"');
      expect(functionsContent).toContain('"delete-file"');
      expect(functionsContent).toContain('"get-file-url"');
      expect(functionsContent).toContain("case \"upload-file\":");
      expect(functionsContent).toContain("case \"delete-file\":");
      expect(functionsContent).toContain("case \"get-file-url\":");
    });
  });

  describe("5. Authorization Boundaries & Security Policies", () => {
    it("rejects unauthorized access when non-admin accesses another user's document path", async () => {
      const auth = { userId: "user-1", role: "driver", isAdmin: false };
      await expect(
        fileUploadService.handleGetFileUrl(auth, {
          purpose: "user_document",
          filePath: "user-2/driver_license/license.pdf",
        })
      ).rejects.toThrow(/Not authorized to access this file path/i);
    });

    it("rejects unauthorized deletion when non-admin deletes another user's vehicle photo", async () => {
      const auth = { userId: "owner-1", role: "owner", isAdmin: false };
      await expect(
        fileUploadService.handleDeleteFile(auth, {
          purpose: "vehicle_photo",
          filePath: "owner-2/vehicle-99/photo.jpg",
        })
      ).rejects.toThrow(/Not authorized to delete this vehicle photo/i);
    });

    it("rejects unauthenticated caller without token in authenticateCaller", async () => {
      await expect(fileUploadService.authenticateCaller(undefined)).rejects.toThrow(
        /Authentication required/i
      );
    });
  });

  describe("6. Upload Surfaces Migration Verification (Surfaces 8A - 8E)", () => {
    it("8A: DocumentUpload.tsx imports and uses file-upload-api", () => {
      const filePath = path.resolve(process.cwd(), "src/components/documents/DocumentUpload.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("@/lib/file-upload-api");
      expect(content).toContain("uploadUserDocument");
      expect(content).toContain("deleteUploadedFile");
      expect(content).toContain("getUploadedFileUrl");
      expect(content).not.toContain("supabase.storage\n        .from('user-documents')\n        .upload");
    });

    it("8B: RideshareProfileUpload.tsx imports and uses file-upload-api", () => {
      const filePath = path.resolve(process.cwd(), "src/components/driver/RideshareProfileUpload.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("@/lib/file-upload-api");
      expect(content).toContain("uploadRideshareProfile");
      expect(content).toContain("deleteUploadedFile");
      expect(content).not.toContain("supabase.storage\n        .from('user-documents')\n        .upload");
    });

    it("8C: VehiclePhotoUploader.tsx imports and uses file-upload-api", () => {
      const filePath = path.resolve(process.cwd(), "src/components/owner/VehiclePhotoUploader.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("@/lib/file-upload-api");
      expect(content).toContain("uploadVehiclePhoto");
      expect(content).not.toContain("supabase.storage\n            .from(BUCKET)\n            .upload");
    });

    it("8D: VehiclePhotoManager.tsx imports and uses file-upload-api", () => {
      const filePath = path.resolve(process.cwd(), "src/components/owner/VehiclePhotoManager.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("@/lib/file-upload-api");
      expect(content).toContain("uploadVehiclePhoto");
      expect(content).toContain("deleteUploadedFile");
      expect(content).not.toContain("supabase.storage\n            .from(BUCKET)\n            .upload");
    });

    it("8E: PersonaVerification.tsx imports and uses file-upload-api", () => {
      const filePath = path.resolve(process.cwd(), "src/components/verification/PersonaVerification.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("@/lib/file-upload-api");
      expect(content).toContain("uploadUserDocument");
      expect(content).not.toContain("supabase.storage\n                      .from(\"user-documents\")\n                      .upload");
    });
  });
});
