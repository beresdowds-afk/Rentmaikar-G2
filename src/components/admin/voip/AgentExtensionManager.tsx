import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Users,
  Phone,
  ShieldCheck,
  ShieldAlert,
  Headphones,
  Laptop,
  CheckCircle2,
  Clock,
  Radio,
  Sliders,
  Sparkles,
  Search,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface AgentExtension {
  id: string;
  extension: string;
  name: string;
  email: string;
  role: 'admin' | 'admin_assistant' | 'system';
  directDid: string;
  endpointType: 'WebRTC Browser Softphone' | 'SIP Desk Phone' | 'IVR Service';
  presence: 'available' | 'in_call' | 'busy' | 'offline';
  assignedQueues: string[];
  ringGroups: string[];
  permissions: {
    canMakeOutbound: boolean;
    canTransferCalls: boolean;
    canUseWhatsAppVoice: boolean;
    canViewRecordings: boolean;
    canManageQueues: boolean;
    canAdminIVR: boolean;
  };
}

const INITIAL_EXTENSIONS: AgentExtension[] = [
  {
    id: 'ext_101',
    extension: '101',
    name: 'Olusola Adebayo',
    email: 'eastfortemain@gmail.com',
    role: 'admin',
    directDid: '+2348139051772',
    endpointType: 'WebRTC Browser Softphone',
    presence: 'available',
    assignedQueues: ['Emergency Roadside', 'General Support', 'Owner Operations'],
    ringGroups: ['Executive Ring Group', 'All Staff'],
    permissions: {
      canMakeOutbound: true,
      canTransferCalls: true,
      canUseWhatsAppVoice: true,
      canViewRecordings: true,
      canManageQueues: true,
      canAdminIVR: true,
    },
  },
  {
    id: 'ext_102',
    extension: '102',
    name: 'Eastforte Operations',
    email: 'admin@rentmaikar.com',
    role: 'admin',
    directDid: '+234 916 307 2576',
    endpointType: 'WebRTC Browser Softphone',
    presence: 'available',
    assignedQueues: ['General Support', 'Billing & Default'],
    ringGroups: ['Executive Ring Group', 'All Staff'],
    permissions: {
      canMakeOutbound: true,
      canTransferCalls: true,
      canUseWhatsAppVoice: true,
      canViewRecordings: true,
      canManageQueues: true,
      canAdminIVR: true,
    },
  },
  {
    id: 'ext_201',
    extension: '201',
    name: 'Sarah Jenkins',
    email: 'sarah.j@rentmaikar.com',
    role: 'admin_assistant',
    directDid: '+1 (608) 384-3932',
    endpointType: 'WebRTC Browser Softphone',
    presence: 'available',
    assignedQueues: ['General Support', 'Driver Support'],
    ringGroups: ['Tier 1 Support', 'All Staff'],
    permissions: {
      canMakeOutbound: true,
      canTransferCalls: true,
      canUseWhatsAppVoice: true,
      canViewRecordings: false,
      canManageQueues: false,
      canAdminIVR: false,
    },
  },
  {
    id: 'ext_202',
    extension: '202',
    name: 'Michael Obi',
    email: 'michael.o@rentmaikar.com',
    role: 'admin_assistant',
    directDid: '+234 916 307 2576 (Ext 202)',
    endpointType: 'WebRTC Browser Softphone',
    presence: 'in_call',
    assignedQueues: ['Owner Operations', 'Fleet Dispatch'],
    ringGroups: ['Owner Desk', 'All Staff'],
    permissions: {
      canMakeOutbound: true,
      canTransferCalls: true,
      canUseWhatsAppVoice: true,
      canViewRecordings: false,
      canManageQueues: false,
      canAdminIVR: false,
    },
  },
  {
    id: 'ext_203',
    extension: '203',
    name: 'Amara Nwosu',
    email: 'amara.n@rentmaikar.com',
    role: 'admin_assistant',
    directDid: '+234 800 736 8624',
    endpointType: 'WebRTC Browser Softphone',
    presence: 'available',
    assignedQueues: ['Verification & KYC', 'Billing & Default'],
    ringGroups: ['Onboarding Desk', 'All Staff'],
    permissions: {
      canMakeOutbound: true,
      canTransferCalls: true,
      canUseWhatsAppVoice: true,
      canViewRecordings: false,
      canManageQueues: false,
      canAdminIVR: false,
    },
  },
  {
    id: 'ext_301',
    extension: '301',
    name: 'David Vance',
    email: 'david.v@rentmaikar.com',
    role: 'admin_assistant',
    directDid: '+1 (608) 548-9220 (Ext 301)',
    endpointType: 'SIP Desk Phone',
    presence: 'busy',
    assignedQueues: ['Emergency Roadside'],
    ringGroups: ['Emergency Dispatch'],
    permissions: {
      canMakeOutbound: true,
      canTransferCalls: true,
      canUseWhatsAppVoice: false,
      canViewRecordings: false,
      canManageQueues: false,
      canAdminIVR: false,
    },
  },
];

interface AgentExtensionManagerProps {
  userRole?: string;
  isAssistant?: boolean;
  onDialExtension?: (ext: string) => void;
}

export const AgentExtensionManager = ({
  userRole = 'admin',
  isAssistant = false,
  onDialExtension,
}: AgentExtensionManagerProps) => {
  const { toast } = useToast();
  const [extensions, setExtensions] = useState<AgentExtension[]>(INITIAL_EXTENSIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentExtension | null>(null);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);

  const canManage = userRole === 'admin' && !isAssistant;

  const filtered = extensions.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.extension.includes(searchQuery) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTogglePermission = (field: keyof AgentExtension['permissions']) => {
    if (!selectedAgent || !canManage) return;
    const updated = {
      ...selectedAgent,
      permissions: {
        ...selectedAgent.permissions,
        [field]: !selectedAgent.permissions[field],
      },
    };
    setSelectedAgent(updated);
    setExtensions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    toast({
      title: 'Permission Updated',
      description: `Updated ${field} for extension ${selectedAgent.extension}.`,
    });
  };

  const getPresenceBadge = (p: AgentExtension['presence']) => {
    switch (p) {
      case 'available':
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px]">Available</Badge>;
      case 'in_call':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-[10px]">In Call</Badge>;
      case 'busy':
        return <Badge variant="secondary" className="text-[10px]">Busy</Badge>;
      case 'offline':
        return <Badge variant="outline" className="text-muted-foreground text-[10px]">Offline</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">Admin & Assistant Extension Directory</h3>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">
                Internal PBX
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provision internal 3-digit extensions, softphone endpoints, presence states, and role-based telephony permissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
            <Input
              placeholder="Search extensions or names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 h-9"
            />
          </div>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((agent) => (
          <Card key={agent.id} className="hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-primary">
                    Ext {agent.extension}
                  </span>
                  <Badge variant={agent.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                    {agent.role === 'admin' ? 'Admin' : 'Admin Assistant'}
                  </Badge>
                </div>
                {getPresenceBadge(agent.presence)}
              </div>
              <CardTitle className="text-sm font-semibold mt-1">{agent.name}</CardTitle>
              <CardDescription className="text-xs truncate">{agent.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Direct Inbound DID:</span>
                  <span className="font-mono text-foreground font-medium text-[11px]">{agent.directDid}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Endpoint Device:</span>
                  <span className="text-foreground text-[11px]">{agent.endpointType}</span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <span className="text-[11px] text-muted-foreground font-medium block mb-1">
                  Assigned Queues:
                </span>
                <div className="flex flex-wrap gap-1">
                  {agent.assignedQueues.map((q) => (
                    <span
                      key={q}
                      className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs flex-1"
                  onClick={() => {
                    if (onDialExtension) onDialExtension(agent.extension);
                    else {
                      toast({
                        title: 'Dialing Extension',
                        description: `Initiating internal softphone call to Ext ${agent.extension} (${agent.name}).`,
                      });
                    }
                  }}
                >
                  <Phone className="h-3.5 w-3.5" /> Call Ext
                </Button>

                {canManage && agent.role === 'admin_assistant' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedAgent(agent);
                      setIsPermissionsModalOpen(true);
                    }}
                  >
                    <Sliders className="h-3.5 w-3.5" /> Permissions
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permissions Matrix Modal */}
      <Dialog open={isPermissionsModalOpen} onOpenChange={setIsPermissionsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Telephony Permissions: {selectedAgent?.name} (Ext {selectedAgent?.extension})
            </DialogTitle>
            <DialogDescription className="text-xs">
              Manage operational rights for this Admin Assistant. Changes apply immediately to their softphone session.
            </DialogDescription>
          </DialogHeader>

          {selectedAgent && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Outbound VoIP Dialing</p>
                  <p className="text-xs text-muted-foreground">Permit calls to external USA and Nigeria numbers.</p>
                </div>
                <Switch
                  checked={selectedAgent.permissions.canMakeOutbound}
                  onCheckedChange={() => handleTogglePermission('canMakeOutbound')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Call Transfer (Blind & Warm)</p>
                  <p className="text-xs text-muted-foreground">Allow transferring active calls to other agents or queues.</p>
                </div>
                <Switch
                  checked={selectedAgent.permissions.canTransferCalls}
                  onCheckedChange={() => handleTogglePermission('canTransferCalls')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">WhatsApp Voice Calling</p>
                  <p className="text-xs text-muted-foreground">Allow starting voice calls via official WhatsApp DIDs.</p>
                </div>
                <Switch
                  checked={selectedAgent.permissions.canUseWhatsAppVoice}
                  onCheckedChange={() => handleTogglePermission('canUseWhatsAppVoice')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Call Recording Access</p>
                  <p className="text-xs text-muted-foreground">Allow listening to and downloading call audio recordings.</p>
                </div>
                <Switch
                  checked={selectedAgent.permissions.canViewRecordings}
                  onCheckedChange={() => handleTogglePermission('canViewRecordings')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Manage Inbound Queues</p>
                  <p className="text-xs text-muted-foreground">Allow reordering or reassigning callers in queue.</p>
                </div>
                <Switch
                  checked={selectedAgent.permissions.canManageQueues}
                  onCheckedChange={() => handleTogglePermission('canManageQueues')}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setIsPermissionsModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
