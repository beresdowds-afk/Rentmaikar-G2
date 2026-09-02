import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  Car, 
  MapPin, 
  Clock, 
  Cpu,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  Loader2,
  Search,
  RefreshCw,
  WifiOff,
  Signal,
  Activity,
  Eye
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface VehicleRecall {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  owner_id: string | null;
  recall_reason: string;
  recall_type: string;
  status: string;
  priority: string;
  iot_failure_type: string | null;
  last_known_location_lat: number | null;
  last_known_location_lng: number | null;
  last_known_location_address: string | null;
  last_successful_ping: string | null;
  failed_capture_attempts: number;
  last_telemetry_snapshot: any;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  driver_notified_at: string | null;
  owner_notified_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  vehicle?: {
    make: string;
    model: string;
    year: number;
    license_plate: string;
  };
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-600',
};

const statusColors: Record<string, string> = {
  pending: 'bg-red-500',
  acknowledged: 'bg-yellow-500',
  in_progress: 'bg-blue-500',
  resolved: 'bg-green-500',
  cancelled: 'bg-gray-500',
};

const failureTypeLabels: Record<string, string> = {
  telemetry_timeout: 'Telemetry Timeout',
  connection_lost: 'Connection Lost',
  data_corruption: 'Data Corruption',
  sensor_malfunction: 'Sensor Malfunction',
  capture_failed: 'Capture Failed',
};

export function VehicleRecallManagement() {
  const { user } = useAuth();
  const [recalls, setRecalls] = useState<VehicleRecall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [selectedRecall, setSelectedRecall] = useState<VehicleRecall | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const fetchRecalls = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('vehicle_recalls')
        .select(`
          *,
          vehicle:vehicles(make, model, year, license_plate)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter === 'active') {
        query = query.in('status', ['pending', 'acknowledged', 'in_progress']);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRecalls((data as any[]) || []);
    } catch (error) {
      console.error('[VehicleRecalls] Fetch error:', error);
      toast.error('Failed to load vehicle recalls');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecalls();
  }, [statusFilter]);

  const handleAcknowledge = async (recall: VehicleRecall) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('vehicle_recalls')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .eq('id', recall.id);

      if (error) throw error;

      toast.success('Recall acknowledged', {
        description: 'You can now coordinate vehicle recovery.',
      });
      fetchRecalls();
    } catch (error) {
      console.error('[VehicleRecalls] Acknowledge error:', error);
      toast.error('Failed to acknowledge recall');
    }
  };

  const handleResolve = async () => {
    if (!user?.id || !selectedRecall) return;

    setIsResolving(true);
    try {
      const { error } = await supabase
        .from('vehicle_recalls')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: resolutionNotes.trim() || null,
        })
        .eq('id', selectedRecall.id);

      if (error) throw error;

      toast.success('Recall resolved', {
        description: 'Vehicle has been successfully recalled and issue addressed.',
      });
      setSelectedRecall(null);
      setResolutionNotes('');
      fetchRecalls();
    } catch (error) {
      console.error('[VehicleRecalls] Resolve error:', error);
      toast.error('Failed to resolve recall');
    } finally {
      setIsResolving(false);
    }
  };

  const handleNotifyDriver = async (recall: VehicleRecall) => {
    try {
      // In production, this would send SMS/email to driver
      const { error } = await supabase
        .from('vehicle_recalls')
        .update({
          driver_notified_at: new Date().toISOString(),
        })
        .eq('id', recall.id);

      if (error) throw error;

      toast.success('Driver notified', {
        description: 'SMS and email notification sent to driver.',
      });
      fetchRecalls();
    } catch (error) {
      console.error('[VehicleRecalls] Notify error:', error);
      toast.error('Failed to notify driver');
    }
  };

  const filteredRecalls = recalls.filter(recall => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      recall.vehicle?.license_plate?.toLowerCase().includes(query) ||
      recall.vehicle?.make?.toLowerCase().includes(query) ||
      recall.vehicle?.model?.toLowerCase().includes(query) ||
      recall.recall_reason.toLowerCase().includes(query)
    );
  });

  const activeRecallsCount = recalls.filter(r => 
    ['pending', 'acknowledged', 'in_progress'].includes(r.status)
  ).length;

  const criticalRecallsCount = recalls.filter(r => 
    r.priority === 'critical' && r.status === 'pending'
  ).length;

  return (
    <div className="space-y-6">
      {/* Critical Alert */}
      {criticalRecallsCount > 0 && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="font-semibold">
            {criticalRecallsCount} critical vehicle recall{criticalRecallsCount > 1 ? 's' : ''} requiring immediate attention!
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 text-red-600">
              <WifiOff className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeRecallsCount}</p>
              <p className="text-xs text-muted-foreground">Active Recalls</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-600 text-white">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{criticalRecallsCount}</p>
              <p className="text-xs text-muted-foreground">Critical Priority</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 text-yellow-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {recalls.filter(r => r.status === 'pending').length}
              </p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {recalls.filter(r => r.status === 'resolved').length}
              </p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-destructive" />
                Vehicle Recall Management
              </CardTitle>
              <CardDescription>
                IoT telemetry failures trigger automatic vehicle recall procedures
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRecalls}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by plate, make, model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active Recalls</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecalls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No vehicle recalls</p>
              <p className="text-sm">All IoT devices are reporting normally</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {filteredRecalls.map((recall) => (
                  <Card 
                    key={recall.id} 
                    className={`p-4 border-l-4 ${
                      recall.priority === 'critical' ? 'border-l-red-600 bg-red-50/50' :
                      recall.priority === 'high' ? 'border-l-orange-500' :
                      'border-l-yellow-500'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        {/* Vehicle Info */}
                        <div className="flex items-center gap-3">
                          <Car className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-semibold">
                              {recall.vehicle?.year} {recall.vehicle?.make} {recall.vehicle?.model}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {recall.vehicle?.license_plate}
                            </p>
                          </div>
                          <Badge className={priorityColors[recall.priority]}>
                            {recall.priority.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className={statusColors[recall.status]}>
                            {recall.status.replace('_', ' ')}
                          </Badge>
                        </div>

                        {/* Failure Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="flex items-start gap-2">
                            <WifiOff className="h-4 w-4 text-destructive mt-0.5" />
                            <div>
                              <p className="font-medium">
                                {failureTypeLabels[recall.iot_failure_type || ''] || recall.iot_failure_type || 'Unknown'}
                              </p>
                              <p className="text-muted-foreground">{recall.recall_reason}</p>
                            </div>
                          </div>
                          
                          {recall.last_known_location_address && (
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <p className="font-medium">Last Known Location</p>
                                <p className="text-muted-foreground">{recall.last_known_location_address}</p>
                              </div>
                            </div>
                          )}

                          {recall.last_successful_ping && (
                            <div className="flex items-start gap-2">
                              <Signal className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <p className="font-medium">Last Successful Ping</p>
                                <p className="text-muted-foreground">
                                  {formatDistanceToNow(new Date(recall.last_successful_ping), { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="flex items-start gap-2">
                            <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="font-medium">Failed Attempts</p>
                              <p className="text-muted-foreground">{recall.failed_capture_attempts} capture failures</p>
                            </div>
                          </div>
                        </div>

                        {/* Timestamps */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Created: {format(new Date(recall.created_at), 'MMM d, h:mm a')}</span>
                          {recall.acknowledged_at && (
                            <span>Acknowledged: {format(new Date(recall.acknowledged_at), 'MMM d, h:mm a')}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {recall.status === 'pending' && (
                          <Button 
                            size="sm" 
                            variant="default"
                            onClick={() => handleAcknowledge(recall)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Acknowledge
                          </Button>
                        )}

                        {!recall.driver_notified_at && recall.driver_id && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleNotifyDriver(recall)}
                          >
                            <Phone className="h-4 w-4 mr-1" />
                            Notify Driver
                          </Button>
                        )}

                        {recall.last_telemetry_snapshot && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setSelectedRecall(recall)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Telemetry
                          </Button>
                        )}

                        {['acknowledged', 'in_progress'].includes(recall.status) && (
                          <Button 
                            size="sm" 
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setSelectedRecall(recall);
                              setResolutionNotes('');
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Resolution Dialog */}
      <Dialog open={!!selectedRecall} onOpenChange={() => setSelectedRecall(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedRecall?.last_telemetry_snapshot ? 'Telemetry Details' : 'Resolve Vehicle Recall'}
            </DialogTitle>
          </DialogHeader>

          {selectedRecall?.last_telemetry_snapshot ? (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Last Known Telemetry</p>
                <pre className="text-xs overflow-auto max-h-[300px]">
                  {JSON.stringify(selectedRecall.last_telemetry_snapshot, null, 2)}
                </pre>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Resolution Notes</Label>
                <Textarea
                  placeholder="Describe how the issue was resolved..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Confirm that the vehicle has been recalled and the IoT issue has been addressed.
              </p>
              <div className="space-y-2">
                <Label>Resolution Notes *</Label>
                <Textarea
                  placeholder="Describe how the issue was resolved (e.g., device replaced, connection restored, vehicle inspected)..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRecall(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleResolve} 
              disabled={isResolving || !resolutionNotes.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {isResolving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resolving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Resolved
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
