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
  BarChart3, Play, Pause, Target, Globe
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  platform: 'facebook' | 'instagram' | 'linkedin' | 'google';
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
  };
  created_at: string;
}

const platformConfig = {
  facebook: { icon: Facebook, color: 'bg-blue-600', label: 'Facebook' },
  instagram: { icon: Instagram, color: 'bg-gradient-to-br from-purple-600 to-pink-500', label: 'Instagram' },
  linkedin: { icon: Linkedin, color: 'bg-blue-700', label: 'LinkedIn' },
  google: { icon: Chrome, color: 'bg-emerald-500', label: 'Google Ads' },
};

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-muted text-muted-foreground', label: 'Draft' },
  scheduled: { color: 'bg-blue-500 text-white', label: 'Scheduled' },
  active: { color: 'bg-success text-success-foreground', label: 'Active' },
  paused: { color: 'bg-amber-500 text-white', label: 'Paused' },
  completed: { color: 'bg-primary text-primary-foreground', label: 'Completed' },
  cancelled: { color: 'bg-destructive text-destructive-foreground', label: 'Cancelled' },
};

export const SocialMediaManagement = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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
  }, []);

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
        });

      if (error) throw error;

      toast.success('Campaign created successfully');
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
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast.error('Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (campaignId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('social_media_campaigns')
        .update({ status: newStatus })
        .eq('id', campaignId);

      if (error) throw error;
      toast.success(`Campaign ${newStatus}`);
      fetchCampaigns();
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast.error('Failed to update campaign');
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(platformConfig).map(([key, config]) => {
          const Icon = config.icon;
          const count = campaigns.filter(c => c.platform === key).length;
          const active = campaigns.filter(c => c.platform === key && c.status === 'active').length;
          return (
            <Card key={key} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFilterPlatform(key)}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium">{config.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {count} campaigns • {active} active
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
                Manage marketing campaigns across Facebook, Instagram, LinkedIn, and Google
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
                  <SelectItem value="google">Google</SelectItem>
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
                          <Button variant="ghost" size="icon" onClick={() => handleStatusChange(campaign.id, 'paused')}>
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : campaign.status !== 'completed' && campaign.status !== 'cancelled' ? (
                          <Button variant="ghost" size="icon" onClick={() => handleStatusChange(campaign.id, 'active')}>
                            <Play className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="icon">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(campaign.id)} className="text-destructive hover:text-destructive">
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
