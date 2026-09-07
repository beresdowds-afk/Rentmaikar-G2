import { useCallback, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Phone,
  Users,
  History,
  Settings,
  PhoneCall,
  Globe,
  Radio,
  UserPlus,
  Volume2,
  Link2,
  Sparkles,
  PhoneOff,
  PhoneIncoming,
  ClipboardList,
  MessageSquare,
  Hash,
  Activity,
  UserCheck,
} from 'lucide-react';
import { useVoIPCalls } from '@/hooks/useVoIPCalls';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { CallDialer } from './CallDialer';
import { CallGroups } from './CallGroups';
import { ActiveCallPanel } from './ActiveCallPanel';
import { VoIPFeatureSettings } from './VoIPFeatureSettings';
import { OutreachContactsPanel } from './OutreachContactsPanel';
import { ConferenceRoomPanel } from './ConferenceRoomPanel';
import { CallRecordingsPanel } from './CallRecordingsPanel';
import { TwiMLAppConfigPanel } from './TwiMLAppConfigPanel';
import { OutboundNumberRouting } from './OutboundNumberRouting';

import { IncomingCallAlerts } from '@/components/voice/IncomingCallAlerts';
import { SoftphoneControls } from './SoftphoneControls';
import { useVoiceDevice } from '@/hooks/useVoiceDevice';
import { Badge } from '@/components/ui/badge';
import { AccentConversionAgentPanel } from './AccentConversionAgentPanel';
import { AudioHardwareTester } from './AudioHardwareTester';
import { Button } from '@/components/ui/button';
import { useAccentConversionAgent } from '@/hooks/useAccentConversionAgent';
import { useCallQueue, type QueuedCall } from '@/hooks/useCallQueue';
import { CallQueueList } from './CallQueueList';

// Core Telephony Modules
import { UnifiedTelephoneCard } from './UnifiedTelephoneCard';
import { WhatsAppVoiceConsole } from './WhatsAppVoiceConsole';
import { VisualIVRBuilder } from './VisualIVRBuilder';
import { VoiceHealthDashboard } from './VoiceHealthDashboard';
import { AgentExtensionManager } from './AgentExtensionManager';
import { TelephonyNumbersProvisioning } from './TelephonyNumbersProvisioning';
import { UnifiedCallHistory } from './UnifiedCallHistory';
import { useAuth } from '@/contexts/AuthContext';

export const CallCenterPage = () => {
  const { calls, groups, isLoading, activeCall, initiateCall, endCall, createGroup, deleteGroup, refreshCalls } = useVoIPCalls();
  const { incomingRequests, acceptCallRequest, rejectCallRequest, escalateCallRequest } = useVoiceCall('admin');
  const [selectedTab, setSelectedTab] = useState('dialer');
  const voice = useVoiceDevice();
  const queueState = useCallQueue();
  const { userRole } = useAuth();

  const isAssistant = userRole === 'admin_assistant';

  // Duck the raw microphone while the American-accent voice is speaking so the
  // caller only hears the converted output.
  const handleDuck = useCallback((ducked: boolean) => {
    voice.setMuted?.(ducked);
  }, [voice]);

  const accentAgent = useAccentConversionAgent({
    onDuckMicrophone: handleDuck,
    callId: activeCall?.id ?? null,
  });

  const activeCalls = calls.filter(c => ['ringing', 'in-progress'].includes(c.status));

  // Hangs up the browser audio session and asks the provider to terminate the call.
  const terminateCall = useCallback(async (callId: string) => {
    if (activeCall?.id === callId) voice.hangUp();
    await endCall(callId);
  }, [activeCall?.id, endCall, voice]);

  const endAllCalls = useCallback(async () => {
    voice.hangUp();
    await Promise.allSettled(activeCalls.map(c => endCall(c.id)));
  }, [activeCalls, endCall, voice]);

  // FIFO router: answering always connects the caller who has waited longest first.
  const answerQueuedCall = useCallback(async (call: QueuedCall) => {
    if (call.isSimulated) {
      queueState.removeSimulated(call.id);
      return;
    }
    if (call.source === 'live_inbound') {
      setSelectedTab('dialer');
      await refreshCalls();
      return;
    }
    await acceptCallRequest(call.recordId);
    if (call.phoneNumber) {
      await initiateCall('individual', call.region === 'Nigeria' ? 'Nigeria' : 'USA', [
        { phoneNumber: call.phoneNumber, displayName: call.displayName },
      ]);
    }
    await queueState.refresh();
  }, [acceptCallRequest, initiateCall, queueState, refreshCalls]);

  const escalateQueuedCall = useCallback(async (call: QueuedCall) => {
    if (call.isSimulated || call.source === 'live_inbound') return;
    await escalateCallRequest(call.recordId);
    await queueState.refresh();
  }, [escalateCallRequest, queueState]);

  const dismissQueuedCall = useCallback(async (call: QueuedCall) => {
    if (call.isSimulated) {
      queueState.removeSimulated(call.id);
      return;
    }
    if (call.source === 'live_inbound') {
      await terminateCall(call.recordId);
    } else {
      await rejectCallRequest(call.recordId);
    }
    await queueState.refresh();
  }, [queueState, rejectCallRequest, terminateCall]);

  const usaCalls = calls.filter(c => c.region === 'USA');
  const nigeriaCalls = calls.filter(c => c.region === 'Nigeria');

  const stats = [
    { label: 'Active Calls', value: activeCalls.length, icon: PhoneCall, color: 'text-green-500' },
    { label: 'USA Calls Today', value: usaCalls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length, icon: Globe, color: 'text-blue-500' },
    { label: 'Nigeria Calls Today', value: nigeriaCalls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length, icon: Globe, color: 'text-emerald-500' },
    { label: 'Call Queue', value: queueState.metrics.waiting, icon: PhoneIncoming, color: 'text-amber-500', tab: 'queue' },
    { label: 'Call Groups', value: groups.length, icon: Users, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">VoIP & Telephony Command Center</h2>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
              {isAssistant ? 'Admin Assistant Desk' : 'Platform Administrator'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real operational telephony system for Rentmaikar Admins across USA (+1 608-548-9220) and Nigeria (+234 916 307 2576).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeCalls.length > 1 && (
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => void endAllCalls()}>
              <PhoneOff className="h-4 w-4" />
              End all calls ({activeCalls.length})
            </Button>
          )}
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            USA DID: +1 (608) 548-9220
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Nigeria DID: +234 916 307 2576
          </Badge>
        </div>
      </div>

      {/* Live inbound call ringing this browser — answer with mic + speaker */}
      {voice.incomingCall && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-4">
          <PhoneIncoming className="h-5 w-5 animate-pulse text-green-600" />
          <span className="text-sm font-medium">
            Incoming call
            {voice.incomingCall.parameters?.From ? ` from ${voice.incomingCall.parameters.From}` : ''}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" className="gap-2" onClick={() => voice.acceptIncoming()}>
              <PhoneCall className="h-4 w-4" />
              Answer
            </Button>
            <Button size="sm" variant="destructive" className="gap-2" onClick={() => voice.rejectIncoming()}>
              <PhoneOff className="h-4 w-4" />
              Decline
            </Button>
          </div>
        </div>
      )}

      {/* Active Call Panel with Speaker Volume, Hold, Transfer, and Transcription */}
      {activeCall && (
        <ActiveCallPanel
          call={activeCall}
          onEndCall={() => { void terminateCall(activeCall.id); }}
          isMuted={voice.isMuted}
          onToggleMute={voice.toggleMute}
          accentAgent={accentAgent}
          isSpeakerOn={voice.isSpeakerphone}
          onToggleSpeaker={() => void voice.toggleSpeakerphone()}
          speakerVolume={voice.speakerVolume}
          onVolumeChange={voice.setSpeakerVolume}
          onTestSound={voice.testSpeakerSound}
        />
      )}

      {/* Stats Summary Bar */}
      {queueState.metrics.waiting > 0 && (
        <button
          type="button"
          onClick={() => setSelectedTab('queue')}
          className="flex w-full items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left"
        >
          <PhoneIncoming className="h-5 w-5 animate-pulse text-amber-500" />
          <span className="text-sm font-medium">
            {queueState.metrics.waiting} caller{queueState.metrics.waiting === 1 ? '' : 's'} waiting in queue
            {queueState.metrics.urgent > 0 ? ` · ${queueState.metrics.urgent} urgent` : ''}
          </span>
        </button>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className={stat.tab ? 'cursor-pointer transition-colors hover:bg-accent/40' : undefined}
            onClick={stat.tab ? () => setSelectedTab(stat.tab as string) : undefined}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Incoming Call Alerts Modal/Banner */}
      <IncomingCallAlerts
        requests={incomingRequests}
        onAccept={acceptCallRequest}
        onReject={rejectCallRequest}
        onEscalate={escalateCallRequest}
        userRole="admin"
      />

      {/* Navigation Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 lg:w-auto lg:inline-grid lg:grid-cols-11 gap-1">
          <TabsTrigger value="dialer" className="flex items-center gap-1.5 text-xs">
            <Phone className="h-3.5 w-3.5" />
            <span>Softphone</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp-voice" className="flex items-center gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5 text-green-600" />
            <span>WhatsApp Voice</span>
          </TabsTrigger>
          <TabsTrigger value="ivr" className="flex items-center gap-1.5 text-xs">
            <Radio className="h-3.5 w-3.5 text-purple-600" />
            <span>Visual IVR</span>
          </TabsTrigger>
          <TabsTrigger value="numbers" className="flex items-center gap-1.5 text-xs">
            <Hash className="h-3.5 w-3.5 text-indigo-600" />
            <span>Phone Numbers</span>
          </TabsTrigger>
          <TabsTrigger value="extensions" className="flex items-center gap-1.5 text-xs">
            <UserCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>Extensions</span>
          </TabsTrigger>
          <TabsTrigger value="telecom-health" className="flex items-center gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5 text-emerald-600" />
            <span>Voice Health</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-1.5 text-xs">
            <PhoneIncoming className="h-3.5 w-3.5" />
            <span>Queue</span>
            {queueState.metrics.waiting > 0 && (
              <Badge className="ml-1 animate-pulse bg-amber-500 px-1 py-0 text-[10px]">
                {queueState.metrics.waiting}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" />
            <span>Call Log</span>
          </TabsTrigger>
          <TabsTrigger value="recordings" className="flex items-center gap-1.5 text-xs">
            <Volume2 className="h-3.5 w-3.5" />
            <span>Recordings</span>
          </TabsTrigger>
          <TabsTrigger value="conferences" className="flex items-center gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            <span>Conference</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Primary Softphone & Dialer with Unified Telephone Card */}
        <TabsContent value="dialer" className="space-y-6">
          <UnifiedTelephoneCard
            voice={voice}
            userRole={userRole || 'admin'}
            isAssistant={isAssistant}
            onInitiateCall={initiateCall}
            onOpenWhatsAppConsole={() => setSelectedTab('whatsapp-voice')}
            onOpenIVRBuilder={() => setSelectedTab('ivr')}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <CallDialer 
              onInitiateCall={initiateCall}
              groups={groups}
              isLoading={isLoading}
              activeCall={activeCall ? { id: activeCall.id, status: activeCall.status } : null}
              onEndCall={activeCall ? () => terminateCall(activeCall.id) : undefined}
            />

            <div className="space-y-4">
              <AudioHardwareTester />
              <OutreachContactsPanel onInitiateCall={initiateCall} isLoading={isLoading} />
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: WhatsApp Voice Console */}
        <TabsContent value="whatsapp-voice">
          <WhatsAppVoiceConsole voice={voice} />
        </TabsContent>

        {/* Tab 3: Visual IVR Flow Builder & Simulator */}
        <TabsContent value="ivr">
          <VisualIVRBuilder voice={voice} />
        </TabsContent>

        {/* Tab 4: Telephony Numbers & Inbound Provisioning */}
        <TabsContent value="numbers">
          <TelephonyNumbersProvisioning userRole={userRole || 'admin'} isAssistant={isAssistant} />
        </TabsContent>

        {/* Tab 5: PBX Internal Extensions & Roles */}
        <TabsContent value="extensions">
          <AgentExtensionManager userRole={userRole || 'admin'} isAssistant={isAssistant} />
        </TabsContent>

        {/* Tab 6: Voice Health & Gateway Telemetry */}
        <TabsContent value="telecom-health">
          <VoiceHealthDashboard />
        </TabsContent>

        {/* Tab 7: Inbound Queues */}
        <TabsContent value="queue">
          <CallQueueList
            queueState={queueState}
            onAnswer={answerQueuedCall}
            onEscalate={escalateQueuedCall}
            onDismiss={dismissQueuedCall}
          />
        </TabsContent>

        {/* Tab 8: Unified Call History & Transcripts */}
        <TabsContent value="history">
          <UnifiedCallHistory
            userRole={userRole || 'admin'}
            isAssistant={isAssistant}
            onOpenMessageComposer={(payload) => {
              setSelectedTab('whatsapp-voice');
            }}
          />
        </TabsContent>

        {/* Tab 9: Audio Recordings */}
        <TabsContent value="recordings">
          <CallRecordingsPanel calls={calls} onRefresh={refreshCalls} isLoading={isLoading} />
        </TabsContent>

        {/* Tab 10: Multi-party Conferences */}
        <TabsContent value="conferences">
          <ConferenceRoomPanel
            activeCalls={activeCalls}
            onEndCall={terminateCall}
          />
        </TabsContent>

        {/* Tab 11: Telephony Settings & Outbound Routing */}
        <TabsContent value="settings" className="space-y-4">
          <OutboundNumberRouting />
          <VoIPFeatureSettings />
          <TwiMLAppConfigPanel />
          <AccentConversionAgentPanel agent={accentAgent} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CallCenterPage;
