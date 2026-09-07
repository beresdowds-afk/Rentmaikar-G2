import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  MessageSquare,
  Volume2,
  Volume1,
  VolumeX,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  ShieldCheck,
  Globe,
  Headphones,
  CheckCircle2,
  Sliders,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import type { UseVoiceDeviceResult } from '@/hooks/useVoiceDevice';
import { useToast } from '@/hooks/use-toast';

interface UnifiedTelephoneCardProps {
  voice: UseVoiceDeviceResult;
  userRole?: string;
  isAssistant?: boolean;
  onInitiateCall: (type: 'individual' | 'group', region: 'USA' | 'Nigeria', participants: Array<{ phoneNumber: string; displayName?: string }>) => Promise<any>;
  onOpenWhatsAppConsole?: () => void;
  onOpenIVRBuilder?: () => void;
}

export const UnifiedTelephoneCard = ({
  voice,
  userRole = 'admin',
  isAssistant = false,
  onInitiateCall,
  onOpenWhatsAppConsole,
  onOpenIVRBuilder,
}: UnifiedTelephoneCardProps) => {
  const { toast } = useToast();
  const [activeChannel, setActiveChannel] = useState<'voip' | 'whatsapp'>('voip');
  const [selectedRegion, setSelectedRegion] = useState<'USA' | 'Nigeria'>('USA');
  const [dialNumber, setDialNumber] = useState('');
  const [callerDisplayName, setCallerDisplayName] = useState('');
  const [isDND, setIsDND] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  // Admin vs Admin Assistant Identity
  const assignedExtension = isAssistant ? '201' : '101';
  const agentTitle = isAssistant ? 'Admin Assistant (Driver & Fleet Desk)' : 'Platform Administrator (Operations Lead)';
  const assignedDid = selectedRegion === 'USA' ? '+1 (608) 548-9220' : '+234 916 307 2576';

  const handleKeypadPress = (digit: string) => {
    setDialNumber((prev) => prev + digit);
  };

  const handleStartCall = async () => {
    if (!dialNumber.trim()) {
      toast({
        title: 'Number Required',
        description: 'Enter a valid telephone number or internal extension to dial.',
        variant: 'destructive',
      });
      return;
    }

    setIsCalling(true);

    try {
      if (activeChannel === 'whatsapp') {
        toast({
          title: 'WhatsApp Voice Call Dispatching',
          description: `Routing encrypted WhatsApp Voice session via ${assignedDid} to ${dialNumber}.`,
        });
        // WhatsApp voice calls route through the Rentmaikar WhatsApp Voice Gateway
        if (voice.makeCall) {
          voice.makeCall(dialNumber);
        }
      } else {
        // Standard VoIP Call
        if (voice.makeCall) {
          voice.makeCall(dialNumber);
        }
        await onInitiateCall('individual', selectedRegion, [
          { phoneNumber: dialNumber, displayName: callerDisplayName || `Caller ${dialNumber}` },
        ]);
      }
    } catch (err: any) {
      toast({
        title: 'Call Failed',
        description: err?.message || 'Unable to establish telephony session.',
        variant: 'destructive',
      });
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <Card className="border-primary/30 shadow-md bg-gradient-to-b from-card to-card/95">
      <CardHeader className="pb-4 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <PhoneCall className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-bold">Unified Business Softphone</CardTitle>
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> WebRTC Registered
                </Badge>
                <Badge variant="secondary" className="text-xs font-mono">
                  Ext {assignedExtension}
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                {agentTitle} · Caller ID: <span className="font-mono font-medium text-foreground">{assignedDid}</span>
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* DND Toggle */}
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border text-xs">
              <Switch id="dnd-switch" checked={isDND} onCheckedChange={setIsDND} />
              <Label htmlFor="dnd-switch" className="cursor-pointer text-xs">
                {isDND ? 'Do Not Disturb' : 'Available'}
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Device & Hardware Soundbar */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-3.5 rounded-xl bg-muted/30 border text-xs">
          {/* Audio Output / Speaker Volume */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium flex items-center gap-1.5">
                {voice.speakerVolume === 0 ? (
                  <VolumeX className="h-3.5 w-3.5 text-destructive" />
                ) : voice.speakerVolume < 40 ? (
                  <Volume1 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-primary" />
                )}
                Speaker Volume
              </span>
              <span className="font-mono text-muted-foreground">{voice.speakerVolume}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Slider
                value={[voice.speakerVolume]}
                min={0}
                max={100}
                step={1}
                onValueChange={(val) => voice.setSpeakerVolume(val[0])}
                className="cursor-pointer"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] shrink-0"
                onClick={() => voice.testSpeakerSound()}
                title="Play test audio chime"
              >
                <Play className="h-3 w-3 mr-0.5" /> Test
              </Button>
            </div>
          </div>

          {/* Microphone State */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium flex items-center gap-1.5">
                {voice.isMuted ? (
                  <MicOff className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-primary" />
                )}
                Microphone
              </span>
              <Badge variant={voice.isMuted ? 'destructive' : 'secondary'} className="text-[10px]">
                {voice.isMuted ? 'MUTED' : 'LIVE'}
              </Badge>
            </div>
            <Button
              variant={voice.isMuted ? 'destructive' : 'outline'}
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => voice.toggleMute()}
            >
              {voice.isMuted ? 'Unmute Mic' : 'Mute Mic'}
            </Button>
          </div>

          {/* Speakerphone Output Route */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5 text-primary" /> Device Routing
              </span>
              <Badge variant="outline" className="text-[10px]">
                {voice.isSpeakerphone ? 'Loudspeaker' : 'Default Headset'}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => voice.toggleSpeakerphone()}
            >
              {voice.isSpeakerphone ? 'Switch to Headset' : 'Switch to Speakerphone'}
            </Button>
          </div>

          {/* Carrier Gateways */}
          <div className="space-y-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Carrier Trunk
            </span>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge variant="outline" className="text-[10px]">
                Twilio SIP
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                Termii
              </Badge>
              <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/30">
                Meta WA Voice
              </Badge>
            </div>
          </div>
        </div>

        {/* Channel & Dialing Controls */}
        <div className="grid gap-6 md:grid-cols-12">
          {/* Left Column: Number Input & Keypad */}
          <div className="md:col-span-7 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Tabs
                value={activeChannel}
                onValueChange={(val: any) => setActiveChannel(val)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="voip" className="text-xs gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> VoIP PSTN Call
                  </TabsTrigger>
                  <TabsTrigger
                    value="whatsapp"
                    className="text-xs gap-1.5 data-[state=active]:bg-green-600 data-[state=active]:text-white"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Voice Call
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Region Selector */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={selectedRegion === 'USA' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs gap-1"
                onClick={() => setSelectedRegion('USA')}
              >
                <span>🇺🇸</span> USA (+1)
              </Button>
              <Button
                type="button"
                variant={selectedRegion === 'Nigeria' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs gap-1"
                onClick={() => setSelectedRegion('Nigeria')}
              >
                <span>🇳🇬</span> Nigeria (+234)
              </Button>
            </div>

            {/* Dial Input Field */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Target Telephone or Extension</Label>
              <div className="relative">
                <Input
                  placeholder={selectedRegion === 'USA' ? '+1 (608) 555-0199 or Ext 201' : '+234 803 123 4567 or Ext 102'}
                  value={dialNumber}
                  onChange={(e) => setDialNumber(e.target.value)}
                  className="font-mono text-base font-semibold pr-10"
                />
                {dialNumber && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setDialNumber('')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Dial Action Buttons */}
            <div className="flex gap-3">
              <Button
                className={`flex-1 gap-2 font-semibold ${
                  activeChannel === 'whatsapp'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-primary hover:bg-primary/90'
                }`}
                disabled={isCalling || !dialNumber.trim()}
                onClick={handleStartCall}
              >
                {activeChannel === 'whatsapp' ? (
                  <>
                    <MessageSquare className="h-4 w-4" /> Start WhatsApp Voice Call
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4" /> Place VoIP Call
                  </>
                )}
              </Button>

              {voice.deviceState === 'connected' && (
                <Button variant="destructive" onClick={() => voice.hangUp()}>
                  <PhoneOff className="h-4 w-4 mr-1.5" /> Hang Up
                </Button>
              )}
            </div>

            {/* Quick Extension Buttons */}
            <div className="space-y-1 pt-1">
              <span className="text-[11px] text-muted-foreground font-medium block">
                Quick Dial Internal Extensions:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { ext: '101', name: 'Olusola (Lead)' },
                  { ext: '102', name: 'Ops Supervisor' },
                  { ext: '201', name: 'Driver Desk' },
                  { ext: '202', name: 'Fleet Desk' },
                  { ext: '301', name: 'Roadside IoT' },
                ].map((item) => (
                  <Button
                    key={item.ext}
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs px-2.5 font-mono"
                    onClick={() => setDialNumber(item.ext)}
                  >
                    Ext {item.ext} · {item.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Physical Keypad */}
          <div className="md:col-span-5 bg-muted/20 p-4 rounded-xl border flex flex-col justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              DTMF Keypad
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { digit: '1', sub: '' },
                { digit: '2', sub: 'ABC' },
                { digit: '3', sub: 'DEF' },
                { digit: '4', sub: 'GHI' },
                { digit: '5', sub: 'JKL' },
                { digit: '6', sub: 'MNO' },
                { digit: '7', sub: 'PQRS' },
                { digit: '8', sub: 'TUV' },
                { digit: '9', sub: 'WXYZ' },
                { digit: '*', sub: '' },
                { digit: '0', sub: '+' },
                { digit: '#', sub: '' },
              ].map((btn) => (
                <Button
                  key={btn.digit}
                  variant="outline"
                  type="button"
                  className="h-12 flex flex-col items-center justify-center p-0 hover:bg-primary/10 hover:border-primary"
                  onClick={() => handleKeypadPress(btn.digit)}
                >
                  <span className="text-base font-bold font-mono leading-none">{btn.digit}</span>
                  {btn.sub && <span className="text-[9px] text-muted-foreground">{btn.sub}</span>}
                </Button>
              ))}
            </div>

            {/* Quick Links to Full Consoles */}
            <div className="pt-3 border-t mt-3 flex items-center justify-between text-xs">
              {onOpenWhatsAppConsole && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] gap-1 text-green-600"
                  onClick={onOpenWhatsAppConsole}
                >
                  <MessageSquare className="h-3 w-3" /> WhatsApp Console
                </Button>
              )}
              {onOpenIVRBuilder && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] gap-1 text-purple-600"
                  onClick={onOpenIVRBuilder}
                >
                  <Radio className="h-3 w-3" /> Visual IVR Builder
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
