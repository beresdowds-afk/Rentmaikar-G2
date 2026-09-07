import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MessageSquare,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Volume1,
  VolumeX,
  Play,
  User,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Send,
  Sparkles,
  Search,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { WHATSAPP_SENDER_CONFIG, WHATSAPP_TEMPLATES_CATALOG } from '@/lib/whatsapp-templates-registry';
import type { useVoiceDevice } from '@/hooks/useVoiceDevice';

type VoiceDevice = ReturnType<typeof useVoiceDevice>;

interface WhatsAppVoiceConsoleProps {
  voice: VoiceDevice;
  userRole?: string;
  onOpenMessageComposer?: (payload: { recipient: string; templateId?: string; defaultParams?: Record<string, string> }) => void;
}

interface WhatsAppContact {
  id: string;
  name: string;
  phoneNumber: string;
  role: 'Driver' | 'Vehicle Owner' | 'Tenant' | 'Lead';
  region: 'USA' | 'Nigeria';
  verifiedWhatsApp: boolean;
  activeAgreement?: string;
}

const FREQUENT_CONTACTS: WhatsAppContact[] = [
  {
    id: 'c1',
    name: 'Chidi Okonkwo',
    phoneNumber: '+2348031234567',
    role: 'Driver',
    region: 'Nigeria',
    verifiedWhatsApp: true,
    activeAgreement: 'AGR-NG-2026-88',
  },
  {
    id: 'c2',
    name: 'Marcus Sterling',
    phoneNumber: '+16085550192',
    role: 'Vehicle Owner',
    region: 'USA',
    verifiedWhatsApp: true,
    activeAgreement: 'FLT-US-091',
  },
  {
    id: 'c3',
    name: 'Amina Bello',
    phoneNumber: '+2349029876543',
    role: 'Driver',
    region: 'Nigeria',
    verifiedWhatsApp: true,
    activeAgreement: 'AGR-NG-2026-104',
  },
  {
    id: 'c4',
    name: 'Jessica Taylor',
    phoneNumber: '+16085550143',
    role: 'Tenant',
    region: 'USA',
    verifiedWhatsApp: true,
    activeAgreement: 'PROP-US-44',
  },
];

export const WhatsAppVoiceConsole = ({
  voice,
  userRole = 'admin',
  onOpenMessageComposer,
}: WhatsAppVoiceConsoleProps) => {
  const { toast } = useToast();
  const { speakerVolume, setSpeakerVolume, testSpeakerSound } = voice;

  const [activeTab, setActiveTab] = useState<'dial' | 'active_call' | 'templates'>('dial');
  const [targetNumber, setTargetNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<'USA' | 'Nigeria'>('Nigeria');
  const [searchQuery, setSearchQuery] = useState('');

  // Call session state
  const [isOnCall, setIsOnCall] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isHold, setIsHold] = useState(false);
  const [recentFollowUpNumber, setRecentFollowUpNumber] = useState<string | null>(null);

  // Dedicated sender DID
  const designatedSender =
    selectedRegion === 'Nigeria'
      ? WHATSAPP_SENDER_CONFIG.nigeriaMaster
      : WHATSAPP_SENDER_CONFIG.usaPublic;

  // Timer for active call
  useEffect(() => {
    let timer: any;
    if (isOnCall) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [isOnCall]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartWhatsAppVoiceCall = (phone: string, name?: string) => {
    if (!phone) {
      toast({
        title: 'Number Required',
        description: 'Please enter or select a recipient phone number.',
        variant: 'destructive',
      });
      return;
    }

    setTargetNumber(phone);
    if (name) setRecipientName(name);
    setIsOnCall(true);
    setIsMuted(false);
    setIsHold(false);
    setActiveTab('active_call');

    toast({
      title: 'WhatsApp Voice Call Initiated',
      description: `Calling ${name || phone} via ${designatedSender} (Voice Only).`,
    });
  };

  const handleEndCall = () => {
    setIsOnCall(false);
    setRecentFollowUpNumber(targetNumber);
    toast({
      title: 'WhatsApp Voice Call Ended',
      description: `Call duration: ${formatDuration(callDuration)}. Ready for follow-up message.`,
    });
    setActiveTab('templates');
  };

  const filteredContacts = FREQUENT_CONTACTS.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phoneNumber.includes(searchQuery) ||
      c.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTriggerTemplate = (templateId: string) => {
    const phone = recentFollowUpNumber || targetNumber || '+2349163072576';
    const tmpl = WHATSAPP_TEMPLATES_CATALOG.find((t) => t.id === templateId);

    if (onOpenMessageComposer) {
      onOpenMessageComposer({
        recipient: phone,
        templateId,
        defaultParams: {
          user_name: recipientName || 'Customer',
          date_time: new Date().toLocaleString(),
          agent_name: 'Rentmaikar Admin',
        },
      });
    } else {
      toast({
        title: 'Template Trigger Dispatched',
        description: `Triggered Meta-approved template "${tmpl?.name || templateId}" to ${phone} via Sent.dm / Termii.`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 text-green-600">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">WhatsApp Voice Calling Console</h3>
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                Voice Only · Audio Calling
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Video Disabled
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Strictly audio-only WhatsApp telephone calls using authorized Rentmaikar business endpoints.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs bg-muted/40 px-3 py-1.5 rounded-lg border">
          <span className="text-muted-foreground">Outbound Sender DID:</span>
          <span className="font-mono font-medium text-foreground">{designatedSender}</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="dial" className="gap-2">
            <Phone className="h-4 w-4" /> Start Voice Call
          </TabsTrigger>
          <TabsTrigger value="active_call" className="gap-2">
            <Mic className="h-4 w-4" /> Active Call {isOnCall && `(${formatDuration(callDuration)})`}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <Sparkles className="h-4 w-4" /> Follow-Up Templates
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Dial & Contacts */}
        <TabsContent value="dial" className="space-y-6 mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Direct Number Input */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Direct WhatsApp Audio Call</CardTitle>
                <CardDescription className="text-xs">
                  Initiate a real-time WhatsApp voice call to any registered driver, owner, or tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Designated Sending Region</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={selectedRegion === 'Nigeria' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedRegion('Nigeria')}
                    >
                      🇳🇬 Nigeria (+234 916 307 2576)
                    </Button>
                    <Button
                      type="button"
                      variant={selectedRegion === 'USA' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedRegion('USA')}
                    >
                      🇺🇸 USA (+1 608 548-9220)
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient Phone Number</Label>
                  <Input
                    placeholder="e.g. +234 803 123 4567 or +1 608 555 0192"
                    value={targetNumber}
                    onChange={(e) => setTargetNumber(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Name (Optional)</Label>
                  <Input
                    placeholder="e.g. Chidi Okonkwo (Driver)"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Speaker volume control in dialer */}
                <div className="pt-2 border-t space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5 text-primary" /> Speaker Volume
                    </span>
                    <span className="font-mono font-medium">{speakerVolume}%</span>
                  </div>
                  <Slider
                    value={[speakerVolume]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => setSpeakerVolume(v[0])}
                    className="w-full cursor-pointer"
                  />
                </div>

                <Button
                  className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleStartWhatsAppVoiceCall(targetNumber, recipientName)}
                >
                  <Phone className="h-4 w-4" /> Start WhatsApp Voice Call
                </Button>
              </CardContent>
            </Card>

            {/* Quick Contacts Directory */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Rentmaikar WhatsApp Contacts</CardTitle>
                <CardDescription className="text-xs">
                  Select a verified customer to start a direct WhatsApp voice conversation.
                </CardDescription>
                <div className="pt-2 relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, role, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-xs pl-8 h-8"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                {filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-2.5 rounded-lg border bg-card hover:bg-accent/40 transition-colors flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">{contact.name}</span>
                        <Badge variant="outline" className="text-[10px] py-0">
                          {contact.role}
                        </Badge>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {contact.phoneNumber} · {contact.activeAgreement}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs border-green-500/40 text-green-600 hover:bg-green-500/10"
                      onClick={() => handleStartWhatsAppVoiceCall(contact.phoneNumber, contact.name)}
                    >
                      <Phone className="h-3 w-3" /> Voice
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Active Call Controls */}
        <TabsContent value="active_call" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="text-center pb-2">
              <Badge variant="outline" className="mx-auto bg-green-500/10 text-green-600 border-green-500/30 text-xs gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Business Voice Call
              </Badge>
              <CardTitle className="text-xl font-bold mt-2">
                {recipientName || targetNumber || 'Active Voice Call'}
              </CardTitle>
              <CardDescription className="text-sm font-mono">
                {targetNumber || '+234 916 307 2576'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pt-2">
              {/* Call Status & Timer */}
              <div className="text-center space-y-1">
                <div className="text-3xl font-mono font-bold tracking-wider text-primary">
                  {isOnCall ? formatDuration(callDuration) : '00:00'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isOnCall
                    ? isHold
                      ? 'Call on Hold'
                      : 'Connected · 48kHz HD Voice'
                    : 'Call Disconnected'}
                </p>
              </div>

              {/* Speaker Volume Bar */}
              <div className="max-w-md mx-auto p-4 rounded-xl border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    {speakerVolume === 0 ? (
                      <VolumeX className="h-4 w-4 text-destructive" />
                    ) : speakerVolume < 40 ? (
                      <Volume1 className="h-4 w-4 text-primary" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-primary" />
                    )}
                    Speaker Output Volume
                  </span>
                  <span className="font-mono font-semibold">{speakerVolume}%</span>
                </div>
                <Slider
                  value={[speakerVolume]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setSpeakerVolume(v[0])}
                  className="w-full cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button
                  variant={isMuted ? 'destructive' : 'outline'}
                  size="lg"
                  className="h-12 w-12 rounded-full p-0"
                  onClick={() => setIsMuted(!isMuted)}
                  disabled={!isOnCall}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                <Button
                  variant={isHold ? 'secondary' : 'outline'}
                  size="lg"
                  className="px-5 h-12 rounded-full gap-2"
                  onClick={() => setIsHold(!isHold)}
                  disabled={!isOnCall}
                >
                  <Clock className="h-4 w-4" />
                  {isHold ? 'Resume Call' : 'Hold Call'}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-12 rounded-full p-0"
                  onClick={testSpeakerSound}
                  title="Test Speaker Tone"
                >
                  <Play className="h-5 w-5" />
                </Button>

                <Button
                  variant="destructive"
                  size="lg"
                  className="px-6 h-12 rounded-full gap-2 bg-red-600 hover:bg-red-700"
                  onClick={handleEndCall}
                  disabled={!isOnCall}
                >
                  <PhoneOff className="h-5 w-5" />
                  End Call
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Meta-Approved WhatsApp Follow-Up Templates */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-600" />
                Post-Call WhatsApp Template Automations
              </CardTitle>
              <CardDescription className="text-xs">
                Trigger Meta-approved WhatsApp HSM templates from the Rentmaikar catalog to follow up on this voice session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Template 1: Missed Call / Callback Notice */}
                <div className="p-3.5 rounded-xl border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">Missed Call Notice</Badge>
                    <span className="text-[11px] font-mono text-muted-foreground">sent / termii</span>
                  </div>
                  <h4 className="font-medium text-sm">Missed Call Follow-Up</h4>
                  <p className="text-xs text-muted-foreground">
                    "Hi, we noticed you called Rentmaikar Support. An admin assistant is standing by to assist you."
                  </p>
                  <Button
                    size="sm"
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white text-xs mt-2"
                    onClick={() => handleTriggerTemplate('self_service_menu')}
                  >
                    <Send className="h-3.5 w-3.5" /> Send Follow-up Prompt
                  </Button>
                </div>

                {/* Template 2: Rental Inquiry Followup */}
                <div className="p-3.5 rounded-xl border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">Booking Inquiry</Badge>
                    <span className="text-[11px] font-mono text-muted-foreground">sent</span>
                  </div>
                  <h4 className="font-medium text-sm">Rental Inquiry Summary</h4>
                  <p className="text-xs text-muted-foreground">
                    "Thank you for speaking with our fleet desk. Here is the link to complete your vehicle booking."
                  </p>
                  <Button
                    size="sm"
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white text-xs mt-2"
                    onClick={() => handleTriggerTemplate('rentmaikar_booking_confirmed')}
                  >
                    <Send className="h-3.5 w-3.5" /> Send Booking Link
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
