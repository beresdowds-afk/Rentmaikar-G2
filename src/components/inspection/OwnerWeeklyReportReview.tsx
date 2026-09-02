import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { InspectionPhotoComparison } from './InspectionPhotoComparison';
import { PhotoZoomModal } from './PhotoZoomModal';
import { useWeeklyInspection, PHOTO_TYPES, type InspectionReport } from '@/hooks/useWeeklyInspection';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Car,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  Calendar,
  Clock,
  ImageIcon,
  Loader2,
  ArrowLeftRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
}

export function OwnerWeeklyReportReview() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<InspectionReport | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomPhotos, setZoomPhotos] = useState<Array<{ url: string | null; label: string; timestamp?: string | null }>>([]);

  const { updateOwnerReview, settings } = useWeeklyInspection();

  useEffect(() => {
    fetchVehicles();
  }, [user]);

  useEffect(() => {
    if (selectedVehicle) {
      fetchReportsForVehicle(selectedVehicle);
    }
  }, [selectedVehicle]);

  const fetchVehicles = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, make, model, year, license_plate')
      .eq('owner_id', user.id);
    
    if (!error && data) {
      setVehicles(data);
      if (data.length > 0) {
        setSelectedVehicle(data[0].id);
      }
    }
    setIsLoading(false);
  };

  const fetchReportsForVehicle = async (vehicleId: string) => {
    const { data, error } = await supabase
      .from('weekly_inspection_reports')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('week_start_date', { ascending: false });
    
    if (!error && data) {
      setReports(data as InspectionReport[]);
    }
  };

  const openReviewDialog = (report: InspectionReport) => {
    setSelectedReport(report);
    setReviewNotes('');
    setReviewDialogOpen(true);
  };

  const openCompareDialog = () => {
    setCompareDialogOpen(true);
  };

  const handleReviewAction = async (action: 'approved' | 'recall' | 'reassignment') => {
    if (!selectedReport) return;
    
    setIsSubmitting(true);
    const success = await updateOwnerReview(selectedReport.id, action, reviewNotes);
    setIsSubmitting(false);
    
    if (success) {
      setReviewDialogOpen(false);
      fetchReportsForVehicle(selectedVehicle!);
    }
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

  const selectedVehicleData = vehicles.find(v => v.id === selectedVehicle);
  const pendingReports = reports.filter(r => r.status === 'pending' && r.submitted_at);
  const reviewedReports = reports.filter(r => r.status !== 'pending');

  if (!settings?.feature_enabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Weekly Reports Disabled</p>
          <p className="text-muted-foreground">
            The weekly inspection report feature is currently disabled by admin.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
          <p className="text-muted-foreground mt-2">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No Vehicles</p>
          <p className="text-muted-foreground">
            You don't have any registered vehicles yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vehicle Selector & Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Weekly Inspection Reviews
              </CardTitle>
              <CardDescription>
                Review inspection reports from your drivers
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedVehicle || ''} onValueChange={setSelectedVehicle}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.make} {vehicle.model} ({vehicle.license_plate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reports.length >= 2 && (
                <Button variant="outline" onClick={openCompareDialog}>
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Compare Photos
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Review
            {pendingReports.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingReports.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium">All Caught Up!</p>
                <p className="text-muted-foreground">
                  No pending inspection reports to review.
                </p>
              </CardContent>
            </Card>
          ) : (
            pendingReports.map((report) => (
              <Card key={report.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-semibold">
                          Week of {format(parseISO(report.week_start_date), 'MMMM d, yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Submitted {format(new Date(report.submitted_at!), 'MMM d, h:mm a')}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">
                            {PHOTO_TYPES.filter(pt => report[pt.key as keyof InspectionReport]).length}/10 Photos
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => handleViewPhotos(report)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Photos
                      </Button>
                      <Button onClick={() => openReviewDialog(report)}>
                        Review
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="reviewed" className="space-y-4">
          {reviewedReports.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Reviewed Reports</p>
                <p className="text-muted-foreground">
                  Your reviewed reports will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            reviewedReports.map((report) => (
              <Card key={report.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                        report.owner_action === 'approved' 
                          ? 'bg-green-100' 
                          : 'bg-orange-100'
                      }`}>
                        {report.owner_action === 'approved' ? (
                          <CheckCircle className="h-6 w-6 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 text-orange-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">
                          Week of {format(parseISO(report.week_start_date), 'MMMM d, yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Reviewed {format(new Date(report.owner_reviewed_at!), 'MMM d, h:mm a')}
                        </p>
                        {report.owner_notes && (
                          <p className="text-sm mt-1 italic">"{report.owner_notes}"</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={report.owner_action === 'approved' ? 'default' : 'destructive'}
                      >
                        {report.owner_action === 'approved' ? 'Approved' : 
                         report.owner_action === 'recall' ? 'Recall Requested' : 
                         'Reassignment Requested'}
                      </Badge>
                      {report.admin_decision && (
                        <Badge variant="outline">
                          Admin: {report.admin_decision}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Inspection Report</DialogTitle>
            <DialogDescription>
              Review the inspection photos and take action on this report.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Review Notes</label>
              <Textarea
                placeholder="Add any notes about the vehicle condition..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Button 
                onClick={() => handleReviewAction('approved')}
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Approve Report
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline"
                  onClick={() => handleReviewAction('recall')}
                  disabled={isSubmitting}
                  className="border-orange-500 text-orange-600 hover:bg-orange-50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Request Recall
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handleReviewAction('reassignment')}
                  disabled={isSubmitting}
                  className="border-red-500 text-red-600 hover:bg-red-50"
                >
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Request Reassignment
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Comparison Dialog */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Photo Comparison</DialogTitle>
            <DialogDescription>
              Compare inspection photos across different weeks for {selectedVehicleData?.make} {selectedVehicleData?.model}
            </DialogDescription>
          </DialogHeader>
          <InspectionPhotoComparison
            reports={reports}
            vehicleName={`${selectedVehicleData?.make} ${selectedVehicleData?.model}`}
          />
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
