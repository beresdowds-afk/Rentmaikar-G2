import { useState } from 'react';
import { usePolicyVersions, PolicyVersion } from '@/hooks/useFAQ';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Pencil,
  Check,
  FileText,
  Shield,
  Loader2,
  Calendar,
  Users,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface PolicyAcceptanceWithUser {
  id: string;
  user_id: string;
  policy_version_id: string;
  policy_type: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  region: string | null;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

export function PolicyManagement() {
  const { policies, loading, createPolicy, updatePolicy, activatePolicy } = usePolicyVersions();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyVersion | null>(null);
  const [saving, setSaving] = useState(false);
  const [acceptancesDialogOpen, setAcceptancesDialogOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [acceptances, setAcceptances] = useState<PolicyAcceptanceWithUser[]>([]);
  const [loadingAcceptances, setLoadingAcceptances] = useState(false);

  const [form, setForm] = useState({
    policy_type: 'terms' as 'terms' | 'privacy',
    version: '',
    region: 'USA' as 'USA' | 'Nigeria' | (string & {}),
    title: '',
    content: '',
    summary: '',
    effective_date: new Date().toISOString().split('T')[0],
  });

  const openDialog = (policy?: PolicyVersion) => {
    if (policy) {
      setEditingPolicy(policy);
      setForm({
        policy_type: policy.policy_type,
        version: policy.version,
        region: policy.region,
        title: policy.title,
        content: policy.content,
        summary: policy.summary || '',
        effective_date: policy.effective_date,
      });
    } else {
      setEditingPolicy(null);
      // Auto-increment version
      const latestVersion = policies
        .filter(p => p.policy_type === form.policy_type && p.region === form.region)
        .sort((a, b) => parseFloat(b.version) - parseFloat(a.version))[0];
      const nextVersion = latestVersion 
        ? (parseFloat(latestVersion.version) + 0.1).toFixed(1) 
        : '1.0';
      
      setForm({
        policy_type: 'terms',
        version: nextVersion,
        region: 'USA',
        title: '',
        content: '',
        summary: '',
        effective_date: new Date().toISOString().split('T')[0],
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.content || !form.version) {
      toast.error('Title, content, and version are required');
      return;
    }

    setSaving(true);
    try {
      if (editingPolicy) {
        await updatePolicy(editingPolicy.id, form);
      } else {
        await createPolicy(form);
      }
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving policy:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (policy: PolicyVersion) => {
    if (!confirm(`Are you sure you want to activate "${policy.title}"? This will deactivate other versions of the same type and region.`)) {
      return;
    }
    await activatePolicy(policy.id, policy.policy_type, policy.region);
  };

  const viewAcceptances = async (policyId: string) => {
    setSelectedPolicyId(policyId);
    setLoadingAcceptances(true);
    setAcceptancesDialogOpen(true);

    try {
      // Fetch acceptances
      const { data: acceptancesData, error: acceptancesError } = await supabase
        .from('policy_acceptances')
        .select('*')
        .eq('policy_version_id', policyId)
        .order('accepted_at', { ascending: false });

      if (acceptancesError) throw acceptancesError;

      // Fetch profiles for the user_ids
      const userIds = acceptancesData?.map(a => a.user_id) || [];
      let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
      
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);
        
        profilesData?.forEach(p => {
          profilesMap[p.user_id] = { full_name: p.full_name, email: p.email };
        });
      }

      // Combine data
      const combined = acceptancesData?.map(a => ({
        ...a,
        profile: profilesMap[a.user_id] || { full_name: null, email: null }
      })) || [];

      setAcceptances(combined as PolicyAcceptanceWithUser[]);
    } catch (error) {
      console.error('Error fetching acceptances:', error);
      toast.error('Failed to load acceptances');
    } finally {
      setLoadingAcceptances(false);
    }
  };

  const exportAcceptances = () => {
    const csv = [
      ['User', 'Email', 'Accepted At', 'Region', 'IP Address'],
      ...acceptances.map(a => [
        a.profile?.full_name || 'Unknown',
        a.profile?.email || 'Unknown',
        format(new Date(a.accepted_at), 'PPpp'),
        a.region || 'N/A',
        a.ip_address || 'N/A',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `policy-acceptances-${selectedPolicyId}.csv`;
    a.click();
  };

  const termsPolicies = policies.filter(p => p.policy_type === 'terms');
  const privacyPolicies = policies.filter(p => p.policy_type === 'privacy');

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Policy Management</h2>
          <p className="text-muted-foreground">Manage Terms of Service and Privacy Policy versions</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          New Policy Version
        </Button>
      </div>

      <Tabs defaultValue="terms">
        <TabsList>
          <TabsTrigger value="terms" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Terms of Service ({termsPolicies.length})
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Privacy Policy ({privacyPolicies.length})
          </TabsTrigger>
        </TabsList>

        {['terms', 'privacy'].map(policyType => (
          <TabsContent key={policyType} value={policyType}>
            <Card>
              <CardHeader>
                <CardTitle>{policyType === 'terms' ? 'Terms of Service' : 'Privacy Policy'} Versions</CardTitle>
                <CardDescription>Manage policy versions and view acceptance audit trail</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(policyType === 'terms' ? termsPolicies : privacyPolicies).map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-mono">{policy.version}</TableCell>
                        <TableCell className="font-medium max-w-xs truncate">{policy.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{policy.region}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(policy.effective_date), 'MMM d, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell>
                          {policy.is_active ? (
                            <Badge className="bg-primary text-primary-foreground">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {policy.summary || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewAcceptances(policy.id)}
                              title="View Acceptances"
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDialog(policy)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!policy.is_active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleActivate(policy)}
                                title="Activate"
                              >
                                <Check className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? 'Edit Policy Version' : 'Create New Policy Version'}</DialogTitle>
            <DialogDescription>
              {editingPolicy ? 'Update the policy details' : 'Create a new version of the policy'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Policy Type</Label>
                <Select
                  value={form.policy_type}
                  onValueChange={(value) => setForm({ ...form, policy_type: value as 'terms' | 'privacy' })}
                  disabled={!!editingPolicy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="terms">Terms of Service</SelectItem>
                    <SelectItem value="privacy">Privacy Policy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Version</Label>
                <Input
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="e.g., 1.0, 2.1"
                  disabled={!!editingPolicy}
                />
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={form.region}
                  onValueChange={(value) => setForm({ ...form, region: value as 'USA' | 'Nigeria' | (string & {}) })}
                  disabled={!!editingPolicy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USA">United States</SelectItem>
                    <SelectItem value="Nigeria">Nigeria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input
                  type="date"
                  value={form.effective_date}
                  onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Terms of Service - United States"
              />
            </div>
            <div className="space-y-2">
              <Label>Summary (shown to users)</Label>
              <Textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Brief summary of key changes in this version"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Content (Markdown supported)</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Full policy content with markdown formatting..."
                rows={15}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acceptances Dialog */}
      <Dialog open={acceptancesDialogOpen} onOpenChange={setAcceptancesDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Policy Acceptances Audit Trail</DialogTitle>
            <DialogDescription>
              View all users who have accepted this policy version
            </DialogDescription>
          </DialogHeader>
          
          {loadingAcceptances ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <Badge variant="secondary">{acceptances.length} acceptances</Badge>
                {acceptances.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportAcceptances}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
              
              {acceptances.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No acceptances recorded for this policy version.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Accepted At</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acceptances.map((acceptance) => (
                      <TableRow key={acceptance.id}>
                        <TableCell className="font-medium">
                          {acceptance.profile?.full_name || 'Unknown'}
                        </TableCell>
                        <TableCell>{acceptance.profile?.email || 'Unknown'}</TableCell>
                        <TableCell>{format(new Date(acceptance.accepted_at), 'PPpp')}</TableCell>
                        <TableCell>
                          {acceptance.region && <Badge variant="outline">{acceptance.region}</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {acceptance.ip_address || 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
