import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DataPagination } from '@/components/ui/data-pagination';
import { SplitPane } from '@/components/ui/split-pane';
import {
  User, Car, Search, Eye, CheckCircle, XCircle, Clock, AlertCircle,
  Mail, Phone, MapPin, Calendar, RefreshCw, UserPlus, ClipboardList
} from 'lucide-react';
import { format } from 'date-fns';
import RefereeVerificationPanel from '@/components/verification/RefereeVerificationPanel';
import ApplicationPipelineStatusPanel from '@/components/admin/ApplicationPipelineStatusPanel';
import ApplicationAuditLog from '@/components/admin/ApplicationAuditLog';
import ApplicationRecoveryPanel from '@/components/admin/ApplicationRecoveryPanel';

type ApplicationType = 'driver' | 'owner';
type ApplicationStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'needs_info';

interface Application {
  id: string;
  application_type: ApplicationType;
  status: ApplicationStatus;
  first_name: string;
  last_name: string;
  email: string;
  phone_country: string;
  phone_number: string;
  country: string;
  city: string;
  zip_code: string;
  region: string;
  rideshare_platforms: string[];
  has_driver_license: boolean;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  desired_weekly_price: number | null;
  vehicle_description: string | null;
  has_registration: boolean;
  has_insurance: boolean;
  agreed_terms: boolean;
  agreed_privacy: boolean;
  agreed_iot: boolean;
  agreed_fees: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<ApplicationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
  under_review: { label: 'Under Review', color: 'bg-blue-100 text-blue-800', icon: <Eye className="h-3 w-3" /> },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" /> },
  needs_info: { label: 'Needs Info', color: 'bg-orange-100 text-orange-800', icon: <AlertCircle className="h-3 w-3" /> },
};

export const ApplicationManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'driver' | 'owner'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [viewApp, setViewApp] = useState<Application | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedListAppId, setSelectedListAppId] = useState<string | null>(null);

  // Fetch applications
  const { data: applications = [], isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['applications', activeTab, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeTab !== 'all') {
        query = query.eq('application_type', activeTab);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Application[];
    },
    retry: (count, err: any) => {
      const msg = String(err?.message || '').toLowerCase();
      // Don't retry on permission / auth errors — retrying won't help.
      if (msg.includes('permission denied') || msg.includes('rls') || msg.includes('not authorized')) {
        return false;
      }
      return count < 2;
    },
  });

  // Real-time subscription for applications
  useEffect(() => {
    const channel = supabase
      .channel('applications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications',
        },
        (payload) => {
          console.log('Application realtime update:', payload);
          queryClient.invalidateQueries({ queryKey: ['applications'] });
          
          if (payload.eventType === 'INSERT') {
            const app = payload.new as Application;
            toast.info(`New ${app.application_type} application from ${app.first_name} ${app.last_name}`);
          } else if (payload.eventType === 'UPDATE') {
            const app = payload.new as Application;
            toast.info(`Application from ${app.first_name} ${app.last_name} updated`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch support staff for assignment
  const { data: supportStaff = [] } = useQuery({
    queryKey: ['support-staff-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_staff')
        .select('id, user_id, support_type, assigned_city')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Update application status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      appId, 
      newStatus, 
      notes, 
      reason 
    }: { 
      appId: string; 
      newStatus: ApplicationStatus; 
      notes?: string; 
      reason?: string;
    }) => {
      // Approvals go through a security-definer RPC that also grants the
      // driver/owner role in one transaction. Other status changes remain a
      // direct update.
      if (newStatus === 'approved') {
        const { error } = await supabase.rpc('approve_application', {
          _app_id: appId,
          _notes: notes ?? null,
        });
        if (error) throw error;
        return;
      }

      if (newStatus === 'rejected') {
        const { error } = await supabase.rpc('reject_application', {
          _app_id: appId,
          _reason: reason ?? 'Rejected by reviewer',
          _notes: notes ?? null,
        });
        if (error) throw error;
        return;
      }

      const updateData: Record<string, unknown> = {
        status: newStatus,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      };

      if (notes) updateData.review_notes = notes;
      if (reason) updateData.rejection_reason = reason;

      const { error } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', appId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application status updated');
      setReviewDialogOpen(false);
      setSelectedApp(null);
      setReviewNotes('');
      setRejectionReason('');
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    },
  });

  // Assign staff mutation
  const assignStaffMutation = useMutation({
    mutationFn: async ({ appId, staffId }: { appId: string; staffId: string }) => {
      const { error } = await supabase
        .from('applications')
        .update({
          assigned_to: staffId,
          assigned_at: new Date().toISOString(),
          assigned_by: user?.id,
          status: 'under_review',
        })
        .eq('id', appId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application assigned');
    },
    onError: (error) => {
      toast.error('Failed to assign: ' + error.message);
    },
  });

  // Filter applications by search
  const filteredApps = applications.filter(app => {
    const searchLower = searchQuery.toLowerCase();
    return (
      app.first_name.toLowerCase().includes(searchLower) ||
      app.last_name.toLowerCase().includes(searchLower) ||
      app.email.toLowerCase().includes(searchLower) ||
      app.city.toLowerCase().includes(searchLower)
    );
  });

  // Stats
  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    underReview: applications.filter(a => a.status === 'under_review').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
    drivers: applications.filter(a => a.application_type === 'driver').length,
    owners: applications.filter(a => a.application_type === 'owner').length,
  };

  const handleQuickApprove = (app: Application) => {
    updateStatusMutation.mutate({ appId: app.id, newStatus: 'approved' });
  };

  const handleQuickReject = (app: Application) => {
    setSelectedApp(app);
    setReviewDialogOpen(true);
  };

  const handleReviewSubmit = () => {
    if (!selectedApp) return;
    updateStatusMutation.mutate({
      appId: selectedApp.id,
      newStatus: 'rejected',
      notes: reviewNotes,
      reason: rejectionReason,
    });
  };

  const handleMarkUnderReview = (app: Application) => {
    updateStatusMutation.mutate({ appId: app.id, newStatus: 'under_review' });
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
            <p className="text-xs text-yellow-600">Pending</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{stats.underReview}</p>
            <p className="text-xs text-blue-600">Under Review</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.approved}</p>
            <p className="text-xs text-green-600">Approved</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
            <p className="text-xs text-red-600">Rejected</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-700">{stats.drivers}</p>
            <p className="text-xs text-purple-600">Drivers</p>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-indigo-700">{stats.owners}</p>
            <p className="text-xs text-indigo-600">Owners</p>
          </CardContent>
        </Card>
      </div>

      {/* Recovery & recycle for rejected applications */}
      <ApplicationRecoveryPanel />

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Application Management
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApplicationStatus | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="needs_info">Needs Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'driver' | 'owner')}>
            <TabsList className="mb-4">
              <TabsTrigger value="all" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                All ({stats.total})
              </TabsTrigger>
              <TabsTrigger value="driver" className="gap-2">
                <User className="h-4 w-4" />
                Drivers ({stats.drivers})
              </TabsTrigger>
              <TabsTrigger value="owner" className="gap-2">
                <Car className="h-4 w-4" />
                Owners ({stats.owners})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading applications...</div>
              ) : isError ? (
                (() => {
                  const raw = String((queryError as any)?.message || 'Unknown error');
                  const permission = /permission denied|rls|not authorized|jwt|forbidden/i.test(raw);
                  return (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
                      <p className="font-semibold text-destructive">
                        {permission ? 'Access denied loading applications' : 'Could not load applications'}
                      </p>
                      <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                        {permission
                          ? 'Your account does not currently have permission to read the applications list. Ask an administrator to grant you the "View / Manage Users" capability (Admin Assistants portal) or to check the applications table row-level security policies.'
                          : 'The applications query failed. This is usually temporary. Please retry or refresh the page.'}
                      </p>
                      <p className="text-xs text-muted-foreground/80 font-mono break-all">{raw}</p>
                      <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
                    </div>
                  );
                })()
              ) : filteredApps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No applications found</div>
              ) : (
                <>

                  {(() => {
                    const totalPages = Math.ceil(filteredApps.length / itemsPerPage);
                    const paginatedApps = filteredApps.slice(
                      (currentPage - 1) * itemsPerPage,
                      currentPage * itemsPerPage
                    );
                    const selectedApp =
                      paginatedApps.find((a) => a.id === selectedListAppId) ??
                      filteredApps.find((a) => a.id === selectedListAppId) ??
                      null;

                    const list = (
                      <>
                        <div className="space-y-2">
                          {paginatedApps.map((app) => {
                            const status = statusConfig[app.status];
                            const isSelected = selectedListAppId === app.id;
                            const isDriver = app.application_type === 'driver';
                            return (
                              <button
                                type="button"
                                key={app.id}
                                onClick={() => setSelectedListAppId(app.id)}
                                aria-selected={isSelected}
                                className={`w-full text-left rounded-lg border p-3 hover:bg-accent/40 transition-colors ${
                                  isSelected ? 'border-primary ring-1 ring-primary bg-primary/5' : ''
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-full shrink-0 ${isDriver ? 'bg-purple-100' : 'bg-indigo-100'}`}>
                                    {isDriver ? (
                                      <User className="h-4 w-4 text-purple-600" />
                                    ) : (
                                      <Car className="h-4 w-4 text-indigo-600" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-medium truncate">{app.first_name} {app.last_name}</p>
                                      <Badge className={`text-[10px] ${status.color}`}>
                                        {status.label}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">{app.email}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {app.city}, {app.country.toUpperCase()} · {format(new Date(app.created_at), 'MMM dd')}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <DataPagination
                          currentPage={currentPage}
                          totalPages={totalPages}
                          onPageChange={setCurrentPage}
                          className="mt-4"
                        />
                      </>
                    );

                    const detail = selectedApp && (
                      <ApplicationCard
                        application={selectedApp}
                        supportStaff={supportStaff}
                        onApprove={() => handleQuickApprove(selectedApp)}
                        onReject={() => handleQuickReject(selectedApp)}
                        onMarkReview={() => handleMarkUnderReview(selectedApp)}
                        onAssign={(staffId) => assignStaffMutation.mutate({ appId: selectedApp.id, staffId })}
                        onView={() => setViewApp(selectedApp)}
                      />
                    );

                    return (
                      <>
                        {/* On < xl show inline list of full ApplicationCards for parity */}
                        <div className="xl:hidden space-y-3">
                          {paginatedApps.map((app) => (
                            <ApplicationCard
                              key={app.id}
                              application={app}
                              supportStaff={supportStaff}
                              onApprove={() => handleQuickApprove(app)}
                              onReject={() => handleQuickReject(app)}
                              onMarkReview={() => handleMarkUnderReview(app)}
                              onAssign={(staffId) => assignStaffMutation.mutate({ appId: app.id, staffId })}
                              onView={() => setViewApp(app)}
                            />
                          ))}
                          <DataPagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            className="mt-4"
                          />
                        </div>
                        {/* xl+: split-pane list + detail */}
                        <div className="hidden xl:block">
                          <SplitPane
                            list={list}
                            detail={detail}
                            hasSelection={!!selectedApp}
                            emptyState={
                              <div className="text-center text-sm text-muted-foreground py-16">
                                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                Select an application to see full details and actions.
                              </div>
                            }
                          />
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Full-details dialog opened by the View button */}
      <Dialog open={!!viewApp} onOpenChange={(open) => !open && setViewApp(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewApp?.application_type === 'driver' ? (
                <User className="h-5 w-5 text-purple-600" />
              ) : (
                <Car className="h-5 w-5 text-indigo-600" />
              )}
              {viewApp?.first_name} {viewApp?.last_name}
              {viewApp && (
                <Badge className={`ml-2 ${statusConfig[viewApp.status].color}`}>
                  {statusConfig[viewApp.status].label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewApp && (
            <div className="space-y-4 text-sm">
              <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><span className="font-medium">Email:</span> {viewApp.email}</div>
                <div><span className="font-medium">Phone:</span> {viewApp.phone_country === 'us' ? '+1 ' : '+234 '}{viewApp.phone_number}</div>
                <div><span className="font-medium">Country:</span> {viewApp.country.toUpperCase()}</div>
                <div><span className="font-medium">City:</span> {viewApp.city}</div>
                <div><span className="font-medium">ZIP:</span> {viewApp.zip_code}</div>
                <div><span className="font-medium">Region:</span> {viewApp.region}</div>
                <div><span className="font-medium">Submitted:</span> {format(new Date(viewApp.created_at), 'MMM dd, yyyy HH:mm')}</div>
                <div><span className="font-medium">Last update:</span> {format(new Date(viewApp.updated_at), 'MMM dd, yyyy HH:mm')}</div>
              </section>

              {viewApp.application_type === 'driver' ? (
                <section className="space-y-2 border-t pt-3">
                  <h4 className="font-semibold">Driver details</h4>
                  <div><span className="font-medium">Rideshare platforms:</span> {(viewApp.rideshare_platforms || []).join(', ') || '—'}</div>
                  <div><span className="font-medium">Driver license:</span> {viewApp.has_driver_license ? 'Yes' : 'No'}</div>
                </section>
              ) : (
                <section className="space-y-2 border-t pt-3">
                  <h4 className="font-semibold">Vehicle details</h4>
                  <div>{viewApp.vehicle_year} {viewApp.vehicle_make} {viewApp.vehicle_model} ({viewApp.vehicle_color})</div>
                  <div><span className="font-medium">Plate:</span> {viewApp.vehicle_plate}</div>
                  <div><span className="font-medium">Desired weekly price:</span> {viewApp.country === 'nigeria' ? '₦' : '$'}{viewApp.desired_weekly_price}</div>
                  <div><span className="font-medium">Registration:</span> {viewApp.has_registration ? 'Yes' : 'No'} · <span className="font-medium">Insurance:</span> {viewApp.has_insurance ? 'Yes' : 'No'}</div>
                  {viewApp.vehicle_description && (
                    <div><span className="font-medium">Description:</span> {viewApp.vehicle_description}</div>
                  )}
                </section>
              )}

              <section className="space-y-2 border-t pt-3">
                <h4 className="font-semibold">Agreements</h4>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={viewApp.agreed_terms ? 'default' : 'destructive'} className="text-xs">Terms</Badge>
                  <Badge variant={viewApp.agreed_privacy ? 'default' : 'destructive'} className="text-xs">Privacy</Badge>
                  <Badge variant={viewApp.agreed_iot ? 'default' : 'destructive'} className="text-xs">IoT Consent</Badge>
                  <Badge variant={viewApp.agreed_fees ? 'default' : 'destructive'} className="text-xs">Fees</Badge>
                </div>
              </section>

              {(viewApp.review_notes || viewApp.rejection_reason || viewApp.reviewed_at) && (
                <section className="space-y-2 border-t pt-3">
                  <h4 className="font-semibold">Review history</h4>
                  {viewApp.reviewed_at && <div><span className="font-medium">Reviewed at:</span> {format(new Date(viewApp.reviewed_at), 'MMM dd, yyyy HH:mm')}</div>}
                  {viewApp.review_notes && <div><span className="font-medium">Notes:</span> {viewApp.review_notes}</div>}
                  {viewApp.rejection_reason && (
                    <div className="p-3 bg-red-50 rounded"><span className="font-medium text-red-700">Rejection reason:</span> <span className="text-red-600">{viewApp.rejection_reason}</span></div>
                  )}
                </section>
              )}

              <ApplicationAuditLog applicationId={viewApp.id} />
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2">
            {viewApp && (viewApp.status === 'pending' || viewApp.status === 'under_review') && (
              <>
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    handleQuickApprove(viewApp);
                    setViewApp(null);
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleQuickReject(viewApp);
                    setViewApp(null);
                  }}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </>
            )}
            {viewApp && viewApp.status === 'approved' && viewApp.user_id && (
              <Button
                variant="default"
                onClick={async () => {
                  const { error } = await supabase.rpc('grant_full_access', { _user_id: viewApp.user_id });
                  if (error) {
                    toast.error('Could not grant full access: ' + error.message);
                  } else {
                    toast.success('Full dashboard access granted');
                    setViewApp(null);
                    queryClient.invalidateQueries({ queryKey: ['applications'] });
                  }
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Grant full dashboard access
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewApp(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rejection Reason (Required)</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this application is being rejected..."
                rows={3}
              />
            </div>
            <div>
              <Label>Internal Notes (Optional)</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Additional notes for internal reference..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleReviewSubmit}
              disabled={!rejectionReason.trim() || updateStatusMutation.isPending}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Application Card Component
interface ApplicationCardProps {
  application: Application;
  supportStaff: { id: string; user_id: string; support_type: string; assigned_city: string }[];
  onApprove: () => void;
  onReject: () => void;
  onMarkReview: () => void;
  onAssign: (staffId: string) => void;
  onView: () => void;
}

const ApplicationCard = ({
  application,
  supportStaff,
  onApprove,
  onReject,
  onMarkReview,
  onAssign,
  onView,
}: ApplicationCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const status = statusConfig[application.status];
  const isDriver = application.application_type === 'driver';

  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Main Info */}
          <div className="flex items-start gap-4 flex-1">
            <div className={`p-2 rounded-full ${isDriver ? 'bg-purple-100' : 'bg-indigo-100'}`}>
              {isDriver ? (
                <User className="h-5 w-5 text-purple-600" />
              ) : (
                <Car className="h-5 w-5 text-indigo-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium">{application.first_name} {application.last_name}</h4>
                <Badge variant="outline" className="text-xs">
                  {isDriver ? 'Driver' : 'Owner'}
                </Badge>
                <Badge className={`text-xs ${status.color}`}>
                  {status.icon}
                  <span className="ml-1">{status.label}</span>
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {application.email}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {application.phone_country === 'us' ? '+1' : '+234'} {application.phone_number}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {application.city}, {application.country.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                Applied: {format(new Date(application.created_at), 'MMM dd, yyyy HH:mm')}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={onView}>
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            {application.status === 'pending' && (
              <>
                <Button size="sm" variant="outline" onClick={onMarkReview}>
                  <Eye className="h-4 w-4 mr-1" />
                  Review
                </Button>
                <Select onValueChange={onAssign}>
                  <SelectTrigger className="w-[140px] h-8">
                    <UserPlus className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportStaff.filter(staff => staff.id).map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.support_type} - {staff.assigned_city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {(application.status === 'pending' || application.status === 'under_review') && (
              <>
                <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={onApprove}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={onReject}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Less' : 'More'}
            </Button>
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {isDriver ? (
              <>
                <div>
                  <span className="font-medium">Rideshare Platforms:</span>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {application.rideshare_platforms?.map((platform) => (
                      <Badge key={platform} variant="secondary" className="text-xs">
                        {platform}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Driver License:</span>
                  <Badge variant={application.has_driver_license ? 'default' : 'destructive'} className="ml-2 text-xs">
                    {application.has_driver_license ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="font-medium">Vehicle:</span>
                  <span className="ml-2">
                    {application.vehicle_year} {application.vehicle_make} {application.vehicle_model} ({application.vehicle_color})
                  </span>
                </div>
                <div>
                  <span className="font-medium">License Plate:</span>
                  <span className="ml-2">{application.vehicle_plate}</span>
                </div>
                <div>
                  <span className="font-medium">Desired Weekly Price:</span>
                  <span className="ml-2">{application.country === 'nigeria' ? '₦' : '$'}{application.desired_weekly_price}</span>
                </div>
                <div>
                  <span className="font-medium">Documents:</span>
                  <div className="flex gap-2 mt-1">
                    <Badge variant={application.has_registration ? 'default' : 'destructive'} className="text-xs">
                      Registration: {application.has_registration ? 'Yes' : 'No'}
                    </Badge>
                    <Badge variant={application.has_insurance ? 'default' : 'destructive'} className="text-xs">
                      Insurance: {application.has_insurance ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </div>
                {application.vehicle_description && (
                  <div className="md:col-span-2">
                    <span className="font-medium">Description:</span>
                    <p className="text-muted-foreground mt-1">{application.vehicle_description}</p>
                  </div>
                )}
              </>
            )}
            <div className="md:col-span-2">
              <span className="font-medium">Agreements:</span>
              <div className="flex gap-2 mt-1 flex-wrap">
                <Badge variant={application.agreed_terms ? 'default' : 'destructive'} className="text-xs">Terms</Badge>
                <Badge variant={application.agreed_privacy ? 'default' : 'destructive'} className="text-xs">Privacy</Badge>
                <Badge variant={application.agreed_iot ? 'default' : 'destructive'} className="text-xs">IoT Consent</Badge>
                {!isDriver && (
                  <Badge variant={application.agreed_fees ? 'default' : 'destructive'} className="text-xs">Fees</Badge>
                )}
              </div>
            </div>
            {application.rejection_reason && (
              <div className="md:col-span-2 p-3 bg-red-50 rounded-lg">
                <span className="font-medium text-red-700">Rejection Reason:</span>
                <p className="text-red-600 mt-1">{application.rejection_reason}</p>
              </div>
            )}
            {isDriver && (
              <div className="md:col-span-2">
                <RefereeVerificationPanel applicationId={application.id} />
                <ApplicationPipelineStatusPanel applicationId={application.id} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ApplicationManagement;
