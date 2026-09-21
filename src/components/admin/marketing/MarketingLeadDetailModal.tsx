import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Globe, 
  Calendar, 
  Clock, 
  MessageSquare, 
  Share2, 
  ShieldCheck, 
  Car, 
  Key, 
  Send, 
  PhoneCall, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Tag, 
  ExternalLink,
  ChevronRight,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnifiedLead, LeadStage, LeadActivity, STAGE_ORDER } from '@/server/marketing/types';
import { useToast } from '@/hooks/use-toast';

interface MarketingLeadDetailModalProps {
  leadId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'New Lead',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  REGISTERED: 'Registered',
  VERIFIED: 'Verified User',
  KYC_COMPLETED: 'KYC Completed',
  VEHICLE_LISTED: 'Vehicle Listed',
  VEHICLE_APPROVED: 'Vehicle Approved',
  RENTAL: 'Active Rental',
  CONVERTED: 'Converted',
};

export const MarketingLeadDetailModal: React.FC<MarketingLeadDetailModalProps> = ({
  leadId,
  isOpen,
  onClose,
  onLeadUpdated,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<UnifiedLead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [activeTab, setActiveTab] = useState<'timeline' | 'message' | 'notes'>('timeline');

  // Stage change state
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [targetStage, setTargetStage] = useState<LeadStage>('NEW');
  const [stageNote, setStageNote] = useState('');

  // Quick message dispatch state
  const [msgProvider, setMsgProvider] = useState<'sentdm' | 'twilio' | 'resend' | 'manychat'>('sentdm');
  const [msgChannel, setMsgChannel] = useState<'sms' | 'whatsapp' | 'email' | 'call'>('sms');
  const [msgText, setMsgText] = useState('');
  const [msgSubject, setMsgSubject] = useState('');
  const [isSending, setIsSending] = useState(false);

  // New Note state
  const [newNote, setNewNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const fetchLeadDetails = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setLead(data.lead);
        setActivities(data.activities || []);
        setTargetStage(data.lead.stage);
      }
    } catch {
      toast({
        title: 'Error loading lead details',
        description: 'Could not retrieve full lead telemetry from marketing engine.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && leadId) {
      fetchLeadDetails();
    }
  }, [isOpen, leadId]);

  const handleAdvanceStage = async (nextStage: LeadStage) => {
    if (!lead) return;
    setIsUpdatingStage(true);
    try {
      const res = await fetch(`/api/marketing/leads/${lead.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: nextStage,
          note: stageNote || `Stage advanced to ${nextStage}`,
        }),
      });

      if (res.ok) {
        toast({
          title: 'Lead stage updated',
          description: `Progressed to ${STAGE_LABELS[nextStage]}`,
        });
        setStageNote('');
        fetchLeadDetails();
        onLeadUpdated?.();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update stage');
      }
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStage(false);
    }
  };

  const handleSendMessage = async () => {
    if (!lead) return;
    const recipient = msgChannel === 'email' ? lead.email : lead.phone;
    if (!recipient) {
      toast({
        title: 'Missing recipient contact',
        description: `This lead does not have a ${msgChannel === 'email' ? 'email' : 'phone number'}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/marketing/communications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: msgProvider,
          channel: msgChannel,
          leadId: lead.id,
          to: recipient,
          text: msgText,
          subject: msgSubject || 'RentMaikar Update',
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: 'Communication dispatched',
          description: `Dispatched via ${msgProvider.toUpperCase()} (${data.externalId || 'queued'})`,
        });
        setMsgText('');
        setMsgSubject('');
        fetchLeadDetails();
        onLeadUpdated?.();
      } else {
        throw new Error(data.error || 'Failed to dispatch');
      }
    } catch (err: any) {
      toast({
        title: 'Dispatch failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveNote = async () => {
    if (!lead || !newNote.trim()) return;
    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/marketing/leads/${lead.id}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim() }),
      });

      if (res.ok) {
        toast({ title: 'Note saved' });
        setNewNote('');
        fetchLeadDetails();
      }
    } catch (err: any) {
      toast({
        title: 'Error saving note',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingNote(false);
    }
  };

  if (!lead) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <div className="py-12 text-center text-muted-foreground text-sm">
            Loading lead profile...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentStageIndex = STAGE_ORDER.indexOf(lead.stage);
  const nextStage = currentStageIndex < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentStageIndex + 1] : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header Profile Bar */}
        <div className="bg-muted/40 p-6 border-b border-border">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">{lead.full_name || 'Anonymous Lead'}</h2>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs uppercase font-semibold">
                  {lead.target_role}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {lead.acquisition_source.toUpperCase()}
                </Badge>
                {lead.user_id && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Linked Account
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-4 flex-wrap">
                {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>}
                {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span>}
                {(lead.city || lead.country) && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {lead.city ? `${lead.city}, ` : ''}{lead.country}</span>
                )}
              </p>
            </div>
            {nextStage && (
              <Button
                size="sm"
                onClick={() => handleAdvanceStage(nextStage)}
                disabled={isUpdatingStage}
                className="h-9 font-medium"
              >
                Advance to {STAGE_LABELS[nextStage]}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>

          {/* Stepper Bar */}
          <div className="mt-5 pt-4 border-t border-border/80">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Lifecycle Stage Pipeline
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none">
              {STAGE_ORDER.map((stage, idx) => {
                const isPassed = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;
                return (
                  <button
                    key={stage}
                    onClick={() => setTargetStage(stage)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors flex items-center gap-1 border ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground border-primary'
                        : isPassed
                        ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {isPassed ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <span className="h-3 w-3 rounded-full text-[9px] inline-flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                    )}
                    {STAGE_LABELS[stage]}
                  </button>
                );
              })}
            </div>
            {targetStage !== lead.stage && (
              <div className="mt-2 p-2.5 bg-background rounded-lg border border-border flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  Change stage to <strong className="text-foreground">{STAGE_LABELS[targetStage]}</strong>?
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Optional note..."
                    value={stageNote}
                    onChange={(e) => setStageNote(e.target.value)}
                    className="h-7 text-xs w-48"
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => handleAdvanceStage(targetStage)}
                    disabled={isUpdatingStage}
                  >
                    Confirm Change
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Intelligence Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Attribution Intelligence */}
            <div className="p-3.5 rounded-lg border border-border bg-card space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                <Share2 className="h-3.5 w-3.5 text-primary" /> Acquisition & Attribution
              </div>
              <div className="space-y-1 text-muted-foreground">
                <div>Source: <strong className="text-foreground">{lead.acquisition_source.toUpperCase()}</strong></div>
                <div>Campaign: <strong className="text-foreground">{lead.campaign_name || 'None'}</strong></div>
                <div>First Touch: <span className="text-foreground">{new Date(lead.first_touch_at).toLocaleDateString()} via {lead.first_touch_channel}</span></div>
                <div>Last Touch: <span className="text-foreground">{new Date(lead.last_touch_at).toLocaleDateString()} via {lead.last_touch_channel}</span></div>
                <div>Total Touches: <strong className="text-foreground">{lead.touchpoints_count}</strong></div>
              </div>
            </div>

            {/* Platform Verification & KYC */}
            <div className="p-3.5 rounded-lg border border-border bg-card space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-500" /> Identity & Verification
              </div>
              <div className="space-y-1 text-muted-foreground">
                <div>User ID: <span className="text-foreground font-mono">{lead.user_id || 'Not registered yet'}</span></div>
                <div>Phone/Email: <strong className={lead.is_verified ? 'text-emerald-600' : 'text-amber-600'}>{lead.is_verified ? 'Verified' : 'Unverified'}</strong></div>
                <div>KYC Status: <strong className={lead.kyc_status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}>{lead.kyc_status || 'Unverified'}</strong></div>
                <div>Target Role: <span className="text-foreground uppercase font-medium">{lead.target_role}</span></div>
              </div>
            </div>

            {/* Vehicle & Rental Status */}
            <div className="p-3.5 rounded-lg border border-border bg-card space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                <Car className="h-3.5 w-3.5 text-indigo-500" /> Fleet & Rental Linkage
              </div>
              <div className="space-y-1 text-muted-foreground">
                <div>Vehicle Listing: <strong className="text-foreground">{lead.vehicle_status || 'None'}</strong></div>
                <div>Rental Booking: <strong className="text-foreground">{lead.rental_status || 'None'}</strong></div>
                <div>Comms Count: <span className="text-foreground">{lead.communications_count?.total || 0} (SMS: {lead.communications_count?.sms || 0}, WA: {lead.communications_count?.whatsapp || 0}, Calls: {lead.communications_count?.calls || 0})</span></div>
              </div>
            </div>
          </div>

          {/* Action Tabs: Timeline, Quick Message, Notes */}
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="timeline" className="text-xs">Activity Timeline</TabsTrigger>
              <TabsTrigger value="message" className="text-xs">Dispatch Message</TabsTrigger>
              <TabsTrigger value="notes" className="text-xs">Internal Notes</TabsTrigger>
            </TabsList>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="space-y-3 mt-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                Complete Touchpoint History
              </div>
              {activities.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  No previous activity recorded for this lead.
                </div>
              ) : (
                <div className="space-y-2">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg border border-border bg-card/60 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold py-0">
                            {act.activity_type}
                          </Badge>
                          {act.provider && (
                            <span className="text-muted-foreground font-medium">via {act.provider.toUpperCase()}</span>
                          )}
                          <span className="text-muted-foreground">• {new Date(act.created_at).toLocaleString()}</span>
                        </div>
                        <p className="font-medium text-foreground">{act.summary}</p>
                        {act.content && (
                          <p className="text-muted-foreground bg-muted/40 p-2 rounded text-[11px] font-mono whitespace-pre-wrap">
                            {act.content}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {act.direction || 'system'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Dispatch Message Tab */}
            <TabsContent value="message" className="space-y-4 mt-4">
              <div className="p-4 rounded-lg border border-border bg-card space-y-4">
                <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Dispatch Communication via Connected Providers
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-muted-foreground block mb-1">Communication Channel</label>
                    <Select
                      value={msgChannel}
                      onValueChange={(v: any) => {
                        setMsgChannel(v);
                        if (v === 'sms' || v === 'whatsapp') setMsgProvider('sentdm');
                        else if (v === 'email') setMsgProvider('resend');
                        else if (v === 'call') setMsgProvider('twilio');
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms">SMS Message (SENT.dm)</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp Message (SENT.dm)</SelectItem>
                        <SelectItem value="email">Email (Resend notify.rentmaikar.com)</SelectItem>
                        <SelectItem value="call">VoIP Call Request (Twilio)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-muted-foreground block mb-1">Provider Engine</label>
                    <Select value={msgProvider} onValueChange={(v: any) => setMsgProvider(v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sentdm">SENT.dm (Global SMS / WhatsApp)</SelectItem>
                        <SelectItem value="twilio">Twilio (Voice / VoIP)</SelectItem>
                        <SelectItem value="resend">Resend (notify.rentmaikar.com)</SelectItem>
                        <SelectItem value="manychat">ManyChat (Social DM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {msgChannel === 'email' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Email Subject</label>
                    <Input
                      placeholder="e.g. Next steps for your RentMaikar vehicle application"
                      value={msgSubject}
                      onChange={(e) => setMsgSubject(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                )}

                {msgChannel !== 'call' ? (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Message Content</label>
                    <Textarea
                      placeholder="Enter outbound message body..."
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      rows={4}
                      className="text-xs resize-none"
                    />
                  </div>
                ) : (
                  <div className="p-3 bg-muted/40 rounded border border-border text-xs text-muted-foreground">
                    Initiating a VoIP Call will ring the lead at <strong className="text-foreground">{lead.phone || 'N/A'}</strong> and connect them directly to RentMaikar's IVR / Operations Queue via Twilio Voice.
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSendMessage}
                    disabled={isSending || (msgChannel !== 'call' && !msgText.trim())}
                    className="h-9 text-xs"
                  >
                    {isSending ? 'Dispatching...' : msgChannel === 'call' ? 'Initiate Call' : 'Send Message'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="space-y-4 mt-4">
              <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Internal Qualification Notes
                </div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded border border-border/80 min-h-[80px]">
                  {lead.notes || 'No internal notes added yet.'}
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  <Textarea
                    placeholder="Add an internal observation or qualification note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                    className="text-xs resize-none"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={isSavingNote || !newNote.trim()}
                      className="h-8 text-xs"
                    >
                      {isSavingNote ? 'Saving...' : 'Add Note'}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
