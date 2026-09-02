import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Expand, ZoomIn, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { PhotoZoomModal } from './PhotoZoomModal';
import { PHOTO_TYPES, type InspectionReport } from '@/hooks/useWeeklyInspection';
import { cn } from '@/lib/utils';

interface InspectionPhotoComparisonProps {
  reports: InspectionReport[];
  vehicleName?: string;
}

export function InspectionPhotoComparison({
  reports,
  vehicleName,
}: InspectionPhotoComparisonProps) {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [compareWeekIndex, setCompareWeekIndex] = useState(1);
  const [activePhotoType, setActivePhotoType] = useState<string>(PHOTO_TYPES[0].key);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomSide, setZoomSide] = useState<'current' | 'compare'>('current');

  const sortedReports = useMemo(() => 
    [...reports].sort((a, b) => 
      new Date(b.week_start_date).getTime() - new Date(a.week_start_date).getTime()
    ),
    [reports]
  );

  const currentReport = sortedReports[selectedWeekIndex];
  const compareReport = sortedReports[compareWeekIndex];

  const getPhotoUrl = (report: InspectionReport | undefined, photoType: string): string | null => {
    if (!report) return null;
    return report[photoType as keyof InspectionReport] as string | null;
  };

  const getTimestamp = (report: InspectionReport | undefined, photoType: string): string | null => {
    if (!report?.photo_timestamps) return null;
    return report.photo_timestamps[photoType] || null;
  };

  const currentPhotoUrl = getPhotoUrl(currentReport, activePhotoType);
  const comparePhotoUrl = getPhotoUrl(compareReport, activePhotoType);
  const currentTimestamp = getTimestamp(currentReport, activePhotoType);
  const compareTimestamp = getTimestamp(compareReport, activePhotoType);

  const handleZoom = (side: 'current' | 'compare') => {
    setZoomSide(side);
    setZoomModalOpen(true);
  };

  const getPhotosForZoom = (report: InspectionReport | undefined) => {
    if (!report) return [];
    return PHOTO_TYPES.map(pt => ({
      url: getPhotoUrl(report, pt.key),
      label: pt.label,
      timestamp: getTimestamp(report, pt.key),
    }));
  };

  const goToPrevPhoto = () => {
    const currentIdx = PHOTO_TYPES.findIndex(p => p.key === activePhotoType);
    const prevIdx = (currentIdx - 1 + PHOTO_TYPES.length) % PHOTO_TYPES.length;
    setActivePhotoType(PHOTO_TYPES[prevIdx].key);
  };

  const goToNextPhoto = () => {
    const currentIdx = PHOTO_TYPES.findIndex(p => p.key === activePhotoType);
    const nextIdx = (currentIdx + 1) % PHOTO_TYPES.length;
    setActivePhotoType(PHOTO_TYPES[nextIdx].key);
  };

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No Inspection Reports</p>
          <p className="text-muted-foreground">
            No weekly inspection reports have been submitted yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (reports.length === 1) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Only One Report Available</p>
          <p className="text-muted-foreground">
            Need at least two weeks of reports to compare.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activePhotoInfo = PHOTO_TYPES.find(p => p.key === activePhotoType);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Photo Comparison
                {vehicleName && (
                  <Badge variant="outline">{vehicleName}</Badge>
                )}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Current:</span>
                <Select
                  value={selectedWeekIndex.toString()}
                  onValueChange={(v) => setSelectedWeekIndex(parseInt(v))}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedReports.map((report, idx) => (
                      <SelectItem key={report.id} value={idx.toString()} disabled={idx === compareWeekIndex}>
                        Week of {format(parseISO(report.week_start_date), 'MMM d, yyyy')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-muted-foreground">vs</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Compare:</span>
                <Select
                  value={compareWeekIndex.toString()}
                  onValueChange={(v) => setCompareWeekIndex(parseInt(v))}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedReports.map((report, idx) => (
                      <SelectItem key={report.id} value={idx.toString()} disabled={idx === selectedWeekIndex}>
                        Week of {format(parseISO(report.week_start_date), 'MMM d, yyyy')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Photo Type Tabs */}
      <Tabs value={activePhotoType} onValueChange={(v) => setActivePhotoType(v as typeof activePhotoType)}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          {PHOTO_TYPES.map((pt) => (
            <TabsTrigger key={pt.key} value={pt.key} className="text-xs">
              {pt.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activePhotoType} className="mt-4">
          {/* Comparison View */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Current Week */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Current Week</p>
                    <p className="font-semibold">
                      {format(parseISO(currentReport.week_start_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {currentTimestamp && (
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(currentTimestamp), 'h:mm a')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="aspect-video relative rounded-lg overflow-hidden bg-muted">
                  {currentPhotoUrl ? (
                    <>
                      <img
                        src={currentPhotoUrl}
                        alt={`Current - ${activePhotoInfo?.label}`}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute top-2 right-2"
                        onClick={() => handleZoom('current')}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-muted-foreground">Photo not submitted</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Compare Week */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Previous Week</p>
                    <p className="font-semibold">
                      {format(parseISO(compareReport.week_start_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {compareTimestamp && (
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(compareTimestamp), 'h:mm a')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="aspect-video relative rounded-lg overflow-hidden bg-muted">
                  {comparePhotoUrl ? (
                    <>
                      <img
                        src={comparePhotoUrl}
                        alt={`Compare - ${activePhotoInfo?.label}`}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute top-2 right-2"
                        onClick={() => handleZoom('compare')}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-muted-foreground">Photo not submitted</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" onClick={goToPrevPhoto}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous Photo
            </Button>
            <p className="text-sm text-muted-foreground">
              {PHOTO_TYPES.findIndex(p => p.key === activePhotoType) + 1} of {PHOTO_TYPES.length}
            </p>
            <Button variant="outline" onClick={goToNextPhoto}>
              Next Photo
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Zoom Modal */}
      <PhotoZoomModal
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        photos={getPhotosForZoom(zoomSide === 'current' ? currentReport : compareReport)}
        initialIndex={PHOTO_TYPES.findIndex(p => p.key === activePhotoType)}
      />
    </div>
  );
}
