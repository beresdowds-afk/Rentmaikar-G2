import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { prepareImageForUpload, isImage } from '@/lib/image-compression';


interface UploadDropZoneProps {
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
  isUploading?: boolean;
  progress?: number;
  onFileSelected?: (file: File) => void;
  onFilesSelected?: (files: File[]) => void;
  multiple?: boolean;
  className?: string;
  compact?: boolean;
  label?: string;
}

/**
 * Reusable uploader that combines:
 * - Drag-and-drop
 * - Click-to-browse
 * - Camera capture (mobile browsers use `capture="environment"` to open the rear camera)
 */
export function UploadDropZone({
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
  maxSizeMB = 10,
  disabled = false,
  isUploading = false,
  progress = 0,
  onFileSelected,
  onFilesSelected,
  multiple = false,
  className,
  compact = false,
  label = 'Upload',
}: UploadDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isPreparing, setIsPreparing] = useState(false);

  const validate = (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`File must be under ${maxSizeMB}MB`);
      return false;
    }
    const allowed = accept.split(',').map(s => s.trim());
    const wildcard = allowed.some(a => a.endsWith('/*') && file.type.startsWith(a.replace('/*', '/')));
    if (allowed.length && !allowed.includes(file.type) && !wildcard) {
      toast.error(`Unsupported file type: ${file.type}`);
      return false;
    }
    return true;
  };

  const handleFiles = async (files: FileList | File[] | null | undefined) => {
    if (!files || (files as FileList).length === 0) return;
    const incoming = Array.from(files as FileList);

    setIsPreparing(true);
    const prepared: File[] = [];
    try {
      for (const file of incoming) {
        let candidate = file;
        if (isImage(file)) {
          try {
            candidate = await prepareImageForUpload(file, { maxSizeMB });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not process image');
            continue;
          }
        }
        if (validate(candidate)) prepared.push(candidate);
      }
    } finally {
      setIsPreparing(false);
    }

    if (prepared.length === 0) return;
    if (multiple && onFilesSelected) return onFilesSelected(prepared);
    if (onFileSelected) return onFileSelected(prepared[0]);
    if (onFilesSelected) return onFilesSelected(prepared);
  };


  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          disabled={disabled}
        />
        <input
          ref={cameraInputRef}
          type="file"
          multiple={multiple}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          disabled={disabled}
        />
        <Button
          size="sm"
          type="button"
          disabled={disabled || isUploading || isPreparing}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{progress}%</>
          ) : (
            <><Upload className="h-4 w-4 mr-1" />{label}</>
          )}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="outline"
          disabled={disabled || isUploading || isPreparing}
          onClick={() => cameraInputRef.current?.click()}
          title="Take photo with camera"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={cn(
        'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
        isDragging && 'border-primary bg-primary/5',
        disabled && 'opacity-60 pointer-events-none',
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
          multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={cameraInputRef}
        type="file"
          multiple={multiple}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <div className="flex flex-col items-center gap-2">
        {isUploading ? (
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}
        <p className="text-sm text-muted-foreground">
          {isPreparing ? 'Optimizing image…' : isUploading ? `Uploading… ${progress}%` : 'Drag & drop a file, or choose an option below'}
        </p>
        <div className="flex gap-2 flex-wrap justify-center">
          <Button size="sm" type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isPreparing}>
            <Upload className="h-4 w-4 mr-1" /> Browse
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => cameraInputRef.current?.click()} disabled={isUploading || isPreparing}>
            <Camera className="h-4 w-4 mr-1" /> Take Photo
          </Button>
        </div>
      </div>
    </div>
  );
}

export default UploadDropZone;
