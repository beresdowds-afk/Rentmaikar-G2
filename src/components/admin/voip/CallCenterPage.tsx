import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Users, History, Settings, PhoneCall, Globe, Radio, UserPlus, Volume2, Link2, Headphones, PhoneOff, Sparkles, ListOrdered, PhoneIncoming, GitBranch, UserCheck } from 'lucide-react';
import { useVoIPCalls } from '@/hooks/useVoIPCalls';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { useVoiceDevice } from '@/hooks/useVoiceDevice';
import { useAccentConversionAgent } from '@/hooks/useAccentConversionAgent';
import { useCallQueue } from '@/hooks/useCallQueue';
import { useCallRouter } from '@/hooks/useCallRouter';
import { CallDialer } from './CallDialer';
import { CallHistory } from './CallHistory';
import { CallGroups } from './CallGroups';
import { ActiveCallPanel } from './ActiveCallPanel';
import { AudioHardwareTester } from './AudioHardwareTester';
import { VoIPFeatureSettings } from './VoIPFeatureSettings';
import { OutreachContactsPanel } from './OutreachContactsPanel';
import { ConferenceRoomPanel } from './ConferenceRoomPanel';
import { CallRecordingsPanel } from './CallRecordingsPanel';
import { TwiMLAppConfigPanel } from './TwiMLAppConfigPanel';
import { AccentConversionAgentPanel } from './AccentConversionAgentPanel';
import { CallQueueList } from './CallQueueList';
import { CallRouterPanel } from './CallRouterPanel';
import { IncomingCallAlerts } from '@/components/voice/IncomingCallAlerts';
import { Badge } from '@/components/ui/badge';
import type { CallQueueItem } from '@/types/voip';

export const CallCenterPage = () => {
  const { calls, groups, isLoading, activeCall, initiateCall, endCall, createGroup, deleteGroup, refreshCalls } = useVoIPCalls();
  const { incomingRequests, acceptCallRequest, rejectCallRequest, escalateCallRequest } = useVoiceCall('admin');
  const {
    queueItems,
    queueStats,
    isLoading: isQueueLoading,
    audioAlertsEnabled,
    toggleAudioAlerts,
    answerCall: answerQueueCall,
    dismissCall: dismissQueueCall,
    escalateCall: escalateQueueCall,
    simulateInboundCall,
    clearAllSimulated,
    refreshQueue,
  } = useCallQueue();
  const voiceDevice = useVoiceDevice();
  const accentAgent = useAccentConversionAgent();
  const [selectedTab, setSelectedTab] = useState('dialer');

  const activeCalls = calls.filter(c => ['ringing', 'in-progress'].includes(c.status));
  const effectiveActiveCall = activeCall || (activeCalls.length > 0 ? activeCalls[0] : null);
  const isWebRTCOnCall = voiceDevice.status === 'on-call' || voiceDevice.status === 'connecting';
  const usaCalls = calls.filter(c => c.region === 'USA');
  const nigeriaCalls = calls.filter(c => c.region === 'Nigeria');

  const handleEndAllActive = async () => {
    if (isWebRTCOnCall) {
      voiceDevice.hangUp();
    }
    for (const call of activeCalls) {
      await endCall(call.id);
    }
  };

  const handleAnswerFromQueue = async (item: CallQueueItem) => {
    await answerQueueCall(item, async (callType, region, recipients) => {
      return initiateCall(callType, region, recipients);
    });
    // If phone call dialed or active, user can also manage from active panel
    refreshCalls();
  };

  const formatWaitTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stats = [
    {
      label: 'Call Queue',
      value: queueStats.totalWaiting,
      subtext: queueStats.totalWaiting === 0 ? 'Queue clear' : `${queueStats.urgentCount} urgent`,
      icon: ListOrdered,
      color: queueStats.totalWaiting > 0 ? 'text-amber-500 animate-pulse' : 'text-muted-foreground',
      tabTarget: 'queue',
      badge: queueStats.totalWaiting > 0 ? 'WAITING' : null,
    },
    { label: 'Active Calls', value: activeCalls.length, subtext: `${activeCalls.length} live lines`, icon: PhoneCall, color: 'text-green-500', tabTarget: 'dialer' },
    { label: 'USA Calls Today', value: usaCalls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length, subtext: 'Regional inbound/outbound', icon: Globe, color: 'text-blue-500', tabTarget: 'history' },
    { label: 'Nigeria Calls Today', value: nigeriaCalls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length, subtext: 'Regional inbound/outbound', icon: Globe, color: 'text-emerald-500', tabTarget: 'history' },
    { label: 'Call Groups', value: groups.length, subtext: 'Configured teams', icon: Users, color: 'text-purple-500', tabTarget: 'groups' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">VoIP Call Center</h2>
          <p className="text-muted-foreground">
            Manage VoIP audio calls using your device's speakers and microphone across USA (+1) and Nigeria (+234)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeCalls.length > 1 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEndAllActive}
              className="h-8 text-xs bg-red-600 hover:bg-red-700"
            >
              <PhoneOff className="h-3.5 w-3.5 mr-1" />
              End All Active Calls ({activeCalls.length})
            </Button>
          )}
          <Badge variant="outline" className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            USA: +1
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Nigeria: +234
          </Badge>
          <Badge
            variant="outline"
            onClick={() => setSelectedTab('accent-agent')}
            className={`cursor-pointer transition-colors flex items-center gap-1.5 py-1 px-2.5 ${
              accentAgent.isListening
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950'
            }`}
            title="Configure American Accent Agent"
          >
            <span>🇺🇸</span>
            <span className="font-semibold">Accent Agent:</span>
            <span>{accentAgent.isListening ? 'Active' : 'Standby'}</span>
            {accentAgent.isListening && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </Badge>
        </div>
      </div>

      {/* Incoming Call Alerts */}
      <IncomingCallAlerts
        requests={incomingRequests}
        onAccept={acceptCallRequest}
        onReject={rejectCallRequest}
        onEscalate={escalateCallRequest}
        userRole="admin"
      />

      {/* Incoming Call Queue Alert Banner */}
      {queueStats.totalWaiting > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-foreground shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse flex-shrink-0">
              <PhoneIncoming className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">
                  {queueStats.totalWaiting} Incoming Call{queueStats.totalWaiting === 1 ? '' : 's'} Waiting in Queue
                </span>
                {queueStats.urgentCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-bold animate-pulse">
                    {queueStats.urgentCount} Urgent
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Longest wait time: <span className="font-mono font-medium text-foreground">{formatWaitTime(queueStats.longestWaitSeconds)}</span> • USA: {queueStats.usaCount} • Nigeria: {queueStats.nigeriaCount}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setSelectedTab('queue')}
            className="h-8 gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm flex-shrink-0"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Open Call Queue ({queueStats.totalWaiting})
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className={`cursor-pointer transition-colors ${
              stat.tabTarget === 'queue' && queueStats.totalWaiting > 0
                ? 'border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10'
                : 'hover:bg-muted/40'
            }`}
            onClick={() => stat.tabTarget && setSelectedTab(stat.tabTarget)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-bold font-mono">{stat.value}</div>
                {stat.badge && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 animate-pulse font-bold">
                    {stat.badge}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stat.subtext}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Call Panel (Prominent with Call End Button and Live Audio Controls) */}
      {effectiveActiveCall && (
        <ActiveCallPanel 
          call={effectiveActiveCall} 
          onEndCall={() => endCall(effectiveActiveCall.id)}
          voiceDevice={voiceDevice}
          accentAgent={accentAgent}
        />
      )}

      {/* Device Hardware Tester (Speakers & Microphone) */}
      <AudioHardwareTester voiceDevice={voiceDevice} />

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="flex flex-wrap items-center gap-1 w-full lg:w-auto h-auto p-1 bg-muted/80 rounded-lg">
          <TabsTrigger value="queue" className="flex items-center gap-1.5 text-xs">
            <ListOrdered className="h-4 w-4 text-amber-500" />
            <span>Call Queue</span>
            {queueStats.totalWaiting > 0 && (
              <Badge variant="destructive" className="ml-0.5 h-4 px-1.5 text-[10px] font-bold rounded-full animate-pulse">
                {queueStats.totalWaiting}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dialer" className="flex items-center gap-1.5 text-xs">
            <Phone className="h-4 w-4" />
            <span>Make Call</span>
          </TabsTrigger>
          <TabsTrigger value="accent-agent" className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <span>Accent Agent</span>
            {accentAgent.isListening && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex items-center gap-1.5 text-xs">
            <UserPlus className="h-4 w-4" />
            <span>Contacts</span>
          </TabsTrigger>
          <TabsTrigger value="conferences" className="flex items-center gap-1.5 text-xs">
            <Radio className="h-4 w-4" />
            <span>Conferences</span>
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-1.5 text-xs">
            <Users className="h-4 w-4" />
            <span>Groups</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs">
            <History className="h-4 w-4" />
            <span>History</span>
          </TabsTrigger>
          <TabsTrigger value="recordings" className="flex items-center gap-1.5 text-xs">
            <Volume2 className="h-4 w-4" />
            <span>Recordings</span>
          </TabsTrigger>
          <TabsTrigger value="twiml" className="flex items-center gap-1.5 text-xs">
            <Link2 className="h-4 w-4" />
            <span>In-app Setup</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5 text-xs">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <CallQueueList
            queueItems={queueItems}
            queueStats={queueStats}
            isLoading={isQueueLoading}
            onAnswerCall={handleAnswerFromQueue}
            onDismissCall={dismissQueueCall}
            onEscalateCall={escalateQueueCall}
            onSimulateCall={simulateInboundCall}
            onClearSimulated={clearAllSimulated}
            onRefresh={refreshQueue}
            audioAlertsEnabled={audioAlertsEnabled}
            onToggleAudioAlerts={toggleAudioAlerts}
          />
        </TabsContent>

        <TabsContent value="dialer">
          <CallDialer 
            onInitiateCall={initiateCall}
            groups={groups}
            isLoading={isLoading}
            voiceDevice={voiceDevice}
            onEndCall={endCall}
            activeCall={effectiveActiveCall}
            accentAgent={accentAgent}
          />
        </TabsContent>

        <TabsContent value="accent-agent">
          <AccentConversionAgentPanel agent={accentAgent} />
        </TabsContent>

        <TabsContent value="contacts">
          <OutreachContactsPanel onInitiateCall={initiateCall} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="conferences">
          <ConferenceRoomPanel
            activeCalls={activeCalls}
            onEndCall={endCall}
          />
        </TabsContent>

        <TabsContent value="groups">
          <CallGroups 
            groups={groups}
            onCreateGroup={createGroup}
            onDeleteGroup={deleteGroup}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="history">
          <CallHistory 
            calls={calls}
            onRefresh={refreshCalls}
            isLoading={isLoading}
            onEndCall={endCall}
          />
        </TabsContent>

        <TabsContent value="recordings">
          <CallRecordingsPanel calls={calls} onRefresh={refreshCalls} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="twiml">
          <TwiMLAppConfigPanel />
        </TabsContent>

        <TabsContent value="settings">
          <VoIPFeatureSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CallCenterPage;
