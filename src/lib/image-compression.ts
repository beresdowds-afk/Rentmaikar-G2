import imageCompression from 'browser-image-compression';

/**
 * Mobile camera captures routinely exceed the 10MB storage bucket limit and can
 * arrive as HEIC/HEIF, which the `user-documents` bucket rejects. Every upload
 * surface funnels files through here so photos are transcoded to JPEG and
 * shrunk below the bucket limit before they ever hit storage.
 */

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence'];

export function isHeic(file: File) {
  return (
    HEIC_TYPES.includes(file.type.toLowerCase()) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

export function isImage(file: File) {
  return file.type.startsWith('image/') || isHeic(file);
}

function renamed(file: File, blob: Blob, type = 'image/jpeg') {
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type, lastModified: Date.now() });
}

/** Transcodes HEIC/HEIF to JPEG using the browser's native decoder. */
async function heicToJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const blob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob) throw new Error('Could not convert image');
  return renamed(file, blob);
}

export interface PrepareOptions {
  /** Hard ceiling enforced by the destination storage bucket. */
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
}

/**
 * Returns an upload-safe file. Non-images pass through untouched.
 * Throws a user-readable Error when the file cannot be made compliant.
 */
export async function prepareImageForUpload(
  file: File,
  { maxSizeMB = 8, maxWidthOrHeight = 2400 }: PrepareOptions = {},
): Promise<File> {
  if (!isImage(file)) return file;

  let working = file;

  if (isHeic(file)) {
    try {
      working = await heicToJpeg(file);
    } catch {
      throw new Error(
        'This photo is in HEIC format, which this browser cannot read. Set your camera to “Most Compatible” (JPEG) and try again.',
      );
    }
  }

  const withinLimit = working.size <= maxSizeMB * 1024 * 1024;
  if (withinLimit && working.type !== 'image/heic') return working;

  try {
    const compressed = await imageCompression(working, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.85,
    });
    return renamed(working, compressed);
  } catch {
    throw new Error('Could not process this image. Please try a different photo.');
  }
}

/**
 * Generates a small JPEG thumbnail (default 480px, ~0.15MB) used for fast
 * grid/mobile rendering. Full-size originals stay untouched for the gallery.
 */
export async function createThumbnail(
  file: File,
  { maxWidthOrHeight = 480, maxSizeMB = 0.15 }: PrepareOptions = {},
): Promise<File | null> {
  if (!isImage(file)) return null;
  try {
    const source = isHeic(file) ? await heicToJpeg(file) : file;
    const thumb = await imageCompression(source, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.7,
    });
    return renamed(source, thumb);
  } catch {
    return null;
  }
}

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
}

/** Cheap client-side content check: type, size and decodable pixel dimensions. */
export async function validateImageFile(
  file: File,
  { maxSizeMB = 10, accepted = ['image/jpeg', 'image/png', 'image/webp'], minDimension = 200 } = {},
): Promise<ImageValidationResult> {
  if (!isImage(file)) return { ok: false, error: `${file.name} is not an image file.` };
  if (!isHeic(file) && !accepted.includes(file.type)) {
    return { ok: false, error: `${file.name} must be a JPG, PNG or WebP image.` };
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { ok: false, error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${maxSizeMB}MB.` };
  }
  if (file.size < 1024) return { ok: false, error: `${file.name} looks empty or corrupted.` };
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close?.();
    if (width < minDimension || height < minDimension) {
      return { ok: false, error: `${file.name} is too small (${width}x${height}px). Use at least ${minDimension}px.` };
    }
  } catch {
    return { ok: false, error: `${file.name} could not be read as an image.` };
  }
  return { ok: true };
}
