import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PhotoZoomModal } from '@/components/inspection/PhotoZoomModal';
import { InspectionPhotoComparison } from '@/components/inspection/InspectionPhotoComparison';
import { useAllInspectionReports, PHOTO_TYPES, type InspectionReport } from '@/hooks/useWeeklyInspection';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Camera,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  Calendar,
  Clock,
  Power,
  Loader2,
  Ban,
  ArrowLeftRight,
  FileWarning,
  Car,
  FileDown,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function AdminWeeklyReportManagement() {
  const { user } = useAuth();
  const { reports, settings, isLoading, refetch } = useAllInspectionReports();
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<InspectionReport | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomPhotos, setZoomPhotos] = useState<Array<{ url: string | null; label: string; timestamp?: string | null }>>([]);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareVehicleReports, setCompareVehicleReports] = useState<InspectionReport[]>([]);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setFeatureEnabled(settings.feature_enabled);
    }
  }, [settings]);

  const handleToggleFeature = async (enabled: boolean) => {
    setIsUpdatingSettings(true);
    
    const { error } = await supabase
      .from('weekly_report_settings')
      .update({
        feature_enabled: enabled,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings?.id);
    
    if (error) {
      toast.error('Failed to update settings');
    } else {
      setFeatureEnabled(enabled);
      toast.success(`Weekly reports ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    setIsUpdatingSettings(false);
  };

  const openReviewDialog = (report: InspectionReport) => {
    setSelectedReport(report);
    setAdminNotes('');
    setReviewDialogOpen(true);
  };

  const handleViewPhotos = (report: InspectionReport) => {
    const photos = PHOTO_TYPES.map(pt => ({
      url: report[pt.key as keyof InspectionReport] as string | null,
      label: pt.label,
      timestamp: report.photo_timestamps?.[pt.key] || null,
    }));
    setZoomPhotos(photos);
    setZoomModalOpen(true);
  };

  const handleComparePhotos = (report: InspectionReport) => {
    const vehicleReports = reports.filter(r => r.vehicle_id === report.vehicle_id);
    setCompareVehicleReports(vehicleReports);
    setCompareDialogOpen(true);
  };

  const handleDownloadPdf = async (report: InspectionReport) => {
    setDownloadingReportId(report.id);
    
    try {
      // Pull the real vehicle / driver / owner records so the PDF reflects
      // actual data rather than placeholder values.
      const [vehicleRes, driverRes, ownerRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('make, model, year, license_plate')
          .eq('id', report.vehicle_id)
          .maybeSingle(),
        report.driver_id
          ? supabase.from('profiles').select('full_name, email').eq('user_id', report.driver_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        report.owner_id
          ? supabase.from('profiles').select('full_name, email').eq('user_id', report.owner_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      const vehicle = vehicleRes.data;
      const driver = driverRes?.data;
      const owner = ownerRes?.data;

      const { data, error } = await supabase.functions.invoke('generate-inspection-pdf', {
        body: {
          reportId: report.id,
          vehicleInfo: {
            make: vehicle?.make ?? 'Unknown',
            model: vehicle?.model ?? 'Unknown',
            year: vehicle?.year ?? null,
            licensePlate: vehicle?.license_plate ?? 'N/A',
          },
          driverInfo: driver
            ? { name: driver.full_name ?? 'Unknown', email: driver.email ?? '' }
            : null,
          ownerInfo: owner
            ? { name: owner.full_name ?? 'Unknown', email: owner.email ?? '' }
            : null,
        },
      });


      if (error) throw error;

      if (data?.pdf) {
        // Create download link from base64 PDF
        const link = document.createElement('a');
        link.href = data.pdf;
        link.download = data.filename || `inspection-report-${report.id.slice(0, 8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success('PDF report downloaded successfully');
      }
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF report');
    } finally {
      setDownloadingReportId(null);
    }
  };

  const handleAdminDecision = async (decision: string) => {
    if (!selectedReport || !user) return;
    
    setIsSubmitting(true);
    
    const { error } = await supabase
      .from('weekly_inspection_reports')
      .update({
        admin_reviewed_at: new Date().toISOString(),
        admin_decision: decision,
        admin_notes: adminNotes,
        admin_id: user.id,
        status: decision === 'approved' ? 'completed' : decision,
      })
      .eq('id', selectedReport.id);
    
    if (error) {
      toast.error('Failed to submit decision');
    } else {
      toast.success('Decision recorded');
      setReviewDialogOpen(false);
      refetch();
    }
    
    setIsSubmitting(false);
  };

  // Filter reports
  const pendingReports = reports.filter(r => 
    r.status === 'pending' && r.submitted_at
  );
  const ownerRequestReports = reports.filter(r => 
    ['recall_requested', 'reassignment_requested'].includes(r.status)
  );
  const forcedWithdrawalReports = reports.filter(r => 
    r.owner_action && !r.driver_accepted_withdrawal && r.driver_responded_at
  );
  const completedReports = reports.filter(r => 
    ['completed', 'approved', 'recall_approved', 'reassignment_approved', 'forced_withdrawal'].includes(r.status)
  );

  // Stats
  const stats = {
    total: reports.length,
    pending: pendingReports.length,
    ownerRequests: ownerRequestReports.length,
    completed: completedReports.length,
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
          <p className="text-muted-foreground mt-2">Loading reports...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feature Toggle & Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-1">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Power className={`h-5 w-5 ${featureEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                <Label htmlFor="feature-toggle" className="font-medium">
                  Feature Status
                </Label>
              </div>
              <Switch
                id="feature-toggle"
                checked={featureEnabled}
                onCheckedChange={handleToggleFeature}
                disabled={isUpdatingSettings}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {featureEnabled ? 'Weekly reports are active' : 'Weekly reports are disabled'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reports</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Camera className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Owner Requests</p>
                <p className="text-2xl font-bold">{stats.ownerRequests}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reports Tabs */}
      <Tabs defaultValue="owner-requests">
        <TabsList className="flex-wrap">
          <TabsTrigger value="owner-requests">
            Owner Requests
            {ownerRequestReports.length > 0 && (
              <Badge variant="destructive" className="ml-2">{ownerRequestReports.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="forced-withdrawal">
            Forced Withdrawal
            {forcedWithdrawalReports.length > 0 && (
              <Badge variant="destructive" className="ml-2">{forcedWithdrawalReports.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Reports</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {/* Owner Requests Tab */}
        <TabsContent value="owner-requests" className="space-y-4">
          {ownerRequestReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium">No Pending Requests</p>
                <p className="text-muted-foreground">
                  All owner requests have been processed.
                </p>
              </CardContent>
            </Card>
          ) : (
            ownerRequestReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onViewPhotos={() => handleViewPhotos(report)}
                onCompare={() => handleComparePhotos(report)}
                onReview={() => openReviewDialog(report)}
                onDownloadPdf={() => handleDownloadPdf(report)}
                isDownloading={downloadingReportId === report.id}
              />
            ))
          )}
        </TabsContent>

        {/* Forced Withdrawal Tab */}
        <TabsContent value="forced-withdrawal" className="space-y-4">
          {forcedWithdrawalReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileWarning className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Forced Withdrawal Cases</p>
                <p className="text-muted-foreground">
                  Cases where drivers declined owner's withdrawal requests will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            forcedWithdrawalReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                showForceOption
                onViewPhotos={() => handleViewPhotos(report)}
                onCompare={() => handleComparePhotos(report)}
                onReview={() => openReviewDialog(report)}
                onDownloadPdf={() => handleDownloadPdf(report)}
                isDownloading={downloadingReportId === report.id}
              />
            ))
          )}
        </TabsContent>

        {/* All Reports Tab */}
        <TabsContent value="all" className="space-y-4">
          {reports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Reports Yet</p>
                <p className="text-muted-foreground">
                  Weekly inspection reports will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            reports.slice(0, 20).map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onViewPhotos={() => handleViewPhotos(report)}
                onCompare={() => handleComparePhotos(report)}
                onReview={() => openReviewDialog(report)}
                onDownloadPdf={() => handleDownloadPdf(report)}
                isDownloading={downloadingReportId === report.id}
              />
            ))
          )}
        </TabsContent>

        {/* Completed Tab */}
        <TabsContent value="completed" className="space-y-4">
          {completedReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Completed Reports</p>
                <p className="text-muted-foreground">
                  Processed reports will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            completedReports.slice(0, 20).map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onViewPhotos={() => handleViewPhotos(report)}
                onCompare={() => handleComparePhotos(report)}
                onDownloadPdf={() => handleDownloadPdf(report)}
                isDownloading={downloadingReportId === report.id}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Admin Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Admin Decision</DialogTitle>
            <DialogDescription>
              Review the inspection and make a final decision.
            </DialogDescription>
          </DialogHeader>
          
          {selectedReport && (
            <div className="space-y-4 mt-4">
              {/* Owner's Request Info */}
              {selectedReport.owner_action && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Owner Request</p>
                  <Badge variant={selectedReport.owner_action === 'recall' ? 'secondary' : 'destructive'} className="mt-1">
                    {selectedReport.owner_action === 'recall' ? 'Vehicle Recall' : 'Vehicle Reassignment'}
                  </Badge>
                  {selectedReport.owner_notes && (
                    <p className="text-sm mt-2 italic">"{selectedReport.owner_notes}"</p>
                  )}
                </div>
              )}

              <div>
                <Label>Admin Notes</Label>
                <Textarea
                  placeholder="Add decision notes..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Button 
                  onClick={() => handleAdminDecision('approved')}
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Approve (No Action Needed)
                </Button>
                
                {selectedReport.owner_action === 'recall' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="default"
                      onClick={() => handleAdminDecision('recall_approved')}
                      disabled={isSubmitting}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Approve Recall
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleAdminDecision('recall_denied')}
                      disabled={isSubmitting}
                    >
                      Deny Recall
                    </Button>
                  </div>
                )}
                
                {selectedReport.owner_action === 'reassignment' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="default"
                      onClick={() => handleAdminDecision('reassignment_approved')}
                      disabled={isSubmitting}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Approve Reassignment
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleAdminDecision('reassignment_denied')}
                      disabled={isSubmitting}
                    >
                      Deny Reassignment
                    </Button>
                  </div>
                )}
                
                <Button 
                  variant="destructive"
                  onClick={() => handleAdminDecision('forced_withdrawal')}
                  disabled={isSubmitting}
                  className="w-full"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Force Withdrawal
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Comparison Dialog */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Photo Comparison</DialogTitle>
            <DialogDescription>
              Compare inspection photos across different weeks
            </DialogDescription>
          </DialogHeader>
          <InspectionPhotoComparison reports={compareVehicleReports} />
        </DialogContent>
      </Dialog>

      {/* Photo Zoom Modal */}
      <PhotoZoomModal
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        photos={zoomPhotos}
      />
    </div>
  );
}

// Report Card Component
interface ReportCardProps {
  report: InspectionReport;
  showForceOption?: boolean;
  onViewPhotos: () => void;
  onCompare: () => void;
  onReview?: () => void;
  onDownloadPdf: () => void;
  isDownloading?: boolean;
}

function ReportCard({ report, showForceOption, onViewPhotos, onCompare, onReview, onDownloadPdf, isDownloading }: ReportCardProps) {
  const photoCount = PHOTO_TYPES.filter(pt => report[pt.key as keyof InspectionReport]).length;
  
  const getStatusBadge = () => {
    switch (report.status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'recall_requested':
        return <Badge className="bg-orange-500">Recall Requested</Badge>;
      case 'reassignment_requested':
        return <Badge variant="destructive">Reassignment Requested</Badge>;
      case 'completed':
      case 'approved':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'recall_approved':
        return <Badge className="bg-orange-600">Recall Approved</Badge>;
      case 'reassignment_approved':
        return <Badge className="bg-red-600">Reassignment Approved</Badge>;
      case 'forced_withdrawal':
        return <Badge variant="destructive">Forced Withdrawal</Badge>;
      default:
        return <Badge variant="outline">{report.status}</Badge>;
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Car className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">
                Week of {format(parseISO(report.week_start_date), 'MMMM d, yyyy')}
              </p>
              <p className="text-sm text-muted-foreground">
                Vehicle: {report.vehicle_id.slice(0, 8)}... • 
                Driver: {report.driver_id.slice(0, 8)}...
              </p>
              {report.owner_notes && (
                <p className="text-sm mt-1">
                  <span className="text-muted-foreground">Owner Notes:</span> "{report.owner_notes}"
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline">{photoCount}/10 Photos</Badge>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onViewPhotos}>
              <Eye className="h-4 w-4 mr-1" />
              Photos
            </Button>
            <Button variant="outline" size="sm" onClick={onCompare}>
              <ArrowLeftRight className="h-4 w-4 mr-1" />
              Compare
            </Button>
            <Button variant="outline" size="sm" onClick={onDownloadPdf} disabled={isDownloading}>
              {isDownloading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-1" />
              )}
              PDF
            </Button>
            {onReview && (
              <Button size="sm" onClick={onReview}>
                Review
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
