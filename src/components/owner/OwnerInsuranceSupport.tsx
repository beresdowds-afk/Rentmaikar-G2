import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Clock, CheckCircle, Send, RefreshCw, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface InsuranceRequest {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  city: string;
  region: string;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export const OwnerInsuranceSupport = () => {
  const { user } = useAuth();
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<InsuranceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestType, setRequestType] = useState('');
  const [description, setDescription] = useState('');
  const [vehicleId, setVehicleId] = useState('');

  useEffect(() => {
    checkFeatureAvailability();
    fetchMyRequests();
  }, [user]);

  const checkFeatureAvailability = async () => {
    const { data } = await supabase
      .from('voip_settings')
      .select('is_enabled')
      .eq('feature_key', 'insurance_support')
      .maybeSingle();
    setFeatureEnabled(data?.is_enabled ?? false);
  };

  const fetchMyRequests = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('support_tasks')
        .select('id, title, description, priority, city, region, created_at, resolved_at, resolution_notes')
        .eq('task_type', 'insurance')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests((data as InsuranceRequest[]) || []);
    } catch (error) {
      console.error('Error fetching insurance requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!user || !requestType || !description.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('support_tasks').insert({
        task_type: 'insurance',
        title: requestType,
        description: description.trim(),
        priority: 'medium',
        city: 'Unassigned',
        region: 'All',
        owner_id: user.id,
        vehicle_id: vehicleId || null,
      });

      if (error) throw error;

      toast.success('Insurance support request submitted successfully');
      setRequestType('');
      setDescription('');
      setVehicleId('');
      fetchMyRequests();
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (featureEnabled === null || loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!featureEnabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">Insurance Support Unavailable</h3>
          <p className="text-muted-foreground text-sm">
            Insurance support is currently not available. Please check back later or contact admin support.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Submit New Request */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Insurance Support Request
          </CardTitle>
          <CardDescription>
            Submit a request for insurance verification, renewal, or claims support
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Request Type</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger>
                <SelectValue placeholder="Select request type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Insurance Verification">Insurance Verification</SelectItem>
                <SelectItem value="Insurance Renewal">Insurance Renewal</SelectItem>
                <SelectItem value="Insurance Claim">Insurance Claim</SelectItem>
                <SelectItem value="Registration Renewal">Registration Renewal</SelectItem>
                <SelectItem value="Document Update">Document Update</SelectItem>
                <SelectItem value="General Insurance Query">General Insurance Query</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe your insurance support request in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <Button onClick={handleSubmitRequest} disabled={submitting} className="gap-2">
            <Send className="h-4 w-4" />
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </CardContent>
      </Card>

      {/* My Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            My Insurance Requests
          </CardTitle>
          <CardDescription>
            Track the status of your submitted insurance support requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No insurance requests submitted yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{req.title}</h4>
                    {req.resolved_at ? (
                      <Badge className="bg-green-600 text-white gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Resolved
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500 text-white gap-1">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  {req.description && (
                    <p className="text-sm text-muted-foreground">{req.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Submitted: {format(new Date(req.created_at), 'MMM d, yyyy')}</span>
                    <Badge variant="outline" className="text-xs">{req.priority}</Badge>
                  </div>
                  {req.resolution_notes && (
                    <Alert className="mt-2">
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{req.resolution_notes}</AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OwnerInsuranceSupport;
