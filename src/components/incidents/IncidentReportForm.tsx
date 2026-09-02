import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { UploadDropZone } from '@/components/ui/upload-drop-zone';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { mqttTracker, IoTTelemetrySnapshot } from '@/lib/mqtt-client';
import { 
  AlertTriangle, 
  Wrench, 
  Car, 
  Shield,
  Clock,
  MapPin,
  Loader2,
  Camera,
  Send,
  Info,
  Upload,
  X,
  Image as ImageIcon,
  Cpu,
  CheckCircle2
} from 'lucide-react';

type IncidentType = 'accident' | 'maintenance' | 'breakdown' | 'theft' | 'other';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface IncidentReportFormProps {
  vehicleId: string;
  vehicleName?: string;
  ownerId?: string;
  onSuccess?: () => void;
}

interface UploadedPhoto {
  file: File;
  preview: string;
  uploading: boolean;
  url?: string;
}

const incidentTypes: { value: IncidentType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'accident', label: 'Accident', icon: <AlertTriangle className="h-4 w-4" />, description: 'Collision or crash incident' },
  { value: 'maintenance', label: 'Maintenance', icon: <Wrench className="h-4 w-4" />, description: 'Scheduled or required maintenance' },
  { value: 'breakdown', label: 'Breakdown', icon: <Car className="h-4 w-4" />, description: 'Vehicle stopped working' },
  { value: 'theft', label: 'Theft/Security', icon: <Shield className="h-4 w-4" />, description: 'Theft or security incident' },
  { value: 'other', label: 'Other', icon: <Info className="h-4 w-4" />, description: 'Other incidents' },
];

const severityLevels: { value: Severity; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-yellow-500' },
  { value: 'medium', label: 'Medium', color: 'bg-orange-500' },
  { value: 'high', label: 'High', color: 'bg-red-500' },
  { value: 'critical', label: 'Critical', color: 'bg-red-700' },
];

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function IncidentReportForm({ vehicleId, vehicleName, ownerId, onSuccess }: IncidentReportFormProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType | ''>('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [location, setLocation] = useState('');
  const [estimatedDowntime, setEstimatedDowntime] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [iotSnapshot, setIotSnapshot] = useState<IoTTelemetrySnapshot | null>(null);
  const [isCapturingIoT, setIsCapturingIoT] = useState(false);

  // Check if report would be late (more than 1 hour after occurrence)
  const isLateReport = occurredAt ? 
    (new Date().getTime() - new Date(occurredAt).getTime()) / (1000 * 60 * 60) > 1 : 
    false;

  // Incident types that trigger automatic IoT data capture
  const iotCaptureTypes: IncidentType[] = ['maintenance', 'breakdown'];

  // Capture IoT telemetry when maintenance/breakdown is selected
  useEffect(() => {
    if (incidentType && iotCaptureTypes.includes(incidentType) && !iotSnapshot) {
      captureIoTData();
    }
  }, [incidentType]);

  const captureIoTData = async () => {
    if (!vehicleId) return;
    
    setIsCapturingIoT(true);
    let captureAttempts = 0;
    const maxAttempts = 3;
    
    try {
      // Request fresh diagnostic data from IoT device
      await mqttTracker.requestDiagnosticReport(vehicleId);
      
      // Small delay to allow device to respond
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Capture the telemetry snapshot
      const snapshot = mqttTracker.captureIoTSnapshot(vehicleId);
      
      // Check if we got valid data
      const hasValidData = snapshot.location || snapshot.motion || snapshot.vehicle;
      
      if (!hasValidData) {
        captureAttempts++;
        
        // If capture fails, try again
        while (captureAttempts < maxAttempts && !hasValidData) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await mqttTracker.requestDiagnosticReport(vehicleId);
          await new Promise(resolve => setTimeout(resolve, 500));
          captureAttempts++;
        }
        
        // If still no data after retries, report failure and trigger recall
        if (!hasValidData) {
          await reportTelemetryFailure(vehicleId, snapshot, captureAttempts);
          toast.warning('IoT telemetry capture failed', {
            description: 'A vehicle recall has been initiated. Please continue with the report.',
          });
          return;
        }
      }
      
      setIotSnapshot(snapshot);
      
      // Auto-fill location if available
      if (snapshot.location && !location) {
        setLocation(`${snapshot.location.latitude.toFixed(6)}, ${snapshot.location.longitude.toFixed(6)}`);
      }
      
      toast.success('IoT data captured', {
        description: 'Vehicle telemetry has been logged for this incident.',
      });
    } catch (error) {
      console.error('[IncidentReport] IoT capture error:', error);
      
      // Report the failure and trigger recall procedure
      await reportTelemetryFailure(vehicleId, null, captureAttempts);
      toast.warning('IoT data capture failed', {
        description: 'A vehicle recall has been initiated due to telemetry failure.',
      });
    } finally {
      setIsCapturingIoT(false);
    }
  };

  const reportTelemetryFailure = async (
    vehicleId: string, 
    lastSnapshot: IoTTelemetrySnapshot | null,
    attempts: number
  ) => {
    if (!user?.id) return;

    try {
      // Get vehicle's last known location from tracker
      const lastLocation = mqttTracker.getVehicleLocation(vehicleId);
      
      // Create vehicle recall entry
      const recallData: any = {
        vehicle_id: vehicleId,
        driver_id: user.id,
        owner_id: ownerId || null,
        recall_reason: `IoT telemetry capture failed during ${incidentType || 'incident'} report. Device not responding after ${attempts} attempts.`,
        recall_type: 'iot_failure',
        status: 'pending',
        priority: incidentType === 'breakdown' ? 'high' : 'medium',
        iot_failure_type: 'capture_failed',
        last_known_location_lat: lastLocation?.latitude || null,
        last_known_location_lng: lastLocation?.longitude || null,
        last_successful_ping: lastLocation?.timestamp?.toISOString() || null,
        failed_capture_attempts: attempts,
        last_telemetry_snapshot: lastSnapshot || null,
      };

      const { error } = await supabase
        .from('vehicle_recalls')
        .insert(recallData);

      if (error) {
        console.error('[IncidentReport] Failed to create recall:', error);
      } else {
        console.log('[IncidentReport] Vehicle recall created for telemetry failure');
      }
    } catch (error) {
      console.error('[IncidentReport] Recall creation error:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: UploadedPhoto[] = [];
    
    for (let i = 0; i < files.length && photos.length + newPhotos.length < MAX_PHOTOS; i++) {
      const file = files[i];
      
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`);
        continue;
      }
      
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }

      newPhotos.push({
        file,
        preview: URL.createObjectURL(file),
        uploading: false,
      });
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (!user?.id || photos.length === 0) return [];

    const uploadedUrls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      if (photo.url) {
        uploadedUrls.push(photo.url);
        continue;
      }

      // Mark as uploading
      setPhotos(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], uploading: true };
        return updated;
      });

      try {
        const fileExt = photo.file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${i}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('incident-photos')
          .upload(fileName, photo.file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('incident-photos')
          .getPublicUrl(data.path);

        uploadedUrls.push(urlData.publicUrl);

        // Update photo with URL
        setPhotos(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], uploading: false, url: urlData.publicUrl };
          return updated;
        });
      } catch (error) {
        console.error('[IncidentReport] Photo upload error:', error);
        setPhotos(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], uploading: false };
          return updated;
        });
        toast.error(`Failed to upload ${photo.file.name}`);
      }
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id || !incidentType) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!occurredAt) {
      toast.error('Please specify when the incident occurred');
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload photos first
      const photoUrls = await uploadPhotos();

      // Insert incident record with IoT data
      const insertData: any = {
        vehicle_id: vehicleId,
        driver_id: user.id,
        owner_id: ownerId || null,
        incident_type: incidentType,
        severity,
        title: title.trim(),
        description: description.trim(),
        occurred_at: new Date(occurredAt).toISOString(),
        location_address: location.trim() || null,
        estimated_downtime_hours: estimatedDowntime ? parseInt(estimatedDowntime) : null,
        is_iot_detected: false,
        photos: photoUrls.length > 0 ? photoUrls : null,
      };

      // Add IoT telemetry data if captured (for maintenance/breakdown)
      if (iotSnapshot) {
        insertData.location_lat = iotSnapshot.location?.latitude || null;
        insertData.location_lng = iotSnapshot.location?.longitude || null;
        insertData.iot_data = iotSnapshot;
        insertData.iot_trigger_type = 'driver_report';
        insertData.iot_triggered_at = iotSnapshot.capturedAt;
      }

      const { data: incident, error: insertError } = await supabase
        .from('vehicle_incidents')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Send notification to admin and owner
      try {
        await supabase.functions.invoke('send-incident-notification', {
          body: {
            incidentId: incident.id,
            incidentType,
            severity,
            vehicleId,
            driverId: user.id,
            ownerId,
            title: title.trim(),
            description: description.trim(),
            isIotDetected: false,
            isLateReport,
            location: location.trim() || undefined,
          },
        });
      } catch (notifError) {
        console.error('[IncidentReport] Notification failed:', notifError);
      }

      toast.success('Incident reported successfully', {
        description: isLateReport 
          ? 'Note: This report was submitted more than 1 hour after the incident.'
          : 'Admin and owner have been notified.',
      });

      // Cleanup photo previews
      photos.forEach(p => URL.revokeObjectURL(p.preview));

      // Reset form
      setIncidentType('');
      setTitle('');
      setDescription('');
      setOccurredAt('');
      setLocation('');
      setEstimatedDowntime('');
      setSeverity('medium');
      setPhotos([]);
      setIotSnapshot(null);

      onSuccess?.();
    } catch (error) {
      console.error('[IncidentReport] Error:', error);
      toast.error('Failed to submit incident report');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get current datetime in local format for max attribute
  const now = new Date();
  const maxDateTime = now.toISOString().slice(0, 16);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <CardTitle>Report Incident</CardTitle>
            <CardDescription>
              {vehicleName ? `For ${vehicleName}` : 'Report maintenance or accident'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 1-Hour Requirement Alert */}
          <Alert className="bg-orange-500/10 border-orange-500/30">
            <Clock className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-orange-700">
              <strong>Drivers must report incidents within 1 hour of occurrence.</strong> Late reports will be flagged.
            </AlertDescription>
          </Alert>

          {/* Late Report Warning */}
          {isLateReport && (
            <Alert variant="destructive" className="bg-destructive/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Late Report Warning:</strong> This incident occurred more than 1 hour ago. 
                Your report will be flagged as late.
              </AlertDescription>
            </Alert>
          )}

          {/* IoT Data Capture Notification */}
          {iotCaptureTypes.includes(incidentType as IncidentType) && (
            <Alert className={`${iotSnapshot ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
              <Cpu className={`h-4 w-4 ${iotSnapshot ? 'text-green-600' : 'text-blue-500'}`} />
              <AlertDescription className={iotSnapshot ? 'text-green-700' : 'text-blue-700'}>
                {isCapturingIoT ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Capturing vehicle telemetry data...
                  </span>
                ) : iotSnapshot ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <strong>IoT data captured</strong> - Vehicle parameters logged at {new Date(iotSnapshot.capturedAt).toLocaleTimeString()}
                    {iotSnapshot.motion && (
                      <Badge variant="outline" className="ml-2">
                        {iotSnapshot.motion.isParked ? 'Parked' : `${Math.round(iotSnapshot.motion.speed)} mph`}
                      </Badge>
                    )}
                  </span>
                ) : (
                  <span>
                    <strong>IoT data will be captured</strong> - Vehicle system parameters, location, and diagnostic codes will be automatically logged.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Incident Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Incident Type *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {incidentTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setIncidentType(type.value)}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    incidentType === type.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {type.icon}
                    <span className="font-medium">{type.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label htmlFor="severity" className="text-base font-semibold">Severity *</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {severityLevels.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${level.color}`} />
                      {level.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-base font-semibold">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the incident"
              maxLength={100}
              required
            />
          </div>

          {/* When it occurred */}
          <div className="space-y-2">
            <Label htmlFor="occurred-at" className="text-base font-semibold">
              When did this occur? *
            </Label>
            <Input
              id="occurred-at"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              max={maxDateTime}
              required
            />
            {occurredAt && (
              <p className="text-xs text-muted-foreground">
                {isLateReport ? (
                  <span className="text-destructive">⚠️ More than 1 hour ago</span>
                ) : (
                  <span className="text-green-600">✓ Within 1 hour - on time</span>
                )}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-base font-semibold">Description *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details about what happened, any damage, injuries, etc."
              rows={4}
              maxLength={1000}
              required
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/1000
            </p>
          </div>

          {/* Photo Upload */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Proof Photos (Optional)
            </Label>
            <p className="text-xs text-muted-foreground">
              Upload up to {MAX_PHOTOS} photos documenting the incident. Max 10MB per photo.
            </p>
            
            {/* Photo Grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img 
                      src={photo.preview} 
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {photo.uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                    {photo.url && (
                      <div className="absolute bottom-1 right-1">
                        <Badge variant="secondary" className="text-xs">✓</Badge>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            {photos.length < MAX_PHOTOS && (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <UploadDropZone
                  accept="image/*"
                  maxSizeMB={10}
                  multiple
                  onFilesSelected={(files) => {
                    const dt = new DataTransfer();
                    files.forEach(f => dt.items.add(f));
                    const evt = { target: { files: dt.files, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
                    handleFileSelect(evt);
                  }}
                  label={`Add Photos (${photos.length}/${MAX_PHOTOS})`}
                />
              </div>
            )}
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or location description"
              maxLength={200}
            />
          </div>

          {/* Estimated Downtime */}
          <div className="space-y-2">
            <Label htmlFor="downtime" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Estimated Downtime (hours)
            </Label>
            <Input
              id="downtime"
              type="number"
              value={estimatedDowntime}
              onChange={(e) => setEstimatedDowntime(e.target.value)}
              placeholder="Expected hours vehicle will be out of service"
              min="0"
              max="720"
            />
          </div>

          {/* Submit Button */}
          <Button 
            type="submit" 
            className="w-full" 
            size="lg"
            disabled={!incidentType || !title || !description || !occurredAt || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {photos.some(p => p.uploading) ? 'Uploading Photos...' : 'Submitting...'}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit Incident Report
                {isLateReport && <Badge variant="destructive" className="ml-2">Late</Badge>}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
