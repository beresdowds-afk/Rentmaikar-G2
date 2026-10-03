import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Headphones,
  Phone,
  PenSquare,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Volume2,
  Mic,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCommunicationsHubSafe } from '@/components/admin/communications-hub';
import { AudioHardwareTester } from '@/components/admin/voip/AudioHardwareTester';
import { getMicPermissionState, watchMicPermission, type MicPermissionState } from '@/lib/media-permissions';

export type CommunicationSiblingId =
  | 'messaging-centre'
  | 'communications-hub'
  | 'call-centre'
  | 'omnichannel-composer'
  | 'marketing-engine';

interface CommunicationsSiblingsBarProps {
  activeSibling: CommunicationSiblingId;
  onComposeClick?: () => void;
  className?: string;
}

export const CommunicationsSiblingsBar: React.FC<CommunicationsSiblingsBarProps> = ({
  activeSibling,
  onComposeClick,
  className = '',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const hub = useCommunicationsHubSafe();

  const [micState, setMicState] = useState<MicPermissionState>('unknown');
  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);

  useEffect(() => {
    void getMicPermissionState().then(setMicState);
    const unsub = watchMicPermission(setMicState);
    return unsub;
  }, []);

  const handleSiblingNavigate = (sibling: CommunicationSiblingId) => {
    switch (sibling) {
      case 'messaging-centre':
        if (location.pathname === '/admin') {
          navigate('/admin?tab=inbox');
        } else {
          navigate('/admin/messaging');
        }
        break;

      case 'communications-hub':
        if (hub) {
          hub.setIsOpen(true);
          hub.setIsMinimized(false);
        }
        break;

      case 'call-centre':
        navigate('/admin/call-center');
        break;

      case 'omnichannel-composer':
        if (onComposeClick) {
          onComposeClick();
        } else if (location.pathname === '/admin' || location.pathname === '/admin/messaging') {
          navigate('/admin/messaging?subtab=compose');
        } else if (hub) {
          hub.openMessageEditor();
        }
        break;

      case 'marketing-engine':
        navigate('/admin?tab=marketing');
        break;
    }
  };

  const isCallActive = Boolean(hub?.activeCall && hub.activeCall.status !== 'completed');

  return (
    <div
      className={`rounded-xl border border-border/80 bg-card/75 backdrop-blur-md p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2.5 ${className}`}
    >
      {/* Siblings Tabs Group */}
      <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1.5 hidden sm:inline">
          Communications Suite:
        </span>

        {/* Sibling 1: Messaging Centre */}
        <Button
          type="button"
          size="sm"
          variant={activeSibling === 'messaging-centre' ? 'default' : 'ghost'}
          onClick={() => handleSiblingNavigate('messaging-centre')}
          className={`h-7 px-2.5 text-xs gap-1.5 font-medium transition-all ${
            activeSibling === 'messaging-centre'
              ? 'shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
          <span>Messaging Centre</span>
          {hub && hub.unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="text-[9px] h-3.5 min-w-[14px] px-1 py-0 rounded-full font-mono ml-0.5"
            >
              {hub.unreadCount}
            </Badge>
          )}
        </Button>

        {/* Sibling 2: Call Centre */}
        <Button
          type="button"
          size="sm"
          variant={activeSibling === 'call-centre' ? 'default' : 'ghost'}
          onClick={() => handleSiblingNavigate('call-centre')}
          className={`h-7 px-2.5 text-xs gap-1.5 font-medium transition-all ${
            activeSibling === 'call-centre'
              ? 'shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Phone className="h-3.5 w-3.5 text-emerald-500" />
          <span>Call Centre</span>
          {isCallActive && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping ml-0.5" />
          )}
        </Button>

        {/* Sibling 3: Omni-Channel Composer */}
        <Button
          type="button"
          size="sm"
          variant={activeSibling === 'omnichannel-composer' ? 'default' : 'ghost'}
          onClick={() => handleSiblingNavigate('omnichannel-composer')}
          className={`h-7 px-2.5 text-xs gap-1.5 font-medium transition-all ${
            activeSibling === 'omnichannel-composer'
              ? 'shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <PenSquare className="h-3.5 w-3.5 text-indigo-500" />
          <span>Omni Composer</span>
        </Button>

        {/* Sibling 4: Marketing Engine */}
        <Button
          type="button"
          size="sm"
          variant={activeSibling === 'marketing-engine' ? 'default' : 'ghost'}
          onClick={() => handleSiblingNavigate('marketing-engine')}
          className={`h-7 px-2.5 text-xs gap-1.5 font-medium transition-all ${
            activeSibling === 'marketing-engine'
              ? 'shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          <span>Marketing Engine</span>
        </Button>

        {/* Sibling 5: Communications Hub Floating / Dock Toggle */}
        {hub && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleSiblingNavigate('communications-hub')}
            className={`h-7 px-2.5 text-xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10 transition-all ${
              hub.isOpen ? 'bg-primary/10' : ''
            }`}
            title="Open Communications Hub Overlay"
          >
            <Headphones className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Floating Hub</span>
          </Button>
        )}
      </div>

      {/* Audio Hardware & Microphone Diagnostics Popover */}
      <div className="flex items-center gap-2">
        <Popover open={audioPopoverOpen} onOpenChange={setAudioPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`h-7 px-2 text-xs gap-1.5 font-medium transition-all ${
                micState === 'granted'
                  ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/5 hover:bg-emerald-500/10'
                  : micState === 'denied'
                  ? 'border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10'
                  : 'border-amber-500/40 text-amber-600 bg-amber-500/5 hover:bg-amber-500/10'
              }`}
              title="Click to inspect Microphone and Speaker Hardware"
            >
              {micState === 'granted' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : micState === 'denied' ? (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Radio className="h-3.5 w-3.5 text-amber-500" />
              )}
              <span className="hidden sm:inline">
                {micState === 'granted'
                  ? 'Mic & Audio Ready'
                  : micState === 'denied'
                  ? 'Mic Blocked'
                  : 'Check Mic'}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[360px] sm:w-[420px] p-3 shadow-xl border-border bg-popover"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5 text-primary" />
                  Microphone & Speaker Diagnostics
                </span>
                <Badge
                  variant="outline"
                  className={`text-[9px] uppercase font-mono ${
                    micState === 'granted'
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                      : micState === 'denied'
                      ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                  }`}
                >
                  {micState}
                </Badge>
              </div>
              <AudioHardwareTester
                compact
                onReadyChange={(ready) => setMicState(ready ? 'granted' : 'prompt')}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default CommunicationsSiblingsBar;
