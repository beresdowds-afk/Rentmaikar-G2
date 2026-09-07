import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MessageSquare,
  Radio,
  Search,
  Play,
  Pause,
  Volume2,
  FileText,
  Send,
  User,
  Car,
  Calendar,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { WHATSAPP_TEMPLATES_CATALOG } from '@/lib/whatsapp-templates-registry';

export interface UnifiedCallRecord {
  id: string;
  channel: 'voip' | 'whatsapp_voice' | 'ivr';
  direction: 'inbound' | 'outbound';
  region: 'USA' | 'Nigeria';
  callerNumber: string;
  callerName: string;
  callerRole: 'Driver' | 'Vehicle Owner' | 'Tenant' | 'Lead';
  recipientNumber: string;
  agentName: string;
  extension: string;
  status: 'completed' | 'missed' | 'voicemail' | 'in_progress';
  durationSeconds: number;
  timestamp: string;
  disposition: 'Resolved' | 'Booking Inquiry' | 'Payment Follow-up' | 'Roadside Breakdown' | 'Voicemail Left' | 'Escalated';
  vehicleRef?: string;
  bookingRef?: string;
  recordingUrl?: string;
  transcriptSnippet?: string;
}

const SAMPLE_CALL_HISTORY: UnifiedCallRecord[] = [
  {
    id: 'call_9901',
    channel: 'whatsapp_voice',
    direction: 'outbound',
    region: 'Nigeria',
    callerNumber: '+234 916 307 2576',
    callerName: 'Rentmaikar Master Ops',
    callerRole: 'Lead',
    recipientNumber: '+234 803 123 4567',
    agentName: 'Michael Obi',
    extension: '202',
    status: 'completed',
    durationSeconds: 194,
    timestamp: 'Today, 14:32',
    disposition: 'Payment Follow-up',
    vehicleRef: '2021 Toyota Corolla (KJA-892AB)',
    bookingRef: 'BK-NG-889',
    recordingUrl: 'https://example.com/audio1.mp3',
    transcriptSnippet: 'Driver confirmed remittance of overdue weekly fee. Payment portal link dispatched.',
  },
  {
    id: 'call_9902',
    channel: 'voip',
    direction: 'inbound',
    region: 'USA',
    callerNumber: '+1 (608) 555-0192',
    callerName: 'Marcus Sterling',
    callerRole: 'Vehicle Owner',
    recipientNumber: '+1 (608) 548-9220',
    agentName: 'Sarah Jenkins',
    extension: '201',
    status: 'completed',
    durationSeconds: 312,
    timestamp: 'Today, 13:15',
    disposition: 'Booking Inquiry',
    vehicleRef: '2023 Tesla Model 3',
    bookingRef: 'BK-US-412',
    recordingUrl: 'https://example.com/audio2.mp3',
    transcriptSnippet: 'Owner inquired about upcoming summer lease extensions and insurance rider details.',
  },
  {
    id: 'call_9903',
    channel: 'ivr',
    direction: 'inbound',
    region: 'Nigeria',
    callerNumber: '+234 902 987 6543',
    callerName: 'Amina Bello',
    callerRole: 'Driver',
    recipientNumber: '+234 800 736 8624',
    agentName: 'Emergency Ring Group',
    extension: '301',
    status: 'completed',
    durationSeconds: 448,
    timestamp: 'Today, 11:05',
    disposition: 'Roadside Breakdown',
    vehicleRef: '2020 Hyundai Accent',
    bookingRef: 'BK-NG-744',
    recordingUrl: 'https://example.com/audio3.mp3',
    transcriptSnippet: 'Flat tire near Lekki Toll Gate. Dispatched towing service partner #04.',
  },
  {
    id: 'call_9904',
    channel: 'whatsapp_voice',
    direction: 'inbound',
    region: 'USA',
    callerNumber: '+1 (608) 555-0143',
    callerName: 'Jessica Taylor',
    callerRole: 'Tenant',
    recipientNumber: '+1 (608) 548-9220',
    agentName: 'Sarah Jenkins',
    extension: '201',
    status: 'missed',
    durationSeconds: 0,
    timestamp: 'Today, 09:40',
    disposition: 'Voicemail Left',
    vehicleRef: 'Madison Downtown Apt 4B',
    transcriptSnippet: 'Caller requested callback regarding lease renewal deposit.',
  },
];

interface UnifiedCallHistoryProps {
  userRole?: string;
  isAssistant?: boolean;
  onOpenMessageComposer?: (payload: { recipient: string; templateId?: string }) => void;
}

export const UnifiedCallHistory = ({
  userRole = 'admin',
  isAssistant = false,
  onOpenMessageComposer,
}: UnifiedCallHistoryProps) => {
  const { toast } = useToast();
  const [history] = useState<UnifiedCallRecord[]>(SAMPLE_CALL_HISTORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<UnifiedCallRecord | null>(null);

  const filtered = history.filter((item) => {
    const matchesSearch =
      item.callerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.callerNumber.includes(searchQuery) ||
      item.recipientNumber.includes(searchQuery) ||
      item.disposition.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.vehicleRef && item.vehicleRef.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesChannel = channelFilter === 'all' || item.channel === channelFilter;
    return matchesSearch && matchesChannel;
  });

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlayRecording = (id: string) => {
    if (playingCallId === id) {
      setPlayingCallId(null);
    } else {
      setPlayingCallId(id);
      toast({
        title: 'Audio Playback',
        description: 'Streaming encrypted call recording audio.',
      });
    }
  };

  const handleSendWhatsAppFollowUp = (record: UnifiedCallRecord) => {
    const target = record.direction === 'inbound' ? record.callerNumber : record.recipientNumber;
    if (onOpenMessageComposer) {
      onOpenMessageComposer({
        recipient: target,
        templateId: 'self_service_menu',
      });
    } else {
      toast({
        title: 'WhatsApp Follow-Up Initiated',
        description: `Triggering Meta-approved template to ${target}.`,
      });
    }
  };

  const getChannelBadge = (ch: UnifiedCallRecord['channel']) => {
    switch (ch) {
      case 'voip':
        return (
          <Badge variant="outline" className="text-xs gap-1">
            <Phone className="h-3 w-3" /> VoIP PSTN
          </Badge>
        );
      case 'whatsapp_voice':
        return (
          <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-500/30 bg-green-500/10">
            <MessageSquare className="h-3 w-3" /> WhatsApp Voice
          </Badge>
        );
      case 'ivr':
        return (
          <Badge variant="outline" className="text-xs gap-1 text-purple-600 border-purple-500/30 bg-purple-500/10">
            <Radio className="h-3 w-3" /> IVR Call
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">Unified Call Log & Audit</h3>
              <Badge variant="outline" className="text-xs">
                {filtered.length} Recorded Calls
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comprehensive timeline of all VoIP, WhatsApp Voice, and IVR telephone sessions with recordings and transcripts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 sm:w-56">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
            <Input
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 h-9"
            />
          </div>

          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="text-xs h-9 w-36">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="voip">VoIP PSTN</SelectItem>
              <SelectItem value="whatsapp_voice">WhatsApp Voice</SelectItem>
              <SelectItem value="ivr">IVR Inbound</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Call History Table / Cards */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <Card key={item.id} className="hover:border-primary/40 transition-colors">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.direction === 'inbound' ? (
                    <PhoneIncoming className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                  )}
                  {getChannelBadge(item.channel)}
                  <Badge variant="secondary" className="text-[10px]">
                    {item.region}
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">
                    {item.callerName} ({item.callerRole})
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.timestamp}</span>
                  <span>•</span>
                  <span className="font-mono font-medium text-foreground">
                    {item.durationSeconds > 0 ? formatSec(item.durationSeconds) : 'Missed'}
                  </span>
                  <Badge
                    variant={item.status === 'completed' ? 'default' : 'destructive'}
                    className="text-[10px]"
                  >
                    {item.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* Middle row: Numbers & Metadata */}
              <div className="grid gap-2 sm:grid-cols-3 text-xs bg-muted/20 p-2.5 rounded-lg border">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Caller DID:</span>
                  <span className="font-mono font-medium">{item.callerNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Assigned Agent / Ext:</span>
                  <span className="font-medium">
                    {item.agentName} (Ext {item.extension})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Call Disposition:</span>
                  <Badge variant="outline" className="text-[10px] font-medium bg-background">
                    {item.disposition}
                  </Badge>
                </div>
              </div>

              {/* Associated Record Context */}
              {item.vehicleRef && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Car className="h-3.5 w-3.5 text-primary" /> {item.vehicleRef}
                  </span>
                  {item.bookingRef && (
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="h-3.5 w-3.5 text-primary" /> {item.bookingRef}
                    </span>
                  )}
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.durationSeconds > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => togglePlayRecording(item.id)}
                    >
                      {playingCallId === item.id ? (
                        <>
                          <Pause className="h-3.5 w-3.5 text-primary" /> Pause Audio
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 text-primary" /> Play Recording
                        </>
                      )}
                    </Button>
                  )}

                  {item.transcriptSnippet && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => setSelectedTranscript(item)}
                    >
                      <FileText className="h-3.5 w-3.5" /> View Transcript
                    </Button>
                  )}
                </div>

                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleSendWhatsAppFollowUp(item)}
                >
                  <Send className="h-3.5 w-3.5" /> Follow Up via WhatsApp
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transcript Modal */}
      <Dialog open={!!selectedTranscript} onOpenChange={() => setSelectedTranscript(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Call Transcript & AI Scribe Analysis
            </DialogTitle>
            <DialogDescription className="text-xs">
              ElevenLabs Scribe automated audio-to-text transcript for call with {selectedTranscript?.callerName}.
            </DialogDescription>
          </DialogHeader>

          {selectedTranscript && (
            <div className="space-y-3 py-2">
              <div className="p-3.5 rounded-lg bg-muted/40 border text-xs leading-relaxed italic">
                "{selectedTranscript.transcriptSnippet}"
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Caller:</span>
                  <span className="font-semibold">{selectedTranscript.callerName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Disposition:</span>
                  <span className="font-semibold">{selectedTranscript.disposition}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
