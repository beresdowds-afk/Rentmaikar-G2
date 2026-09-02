import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface TourStep {
  id: string;
  title: string;
  content: string;
  target?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

interface Props {
  open: boolean;
  onClose: () => void;
  steps: TourStep[];
  tour: string;
  country: string;
}

export function TourPreviewModal({ open, onClose, steps, tour, country }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, tour, country]);

  const step = steps[index];
  const total = steps.length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">Tour Preview</DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{tour}</Badge>
              <Badge>{country}</Badge>
            </div>
          </div>
        </DialogHeader>

        {total === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No steps to preview. Add steps in the editor first.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Step {index + 1} of {total}</span>
              {step?.placement && <Badge variant="secondary">placement: {step.placement}</Badge>}
            </div>

            <div className="rounded-lg border bg-card p-5 shadow-sm">
              <h3 className="text-lg font-semibold mb-2">{step?.title || <span className="text-muted-foreground italic">Untitled</span>}</h3>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {step?.content || <span className="text-muted-foreground italic">No content</span>}
              </p>
              {step?.target && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Target: <code className="px-1 py-0.5 rounded bg-muted">{step.target}</code>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">ID: <code>{step?.id}</code></div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>

              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === index ? "bg-primary" : "bg-muted"
                    }`}
                    aria-label={`Go to step ${i + 1}`}
                  />
                ))}
              </div>

              {index < total - 1 ? (
                <Button size="sm" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={onClose}>
                  <X className="w-4 h-4 mr-1" /> Finish
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
