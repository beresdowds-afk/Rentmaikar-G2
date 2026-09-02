import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhotoUploadSlot } from './PhotoUploadSlot';
import { PhotoZoomModal } from './PhotoZoomModal';
import { useWeeklyInspection, PHOTO_TYPES, get30DayPeriodStart, type PhotoType } from '@/hooks/useWeeklyInspection';
import { Camera, Calendar, Clock, CheckCircle, AlertTriangle, History, Loader2, FileText, ShieldAlert } from 'lucide-react';
import { format, parseISO, addDays, isAfter, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';

interface WeeklyInspectionReportProps {
  vehicleId: string;
  vehicleName: string;
  ownerId?: string | null;
  region?: 'USA' | 'Nigeria' | (string & {});
}

export function WeeklyInspectionReport({
  vehicleId,
  vehicleName,
  ownerId = null,
}: WeeklyInspectionReportProps) {
  const {
    reports,
    currentReport,
    settings,
    activeAgreement,
    isLoading,
    uploadPhoto,
    createOrUpdateReport,
    submitReport,
  } = useWeeklyInspection(vehicleId);

  const [uploadingType, setUploadingType] = useState<PhotoType | null>(null);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomPhotoIndex, setZoomPhotoIndex] = useState(0);

  // ── 30-day period logic ──
  const periodStart = get30DayPeriodStart(activeAgreement?.expires_at);
  const dueDate = activeAgreement?.expires_at
    ? parseISO(activeAgreement.expires_at)
    : addDays(parseISO(periodStart), 30);

  const sevenDaysBeforeDue = addDays(dueDate, -7);
  const now = new Date();

  const isInReminderWindow = isAfter(now, sevenDaysBeforeDue) && isBefore(now, dueDate);
  const isOverdue = isAfter(now, dueDate) && !currentReport?.submitted_at;
  const isSubmitted = !!currentReport?.submitted_at;
  const hasActiveAgreement = !!activeAgreement;

  // Photo progress
  const uploadedCount = PHOTO_TYPES.filter(pt =>
    currentReport?.[pt.key as keyof typeof currentReport]
  ).length;
  const progress = (uploadedCount / PHOTO_TYPES.length) * 100;
  const isComplete = uploadedCount === PHOTO_TYPES.length;

  const renewalNum = activeAgreement ? (activeAgreement.renewal_count ?? 0) + 1 : null;

  const handlePhotoUpload = async (photoType: PhotoType, file: File) => {
    setUploadingType(photoType);
    try {
      const url = await uploadPhoto(vehicleId, photoType, file);
      if (url) {
        await createOrUpdateReport(vehicleId, ownerId, photoType, url);
      }
    } finally {
      setUploadingType(null);
    }
  };

  const handleSubmit = async () => {
    if (currentReport) {
      await submitReport(currentReport.id);
    }
  };

  const handleZoom = (photoType: PhotoType) => {
    const index = PHOTO_TYPES.findIndex(pt => pt.key === photoType);
    setZoomPhotoIndex(index);
    setZoomModalOpen(true);
  };

  const getZoomPhotos = () => {
    if (!currentReport) return [];
    return PHOTO_TYPES.map(pt => ({
      url: currentReport[pt.key as keyof typeof currentReport] as string | null,
      label: pt.label,
      timestamp: currentReport.photo_timestamps?.[pt.key] || null,
    }));
  };

  // ── Disabled state ──
  if (!settings?.feature_enabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Inspection Reports Disabled</p>
          <p className="text-muted-foreground">
            The vehicle inspection report feature is currently disabled.
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
          <p className="text-muted-foreground mt-2">Loading inspection data...</p>
        </CardContent>
      </Card>
    );
  }

  // ── No active agreement — block inspection ──
  if (!hasActiveAgreement) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-amber-500" />
          <p className="text-lg font-medium">No Active Rental Agreement</p>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            A compulsory 30-day rental agreement must be active before you can submit a vehicle inspection report.
            Please contact your administrator to initiate or sign your agreement.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                30-Day Vehicle Inspection
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                {vehicleName}
                {renewalNum && (
                  <Badge variant="outline" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    Agreement Renewal #{renewalNum}
                  </Badge>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={isOverdue ? 'destructive' : isSubmitted ? 'default' : isInReminderWindow ? 'outline' : 'secondary'}
                className={cn(isInReminderWindow && !isSubmitted && 'border-amber-500 text-amber-600')}
              >
                {isSubmitted ? (
                  <><CheckCircle className="h-3 w-3 mr-1" /> Submitted</>
                ) : isOverdue ? (
                  <><AlertTriangle className="h-3 w-3 mr-1" /> Overdue</>
                ) : isInReminderWindow ? (
                  <><Clock className="h-3 w-3 mr-1" /> Due in {Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)} days</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1" /> Due {format(dueDate, 'MMM d')}</>
                )}
              </Badge>
              <Badge variant="outline">
                {uploadedCount}/{PHOTO_TYPES.length} Photos
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Period: {format(parseISO(periodStart), 'MMM d')} – {format(dueDate, 'MMM d, yyyy')}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Upload Progress</span>
              <span className={cn(isComplete ? 'text-green-600 font-medium' : 'text-muted-foreground')}>
                {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* 7-day reminder alert */}
      {isInReminderWindow && !isSubmitted && (
        <Alert className="border-yellow-500/40 bg-yellow-500/10">
          <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            <strong>Reminder:</strong> Your 30-day inspection report is due in{' '}
            {Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)} days on{' '}
            {format(dueDate, 'MMMM d')}. Upload all 10 photos and submit before your agreement renews.
          </AlertDescription>
        </Alert>
      )}

      {/* Overdue Alert */}
      {isOverdue && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Your 30-day inspection report is overdue. Please upload all required photos and submit immediately to avoid service interruption.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload Photos</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Required Photos</CardTitle>
              <CardDescription>
                Upload all 10 photos showing the current condition of the vehicle.
                Each photo is timestamped automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {PHOTO_TYPES.map((pt) => (
                  <PhotoUploadSlot
                    key={pt.key}
                    label={pt.label}
                    description={pt.description}
                    photoUrl={currentReport?.[pt.key as keyof typeof currentReport] as string | undefined}
                    timestamp={currentReport?.photo_timestamps?.[pt.key]}
                    onUpload={(file) => handlePhotoUpload(pt.key, file)}
                    onZoom={() => handleZoom(pt.key)}
                    isUploading={uploadingType === pt.key}
                    disabled={isSubmitted}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {!isSubmitted && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Ready to Submit?</p>
                    <p className="text-sm text-muted-foreground">
                      {isComplete
                        ? 'All photos uploaded. Submit your 30-day inspection report.'
                        : `Upload ${PHOTO_TYPES.length - uploadedCount} more photo(s) to complete.`
                      }
                    </p>
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={!isComplete}
                    className="w-full sm:w-auto"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Submit 30-Day Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isSubmitted && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Your 30-day inspection report was submitted on{' '}
                {format(new Date(currentReport!.submitted_at!), 'MMM d, yyyy h:mm a')}.
                {currentReport?.status === 'pending' && ' Awaiting owner review.'}
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submission History</CardTitle>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No previous inspection reports found.
                </p>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => {
                    const photoCount = PHOTO_TYPES.filter(pt =>
                      report[pt.key as keyof typeof report]
                    ).length;

                    return (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">
                              Period from {format(parseISO(report.week_start_date), 'MMM d, yyyy')}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {report.submitted_at
                                ? `Submitted ${format(new Date(report.submitted_at), 'MMM d, h:mm a')}`
                                : 'Not submitted'
                              }
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{photoCount}/10 Photos</Badge>
                          <Badge
                            variant={
                              report.status === 'approved' || report.status === 'completed'
                                ? 'default'
                                : report.status === 'pending'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                          >
                            {report.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PhotoZoomModal
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        photos={getZoomPhotos()}
        initialIndex={zoomPhotoIndex}
      />
    </div>
  );
}
