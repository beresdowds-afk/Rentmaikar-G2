import { useCallback, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { prepareImageForUpload, createThumbnail, validateImageFile } from "@/lib/image-compression";

const BUCKET = "vehicle-photos";
const THUMB_SUFFIX = "-thumb.jpg";
const MAX_MB = 10;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 12;

export type PhotoItemStatus = "queued" | "validating" | "uploading" | "done" | "error";

export interface PhotoItem {
  id: string;
  file: File;
  preview: string;
  status: PhotoItemStatus;
  progress: number;
  error?: string;
  url?: string;
}

export interface VehiclePhotoUploaderHandle {
  /** Uploads everything that is not already uploaded. Resolves with the public URLs. */
  uploadAll: () => Promise<string[]>;
  hasPending: () => boolean;
  urls: () => string[];
}

interface Props {
  ownerId: string;
  /** Folder segment under the owner id — a draft id before the vehicle exists. */
  draftId: string;
  disabled?: boolean;
  onStateChange?: (state: { items: PhotoItem[]; uploading: boolean }) => void;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Photo picker with per-file validation, live progress and per-file retry.
 * Files are uploaded to storage before the vehicle row is saved, so a listing
 * is never created with half-uploaded imagery.
 */
export const VehiclePhotoUploader = forwardRef<VehiclePhotoUploaderHandle, Props>(
  ({ ownerId, draftId, disabled, onStateChange }, ref) => {
    const [items, setItems] = useState<PhotoItem[]>([]);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const itemsRef = useRef<PhotoItem[]>([]);

    const sync = (next: PhotoItem[]) => {
      itemsRef.current = next;
      setItems(next);
      onStateChange?.({ items: next, uploading });
    };

    const patch = (id: string, changes: Partial<PhotoItem>) => {
      const next = itemsRef.current.map((it) => (it.id === id ? { ...it, ...changes } : it));
      sync(next);
    };

    const addFiles = async (files: FileList | null) => {
      if (!files?.length) return;
      const room = MAX_PHOTOS - itemsRef.current.length;
      const picked = Array.from(files).slice(0, Math.max(room, 0));
      if (picked.length === 0) return;

      const staged: PhotoItem[] = picked.map((file) => ({
        id: newId(),
        file,
        preview: URL.createObjectURL(file),
        status: "validating",
        progress: 0,
      }));
      sync([...itemsRef.current, ...staged]);

      for (const item of staged) {
        const check = await validateImageFile(item.file, { maxSizeMB: MAX_MB, accepted: ACCEPTED });
        patch(item.id, check.ok
          ? { status: "queued" }
          : { status: "error", error: check.error ?? "Unsupported image" });
      }
      if (inputRef.current) inputRef.current.value = "";
    };

    const uploadOne = useCallback(
      async (item: PhotoItem): Promise<string | null> => {
        patch(item.id, { status: "uploading", progress: 10, error: undefined });
        try {
          const optimised = await prepareImageForUpload(item.file, { maxSizeMB: 2, maxWidthOrHeight: 1920 });
          patch(item.id, { progress: 45 });

          const base = `${ownerId}/${draftId}/${newId()}`;
          const path = `${base}.jpg`;
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(path, optimised, { contentType: optimised.type || "image/jpeg", upsert: false });
          if (error) throw error;
          patch(item.id, { progress: 80 });

          const thumb = await createThumbnail(item.file);
          if (thumb) {
            await supabase.storage
              .from(BUCKET)
              .upload(`${base}${THUMB_SUFFIX}`, thumb, { contentType: "image/jpeg", upsert: true });
          }

          const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          patch(item.id, { status: "done", progress: 100, url });
          return url;
        } catch (err: any) {
          patch(item.id, {
            status: "error",
            progress: 0,
            error: err?.message ?? "Upload failed — tap retry",
          });
          return null;
        }
      },
      [ownerId, draftId],
    );

    const uploadAll = useCallback(async () => {
      const pending = itemsRef.current.filter((i) => i.status === "queued" || i.status === "error");
      if (pending.length === 0) {
        return itemsRef.current.filter((i) => i.url).map((i) => i.url!) as string[];
      }
      setUploading(true);
      try {
        for (const item of pending) {
          // Sequential so slow mobile connections stay predictable.
          // eslint-disable-next-line no-await-in-loop
          await uploadOne(item);
        }
      } finally {
        setUploading(false);
      }
      const failed = itemsRef.current.filter((i) => i.status === "error");
      if (failed.length) {
        throw new Error(`${failed.length} photo${failed.length > 1 ? "s" : ""} failed to upload. Retry them and try again.`);
      }
      return itemsRef.current.filter((i) => i.url).map((i) => i.url!) as string[];
    }, [uploadOne]);

    useImperativeHandle(ref, () => ({
      uploadAll,
      hasPending: () => itemsRef.current.some((i) => i.status !== "done"),
      urls: () => itemsRef.current.filter((i) => i.url).map((i) => i.url!) as string[],
    }));

    const remove = (id: string) => {
      const target = itemsRef.current.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      sync(itemsRef.current.filter((i) => i.id !== id));
    };

    const doneCount = items.filter((i) => i.status === "done").length;
    const errorCount = items.filter((i) => i.status === "error").length;
    const overall = items.length ? Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length) : 0;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Vehicle photos {items.length > 0 && <span className="text-muted-foreground">({items.length}/{MAX_PHOTOS})</span>}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading || items.length >= MAX_PHOTOS}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="w-4 h-4 mr-2" />
            Add photos
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <p className="text-xs text-muted-foreground">
          JPEG, PNG or WEBP up to {MAX_MB}MB each. Photos upload before the vehicle is saved.
        </p>

        {items.length > 0 && (
          <>
            {uploading && (
              <div className="space-y-1">
                <Progress value={overall} />
                <p className="text-xs text-muted-foreground">
                  Uploading… {doneCount}/{items.length} complete
                </p>
              </div>
            )}

            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                  <img
                    src={item.preview}
                    alt={`Selected vehicle photo ${item.file.name}`}
                    className="w-12 h-12 rounded object-cover border border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{item.file.name}</p>
                    {item.status === "error" ? (
                      <p className="text-xs text-destructive">{item.error}</p>
                    ) : item.status === "done" ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Uploaded
                      </p>
                    ) : item.status === "uploading" ? (
                      <Progress value={item.progress} className="h-1.5 mt-1" />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {item.status === "validating" ? "Checking…" : "Ready to upload"}
                      </p>
                    )}
                  </div>
                  {item.status === "error" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => uploadOne(item)}
                      disabled={uploading}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Retry
                    </Button>
                  )}
                  {item.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {item.status !== "uploading" && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => remove(item.id)} aria-label="Remove photo">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {errorCount > 0 && !uploading && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {errorCount} photo{errorCount > 1 ? "s" : ""} could not be uploaded. Retry or remove them before saving.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
    );
  },
);

VehiclePhotoUploader.displayName = "VehiclePhotoUploader";

export default VehiclePhotoUploader;
