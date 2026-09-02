import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface PhotoZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: Array<{
    url: string | null;
    label: string;
    timestamp?: string | null;
  }>;
  initialIndex?: number;
}

export function PhotoZoomModal({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
}: PhotoZoomModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  
  const validPhotos = photos.filter(p => p.url);
  const currentPhoto = validPhotos[currentIndex];

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % validPhotos.length);
    setZoom(1);
  };

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + validPhotos.length) % validPhotos.length);
    setZoom(1);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.5, 0.5));
  };

  if (!currentPhoto) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 bg-black/95 border-0">
        <DialogTitle className="sr-only">{currentPhoto.label}</DialogTitle>
        
        {/* Header */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="text-white">
            <p className="font-medium">{currentPhoto.label}</p>
            {currentPhoto.timestamp && (
              <p className="text-sm text-white/70">
                {format(new Date(currentPhoto.timestamp), 'MMM d, yyyy h:mm a')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={handleZoomOut}
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <span className="text-white text-sm min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={handleZoomIn}
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Image */}
        <div className="relative flex items-center justify-center min-h-[60vh] overflow-hidden">
          <img
            src={currentPhoto.url!}
            alt={currentPhoto.label}
            className="max-w-full max-h-[70vh] object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          />
        </div>

        {/* Navigation */}
        {validPhotos.length > 1 && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
              onClick={goPrev}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
              onClick={goNext}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>

            {/* Thumbnails */}
            <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex justify-center gap-2 overflow-x-auto">
                {validPhotos.map((photo, idx) => (
                  <button
                    key={idx}
                    className={cn(
                      'w-12 h-12 rounded-md overflow-hidden ring-2 transition-all',
                      idx === currentIndex ? 'ring-primary' : 'ring-transparent opacity-60 hover:opacity-100'
                    )}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setZoom(1);
                    }}
                  >
                    <img
                      src={photo.url!}
                      alt={photo.label}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
              <p className="text-center text-white/70 text-sm mt-2">
                {currentIndex + 1} of {validPhotos.length}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
