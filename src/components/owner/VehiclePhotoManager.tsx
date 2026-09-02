import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Camera, ImagePlus, Loader2, Maximize2, Star, Trash2, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { prepareImageForUpload, createThumbnail, validateImageFile } from '@/lib/image-compression';
import { PhotoGalleryViewer } from './PhotoGalleryViewer';

const MAX_MB = 10; // mirrors the storage bucket limit
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTOS = 12;
const BUCKET = 'vehicle-photos';
const THUMB_SUFFIX = '-thumb.jpg';

interface Props {
  vehicleId: string;
  ownerId: string;
  photoUrls: string[];
  /** Called after the vehicle row has been updated so the parent can refetch. */
  onChange?: (urls: string[]) => void;
  readOnly?: boolean;
}

/** Public URL -> bucket-relative object path (needed for deletes). */
function objectPathOf(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]) || null;
}

/** Thumbnails follow a naming convention so no schema change is required. */
function thumbUrlOf(url: string): string {
  return url.replace(/\.[^./?]+(\?.*)?$/, THUMB_SUFFIX);
}

export function VehiclePhotoManager({ vehicleId, ownerId, photoUrls, onChange, readOnly }: Props) {
  const [urls, setUrls] = useState<string[]>(photoUrls ?? []);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const persist = async (next: string[]) => {
    const { error } = await supabase
      .from('vehicles')
      .update({ photo_urls: next } as never)
      .eq('id', vehicleId);
    if (error) throw error;
    setUrls(next);
    onChange?.(next);
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length || busy) return;

    const room = MAX_PHOTOS - urls.length;
    if (room <= 0) {
      toast({
        title: 'Photo limit reached',
        description: `You can keep up to ${MAX_PHOTOS} photos per vehicle. Remove one to add more.`,
        variant: 'destructive',
      });
      return;
    }
    const queue = files.slice(0, room);
    if (files.length > room) {
      toast({
        title: 'Some photos skipped',
        description: `Only ${room} more photo${room > 1 ? 's' : ''} can be added (limit ${MAX_PHOTOS}).`,
      });
    }

    cancelRef.current = false;
    setBusy(true);
    setProgress({ done: 0, total: queue.length, label: 'Preparing…' });

    const uploaded: string[] = [];
    const failures: string[] = [];

    try {
      for (let i = 0; i < queue.length; i++) {
        if (cancelRef.current) break;
        const file = queue[i];
        setProgress({ done: i, total: queue.length, label: file.name });

        const check = await validateImageFile(file, { maxSizeMB: MAX_MB, accepted: ACCEPTED });
        if (!check.ok) {
          failures.push(check.error!);
          continue;
        }

        try {
          // Shrink big camera captures before they ever hit storage.
          const optimised = await prepareImageForUpload(file, { maxSizeMB: 2, maxWidthOrHeight: 1920 });
          if (cancelRef.current) break;

          const base = `${ownerId}/${vehicleId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const path = `${base}.jpg`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, optimised, { contentType: optimised.type || 'image/jpeg', upsert: false });
          if (upErr) throw upErr;

          // Best-effort thumbnail for fast mobile grids; failure is non-fatal.
          const thumb = await createThumbnail(file);
          if (thumb) {
            await supabase.storage
              .from(BUCKET)
              .upload(`${base}${THUMB_SUFFIX}`, thumb, { contentType: 'image/jpeg', upsert: true });
          }

          uploaded.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
        } catch (err: any) {
          failures.push(`${file.name}: ${err?.message ?? 'upload failed'}`);
        }
        setProgress({ done: i + 1, total: queue.length, label: file.name });
      }

      if (uploaded.length) {
        await persist([...urls, ...uploaded]);
        toast({
          title: cancelRef.current
            ? `Upload stopped — ${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} saved`
            : `${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} uploaded`,
        });
      } else if (cancelRef.current) {
        toast({ title: 'Upload cancelled' });
      }

      if (failures.length) {
        toast({
          title: `${failures.length} photo${failures.length > 1 ? 's' : ''} could not be uploaded`,
          description: failures.slice(0, 3).join(' · '),
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      cancelRef.current = false;
      setBusy(false);
      setProgress({ done: 0, total: 0, label: '' });
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async (url: string) => {
    setBusy(true);
    try {
      const path = objectPathOf(url);
      if (path) {
        const thumbPath = path.replace(/\.[^.]+$/, THUMB_SUFFIX);
        await supabase.storage.from(BUCKET).remove([path, thumbPath]);
      }
      await persist(urls.filter((u) => u !== url));
      toast({ title: 'Photo removed' });
    } catch (err: any) {
      toast({ title: 'Could not remove photo', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (url: string) => {
    setBusy(true);
    try {
      await persist([url, ...urls.filter((u) => u !== url)]);
      toast({ title: 'Primary photo updated' });
    } catch (err: any) {
      toast({ title: 'Could not update photo', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const openGallery = (i: number) => {
    setGalleryIndex(i);
    setGalleryOpen(true);
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {urls.map((url, i) => (
          <div key={url} className="relative group rounded-lg overflow-hidden border bg-muted">
            <img
              src={thumbUrlOf(url)}
              alt={`Vehicle photo ${i + 1}`}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src !== url) img.src = url; // fall back to the full-size original
              }}
              onClick={() => openGallery(i)}
              className="h-28 w-full object-cover cursor-zoom-in"
            />
            {i === 0 && <Badge className="absolute top-1 left-1 text-[10px]">Primary</Badge>}
            <Button
              size="icon"
              variant="secondary"
              className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => openGallery(i)}
              aria-label="View photo full screen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            {!readOnly && (
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-1 bg-background/70 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {i !== 0 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={busy}
                    onClick={() => makePrimary(url)}
                    aria-label="Set as primary photo"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  disabled={busy}
                  onClick={() => removePhoto(url)}
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {!readOnly && urls.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              uploadFiles(Array.from(e.dataTransfer.files || []));
            }}
            disabled={busy}
            className={`h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors ${dragging ? 'border-primary text-primary bg-primary/5' : ''}`}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span>Add photos</span>
            <span className="text-[10px]">Drag & drop several or browse</span>
          </button>
        )}
      </div>

      {busy && progress.total > 0 && (
        <div className="space-y-1 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">
              Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total} · {progress.label}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive"
              onClick={() => { cancelRef.current = true; }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Camera className="h-3.5 w-3.5 mr-1" />
            Bulk upload photos
          </Button>
          <span className="text-xs text-muted-foreground">
            JPG, PNG or WebP · up to {MAX_MB}MB each · auto-optimised · {urls.length}/{MAX_PHOTOS}
          </span>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
      />

      <PhotoGalleryViewer
        photos={urls}
        startIndex={galleryIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />
    </div>
  );
}

export default VehiclePhotoManager;
