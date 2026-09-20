import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { 
  Facebook, Instagram, Linkedin, Chrome, Plus, Eye, 
  Trash2, RefreshCw, TrendingUp, DollarSign, 
  BarChart3, Play, Pause, Target, Globe, Copy, Archive,
  Users, CheckCircle, Percent
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  platform: 'facebook' | 'instagram' | 'linkedin' | 'google' | 'tiktok';
  status: string;
  campaign_type: string;
  budget: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  region: string;
  metrics: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spend?: number;
    leads?: number;
  };
  created_at: string;
}

interface NormalizedTotals {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
  costPerLead: number;
  costPerConversion: number;
  ctr: number;
  cpc: number;
}

const platformConfig = {
  facebook: { icon: Facebook, color: 'bg-blue-600', label: 'Facebook' },
  instagram: { icon: Instagram, color: 'bg-gradient-to-br from-purple-600 to-pink-500', label: 'Instagram' },
  linkedin: { icon: Linkedin, color: 'bg-blue-700', label: 'LinkedIn' },
  google: { icon: Chrome, color: 'bg-emerald-500', label: 'Google Ads' },
  tiktok: { icon: Globe, color: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900', label: 'TikTok Ads' },
};

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-muted text-muted-foreground', label: 'Draft' },
  scheduled: { color: 'bg-blue-500 text-white', label: 'Scheduled' },
  active: { color: 'bg-emerald-600 text-white', label: 'Active' },
  paused: { color: 'bg-amber-500 text-white', label: 'Paused' },
  completed: { color: 'bg-primary text-primary-foreground', label: 'Completed' },
  cancelled: { color: 'bg-destructive text-destructive-foreground', label: 'Archived' },
};

export const SocialMediaManagement = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [normalizedTotals, setNormalizedTotals] = useState<NormalizedTotals | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    platform: 'facebook' as Campaign['platform'],
    campaign_type: 'awareness',
    budget: '',
    currency: 'USD',
    start_date: '',
    end_date: '',
    region: 'all',
    content_text: '',
  });

  useEffect(() => {
    fetchCampaigns();
    fetchReporting();
  }, []);

  const fetchReporting = async () => {
    try {
      const res = await fetch('/api/marketing/reporting');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.reporting?.total) {
          setNormalizedTotals(data.reporting.total);
        }
      }
    } catch {
      // Gracefully fall back to local aggregation
    }
  };

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('social_media_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns((data as Campaign[]) || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!formData.name.trim()) {
      toast.error('Campaign name is required');
      return;
    }

    setCreating(true);
    try {
      // Step 1: Attempt provider creation if supported
      let externalId: string | null = null;
      try {
        const providerRes = await fetch('/api/marketing/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: formData.platform,
            name: formData.name.trim(),
            objective: formData.campaign_type,
            budgetAmount: formData.budget ? parseFloat(formData.budget) : 0,
            currency: formData.currency,
            region: formData.region,
          }),
        });
        const providerData = await providerRes.json();
        if (providerData.ok) {
          externalId = providerData.externalId || null;
          toast.success(`Campaign created on ${formData.platform.toUpperCase()} (${externalId})`);
        } else if (providerData.error?.includes('NOT CONNECTED')) {
          toast.info(`${formData.platform.toUpperCase()} provider not connected: saved locally as draft.`);
        }
      } catch {
        // Fallback to local
      }

      // Step 2: Store in local database
      const { error } = await supabase
        .from('social_media_campaigns')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          platform: formData.platform,
          campaign_type: formData.campaign_type,
          budget: formData.budget ? parseFloat(formData.budget) : null,
          currency: formData.currency,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          region: formData.region,
          content_text: formData.content_text.trim() || null,
          created_by: user?.id,
          status: externalId ? 'active' : 'draft',
        });

      if (error) throw error;

      if (!externalId) {
        toast.success('Campaign saved locally');
      }
      setCreateDialogOpen(false);
      setFormData({
        name: '',
        description: '',
        platform: 'facebook',
        campaign_type: 'awareness',
        budget: '',
        currency: 'USD',
        start_date: '',
        end_date: '',
        region: 'all',
        content_text: '',
      });
      fetchCampaigns();
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast.error('Failed to create campaign: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (campaign: Campaign, newStatus: string) => {
    try {
      // Send pause/resume instruction to provider adapter
      try {
        const res = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            platform: campaign.platform, 
            action: newStatus === 'active' ? 'resume' : 'pause',
            status: newStatus 
          }),
        });
        const data = await res.json();
        if (data?.error && !data.ok && !data.error.includes('NOT CONNECTED')) {
          toast.error(`Provider error: ${data.error}`);
          return;
        }
      } catch {
        // Provider call skipped/offline
      }

      const { error } = await supabase
        .from('social_media_campaigns')
        .update({ status: newStatus })
        .eq('id', campaign.id);

      if (error) throw error;
      toast.success(`Campaign ${newStatus}`);
      fetchCampaigns();
    } catch (error: any) {
      console.error('Error updating campaign:', error);
      toast.error('Failed to update campaign: ' + error.message);
    }
  };

  const handleArchive = async (campaign: Campaign) => {
    if (!confirm(`Archive campaign "${campaign.name}"?`)) return;

    try {
      try {
        await fetch(`/api/marketing/campaigns/${campaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: campaign.platform, action: 'archive', status: 'archived' }),
        });
      } catch {
        // Continue
      }

      const { error } = await supabase
        .from('social_media_campaigns')
        .update({ status: 'cancelled' })
        .eq('id', campaign.id);

      if (error) throw error;
      toast.success('Campaign archived');
      fetchCampaigns();
    } catch (error: any) {
      toast.error('Failed to archive: ' + error.message);
    }
  };

  const handleDuplicate = async (campaign: Campaign) => {
    const newName = window.prompt('Enter duplicate campaign name:', `${campaign.name} (Copy)`);
    if (!newName || !newName.trim()) return;

    try {
      try {
        await fetch(`/api/marketing/campaigns/${campaign.id}/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: campaign.platform, newName: newName.trim() }),
        });
      } catch {
        // Continue
      }

      const { error } = await supabase
        .from('social_media_campaigns')
        .insert({
          name: newName.trim(),
          description: campaign.description,
          platform: campaign.platform,
          campaign_type: campaign.campaign_type,
          budget: campaign.budget,
          currency: campaign.currency,
          start_date: null,
          end_date: null,
          region: campaign.region,
          status: 'draft',
          content_text: (campaign as any).content_text || null,
          created_by: user?.id,
        });

      if (error) throw error;
      toast.success(`Duplicated as "${newName.trim()}"`);
      fetchCampaigns();
    } catch (error: any) {
      toast.error('Failed to duplicate: ' + error.message);
    }
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    try {
      const { error } = await supabase
        .from('social_media_campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;
      toast.success('Campaign deleted');
      fetchCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error('Failed to delete campaign');
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (filterPlatform !== 'all' && c.platform !== filterPlatform) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    totalBudget: campaigns.reduce((sum, c) => sum + (c.budget || 0), 0),
    totalImpressions: campaigns.reduce((sum, c) => sum + (c.metrics?.impressions || 0), 0),
  };

  const getPlatformIcon = (platform: Campaign['platform']) => {
    const config = platformConfig[platform];
    const Icon = config.icon;
    return (
      <div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Campaigns</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Target className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Campaigns</p>
                <p className="text-2xl font-bold text-success">{stats.active}</p>
              </div>
              <Play className="h-8 w-8 text-success opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-2xl font-bold">${stats.totalBudget.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Impressions</p>
                <p className="text-2xl font-bold">{stats.totalImpressions.toLocaleString()}</p>
              </div>
              <Eye className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Object.entries(platformConfig).map(([key, config]) => {
          const Icon = config.icon;
          const count = campaigns.filter(c => c.platform === key).length;
          const active = campaigns.filter(c => c.platform === key && c.status === 'active').length;
          return (
            <Card key={key} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFilterPlatform(key)}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{config.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} campaigns • {active} active
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Normalized Cross-Provider Reporting (Meta, Google, TikTok, LinkedIn) */}
      <Card className="border shadow-xs bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Normalized Multi-Channel Reporting
              </CardTitle>
              <CardDescription className="text-xs">
                Aggregated cross-network marketing performance metrics across all connected ad channels.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={fetchReporting} className="h-7 text-xs gap-1">
              <RefreshCw className="h-3 w-3" /> Sync Metrics
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Impressions</p>
              <p className="text-lg font-bold mt-1">{(normalizedTotals?.impressions || stats.totalImpressions).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Clicks</p>
              <p className="text-lg font-bold mt-1">{(normalizedTotals?.clicks || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Total Spend</p>
              <p className="text-lg font-bold mt-1 text-primary">${(normalizedTotals?.spend || stats.totalBudget).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Leads</p>
              <p className="text-lg font-bold mt-1 text-emerald-600">{(normalizedTotals?.leads || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Conversions</p>
              <p className="text-lg font-bold mt-1 text-emerald-600">{(normalizedTotals?.conversions || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Cost / Lead</p>
              <p className="text-lg font-bold mt-1">${(normalizedTotals?.costPerLead || 0).toFixed(2)}</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Cost / Conv (CPA)</p>
              <p className="text-lg font-bold mt-1">${(normalizedTotals?.costPerConversion || 0).toFixed(2)}</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">CTR / CPC</p>
              <p className="text-sm font-bold mt-1">
                {(normalizedTotals?.ctr || 0).toFixed(1)}% <span className="text-xs text-muted-foreground font-normal">/ ${(normalizedTotals?.cpc || 0).toFixed(2)}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Social Media Campaigns
              </CardTitle>
              <CardDescription>
                Manage marketing campaigns across Facebook, Instagram, LinkedIn, Google, and TikTok
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="google">Google Ads</SelectItem>
                  <SelectItem value="tiktok">TikTok Ads</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Campaign</DialogTitle>
                    <DialogDescription>
                      Set up a new social media marketing campaign
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Campaign Name *</Label>
                      <Input
                        placeholder="e.g., Q1 Driver Recruitment"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Campaign goals and strategy..."
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Platform *</Label>
                        <Select value={formData.platform} onValueChange={(v) => setFormData(prev => ({ ...prev, platform: v as Campaign['platform'] }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value="facebook">Facebook</SelectItem>
                            <SelectItem value="instagram">Instagram</SelectItem>
                            <SelectItem value="linkedin">LinkedIn</SelectItem>
                            <SelectItem value="google">Google Ads</SelectItem>
                            <SelectItem value="tiktok">TikTok Ads</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Campaign Type *</Label>
                        <Select value={formData.campaign_type} onValueChange={(v) => setFormData(prev => ({ ...prev, campaign_type: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value="awareness">Brand Awareness</SelectItem>
                            <SelectItem value="engagement">Engagement</SelectItem>
                            <SelectItem value="conversion">Conversion</SelectItem>
                            <SelectItem value="traffic">Traffic</SelectItem>
                            <SelectItem value="app_install">App Install</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Budget</Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={formData.budget}
                          onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Region</Label>
                        <Select value={formData.region} onValueChange={(v) => setFormData(prev => ({ ...prev, region: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value="all">All Regions</SelectItem>
                            <SelectItem value="usa">USA Only</SelectItem>
                            <SelectItem value="nigeria">Nigeria Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input
                          type="date"
                          value={formData.start_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input
                          type="date"
                          value={formData.end_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Ad Content</Label>
                      <Textarea
                        placeholder="Write your ad copy here..."
                        value={formData.content_text}
                        onChange={(e) => setFormData(prev => ({ ...prev, content_text: e.target.value }))}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateCampaign} disabled={creating || !formData.name.trim()}>
                      {creating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Create Campaign
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCampaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No campaigns found</p>
              <p className="text-sm">Create your first social media campaign to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{campaign.campaign_type.replace('_', ' ')}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getPlatformIcon(campaign.platform)}</TableCell>
                    <TableCell>
                      <Badge className={statusConfig[campaign.status]?.color}>
                        {statusConfig[campaign.status]?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {campaign.budget ? (
                        <span className="font-medium">
                          {campaign.currency === 'NGN' ? '₦' : '$'}
                          {campaign.budget.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize gap-1">
                        <Globe className="h-3 w-3" />
                        {campaign.region}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {campaign.start_date ? (
                        <div>
                          <p>{format(new Date(campaign.start_date), 'MMM d')}</p>
                          {campaign.end_date && (
                            <p className="text-xs text-muted-foreground">
                              to {format(new Date(campaign.end_date), 'MMM d')}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not scheduled</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {campaign.status === 'active' ? (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Pause Campaign"
                            onClick={() => handleStatusChange(campaign, 'paused')}
                          >
                            <Pause className="h-4 w-4 text-amber-500" />
                          </Button>
                        ) : campaign.status !== 'completed' && campaign.status !== 'cancelled' ? (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Resume Campaign"
                            onClick={() => handleStatusChange(campaign, 'active')}
                          >
                            <Play className="h-4 w-4 text-emerald-500" />
                          </Button>
                        ) : null}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Duplicate Campaign"
                          onClick={() => handleDuplicate(campaign)}
                        >
                          <Copy className="h-4 w-4 text-primary" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Archive Campaign"
                          onClick={() => handleArchive(campaign)}
                        >
                          <Archive className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Delete Campaign"
                          onClick={() => handleDelete(campaign.id)} 
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
