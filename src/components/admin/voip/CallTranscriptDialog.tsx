import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { VoIPCall } from '@/types/voip';

interface Props {
  call: VoIPCall | null;
  isOpen: boolean;
  onClose: () => void;
}

interface Row {
  id: string;
  segment_index: number;
  speaker: string | null;
  transcript_text: string;
  language_code: string | null;
  segment_started_at: string | null;
  audio_storage_path: string | null;
  created_at: string;
}

export const CallTranscriptDialog = ({ call, isOpen, onClose }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !call) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('voip_call_transcripts')
        .select('id, segment_index, speaker, transcript_text, language_code, segment_started_at, audio_storage_path, created_at')
        .eq('call_id', call.id)
        .order('segment_index', { ascending: true });
      if (!cancelled) {
        if (error) console.error('[CallTranscriptDialog]', error.message);
        setRows((data as Row[]) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, call]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Call transcript
          </DialogTitle>
          <DialogDescription>
            ElevenLabs Scribe segments captured during this conversation.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading transcript…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No transcript was captured for this call.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-md p-3 bg-background/60">
                <div className="flex items-center justify-between mb-1 text-xs text-muted-foreground">
                  <span>
                    #{r.segment_index + 1}
                    {r.speaker ? ` · ${r.speaker}` : ''}
                    {r.language_code ? ` · ${r.language_code}` : ''}
                  </span>
                  <span>
                    {r.segment_started_at
                      ? format(new Date(r.segment_started_at), 'HH:mm:ss')
                      : format(new Date(r.created_at), 'HH:mm:ss')}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{r.transcript_text}</p>
                {r.audio_storage_path && (
                  <Badge variant="outline" className="mt-2 text-[10px]">Voice log saved</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CallTranscriptDialog;
