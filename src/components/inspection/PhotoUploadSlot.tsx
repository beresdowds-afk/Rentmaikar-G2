import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Check, Loader2, ZoomIn, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface PhotoUploadSlotProps {
  label: string;
  description: string;
  photoUrl?: string | null;
  timestamp?: string | null;
  onUpload: (file: File) => Promise<void>;
  onZoom?: () => void;
  disabled?: boolean;
  isUploading?: boolean;
}

export function PhotoUploadSlot({
  label,
  description,
  photoUrl,
  timestamp,
  onUpload,
  onZoom,
  disabled = false,
  isUploading = false,
}: PhotoUploadSlotProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onUpload(file);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await onUpload(file);
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all cursor-pointer',
        isDragging && 'ring-2 ring-primary',
        disabled && 'opacity-50 cursor-not-allowed',
        !photoUrl && 'border-dashed'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />
      
      <div className="aspect-square relative">
        {photoUrl ? (
          <>
            <img
              src={photoUrl}
              alt={label}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <div className="bg-green-500 text-white rounded-full p-1">
                <Check className="h-3 w-3" />
              </div>
              {onZoom && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoom();
                  }}
                >
                  <ZoomIn className="h-3 w-3" />
                </Button>
              )}
            </div>
            {timestamp && (
              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs px-2 py-1">
                {format(new Date(timestamp), 'MMM d, h:mm a')}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-muted/30">
            {isUploading ? (
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
            ) : (
              <Camera className="h-8 w-8 text-muted-foreground mb-2" />
            )}
            <p className="text-xs font-medium text-center">{label}</p>
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              {description}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
