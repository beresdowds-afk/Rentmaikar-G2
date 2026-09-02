import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  photos: string[];
  startIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

/** Full-screen viewer with keyboard/arrow navigation and a thumbnail strip. */
export function PhotoGalleryViewer({ photos, startIndex = 0, open, onOpenChange, title = 'Vehicle photos' }: Props) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(Math.min(startIndex, Math.max(photos.length - 1, 0)));
  }, [open, startIndex, photos.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % photos.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-screen h-[100dvh] sm:max-w-[100vw] p-0 gap-0 bg-background/95 backdrop-blur border-0 rounded-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="relative flex-1 h-full flex items-center justify-center overflow-hidden">
          <img
            src={photos[index]}
            alt={`${title} ${index + 1} of ${photos.length}`}
            className="max-h-[78dvh] max-w-full object-contain select-none"
          />

          {photos.length > 1 && (
            <>
              <Button
                size="icon"
                variant="secondary"
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full"
                onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                aria-label="Next photo"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full"
                onClick={() => setIndex((i) => (i + 1) % photos.length)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}

          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-background/80 rounded-full px-3 py-1">
            {index + 1} / {photos.length}
          </div>
        </div>

        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto p-3 border-t bg-background/80">
            {photos.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`View photo ${i + 1}`}
                className={`shrink-0 rounded-md overflow-hidden border-2 transition-colors ${i === index ? 'border-primary' : 'border-transparent'}`}
              >
                <img src={p} alt="" loading="lazy" className="h-14 w-20 object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PhotoGalleryViewer;
