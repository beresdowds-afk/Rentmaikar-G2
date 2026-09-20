import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  RefreshCw, 
  Mail, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Car,
  TrendingUp,
  FileDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { UnifiedLead, LeadStage, LeadSource, LeadTargetRole } from '@/server/marketing/types';
import { STAGE_ORDER } from '@/server/marketing/leadService';
import { MarketingLeadDetailModal } from './MarketingLeadDetailModal';
import { useToast } from '@/hooks/use-toast';

const STAGE_COLORS: Record<LeadStage, string> = {
  NEW: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  CONTACTED: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  QUALIFIED: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  REGISTERED: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
  VERIFIED: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
  KYC_COMPLETED: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  VEHICLE_LISTED: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  VEHICLE_APPROVED: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
  RENTAL: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  CONVERTED: 'bg-green-600/15 text-green-800 border-green-600/30',
};

export const MarketingLeadsSection: React.FC = () => {
  const { toast } = useToast();
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected lead for detail modal
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Add Lead Modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newLeadFirstName, setNewLeadFirstName] = useState('');
  const [newLeadLastName, setNewLeadLastName] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadCity, setNewLeadCity] = useState('');
  const [newLeadRole, setNewLeadRole] = useState<LeadTargetRole>('driver');
  const [newLeadSource, setNewLeadSource] = useState<LeadSource>('meta');
  const [newLeadNotes, setNewLeadNotes] = useState('');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStage !== 'all') params.set('stage', selectedStage);
      if (selectedSource !== 'all') params.set('source', selectedSource);
      if (selectedRole !== 'all') params.set('role', selectedRole);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/marketing/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch {
      toast({
        title: 'Error loading leads',
        description: 'Could not connect to marketing lead service.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [selectedStage, selectedSource, selectedRole, searchQuery]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadFirstName && !newLeadLastName && !newLeadEmail && !newLeadPhone) {
      toast({
        title: 'Validation error',
        description: 'Provide at least a name, email, or phone number.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmittingNew(true);
    try {
      const res = await fetch('/api/marketing/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: newLeadFirstName,
          last_name: newLeadLastName,
          email: newLeadEmail || undefined,
          phone: newLeadPhone || undefined,
          city: newLeadCity || undefined,
          target_role: newLeadRole,
          acquisition_source: newLeadSource,
          notes: newLeadNotes || undefined,
          channel: 'Admin Manual Entry',
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: data.isNew ? 'Lead created' : 'Existing record updated',
          description: data.isNew
            ? `New lead added at stage ${data.lead.stage}.`
            : `Matched existing lead. Updated touchpoint without duplicating user.`,
        });
        setIsAddOpen(false);
        // Reset form
        setNewLeadFirstName('');
        setNewLeadLastName('');
        setNewLeadEmail('');
        setNewLeadPhone('');
        setNewLeadCity('');
        setNewLeadNotes('');
        fetchLeads();
      } else {
        throw new Error(data.error || 'Failed to create lead');
      }
    } catch (err: any) {
      toast({
        title: 'Creation failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Compute stage counts
  const stageCounts = STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = leads.filter((l) => l.stage === stage).length;
    return acc;
  }, {} as Record<LeadStage, number>);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            Unified Marketing Leads
            <Badge variant="secondary" className="text-xs">
              {leads.length} Active Records
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deduplicated pipeline linking top-of-funnel ad inquiries with profiles, KYC, fleet listings, and active rentals.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLeads}
            disabled={loading}
            className="h-9 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="h-9 text-xs font-medium"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Capture / Add Lead
          </Button>
        </div>
      </div>

      {/* Stage Flow Bar */}
      <Card className="shadow-sm border-border bg-card">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setSelectedStage('all')}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors border ${
                selectedStage === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              All Leads ({leads.length})
            </button>
            {STAGE_ORDER.map((stage) => {
              const count = stageCounts[stage] || 0;
              const isSelected = selectedStage === stage;
              return (
                <button
                  key={stage}
                  onClick={() => setSelectedStage(stage)}
                  className={`px-2.5 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  <span className="capitalize">{stage.toLowerCase().replace('_', ' ')}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? 'bg-background text-foreground' : 'bg-muted text-foreground'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, campaign..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="h-9 text-xs w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="manychat">ManyChat</SelectItem>
              <SelectItem value="direct">Direct</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="h-9 text-xs w-[130px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="driver">Driver</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="renter">Renter</SelectItem>
              <SelectItem value="corporate">Corporate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Leads Table */}
      <Card className="shadow-sm border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold">Lead Contact</TableHead>
                <TableHead className="text-xs font-semibold">Role</TableHead>
                <TableHead className="text-xs font-semibold">Lifecycle Stage</TableHead>
                <TableHead className="text-xs font-semibold">Acquisition Source</TableHead>
                <TableHead className="text-xs font-semibold">Platform Linkage</TableHead>
                <TableHead className="text-xs font-semibold">Touchpoints</TableHead>
                <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                    {loading ? 'Fetching marketing leads...' : 'No leads found matching current criteria.'}
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => {
                      setActiveLeadId(lead.id);
                      setIsDetailOpen(true);
                    }}
                  >
                    {/* Lead Contact */}
                    <TableCell className="py-3">
                      <div>
                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          {lead.full_name || 'Anonymous Lead'}
                          {lead.user_id && (
                            <span title="User registered in RentMaikar database">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          {lead.email && <span>{lead.email}</span>}
                          {lead.phone && <span>• {lead.phone}</span>}
                        </div>
                        {lead.city && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {lead.city}, {lead.country}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Target Role */}
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold py-0">
                        {lead.target_role}
                      </Badge>
                    </TableCell>

                    {/* Lifecycle Stage */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-semibold py-0.5 ${STAGE_COLORS[lead.stage] || ''}`}
                      >
                        {lead.stage.replace('_', ' ')}
                      </Badge>
                    </TableCell>

                    {/* Acquisition Source & Campaign */}
                    <TableCell>
                      <div className="text-xs">
                        <div className="font-medium text-foreground uppercase text-[11px]">
                          {lead.acquisition_source}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                          {lead.campaign_name || lead.first_touch_channel}
                        </div>
                      </div>
                    </TableCell>

                    {/* Platform Linkage */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        {lead.is_verified && (
                          <Badge variant="secondary" className="text-[9px] py-0 bg-teal-500/10 text-teal-700">
                            Verified
                          </Badge>
                        )}
                        {lead.kyc_status === 'approved' && (
                          <Badge variant="secondary" className="text-[9px] py-0 bg-purple-500/10 text-purple-700">
                            KYC
                          </Badge>
                        )}
                        {lead.vehicle_status === 'approved' && (
                          <Badge variant="secondary" className="text-[9px] py-0 bg-lime-500/10 text-lime-700">
                            Vehicle
                          </Badge>
                        )}
                        {lead.rental_status === 'active' && (
                          <Badge variant="secondary" className="text-[9px] py-0 bg-emerald-500/10 text-emerald-700">
                            Rental
                          </Badge>
                        )}
                        {!lead.user_id && !lead.is_verified && (
                          <span className="text-[11px] text-muted-foreground">Prospect</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Touchpoints */}
                    <TableCell>
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">{lead.touchpoints_count} touches</span>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(lead.last_touch_at).toLocaleDateString()}
                        </div>
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-medium"
                        onClick={() => {
                          setActiveLeadId(lead.id);
                          setIsDetailOpen(true);
                        }}
                      >
                        Inspect
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lead Detail Modal */}
      <MarketingLeadDetailModal
        leadId={activeLeadId}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setActiveLeadId(null);
        }}
        onLeadUpdated={fetchLeads}
      />

      {/* Add Lead Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Capture New Lead</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Directly records a prospect into the Marketing Engine. Checks for existing user profiles to avoid duplicates.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLead} className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">First Name</label>
                <Input
                  value={newLeadFirstName}
                  onChange={(e) => setNewLeadFirstName(e.target.value)}
                  placeholder="e.g. Tunde"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Last Name</label>
                <Input
                  value={newLeadLastName}
                  onChange={(e) => setNewLeadLastName(e.target.value)}
                  placeholder="e.g. Bakare"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Email Address</label>
              <Input
                type="email"
                value={newLeadEmail}
                onChange={(e) => setNewLeadEmail(e.target.value)}
                placeholder="tunde.b@example.com"
                className="h-8 text-xs"
              />
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Phone Number (E.164)</label>
              <Input
                value={newLeadPhone}
                onChange={(e) => setNewLeadPhone(e.target.value)}
                placeholder="+2348030000000"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">Target Role</label>
                <Select value={newLeadRole} onValueChange={(v: any) => setNewLeadRole(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver">Driver</SelectItem>
                    <SelectItem value="owner">Vehicle Owner</SelectItem>
                    <SelectItem value="renter">Renter</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-muted-foreground block mb-1">Acquisition Source</label>
                <Select value={newLeadSource} onValueChange={(v: any) => setNewLeadSource(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta">Meta Ads</SelectItem>
                    <SelectItem value="google">Google Ads</SelectItem>
                    <SelectItem value="tiktok">TikTok Ads</SelectItem>
                    <SelectItem value="linkedin">LinkedIn Ads</SelectItem>
                    <SelectItem value="manychat">ManyChat</SelectItem>
                    <SelectItem value="direct">Direct / Referral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">City / Region</label>
              <Input
                value={newLeadCity}
                onChange={(e) => setNewLeadCity(e.target.value)}
                placeholder="e.g. Lagos, Nigeria"
                className="h-8 text-xs"
              />
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Internal Note</label>
              <Input
                value={newLeadNotes}
                onChange={(e) => setNewLeadNotes(e.target.value)}
                placeholder="Initial intent, vehicle interest, etc."
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingNew}
                className="h-8 text-xs"
              >
                {isSubmittingNew ? 'Saving...' : 'Save Lead'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
