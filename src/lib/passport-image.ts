// Passport picture client-side validation + optional square center-crop.
// Keeps uploads consistent (square, capped size) and rejects unsafe files
// before hitting the storage bucket.

export const PASSPORT_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const PASSPORT_MIN_DIM = 200; // px on shortest side
export const PASSPORT_TARGET_DIM = 512; // output square edge (px)
export const PASSPORT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ValidateResult {
  ok: boolean;
  error?: string;
  width?: number;
  height?: number;
}

export async function validatePassportFile(file: File): Promise<ValidateResult> {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (!PASSPORT_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Please upload a JPG, PNG, or WEBP image.' };
  }
  if (file.size > PASSPORT_MAX_BYTES) {
    return { ok: false, error: 'Image is larger than 5MB. Choose a smaller photo.' };
  }
  const dims = await readImageDimensions(file);
  if (!dims) return { ok: false, error: 'Could not read image. File may be corrupted.' };
  if (dims.width < PASSPORT_MIN_DIM || dims.height < PASSPORT_MIN_DIM) {
    return {
      ok: false,
      error: `Image must be at least ${PASSPORT_MIN_DIM}×${PASSPORT_MIN_DIM}px.`,
      ...dims,
    };
  }
  return { ok: true, ...dims };
}

export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Center-crops the source image to a square and scales it to TARGET_DIM.
 *  Returns a JPEG Blob suitable for upload. */
export async function squareCropToBlob(
  file: File,
  size = PASSPORT_TARGET_DIM,
  quality = 0.9,
): Promise<Blob> {
  const img = await loadImage(file);
  const min = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - min) / 2;
  const sy = (img.naturalHeight - min) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      'image/jpeg',
      quality,
    ),
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      // keep url alive until draw; revoke after tick
      setTimeout(() => URL.revokeObjectURL(url), 0);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Extract the storage object path from a public URL for the given bucket.
 *  Returns null when the URL isn't a supabase storage URL for that bucket. */
export function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}
