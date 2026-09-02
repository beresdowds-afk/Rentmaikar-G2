import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Download, Loader2, AlertCircle, Volume2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { VoIPCall } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';

interface RecordingPlaybackModalProps {
  call: VoIPCall | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RecordingPlaybackModal = ({ call, isOpen, onClose }: RecordingPlaybackModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const loadRecording = async () => {
    if (!call) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-recording-url', {
        body: { callId: call.id },
      });

      if (error) throw error;
      
      setAudioUrl(data.url);
      
      // Create audio element
      const audio = new Audio(data.url);
      audio.addEventListener('ended', () => setIsPlaying(false));
      audio.addEventListener('error', () => {
        toast({
          title: 'Playback Error',
          description: 'Failed to play recording',
          variant: 'destructive',
        });
        setIsPlaying(false);
      });
      setAudioElement(audio);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load recording',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayback = () => {
    if (!audioElement) return;
    
    if (isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    } else {
      audioElement.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `call-recording-${call?.id}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClose = () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }
    setAudioElement(null);
    setAudioUrl(null);
    setIsPlaying(false);
    onClose();
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(2)} KB`;
  };

  const recordingStatusBadge = () => {
    const status = (call as any)?.recording_status || 'none';
    const colors: Record<string, string> = {
      none: 'bg-gray-500',
      recording: 'bg-red-500',
      processing: 'bg-yellow-500',
      ready: 'bg-green-500',
      failed: 'bg-red-600',
    };
    return (
      <Badge className={`${colors[status]} text-white`}>
        {status === 'none' ? 'No Recording' : status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Call Recording
          </DialogTitle>
        </DialogHeader>

        {call && (
          <div className="space-y-4">
            {/* Call Info */}
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Call Date</span>
                <span className="font-medium">
                  {format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Region</span>
                <Badge variant="outline">
                  {call.region === 'USA' ? '🇺🇸' : '🇳🇬'} {call.region}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="font-medium">
                  {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Recording Status</span>
                {recordingStatusBadge()}
              </div>
              {(call as any)?.recording_size_bytes > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">File Size</span>
                  <span className="font-medium">
                    {formatBytes((call as any).recording_size_bytes)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground block mb-1">Participants</span>
                <div className="flex flex-wrap gap-1">
                  {call.participants?.map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {p.display_name || formatPhoneForDisplay(p.phone_number)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Recording Controls */}
            {(call as any)?.recording_status === 'ready' ? (
              <div className="space-y-3">
                {!audioUrl ? (
                  <Button onClick={loadRecording} disabled={isLoading} className="w-full">
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading Recording...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Load Recording
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={togglePlayback} className="flex-1">
                      {isPlaying ? (
                        <>
                          <Pause className="h-4 w-4 mr-2" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Play
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleDownload}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (call as any)?.recording_status === 'processing' ? (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Recording is being processed...
              </div>
            ) : (call as any)?.recording_status === 'failed' ? (
              <div className="flex items-center justify-center gap-2 py-4 text-destructive">
                <AlertCircle className="h-4 w-4" />
                Recording failed to process
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                No recording available for this call
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
