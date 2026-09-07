import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  GitFork,
  Play,
  CheckCircle2,
  AlertTriangle,
  Radio,
  PhoneCall,
  Volume2,
  Clock,
  Layers,
  ArrowRight,
  Sparkles,
  PhoneOff,
  UserCheck,
  ShieldAlert,
  HelpCircle,
  Save,
  Send,
  Eye,
  Hash,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface IVRNode {
  id: string;
  title: string;
  type: 'greeting' | 'menu' | 'auth' | 'queue' | 'extension' | 'voicemail' | 'time_check' | 'emergency';
  prompt: string;
  ttsVoice: string;
  inputExpected?: 'dtmf' | 'speech' | 'none';
  timeoutSeconds: number;
  maxRetries: number;
  fallbackNodeId: string;
  branches?: { digit: string; label: string; targetNodeId: string }[];
  targetQueue?: string;
  targetExtension?: string;
  enabled: boolean;
}

const DEFAULT_NODES: IVRNode[] = [
  {
    id: 'node_welcome',
    title: '1. Welcome Greeting',
    type: 'greeting',
    prompt: 'Welcome to Rentmaikar Vehicle Operations. Connecting you to verified rentals across USA and Nigeria.',
    ttsVoice: 'Polly.Joanna (US English)',
    inputExpected: 'none',
    timeoutSeconds: 3,
    maxRetries: 1,
    fallbackNodeId: 'node_language',
    enabled: true,
  },
  {
    id: 'node_language',
    title: '2. Language Selection',
    type: 'menu',
    prompt: 'For English, press 1. Para español, oprima 2. For Nigerian Pidgin, press 3.',
    ttsVoice: 'Polly.Joanna (US English)',
    inputExpected: 'dtmf',
    timeoutSeconds: 8,
    maxRetries: 2,
    fallbackNodeId: 'node_main_menu',
    branches: [
      { digit: '1', label: 'English', targetNodeId: 'node_main_menu' },
      { digit: '2', label: 'Español', targetNodeId: 'node_main_menu' },
      { digit: '3', label: 'Pidgin', targetNodeId: 'node_main_menu' },
    ],
    enabled: true,
  },
  {
    id: 'node_main_menu',
    title: '3. Main Department Menu',
    type: 'menu',
    prompt: 'If you are a driver with an active rental or payment inquiry, press 1. For vehicle owners and fleet support, press 2. For new KYC driver onboarding, press 3. For emergency breakdown or accident, press 4. To speak with an admin operator, press 0.',
    ttsVoice: 'Polly.Joanna (US English)',
    inputExpected: 'dtmf',
    timeoutSeconds: 10,
    maxRetries: 3,
    fallbackNodeId: 'node_operator_queue',
    branches: [
      { digit: '1', label: 'Driver Inquiry / Payment', targetNodeId: 'node_driver_auth' },
      { digit: '2', label: 'Owner & Fleet Support', targetNodeId: 'node_owner_queue' },
      { digit: '3', label: 'New Onboarding & KYC', targetNodeId: 'node_onboarding_ext' },
      { digit: '4', label: 'Emergency Breakdown', targetNodeId: 'node_emergency' },
      { digit: '0', label: 'Admin Assistant Operator', targetNodeId: 'node_operator_queue' },
    ],
    enabled: true,
  },
  {
    id: 'node_driver_auth',
    title: '4. Driver Contact Lookup',
    type: 'auth',
    prompt: 'Please enter your registered 10-digit phone number or national ID to authenticate your rental agreement.',
    ttsVoice: 'Polly.Joanna (US English)',
    inputExpected: 'dtmf',
    timeoutSeconds: 12,
    maxRetries: 2,
    fallbackNodeId: 'node_operator_queue',
    enabled: true,
  },
  {
    id: 'node_emergency',
    title: '5. Emergency Breakdown Dispatch',
    type: 'emergency',
    prompt: 'You have reached the Rentmaikar Emergency Line. If this is a medical emergency, please dial 911 or 112. Connecting to 24/7 Roadside Rescue immediately.',
    ttsVoice: 'Polly.Matthew (US English)',
    inputExpected: 'none',
    timeoutSeconds: 5,
    maxRetries: 1,
    fallbackNodeId: 'node_emergency_ring',
    enabled: true,
  },
  {
    id: 'node_emergency_ring',
    title: '6. Roadside Ring Group',
    type: 'queue',
    prompt: 'Ringing Emergency Dispatcher Group (Admin & IoT Staff)...',
    ttsVoice: 'Polly.Joanna (US English)',
    targetQueue: 'emergency_roadside',
    timeoutSeconds: 30,
    maxRetries: 1,
    fallbackNodeId: 'node_voicemail',
    enabled: true,
  },
  {
    id: 'node_owner_queue',
    title: '7. Owner Support Queue',
    type: 'queue',
    prompt: 'Routing your call to Vehicle Owner Operations...',
    ttsVoice: 'Polly.Joanna (US English)',
    targetQueue: 'owner_operations',
    timeoutSeconds: 25,
    maxRetries: 1,
    fallbackNodeId: 'node_voicemail',
    enabled: true,
  },
  {
    id: 'node_onboarding_ext',
    title: '8. KYC Onboarding Extension',
    type: 'extension',
    prompt: 'Transferring to Extension 203 (Amara Nwosu - Verification Inquiries)...',
    ttsVoice: 'Polly.Joanna (US English)',
    targetExtension: '203',
    timeoutSeconds: 20,
    maxRetries: 1,
    fallbackNodeId: 'node_operator_queue',
    enabled: true,
  },
  {
    id: 'node_operator_queue',
    title: '9. Admin Assistant Queue',
    type: 'queue',
    prompt: 'Please hold while we connect you with the next available Rentmaikar assistant.',
    ttsVoice: 'Polly.Joanna (US English)',
    targetQueue: 'general_support',
    timeoutSeconds: 45,
    maxRetries: 1,
    fallbackNodeId: 'node_voicemail',
    enabled: true,
  },
  {
    id: 'node_voicemail',
    title: '10. Automated Voicemail Box',
    type: 'voicemail',
    prompt: 'All assistants are currently assisting other callers. Please leave your name, vehicle registration or inquiry after the tone. A WhatsApp callback notification will be generated instantly.',
    ttsVoice: 'Polly.Joanna (US English)',
    timeoutSeconds: 60,
    maxRetries: 1,
    fallbackNodeId: 'node_end',
    enabled: true,
  },
];

interface VisualIVRBuilderProps {
  userRole?: string;
  isAssistant?: boolean;
}

export const VisualIVRBuilder = ({
  userRole = 'admin',
  isAssistant = false,
}: VisualIVRBuilderProps) => {
  const { toast } = useToast();
  const [nodes, setNodes] = useState<IVRNode[]>(DEFAULT_NODES);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node_welcome');
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastPublishedAt, setLastPublishedAt] = useState<string>('2026-09-04 18:30:00 UTC');
  const [activeTab, setActiveTab] = useState<'flow' | 'simulator' | 'rules'>('flow');

  // Interactive Simulator State
  const [simActive, setSimActive] = useState(false);
  const [simCurrentNodeId, setSimCurrentNodeId] = useState('node_welcome');
  const [simLogs, setSimLogs] = useState<string[]>([]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const canEdit = userRole === 'admin' && !isAssistant;

  // Validation
  const validateFlow = useCallback((): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    nodes.forEach((node) => {
      if (!node.prompt.trim()) {
        errors.push(`Node "${node.title}" has an empty audio prompt.`);
      }
      if (node.type === 'menu' && (!node.branches || node.branches.length === 0)) {
        errors.push(`Menu node "${node.title}" has no DTMF branches configured.`);
      }
      if (node.type === 'extension' && !node.targetExtension) {
        errors.push(`Extension node "${node.title}" has no destination extension assigned.`);
      }
      if (node.type === 'queue' && !node.targetQueue) {
        errors.push(`Queue node "${node.title}" has no target queue assigned.`);
      }
    });
    return { valid: errors.length === 0, errors };
  }, [nodes]);

  const validation = validateFlow();

  const handleUpdateSelectedNode = (patch: Partial<IVRNode>) => {
    if (!canEdit) return;
    setNodes((prev) =>
      prev.map((node) => (node.id === selectedNodeId ? { ...node, ...patch } : node))
    );
  };

  const handlePublish = async () => {
    if (!validation.valid) {
      toast({
        title: 'Validation Errors Detected',
        description: 'Please resolve all incomplete node pathways before publishing.',
        variant: 'destructive',
      });
      return;
    }

    setIsPublishing(true);
    // Simulate real edge function deployment to voice-ivr-case
    setTimeout(() => {
      setIsPublishing(false);
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      setLastPublishedAt(now);
      toast({
        title: 'IVR Published Successfully',
        description: `Voice XML Flow deployed to USA (+1 608 548-9220) and Nigeria (+234 916 307 2576).`,
      });
    }, 1200);
  };

  // Simulator Actions
  const startSimulator = () => {
    setSimActive(true);
    setSimCurrentNodeId('node_welcome');
    const startNode = nodes.find((n) => n.id === 'node_welcome');
    setSimLogs([
      `[CALL CONNECTED] Inbound Call to +1 (608) 548-9220`,
      `[NODE: ${startNode?.title}] TTS Prompt: "${startNode?.prompt}"`,
    ]);
  };

  const endSimulator = () => {
    setSimActive(false);
    setSimLogs((prev) => [...prev, `[CALL ENDED] Softphone session terminated.`]);
  };

  const playDtmfTone = (digit: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(800 + parseInt(digit || '1', 10) * 80, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => ctx.close().catch(() => {}), 300);
    } catch {}
  };

  const handleSimDtmf = (digit: string) => {
    if (!simActive) return;
    playDtmfTone(digit);
    const currNode = nodes.find((n) => n.id === simCurrentNodeId);
    if (!currNode) return;

    if (currNode.branches) {
      const match = currNode.branches.find((b) => b.digit === digit);
      if (match) {
        const nextNode = nodes.find((n) => n.id === match.targetNodeId);
        setSimCurrentNodeId(match.targetNodeId);
        setSimLogs((prev) => [
          ...prev,
          `[DTMF KEY ${digit}] Selected "${match.label}" -> Transition to ${nextNode?.title}`,
          `[TTS PROMPT] "${nextNode?.prompt}"`,
        ]);
        return;
      }
    }

    setSimLogs((prev) => [
      ...prev,
      `[DTMF KEY ${digit}] Invalid selection for current node. Retrying...`,
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600">
            <GitFork className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">Visual IVR Flow Builder</h3>
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30 text-xs">
                v2.1 Active
              </Badge>
              {validation.valid ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Validated
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Incomplete Flow
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Build, validate, simulate, and deploy interactive voice response journeys for Rentmaikar callers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handlePublish}
              disabled={isPublishing || !validation.valid}
            >
              <Send className="h-4 w-4" />
              {isPublishing ? 'Publishing IVR...' : 'Publish to Production'}
            </Button>
          ) : (
            <Badge variant="secondary" className="text-xs">
              <Eye className="h-3 w-3 mr-1" /> View Only (Admin Assistant)
            </Badge>
          )}
        </div>
      </div>

      {!canEdit && (
        <Alert>
          <HelpCircle className="h-4 w-4" />
          <AlertTitle>Admin Assistant Read-Only Notice</AlertTitle>
          <AlertDescription className="text-xs">
            Admin Assistants can inspect active IVR journeys and test them in the Interactive Simulator, but only Full Administrators can modify nodes or deploy updates to live business DIDs.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Tabs: Visual Flow Graph vs Interactive Simulator vs Business Hours */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="flow" className="gap-2">
            <Layers className="h-4 w-4" /> Visual Flow
          </TabsTrigger>
          <TabsTrigger value="simulator" className="gap-2">
            <Play className="h-4 w-4" /> Interactive Simulator
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Clock className="h-4 w-4" /> Business Hours & Routing
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Visual Graph & Node Inspector */}
        <TabsContent value="flow" className="space-y-6 mt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: Interactive Node Hierarchy */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Call Journey Stages ({nodes.length} Nodes)
                </span>
                <span className="text-xs text-muted-foreground">
                  Last Published: <span className="font-mono">{lastPublishedAt}</span>
                </span>
              </div>

              <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
                {nodes.map((node, index) => {
                  const isSelected = node.id === selectedNodeId;
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/10 shadow-sm ring-1 ring-purple-500'
                          : 'hover:border-border/80 bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {node.type.toUpperCase()}
                          </Badge>
                          <span className="font-medium text-sm">{node.title}</span>
                        </div>
                        <Badge
                          variant={node.enabled ? 'secondary' : 'destructive'}
                          className="text-[10px]"
                        >
                          {node.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                        "{node.prompt}"
                      </p>

                      {node.branches && node.branches.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t">
                          {node.branches.map((b) => (
                            <span
                              key={b.digit}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-[11px] font-mono text-muted-foreground"
                            >
                              <span className="font-bold text-foreground">[{b.digit}]</span> {b.label}
                            </span>
                          ))}
                        </div>
                      )}

                      {node.targetExtension && (
                        <div className="mt-2 text-[11px] text-purple-600 dark:text-purple-400 flex items-center gap-1 font-mono">
                          <ArrowRight className="h-3 w-3" /> Dial Extension: {node.targetExtension}
                        </div>
                      )}

                      {node.targetQueue && (
                        <div className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 font-mono">
                          <ArrowRight className="h-3 w-3" /> Queue: {node.targetQueue}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Node Inspector & Editor */}
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Node Inspector: {selectedNode.title}
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure prompt text, DTMF rules, timeouts, and fallback routing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Node Title</Label>
                  <Input
                    value={selectedNode.title}
                    disabled={!canEdit}
                    onChange={(e) => handleUpdateSelectedNode({ title: e.target.value })}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Node Type</Label>
                  <Select
                    value={selectedNode.type}
                    disabled={!canEdit}
                    onValueChange={(val: any) => handleUpdateSelectedNode({ type: val })}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="greeting">Greeting / Announcement</SelectItem>
                      <SelectItem value="menu">DTMF Menu Options</SelectItem>
                      <SelectItem value="auth">Customer Identification (KYC Lookup)</SelectItem>
                      <SelectItem value="queue">Call Center Queue</SelectItem>
                      <SelectItem value="extension">Extension Dialing</SelectItem>
                      <SelectItem value="emergency">Roadside Emergency</SelectItem>
                      <SelectItem value="voicemail">Voicemail Box</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Voice Prompt (TTS / Audio Announcement)</Label>
                  <Textarea
                    value={selectedNode.prompt}
                    disabled={!canEdit}
                    onChange={(e) => handleUpdateSelectedNode({ prompt: e.target.value })}
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Timeout (sec)</Label>
                    <Input
                      type="number"
                      value={selectedNode.timeoutSeconds}
                      disabled={!canEdit}
                      onChange={(e) =>
                        handleUpdateSelectedNode({ timeoutSeconds: parseInt(e.target.value || '10', 10) })
                      }
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Max Retries</Label>
                    <Input
                      type="number"
                      value={selectedNode.maxRetries}
                      disabled={!canEdit}
                      onChange={(e) =>
                        handleUpdateSelectedNode({ maxRetries: parseInt(e.target.value || '1', 10) })
                      }
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                {selectedNode.type === 'extension' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Target Extension</Label>
                    <Input
                      value={selectedNode.targetExtension || ''}
                      disabled={!canEdit}
                      placeholder="e.g. 101, 201, 202"
                      onChange={(e) => handleUpdateSelectedNode({ targetExtension: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>
                )}

                {selectedNode.type === 'queue' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Destination Queue</Label>
                    <Select
                      value={selectedNode.targetQueue || 'general_support'}
                      disabled={!canEdit}
                      onValueChange={(val) => handleUpdateSelectedNode({ targetQueue: val })}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general_support">Admin Assistant General Queue</SelectItem>
                        <SelectItem value="owner_operations">Owner & Fleet Operations</SelectItem>
                        <SelectItem value="emergency_roadside">Emergency Roadside Dispatch</SelectItem>
                        <SelectItem value="billing_payments">Billing & Default Inquiries</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <Label htmlFor="node-active-switch" className="text-xs cursor-pointer">
                    Enable Node in Active Call Routing
                  </Label>
                  <Switch
                    id="node-active-switch"
                    checked={selectedNode.enabled}
                    onCheckedChange={(val) => handleUpdateSelectedNode({ enabled: val })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Interactive IVR Simulator Softphone */}
        <TabsContent value="simulator" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Play className="h-4 w-4 text-emerald-600" />
                Live In-Browser IVR Simulator
              </CardTitle>
              <CardDescription className="text-xs">
                Dial through the IVR tree exactly as a Rentmaikar driver or vehicle owner would experience it. Press DTMF keys to test branching.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-muted/40 border">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      simActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {simActive ? 'Simulator Active · Call In Progress' : 'Simulator Idle'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Target Number: <span className="font-mono">+1 (608) 548-9220 (Rentmaikar USA)</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {!simActive ? (
                    <Button onClick={startSimulator} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <PhoneCall className="h-4 w-4" /> Start Simulator Call
                    </Button>
                  ) : (
                    <Button onClick={endSimulator} variant="destructive" className="gap-2">
                      <PhoneOff className="h-4 w-4" /> Hang Up Simulator
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Simulator Dialpad */}
                <div className="p-4 rounded-xl border bg-card space-y-4">
                  <div className="text-center">
                    <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                      Interactive DTMF Keypad
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Click digits to send dual-tone frequencies to the active IVR node.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                      <Button
                        key={digit}
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={!simActive}
                        onClick={() => handleSimDtmf(digit)}
                        className="h-12 text-lg font-bold font-mono hover:bg-accent active:scale-95"
                      >
                        {digit}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Simulator Telephony Transcript Logs */}
                <div className="p-4 rounded-xl border bg-muted/20 flex flex-col h-[320px]">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                      Live Call Traversal Stream
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      WebRTC Simulation
                    </Badge>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pt-3 font-mono text-xs">
                    {simLogs.length === 0 ? (
                      <p className="text-muted-foreground italic text-center pt-16">
                        Click "Start Simulator Call" above to begin testing the IVR branches.
                      </p>
                    ) : (
                      simLogs.map((log, idx) => (
                        <div key={idx} className="leading-relaxed p-1.5 rounded bg-background/70 border text-foreground">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Business Hours & Routing */}
        <TabsContent value="rules" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Business Hours & Schedule-Based Routing Rules
              </CardTitle>
              <CardDescription className="text-xs">
                Govern how inbound calls on USA and Nigeria DIDs are routed during open hours versus after-hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">USA Business Hours (EST)</h4>
                    <Badge variant="outline" className="text-emerald-600 bg-emerald-500/10">Active</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Monday - Friday: 08:00 AM - 08:00 PM EST</p>
                  <p className="text-xs text-muted-foreground">Saturday: 09:00 AM - 05:00 PM EST</p>
                  <div className="pt-2 text-xs font-medium text-primary">
                    After-hours rule: Forward to Voicemail Box & Send WhatsApp notification.
                  </div>
                </div>

                <div className="p-4 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Nigeria Business Hours (WAT)</h4>
                    <Badge variant="outline" className="text-emerald-600 bg-emerald-500/10">Active</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Monday - Saturday: 07:00 AM - 09:00 PM WAT</p>
                  <p className="text-xs text-muted-foreground">Sunday: 10:00 AM - 06:00 PM WAT</p>
                  <div className="pt-2 text-xs font-medium text-primary">
                    Emergency Line (Digit 4): 24/7 Unrestricted Bypass
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
