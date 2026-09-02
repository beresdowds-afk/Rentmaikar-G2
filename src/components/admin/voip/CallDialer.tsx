import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneOff, Users, Plus, X, Loader2, Mic, MicOff, Volume2, Headphones, Sparkles, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CallRegion, CallType, VoIPCall, VoIPCallGroup } from '@/types/voip';
import { COUNTRY_CODES, validatePhoneNumber, formatPhoneForDisplay } from '@/types/voip';
import { useRegion } from '@/contexts/RegionContext';
import { regionToDefaultCountry } from '@/hooks/useDefaultPhoneCountry';
import { UserCallSearch } from './UserCallSearch';
import { Separator } from '@/components/ui/separator';
import { useVoiceDevice } from '@/hooks/useVoiceDevice';
import { ensureMediaPermissions, unlockAudioOutput } from '@/lib/media-permissions';
import { UseAccentConversionAgentResult } from '@/hooks/useAccentConversionAgent';

interface CallDialerProps {
  onInitiateCall: (
    callType: CallType,
    region: CallRegion,
    recipients: { phoneNumber: string; displayName?: string; userId?: string }[]
  ) => Promise<any>;
  groups: VoIPCallGroup[];
  isLoading: boolean;
  voiceDevice?: ReturnType<typeof useVoiceDevice>;
  onEndCall?: (callId?: string) => Promise<void> | void;
  activeCall?: VoIPCall | null;
  accentAgent?: UseAccentConversionAgentResult;
}

export const CallDialer = ({
  onInitiateCall,
  groups,
  isLoading,
  voiceDevice,
  onEndCall,
  activeCall,
  accentAgent,
}: CallDialerProps) => {
  // Seed the dial region from RegionContext so admins start on their active
  // region instead of a hard-coded USA default.
  const { country: activeCountry } = useRegion();
  const [callMode, setCallMode] = useState<'individual' | 'group'>('individual');
  const [audioMode, setAudioMode] = useState<'browser_voip' | 'direct_bridge'>('browser_voip');
  const [region, setRegion] = useState<CallRegion>(
    (activeCountry === 'Nigeria' ? 'Nigeria' : 'USA') as CallRegion,
  );

  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [recipients, setRecipients] = useState<{ phoneNumber: string; displayName: string }[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const { toast } = useToast();

  const prefix = COUNTRY_CODES[region];
  const isWebRTCOnCall = voiceDevice && (voiceDevice.status === 'on-call' || voiceDevice.status === 'connecting');
  const isCallActive = isWebRTCOnCall || !!activeCall || isCalling;

  const handleHangUp = async () => {
    if (voiceDevice && (voiceDevice.status === 'on-call' || voiceDevice.status === 'connecting')) {
      voiceDevice.hangUp();
    }
    if (onEndCall) {
      await onEndCall(activeCall?.id);
    }
    setIsCalling(false);
    toast({
      title: 'Call Terminated',
      description: 'The call has been terminated.',
    });
  };

  const handleAddRecipient = () => {
    const fullNumber = phoneNumber.startsWith('+') ? phoneNumber : `${prefix}${phoneNumber}`;
    
    if (!validatePhoneNumber(fullNumber, region)) {
      toast({
        title: 'Invalid Phone Number',
        description: `Please enter a valid ${region} phone number`,
        variant: 'destructive',
      });
      return;
    }

    if (recipients.some(r => r.phoneNumber === fullNumber)) {
      toast({
        title: 'Duplicate',
        description: 'This number is already in the list',
        variant: 'destructive',
      });
      return;
    }

    setRecipients([...recipients, { phoneNumber: fullNumber, displayName: displayName || fullNumber }]);
    setPhoneNumber('');
    setDisplayName('');
  };

  const handleRemoveRecipient = (phone: string) => {
    setRecipients(recipients.filter(r => r.phoneNumber !== phone));
  };

  const handleCall = async () => {
    setIsCalling(true);
    try {
      if (callMode === 'individual') {
        const fullNumber = phoneNumber.startsWith('+') ? phoneNumber : `${prefix}${phoneNumber}`;
        
        if (!validatePhoneNumber(fullNumber, region)) {
          toast({
            title: 'Invalid Phone Number',
            description: `Please enter a valid ${region} phone number`,
            variant: 'destructive',
          });
          return;
        }

        // If browser VoIP mode is selected, connect directly via user's microphone & speakers
        if (audioMode === 'browser_voip' && voiceDevice) {
          await ensureMediaPermissions();
          await unlockAudioOutput();
          toast({
            title: 'Starting VoIP Audio Call',
            description: `Connecting via device microphone & speakers to ${fullNumber}...`,
          });
          const ok = await voiceDevice.startCall(fullNumber, { Region: region });
          if (!ok) {
            toast({
              title: 'VoIP Connection Failed',
              description: voiceDevice.error || 'Could not connect via device audio. Switching to direct bridge.',
              variant: 'destructive',
            });
            await onInitiateCall('individual', region, [
              { phoneNumber: fullNumber, displayName: displayName || undefined },
            ]);
          }
        } else {
          await onInitiateCall('individual', region, [
            { phoneNumber: fullNumber, displayName: displayName || undefined },
          ]);
        }
      } else if (callMode === 'group') {
        if (selectedGroupId) {
          const group = groups.find(g => g.id === selectedGroupId);
          if (group?.members) {
            await onInitiateCall('group', region, group.members.map(m => ({
              phoneNumber: m.phone_number,
              displayName: m.display_name,
              userId: m.user_id,
            })));
          }
        } else if (recipients.length > 0) {
          await onInitiateCall('group', region, recipients);
        } else {
          toast({
            title: 'No Recipients',
            description: 'Please add at least one recipient or select a group',
            variant: 'destructive',
          });
          return;
        }
      }
    } catch (err: any) {
      toast({
        title: 'Call Error',
        description: err.message || 'Failed to place call',
        variant: 'destructive',
      });
    } finally {
      setIsCalling(false);
    }
  };

  const filteredGroups = groups.filter(g => g.region === region || g.region === 'All');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Make a VoIP Call
            </CardTitle>
            <CardDescription>
              Dial individual numbers or start conferences using your device microphone and speakers
            </CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center gap-1.5 self-start sm:self-auto py-1 px-2.5">
            <Headphones className="h-3.5 w-3.5 text-blue-600" />
            <span>VoIP Audio Engine Ready</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Call Control Banner with Call End Button */}
        {isCallActive && (
          <div className="rounded-lg border-2 border-red-500/40 bg-red-500/10 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="font-semibold text-sm">
                  {voiceDevice?.status === 'on-call' ? 'Live VoIP Call in Progress' : 'Call Active / Connecting...'}
                </span>
                <Badge variant="outline" className="text-xs">
                  {voiceDevice?.outputLabel || 'Device Audio'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {voiceDevice && (
                  <>
                    <Button
                      size="sm"
                      variant={voiceDevice.isMuted ? 'destructive' : 'outline'}
                      onClick={voiceDevice.toggleMute}
                      className="h-8 text-xs"
                    >
                      {voiceDevice.isMuted ? <MicOff className="h-3.5 w-3.5 mr-1" /> : <Mic className="h-3.5 w-3.5 mr-1" />}
                      {voiceDevice.isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void voiceDevice.toggleSpeakerphone()}
                      className="h-8 text-xs"
                    >
                      <Volume2 className="h-3.5 w-3.5 mr-1 text-blue-600" />
                      Speaker
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleHangUp}
                  className="h-8 bg-red-600 hover:bg-red-700 text-white font-semibold"
                  id="dialer-active-end-call-btn"
                >
                  <PhoneOff className="h-3.5 w-3.5 mr-1" />
                  End Call
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Audio Route Selection */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Headphones className="h-3.5 w-3.5 text-blue-600" />
              VoIP Audio Hardware Mode
            </Label>
            <p className="text-xs text-muted-foreground">
              Directly use your device speakers and microphone for crystal clear VoIP audio
            </p>
          </div>
          <div className="flex items-center gap-1 bg-background p-1 rounded-md border text-xs">
            <button
              type="button"
              onClick={() => setAudioMode('browser_voip')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                audioMode === 'browser_voip'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              🎙️ Device Mic & Speakers
            </button>
            <button
              type="button"
              onClick={() => setAudioMode('direct_bridge')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                audioMode === 'direct_bridge'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📞 Cloud Bridge
            </button>
          </div>
        </div>

        {/* Real-Time American Accent Conversion Row */}
        {accentAgent && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span>🇺🇸 Real-Time American Accent Agent</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Converts admin speech intonation and idioms to authentic American accents during calls
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px]">
                {accentAgent.activeProfile.name}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant={accentAgent.isListening ? 'default' : 'outline'}
                onClick={accentAgent.toggleAgent}
                className={`h-8 text-xs font-medium ${
                  accentAgent.isListening
                    ? 'bg-indigo-600 text-white'
                    : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                {accentAgent.isListening ? (
                  <>
                    <Mic className="h-3 w-3 mr-1 text-emerald-300 animate-pulse" />
                    Accent Active
                  </>
                ) : (
                  'Enable for Call'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Region Selection */}
        <div className="space-y-2">
          <Label>Select Region</Label>
          <div className="flex gap-2">
            <Button
              variant={region === 'USA' ? 'default' : 'outline'}
              onClick={() => setRegion('USA')}
              className="flex-1"
            >
              <span className="mr-2">🇺🇸</span>
              USA (+1)
            </Button>
            <Button
              variant={region === 'Nigeria' ? 'default' : 'outline'}
              onClick={() => setRegion('Nigeria')}
              className="flex-1"
            >
              <span className="mr-2">🇳🇬</span>
              Nigeria (+234)
            </Button>
          </div>
        </div>

        {/* Call Mode */}
        <Tabs value={callMode} onValueChange={(v) => setCallMode(v as 'individual' | 'group')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="individual">
              <Phone className="h-4 w-4 mr-2" />
              Individual
            </TabsTrigger>
            <TabsTrigger value="group">
              <Users className="h-4 w-4 mr-2" />
              Group Call
            </TabsTrigger>
          </TabsList>

          <TabsContent value="individual" className="space-y-4 mt-4">
            {/* Search a registered user — selecting one dials immediately */}
            <div className="space-y-2 rounded-md border p-4">
              <Label>Search users to call</Label>
              <p className="text-xs text-muted-foreground">
                Selecting a driver or owner starts the call right away.
              </p>
              <UserCallSearch
                embedded
                isLoading={isLoading || isCalling}
                onInitiateCall={onInitiateCall}
                onUserSelected={(user) => {
                  if (user.phone) {
                    setRegion(user.phone.startsWith('+234') ? 'Nigeria' : 'USA');
                    setPhoneNumber(user.phone);
                  }
                  setDisplayName(user.full_name || '');
                }}
              />
            </div>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or dial manually</span>
              <Separator className="flex-1" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <PhoneNumberInput
                  id="phone"
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  defaultCountry={regionToDefaultCountry(region)}
                  placeholder="Enter phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Display Name (Optional)</Label>
                <Input
                  id="name"
                  placeholder="Contact name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="group" className="space-y-4 mt-4">
            {/* Existing Groups */}
            <div className="space-y-2">
              <Label>Select Existing Group</Label>
              <Select value={selectedGroupId || "manual"} onValueChange={(v) => setSelectedGroupId(v === "manual" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group or add recipients manually" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Add recipients manually</SelectItem>
                  {filteredGroups.filter(g => g.id).map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} ({group.members?.length || 0} members)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Manual Recipients */}
            {!selectedGroupId && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm">
                        {prefix}
                      </span>
                      <Input
                        placeholder="Phone"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        className="rounded-l-none"
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input
                      placeholder="Name (optional)"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddRecipient} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>

                {/* Recipients List */}
                {recipients.length > 0 && (
                  <div className="space-y-2">
                    <Label>Recipients ({recipients.length})</Label>
                    <div className="flex flex-wrap gap-2">
                      {recipients.map((r) => (
                        <Badge key={r.phoneNumber} variant="secondary" className="flex items-center gap-1 py-1">
                          {r.displayName || formatPhoneForDisplay(r.phoneNumber)}
                          <button
                            onClick={() => handleRemoveRecipient(r.phoneNumber)}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Call / End Call Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {isCallActive ? (
            <Button
              onClick={handleHangUp}
              variant="destructive"
              className="w-full h-12 text-base font-semibold bg-red-600 hover:bg-red-700"
              size="lg"
              id="dialer-bottom-end-call-btn"
            >
              <PhoneOff className="h-5 w-5 mr-2" />
              End Active Call
            </Button>
          ) : (
            <Button
              onClick={handleCall}
              disabled={isCalling || isLoading}
              className="w-full h-12 text-base font-semibold"
              size="lg"
            >
              {isCalling ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Connecting Audio Call...
                </>
              ) : (
                <>
                  <Phone className="h-5 w-5 mr-2" />
                  {callMode === 'individual' ? 'Call Now (VoIP Audio)' : 'Start Conference Call'}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
