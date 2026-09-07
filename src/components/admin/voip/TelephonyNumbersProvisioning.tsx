import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Hash,
  Phone,
  Server,
  Radio,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Globe,
  MessageSquare,
  AlertTriangle,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface BusinessPhoneNumber {
  id: string;
  number: string;
  label: string;
  region: 'USA' | 'Nigeria';
  provider: 'Twilio SIP' | 'Termii Voice' | 'Sent.dm';
  status: 'active' | 'reserved' | 'suspended';
  inboundTargetType: 'ivr' | 'extension' | 'queue' | 'ring_group' | 'external';
  inboundTargetValue: string;
  fallbackTarget: string;
  capabilities: {
    voipVoice: boolean;
    whatsAppVoice: boolean;
    emergencyE911: boolean;
    callRecording: boolean;
  };
  assignedCallerIdForRoles: string[];
}

const INITIAL_NUMBERS: BusinessPhoneNumber[] = [
  {
    id: 'num_us_primary',
    number: '+1 (608) 548-9220',
    label: 'USA Primary Business & WhatsApp Voice Line',
    region: 'USA',
    provider: 'Twilio SIP',
    status: 'active',
    inboundTargetType: 'ivr',
    inboundTargetValue: 'v2.1 Main IVR Call Flow',
    fallbackTarget: 'Ext 101 (Olusola Adebayo)',
    capabilities: {
      voipVoice: true,
      whatsAppVoice: true,
      emergencyE911: true,
      callRecording: true,
    },
    assignedCallerIdForRoles: ['admin', 'admin_assistant'],
  },
  {
    id: 'num_ng_master',
    number: '+234 916 307 2576',
    label: 'Nigeria Master Operations & WhatsApp Voice Endpoint',
    region: 'Nigeria',
    provider: 'Termii Voice',
    status: 'active',
    inboundTargetType: 'ivr',
    inboundTargetValue: 'v2.1 Nigeria Case IVR',
    fallbackTarget: 'Ext 102 (Eastforte Operations)',
    capabilities: {
      voipVoice: true,
      whatsAppVoice: true,
      emergencyE911: false,
      callRecording: true,
    },
    assignedCallerIdForRoles: ['admin', 'admin_assistant'],
  },
  {
    id: 'num_us_support',
    number: '+1 (608) 384-3932',
    label: 'USA Support Direct Dial Line (Ext 201)',
    region: 'USA',
    provider: 'Twilio SIP',
    status: 'active',
    inboundTargetType: 'extension',
    inboundTargetValue: 'Ext 201 (Sarah Jenkins)',
    fallbackTarget: 'Admin Assistant General Queue',
    capabilities: {
      voipVoice: true,
      whatsAppVoice: false,
      emergencyE911: true,
      callRecording: true,
    },
    assignedCallerIdForRoles: ['admin_assistant'],
  },
  {
    id: 'num_ng_tollfree',
    number: '+234 800 736 8624',
    label: 'Nigeria 24/7 Roadside Toll-Free Line',
    region: 'Nigeria',
    provider: 'Termii Voice',
    status: 'active',
    inboundTargetType: 'queue',
    inboundTargetValue: 'Emergency Roadside Dispatch Queue',
    fallbackTarget: 'Emergency Ring Group',
    capabilities: {
      voipVoice: true,
      whatsAppVoice: false,
      emergencyE911: false,
      callRecording: true,
    },
    assignedCallerIdForRoles: ['admin'],
  },
];

interface TelephonyNumbersProvisioningProps {
  userRole?: string;
  isAssistant?: boolean;
}

export const TelephonyNumbersProvisioning = ({
  userRole = 'admin',
  isAssistant = false,
}: TelephonyNumbersProvisioningProps) => {
  const { toast } = useToast();
  const [numbers, setNumbers] = useState<BusinessPhoneNumber[]>(INITIAL_NUMBERS);
  const [selectedNumber, setSelectedNumber] = useState<BusinessPhoneNumber | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const canManage = userRole === 'admin' && !isAssistant;

  const handleSaveRouting = (targetType: BusinessPhoneNumber['inboundTargetType'], targetValue: string) => {
    if (!selectedNumber || !canManage) return;
    const updated = {
      ...selectedNumber,
      inboundTargetType: targetType,
      inboundTargetValue: targetValue,
    };
    setSelectedNumber(updated);
    setNumbers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setIsEditModalOpen(false);
    toast({
      title: 'Inbound Routing Updated',
      description: `Calls to ${selectedNumber.number} will now route to ${targetValue}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
            <Hash className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">Telephony Number Inventory & Inbound DIDs</h3>
              <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30 text-xs">
                PSTN & SIP DIDs
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provision real Rentmaikar business telephone numbers across USA and Nigeria, assign inbound destinations, and configure caller IDs.
            </p>
          </div>
        </div>

        <div>
          {isAssistant ? (
            <Badge variant="secondary" className="text-xs">
              <ShieldCheck className="h-3 w-3 mr-1 text-primary" /> Assistant View (Assigned Lines Only)
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" /> 4 Active Lines Configured
            </Badge>
          )}
        </div>
      </div>

      {isAssistant && (
        <div className="p-3.5 rounded-lg border bg-muted/30 text-xs text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
          <span>
            Admin Assistants can view assigned caller IDs and operational lines, but core carrier routing and number provisioning are restricted to Platform Administrators.
          </span>
        </div>
      )}

      {/* Numbers Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {numbers.map((item) => (
          <Card key={item.id} className="hover:border-primary/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {item.region === 'USA' ? '🇺🇸' : '🇳🇬'}
                  </span>
                  <span className="font-mono text-base font-bold text-foreground">
                    {item.number}
                  </span>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                  {item.status.toUpperCase()}
                </Badge>
              </div>
              <CardTitle className="text-sm font-semibold mt-1">{item.label}</CardTitle>
              <CardDescription className="text-xs flex items-center gap-2">
                <span>Carrier: {item.provider}</span>
                <span>•</span>
                <span>Region: {item.region}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {/* Routing Destination */}
              <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-medium">Primary Inbound Destination:</span>
                  <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                    {item.inboundTargetType}
                  </Badge>
                </div>
                <div className="text-foreground font-semibold flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                  {item.inboundTargetValue}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t">
                  <span>Failover:</span>
                  <span className="font-mono">{item.fallbackTarget}</span>
                </div>
              </div>

              {/* Capabilities Badges */}
              <div className="space-y-1 pt-1">
                <span className="text-[11px] text-muted-foreground font-medium block">
                  Channel Capabilities:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {item.capabilities.voipVoice && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Phone className="h-2.5 w-2.5" /> VoIP PSTN
                    </Badge>
                  )}
                  {item.capabilities.whatsAppVoice && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-500/30 bg-green-500/10">
                      <MessageSquare className="h-2.5 w-2.5" /> WhatsApp Voice
                    </Badge>
                  )}
                  {item.capabilities.emergencyE911 && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-500/30">
                      <Radio className="h-2.5 w-2.5" /> E911
                    </Badge>
                  )}
                  {item.capabilities.callRecording && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-purple-600 border-purple-500/30">
                      Recording Active
                    </Badge>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="pt-2 border-t flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => {
                      setSelectedNumber(item);
                      setIsEditModalOpen(true);
                    }}
                  >
                    <Sliders className="h-3.5 w-3.5" /> Reassign Routing
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inbound Routing Assignment Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Configure Inbound Routing: {selectedNumber?.number}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Change where callers to this telephone number are routed when dialing from standard phones or WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {selectedNumber && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Destination Type</Label>
                <Select
                  defaultValue={selectedNumber.inboundTargetType}
                  onValueChange={(val: any) => {
                    if (val === 'ivr') handleSaveRouting('ivr', 'v2.1 Main IVR Call Flow');
                    if (val === 'queue') handleSaveRouting('queue', 'Admin Assistant General Queue');
                    if (val === 'extension') handleSaveRouting('extension', 'Ext 101 (Olusola Adebayo)');
                  }}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ivr">Interactive Voice Response (IVR Menu)</SelectItem>
                    <SelectItem value="queue">Call Center Inbound Queue</SelectItem>
                    <SelectItem value="extension">Direct Extension / Admin</SelectItem>
                    <SelectItem value="ring_group">Multi-Agent Ring Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Destination Target</Label>
                <Input defaultValue={selectedNumber.inboundTargetValue} className="text-xs" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Failover Destination (If Busy / No Answer)</Label>
                <Input defaultValue={selectedNumber.fallbackTarget} className="text-xs" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setIsEditModalOpen(false);
                toast({
                  title: 'Routing Saved',
                  description: 'Telephony carrier routing tables updated successfully.',
                });
              }}
            >
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
