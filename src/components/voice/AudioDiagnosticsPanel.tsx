import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Trash2 } from "lucide-react";
import {
  AudioDiagnosticEvent,
  clearAudioEvents,
  exportAudioEvents,
  subscribeAudioEvents,
} from "@/lib/audio-diagnostics";
import { toast } from "sonner";

const LEVEL_VARIANT: Record<AudioDiagnosticEvent["level"], "outline" | "secondary" | "destructive"> = {
  info: "outline",
  warn: "secondary",
  error: "destructive",
};

/**
 * Developer-facing log of microphone/speaker permission checks and audio
 * routing events, grouped by call.
 */
export function AudioDiagnosticsPanel({ className }: { className?: string }) {
  const [events, setEvents] = useState<AudioDiagnosticEvent[]>([]);

  useEffect(() => subscribeAudioEvents(setEvents), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportAudioEvents());
      toast.success("Audio diagnostics copied");
    } catch {
      toast.error("Could not copy diagnostics");
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 pb-2">
        <p className="text-sm font-medium">Audio diagnostics</p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy diagnostics">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAudioEvents} aria-label="Clear diagnostics">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="h-48 rounded-md border">
        <div className="divide-y">
          {events.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              No audio events recorded yet for this session.
            </p>
          )}
          {[...events].reverse().map((e) => (
            <div key={e.id} className="p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={LEVEL_VARIANT[e.level]} className="text-[10px]">
                  {e.category}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString()}
                </span>
                {e.callId && (
                  <span className="text-muted-foreground">· call {e.callId.slice(0, 12)}</span>
                )}
              </div>
              <p className="pt-1">{e.message}</p>
              {e.detail && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                  {JSON.stringify(e.detail)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
