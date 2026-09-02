import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScrollableStripProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Pixels to scroll per arrow click. Defaults to ~80% of the container width. */
  step?: number;
}

/**
 * Horizontally scrollable row with left/right arrow controls.
 * Arrows appear only when overflow exists and disable at each edge.
 * Content stays touch-scrollable and keyboard-scrollable (Tab into children,
 * arrow keys via the buttons).
 */
export function ScrollableStrip({
  children,
  className,
  ariaLabel = "Scrollable content",
  step,
}: ScrollableStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth > 1;
    setHasOverflow(overflow);
    setCanLeft(el.scrollLeft > 1);
    setCanRight(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c as Element));
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update, children]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = step ?? Math.max(160, Math.round(el.clientWidth * 0.8));
    el.scrollBy({ left: dir * distance, behavior: "smooth" });
  };

  return (
    <div className={cn("relative", className)} role="group" aria-label={ariaLabel}>
      {hasOverflow && (
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          disabled={!canLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full shadow-sm bg-background/95 backdrop-blur hidden md:inline-flex"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      <div
        ref={scrollerRef}
        className={cn(
          "flex items-center gap-2 overflow-x-auto overscroll-x-contain scroll-smooth",
          "[scrollbar-width:thin]",
          hasOverflow && "md:px-11",
        )}
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
      >
        {children}
      </div>
      {hasOverflow && (
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          disabled={!canRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full shadow-sm bg-background/95 backdrop-blur hidden md:inline-flex"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
