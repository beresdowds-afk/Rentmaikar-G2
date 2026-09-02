import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Star, 
  Upload, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Image,
  Loader2,
  Trash2,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { UploadDropZone } from '@/components/ui/upload-drop-zone';
import { format, addDays, isAfter, parseISO } from 'date-fns';

interface RideshareProfileUploadProps {
  vehicleId?: string;
}

const PLATFORMS = [
  { id: 'uber', label: 'Uber' },
  { id: 'lyft', label: 'Lyft' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'indrive', label: 'InDrive' },
];

function getWeekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export function RideshareProfileUpload({ vehicleId }: RideshareProfileUploadProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submission, setSubmission] = useState<any>(null);
  const [platform, setPlatform] = useState('');
  const [rating, setRating] = useState('');

  const weekStart = getWeekStartDate();
  const dueDate = addDays(parseISO(weekStart), 6);
  const isOverdue = isAfter(new Date(), dueDate) && !submission?.submitted_at;
  const isSubmitted = !!submission?.submitted_at;

  // Calculate progress
  const hasPhoto = !!submission?.rating_screenshot_url;
  const hasPlatform = !!submission?.platform || !!platform;
  const progress = ((hasPhoto ? 50 : 0) + (hasPlatform ? 50 : 0));

  useEffect(() => {
    fetchSubmission();
  }, [user]);

  const fetchSubmission = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('rideshare_profile_submissions')
        .select('*')
        .eq('driver_id', user.id)
        .eq('week_start_date', weekStart)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setSubmission(data);
      if (data?.platform) setPlatform(data.platform);
      if (data?.current_rating) setRating(data.current_rating.toString());
    } catch (error) {
      console.error('Error fetching submission:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Only PNG and JPG files are allowed');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${weekStart}/rideshare-profile.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-documents')
        .getPublicUrl(filePath);

      // Create or update submission
      if (submission) {
        const { error } = await supabase
          .from('rideshare_profile_submissions')
          .update({
            rating_screenshot_url: publicUrl,
            platform: platform || null,
            current_rating: rating ? parseFloat(rating) : null,
          })
          .eq('id', submission.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('rideshare_profile_submissions')
          .insert({
            driver_id: user.id,
            vehicle_id: vehicleId || null,
            week_start_date: weekStart,
            rating_screenshot_url: publicUrl,
            platform: platform || null,
            current_rating: rating ? parseFloat(rating) : null,
          });

        if (error) throw error;
      }

      toast.success('Screenshot uploaded successfully');
      fetchSubmission();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload screenshot');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!submission || !user) return;

    try {
      const { error } = await supabase
        .from('rideshare_profile_submissions')
        .update({
          submitted_at: new Date().toISOString(),
          platform: platform || submission.platform,
          current_rating: rating ? parseFloat(rating) : submission.current_rating,
        })
        .eq('id', submission.id);

      if (error) throw error;

      toast.success('Rideshare profile submitted for review');
      fetchSubmission();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to submit');
    }
  };

  const handleDelete = async () => {
    if (!submission?.rating_screenshot_url || !user) return;

    try {
      // Extract file path from URL
      const urlParts = submission.rating_screenshot_url.split('/');
      const filePath = urlParts.slice(-3).join('/');

      await supabase.storage
        .from('user-documents')
        .remove([filePath]);

      const { error } = await supabase
        .from('rideshare_profile_submissions')
        .update({ rating_screenshot_url: null })
        .eq('id', submission.id);

      if (error) throw error;

      toast.success('Screenshot removed');
      fetchSubmission();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to remove screenshot');
    }
  };

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Weekly Rideshare Profile
            </CardTitle>
            <CardDescription>
              Upload your rideshare app rating screenshot
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isOverdue ? 'destructive' : isSubmitted ? 'default' : 'secondary'}>
              {isSubmitted ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Submitted</>
              ) : isOverdue ? (
                <><AlertTriangle className="h-3 w-3 mr-1" /> Overdue</>
              ) : (
                <><Clock className="h-3 w-3 mr-1" /> Due {format(dueDate, 'EEEE')}</>
              )}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Completion</span>
            <span className={progress === 100 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
              {progress}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {isOverdue && !isSubmitted && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your weekly rideshare profile submission is overdue. Please upload immediately.
            </AlertDescription>
          </Alert>
        )}

        {/* Platform Selection */}
        <div className="space-y-2">
          <Label>Rideshare Platform</Label>
          <Select value={platform} onValueChange={setPlatform} disabled={isSubmitted}>
            <SelectTrigger>
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {PLATFORMS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rating Input */}
        <div className="space-y-2">
          <Label>Current Rating (e.g., 4.85)</Label>
          <Input
            type="number"
            step="0.01"
            min="1"
            max="5"
            placeholder="4.85"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            disabled={isSubmitted}
          />
        </div>

        {/* Photo Upload */}
        <div className="space-y-3">
          <Label>Rating Screenshot (PNG or JPG)</Label>
          
          {submission?.rating_screenshot_url ? (
            <div className="relative border rounded-lg overflow-hidden">
              <img 
                src={submission.rating_screenshot_url} 
                alt="Rating screenshot"
                className="w-full h-48 object-cover"
              />
              <div className="absolute bottom-2 right-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open(submission.rating_screenshot_url, '_blank')}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {!isSubmitted && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <UploadDropZone
              accept="image/jpeg,image/png"
              maxSizeMB={5}
              disabled={uploading || isSubmitted}
              isUploading={uploading}
              onFileSelected={(file) => {
                const evt = { target: { files: [file] as unknown as FileList, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
                handlePhotoUpload(evt);
              }}
            />
          )}
        </div>

        {/* Submit Button */}
        {!isSubmitted && hasPhoto && (
          <Button 
            onClick={handleSubmit}
            className="w-full"
            disabled={!platform}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Submit Weekly Profile
          </Button>
        )}

        {isSubmitted && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Your rideshare profile was submitted on{' '}
              {format(new Date(submission.submitted_at), 'MMM d, yyyy h:mm a')}.
              {submission.status === 'pending' && ' Awaiting admin review.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default RideshareProfileUpload;
