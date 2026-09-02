import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  AlertTriangle, 
  Wrench, 
  Car, 
  Shield,
  Search,
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle,
  Eye,
  Filter,
  Bot,
  User,
  MapPin,
  Camera,
  Cpu,
  Activity,
  Battery,
  Gauge,
  ThermometerSun,
  Signal,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare
} from 'lucide-react';

interface Incident {
  id: string;
  vehicle_id: string;
  driver_id: string;
  owner_id: string | null;
  incident_type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  is_iot_detected: boolean;
  is_late_report: boolean;
  occurred_at: string;
  reported_at: string;
  estimated_downtime_hours: number | null;
  actual_downtime_hours: number | null;
  photos: string[] | null;
  iot_data: any;
  iot_trigger_type: string | null;
  iot_triggered_at: string | null;
  iot_speed_at_impact: number | null;
  iot_deceleration_g: number | null;
  iot_impact_severity: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DriverProfile {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface VehicleInfo {
  make: string;
  model: string;
  year: number;
  license_plate: string;
}

const getTypeIcon = (type: string) => {
  const icons: Record<string, React.ReactNode> = {
    accident: <AlertTriangle className="h-4 w-4 text-red-500" />,
    maintenance: <Wrench className="h-4 w-4 text-blue-500" />,
    breakdown: <Car className="h-4 w-4 text-orange-500" />,
    theft: <Shield className="h-4 w-4 text-purple-500" />,
    other: <Clock className="h-4 w-4 text-gray-500" />,
  };
  return icons[type] || icons.other;
};

const getSeverityBadge = (severity: string) => {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    low: 'secondary',
    medium: 'default',
    high: 'destructive',
    critical: 'destructive',
  };
  const colors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700 animate-pulse',
  };
  return (
    <Badge variant={variants[severity] || 'default'} className={colors[severity]}>
      {severity.toUpperCase()}
    </Badge>
  );
};

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    reported: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    acknowledged: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    in_progress: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
    resolved: 'bg-green-500/10 text-green-600 border-green-500/30',
    closed: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
  };
  return (
    <Badge variant="outline" className={colors[status] || colors.reported}>
      {status.replace('_', ' ').toUpperCase()}
    </Badge>
  );
};

export function AdminIncidentManagement() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [driverProfiles, setDriverProfiles] = useState<Record<string, DriverProfile>>({});
  const [vehicleInfo, setVehicleInfo] = useState<Record<string, VehicleInfo>>({});
  const [activeTab, setActiveTab] = useState('details');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actualDowntime, setActualDowntime] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchIncidents = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('vehicle_incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (typeFilter !== 'all') {
        query = query.eq('incident_type', typeFilter as any);
      }
      if (statusFilter === 'active') {
        query = query.in('status', ['reported', 'acknowledged', 'in_progress']);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }

      const { data, error } = await query;

      if (error) throw error;
      setIncidents((data as Incident[]) || []);

      // Fetch driver profiles and vehicle info
      if (data && data.length > 0) {
        const driverIds = [...new Set(data.map(i => i.driver_id))];
        const vehicleIds = [...new Set(data.map(i => i.vehicle_id))];

        const [profilesRes, vehiclesRes] = await Promise.all([
          supabase.from('profiles').select('user_id, full_name, email, phone').in('user_id', driverIds),
          supabase.from('vehicles').select('id, make, model, year, license_plate').in('id', vehicleIds),
        ]);

        if (profilesRes.data) {
          const profileMap: Record<string, DriverProfile> = {};
          profilesRes.data.forEach(p => {
            profileMap[p.user_id] = { full_name: p.full_name, email: p.email, phone: p.phone };
          });
          setDriverProfiles(profileMap);
        }

        if (vehiclesRes.data) {
          const vehicleMap: Record<string, VehicleInfo> = {};
          vehiclesRes.data.forEach(v => {
            vehicleMap[v.id] = { make: v.make, model: v.model, year: v.year, license_plate: v.license_plate };
          });
          setVehicleInfo(vehicleMap);
        }
      }
    } catch (error) {
      console.error('[AdminIncidents] Error:', error);
      toast.error('Failed to fetch incidents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [typeFilter, statusFilter]);

  const handleStatusChange = async (incidentId: string, newStatus: string) => {
    if (!user?.id) return;
    setIsUpdating(true);

    try {
      const updateData: Record<string, unknown> = { status: newStatus };
      
      if (newStatus === 'acknowledged') {
        updateData.acknowledged_at = new Date().toISOString();
        updateData.acknowledged_by = user.id;
      } else if (newStatus === 'resolved' || newStatus === 'closed') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = user.id;
        if (resolutionNotes.trim()) {
          updateData.resolution_notes = resolutionNotes.trim();
        }
        if (actualDowntime) {
          updateData.actual_downtime_hours = parseInt(actualDowntime);
        }
      }

      const { error } = await supabase
        .from('vehicle_incidents')
        .update(updateData)
        .eq('id', incidentId);

      if (error) throw error;

      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
      fetchIncidents();
      setSelectedIncident(null);
      setResolutionNotes('');
      setActualDowntime('');
    } catch (error) {
      console.error('[AdminIncidents] Status update error:', error);
      toast.error('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredIncidents = incidents.filter(incident => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const driver = driverProfiles[incident.driver_id];
    const vehicle = vehicleInfo[incident.vehicle_id];
    return (
      incident.title.toLowerCase().includes(query) ||
      incident.description.toLowerCase().includes(query) ||
      driver?.full_name?.toLowerCase().includes(query) ||
      driver?.email?.toLowerCase().includes(query) ||
      vehicle?.license_plate?.toLowerCase().includes(query) ||
      vehicle?.make?.toLowerCase().includes(query)
    );
  });

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  };

  const stats = {
    total: incidents.length,
    pending: incidents.filter(i => i.status === 'reported').length,
    accidents: incidents.filter(i => i.incident_type === 'accident').length,
    maintenance: incidents.filter(i => i.incident_type === 'maintenance' || i.incident_type === 'breakdown').length,
    lateReports: incidents.filter(i => i.is_late_report).length,
    iotDetected: incidents.filter(i => i.is_iot_detected).length,
    critical: incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved' && i.status !== 'closed').length,
  };

  const openIncidentDetail = (incident: Incident) => {
    setSelectedIncident(incident);
    setActiveTab('details');
    setPhotoIndex(0);
    setResolutionNotes(incident.resolution_notes || '');
    setActualDowntime(incident.actual_downtime_hours?.toString() || '');
  };

  return (
    <div className="space-y-6">
      {/* Critical Alert */}
      {stats.critical > 0 && (
        <Card className="border-red-500 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600 animate-pulse" />
              <div>
                <p className="font-semibold text-red-700">
                  {stats.critical} Critical Incident{stats.critical > 1 ? 's' : ''} Requiring Immediate Attention
                </p>
                <p className="text-sm text-red-600">
                  Review and acknowledge critical incidents as soon as possible
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-700">Pending</p>
          <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
        </Card>
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">Accidents</p>
          <p className="text-2xl font-bold text-red-700">{stats.accidents}</p>
        </Card>
        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-700">Maintenance</p>
          <p className="text-2xl font-bold text-blue-700">{stats.maintenance}</p>
        </Card>
        <Card className="p-4 bg-orange-50 border-orange-200">
          <p className="text-sm text-orange-700">Late Reports</p>
          <p className="text-2xl font-bold text-orange-700">{stats.lateReports}</p>
        </Card>
        <Card className="p-4 bg-cyan-50 border-cyan-200">
          <p className="text-sm text-cyan-700">IoT Detected</p>
          <p className="text-2xl font-bold text-cyan-700">{stats.iotDetected}</p>
        </Card>
        <Card className="p-4 bg-red-100 border-red-300">
          <p className="text-sm text-red-800">Critical</p>
          <p className="text-2xl font-bold text-red-800">{stats.critical}</p>
        </Card>
      </div>

      {/* Main Content Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <CardTitle>Accident & Maintenance Reports</CardTitle>
                <CardDescription>
                  Review, manage, and resolve vehicle incidents with full IoT telemetry
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchIncidents} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, driver, vehicle plate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="accident">Accident</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="breakdown">Breakdown</SelectItem>
                <SelectItem value="theft">Theft</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="reported">Reported</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <h4 className="font-semibold text-lg">No Incidents</h4>
              <p className="text-muted-foreground text-sm mt-1">
                {searchQuery || typeFilter !== 'all' || statusFilter !== 'active'
                  ? 'No incidents match your filters'
                  : 'No active incidents at this time'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reported</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncidents.map((incident) => {
                      const vehicle = vehicleInfo[incident.vehicle_id];
                      return (
                        <TableRow 
                          key={incident.id} 
                          className={`cursor-pointer hover:bg-muted/50 ${
                            incident.severity === 'critical' ? 'bg-red-50/50' :
                            incident.is_late_report ? 'bg-orange-50/50' : ''
                          }`}
                          onClick={() => openIncidentDetail(incident)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(incident.incident_type)}
                              <span className="capitalize text-sm">{incident.incident_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium max-w-[180px] truncate">{incident.title}</span>
                              <div className="flex gap-1">
                                {incident.is_iot_detected && (
                                  <span title="IoT Detected">
                                    <Bot className="h-4 w-4 text-blue-500" />
                                  </span>
                                )}
                                {incident.photos && incident.photos.length > 0 && (
                                  <span title={`${incident.photos.length} photos`}>
                                    <Camera className="h-4 w-4 text-gray-500" />
                                  </span>
                                )}
                                {incident.iot_data && (
                                  <span title="Has telemetry data">
                                    <Cpu className="h-4 w-4 text-cyan-500" />
                                  </span>
                                )}
                                {incident.is_late_report && (
                                  <Badge variant="destructive" className="text-xs">Late</Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {vehicle ? (
                              <div>
                                <p className="text-sm font-medium">{vehicle.license_plate}</p>
                                <p className="text-xs text-muted-foreground">{vehicle.year} {vehicle.make}</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">Unknown</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{driverProfiles[incident.driver_id]?.full_name || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getSeverityBadge(incident.severity)}</TableCell>
                          <TableCell>{getStatusBadge(incident.status)}</TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(incident.reported_at), { addSuffix: true })}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openIncidentDetail(incident);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedIncident} onOpenChange={() => setSelectedIncident(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedIncident && getTypeIcon(selectedIncident.incident_type)}
              <span className="capitalize">{selectedIncident?.incident_type}</span>: {selectedIncident?.title}
            </DialogTitle>
            <DialogDescription>
              Incident ID: {selectedIncident?.id.slice(0, 8)}... | 
              Reported {selectedIncident && formatDistanceToNow(new Date(selectedIncident.reported_at), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedIncident && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="photos" disabled={!selectedIncident.photos?.length}>
                  Photos {selectedIncident.photos?.length ? `(${selectedIncident.photos.length})` : ''}
                </TabsTrigger>
                <TabsTrigger value="telemetry" disabled={!selectedIncident.iot_data && !selectedIncident.is_iot_detected}>
                  IoT Data
                </TabsTrigger>
                <TabsTrigger value="resolution">Resolution</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 mt-4">
                {/* Details Tab */}
                <TabsContent value="details" className="mt-0 space-y-6">
                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    {getSeverityBadge(selectedIncident.severity)}
                    {getStatusBadge(selectedIncident.status)}
                    {selectedIncident.is_iot_detected && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                        <Bot className="h-3 w-3 mr-1" /> IoT Detected
                      </Badge>
                    )}
                    {selectedIncident.is_late_report && (
                      <Badge variant="destructive">⚠️ Late Report</Badge>
                    )}
                    {selectedIncident.iot_data && (
                      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600">
                        <Cpu className="h-3 w-3 mr-1" /> Telemetry Captured
                      </Badge>
                    )}
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Occurred At</p>
                      <p className="font-medium text-sm">{formatDate(selectedIncident.occurred_at)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Reported At</p>
                      <p className="font-medium text-sm">{formatDate(selectedIncident.reported_at)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Est. Downtime</p>
                      <p className="font-medium text-sm">
                        {selectedIncident.estimated_downtime_hours 
                          ? `${selectedIncident.estimated_downtime_hours} hours`
                          : 'Not specified'}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Actual Downtime</p>
                      <p className="font-medium text-sm">
                        {selectedIncident.actual_downtime_hours 
                          ? `${selectedIncident.actual_downtime_hours} hours`
                          : 'Pending'}
                      </p>
                    </div>
                  </div>

                  {/* Driver & Vehicle Info */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">Driver Information</p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> {driverProfiles[selectedIncident.driver_id]?.full_name || 'Unknown'}</p>
                        <p><span className="text-muted-foreground">Email:</span> {driverProfiles[selectedIncident.driver_id]?.email || 'N/A'}</p>
                        <p><span className="text-muted-foreground">Phone:</span> {driverProfiles[selectedIncident.driver_id]?.phone || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">Vehicle Information</p>
                      </div>
                      {vehicleInfo[selectedIncident.vehicle_id] ? (
                        <div className="space-y-2 text-sm">
                          <p><span className="text-muted-foreground">Plate:</span> {vehicleInfo[selectedIncident.vehicle_id].license_plate}</p>
                          <p><span className="text-muted-foreground">Vehicle:</span> {vehicleInfo[selectedIncident.vehicle_id].year} {vehicleInfo[selectedIncident.vehicle_id].make} {vehicleInfo[selectedIncident.vehicle_id].model}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Vehicle info not available</p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">Description</p>
                    </div>
                    <p className="text-sm bg-muted/50 p-4 rounded-lg whitespace-pre-wrap">
                      {selectedIncident.description}
                    </p>
                  </div>

                  {/* Location */}
                  {(selectedIncident.location_address || selectedIncident.location_lat) && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">Location</p>
                      </div>
                      <p className="text-sm">
                        {selectedIncident.location_address || 
                          `${selectedIncident.location_lat?.toFixed(6)}, ${selectedIncident.location_lng?.toFixed(6)}`}
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Photos Tab */}
                <TabsContent value="photos" className="mt-0">
                  {selectedIncident.photos && selectedIncident.photos.length > 0 ? (
                    <div className="space-y-4">
                      {/* Main Photo */}
                      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                        <img 
                          src={selectedIncident.photos[photoIndex]} 
                          alt={`Incident photo ${photoIndex + 1}`}
                          className="w-full h-full object-contain"
                        />
                        {selectedIncident.photos.length > 1 && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                              onClick={() => setPhotoIndex(i => i > 0 ? i - 1 : selectedIncident.photos!.length - 1)}
                            >
                              <ChevronLeft className="h-6 w-6" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                              onClick={() => setPhotoIndex(i => i < selectedIncident.photos!.length - 1 ? i + 1 : 0)}
                            >
                              <ChevronRight className="h-6 w-6" />
                            </Button>
                          </>
                        )}
                        <div className="absolute bottom-2 right-2 flex gap-2">
                          <Badge variant="secondary">{photoIndex + 1} / {selectedIncident.photos.length}</Badge>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => window.open(selectedIncident.photos![photoIndex], '_blank')}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                      {/* Thumbnails */}
                      {selectedIncident.photos.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {selectedIncident.photos.map((photo, i) => (
                            <button
                              key={i}
                              onClick={() => setPhotoIndex(i)}
                              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 ${
                                i === photoIndex ? 'border-primary' : 'border-transparent'
                              }`}
                            >
                              <img src={photo} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No photos attached to this incident</p>
                    </div>
                  )}
                </TabsContent>

                {/* IoT Telemetry Tab */}
                <TabsContent value="telemetry" className="mt-0 space-y-4">
                  {/* Impact Data (for accidents) */}
                  {(selectedIncident.iot_deceleration_g || selectedIncident.iot_speed_at_impact) && (
                    <Card className="border-red-200 bg-red-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2 text-red-700">
                          <AlertTriangle className="h-5 w-5" />
                          Impact Detection Data
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-3 bg-white rounded-lg">
                            <Activity className="h-6 w-6 mx-auto text-red-600 mb-1" />
                            <p className="text-2xl font-bold text-red-700">{selectedIncident.iot_deceleration_g?.toFixed(1) || 'N/A'}G</p>
                            <p className="text-xs text-muted-foreground">Deceleration</p>
                          </div>
                          <div className="text-center p-3 bg-white rounded-lg">
                            <Gauge className="h-6 w-6 mx-auto text-orange-600 mb-1" />
                            <p className="text-2xl font-bold text-orange-700">{selectedIncident.iot_speed_at_impact?.toFixed(0) || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Speed at Impact (mph)</p>
                          </div>
                          <div className="text-center p-3 bg-white rounded-lg">
                            <Bot className="h-6 w-6 mx-auto text-blue-600 mb-1" />
                            <p className="text-lg font-bold text-blue-700 capitalize">{selectedIncident.iot_impact_severity || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">Severity Classification</p>
                          </div>
                        </div>
                        {selectedIncident.iot_triggered_at && (
                          <p className="text-xs text-muted-foreground mt-3 text-center">
                            Triggered at: {formatDate(selectedIncident.iot_triggered_at)} | Type: {selectedIncident.iot_trigger_type || 'Unknown'}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Full Telemetry Snapshot */}
                  {selectedIncident.iot_data && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Cpu className="h-5 w-5 text-cyan-600" />
                          Vehicle Telemetry Snapshot
                        </CardTitle>
                        <CardDescription>
                          Captured at: {selectedIncident.iot_data.capturedAt ? formatDate(selectedIncident.iot_data.capturedAt) : 'Unknown'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Location & Motion */}
                        {(selectedIncident.iot_data.location || selectedIncident.iot_data.motion) && (
                          <div className="grid grid-cols-2 gap-4">
                            {selectedIncident.iot_data.location && (
                              <div className="p-3 border rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <MapPin className="h-4 w-4 text-green-600" />
                                  <p className="font-medium text-sm">Location</p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {selectedIncident.iot_data.location.latitude?.toFixed(6)}, {selectedIncident.iot_data.location.longitude?.toFixed(6)}
                                </p>
                              </div>
                            )}
                            {selectedIncident.iot_data.motion && (
                              <div className="p-3 border rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <Gauge className="h-4 w-4 text-blue-600" />
                                  <p className="font-medium text-sm">Motion</p>
                                </div>
                                <p className="text-xs">
                                  Speed: {selectedIncident.iot_data.motion.speed?.toFixed(1)} mph | 
                                  {selectedIncident.iot_data.motion.isParked ? ' Parked' : ' Moving'}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Vehicle Systems */}
                        {selectedIncident.iot_data.vehicle && (
                          <div className="p-3 border rounded-lg">
                            <p className="font-medium text-sm mb-3">Vehicle Systems</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="flex items-center gap-2">
                                <Battery className="h-4 w-4 text-green-600" />
                                <span className="text-xs">Battery: {selectedIncident.iot_data.vehicle.batteryLevel}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-blue-600" />
                                <span className="text-xs">Ignition: {selectedIncident.iot_data.vehicle.ignitionStatus ? 'On' : 'Off'}</span>
                              </div>
                              {selectedIncident.iot_data.vehicle.fuelLevel && (
                                <div className="flex items-center gap-2">
                                  <Gauge className="h-4 w-4 text-orange-600" />
                                  <span className="text-xs">Fuel: {selectedIncident.iot_data.vehicle.fuelLevel}%</span>
                                </div>
                              )}
                              {selectedIncident.iot_data.vehicle.engineTemp && (
                                <div className="flex items-center gap-2">
                                  <ThermometerSun className="h-4 w-4 text-red-600" />
                                  <span className="text-xs">Engine: {selectedIncident.iot_data.vehicle.engineTemp}°F</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Diagnostics */}
                        {selectedIncident.iot_data.diagnostics && (
                          <div className="p-3 border rounded-lg">
                            <p className="font-medium text-sm mb-3">Diagnostics</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {selectedIncident.iot_data.diagnostics.checkEngineLightOn && (
                                <Badge variant="destructive">Check Engine Light ON</Badge>
                              )}
                              {selectedIncident.iot_data.diagnostics.engineCode?.length > 0 && (
                                <div>
                                  <span className="text-muted-foreground">DTC Codes: </span>
                                  {selectedIncident.iot_data.diagnostics.engineCode.join(', ')}
                                </div>
                              )}
                              {selectedIncident.iot_data.diagnostics.oilLevel && (
                                <div>Oil Level: {selectedIncident.iot_data.diagnostics.oilLevel}%</div>
                              )}
                              {selectedIncident.iot_data.diagnostics.brakeWearLevel && (
                                <div>Brake Wear: {selectedIncident.iot_data.diagnostics.brakeWearLevel}%</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Raw JSON */}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            View Raw Telemetry JSON
                          </summary>
                          <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-48">
                            {JSON.stringify(selectedIncident.iot_data, null, 2)}
                          </pre>
                        </details>
                      </CardContent>
                    </Card>
                  )}

                  {!selectedIncident.iot_data && !selectedIncident.is_iot_detected && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Cpu className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No IoT telemetry data available for this incident</p>
                    </div>
                  )}
                </TabsContent>

                {/* Resolution Tab */}
                <TabsContent value="resolution" className="mt-0 space-y-4">
                  {selectedIncident.resolved_at ? (
                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-4">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <p className="font-medium text-green-700">Incident Resolved</p>
                        </div>
                        <div className="space-y-2 text-sm">
                          <p><span className="text-muted-foreground">Resolved At:</span> {formatDate(selectedIncident.resolved_at)}</p>
                          {selectedIncident.actual_downtime_hours && (
                            <p><span className="text-muted-foreground">Actual Downtime:</span> {selectedIncident.actual_downtime_hours} hours</p>
                          )}
                          {selectedIncident.resolution_notes && (
                            <div className="mt-4">
                              <p className="text-muted-foreground mb-1">Resolution Notes:</p>
                              <p className="bg-white p-3 rounded-lg">{selectedIncident.resolution_notes}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Resolution Notes</Label>
                        <Textarea
                          placeholder="Describe how the incident was resolved, actions taken, repairs made..."
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                          rows={4}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Actual Downtime (hours)</Label>
                        <Input
                          type="number"
                          placeholder="Enter actual downtime hours"
                          value={actualDowntime}
                          onChange={(e) => setActualDowntime(e.target.value)}
                          min="0"
                        />
                      </div>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )}

          <Separator />

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="ghost" onClick={() => setSelectedIncident(null)}>
              Close
            </Button>
            <div className="flex gap-2">
              {selectedIncident?.status === 'reported' && (
                <Button 
                  onClick={() => handleStatusChange(selectedIncident.id, 'acknowledged')}
                  disabled={isUpdating}
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Acknowledge
                </Button>
              )}
              {selectedIncident?.status === 'acknowledged' && (
                <Button 
                  onClick={() => handleStatusChange(selectedIncident.id, 'in_progress')}
                  disabled={isUpdating}
                >
                  Mark In Progress
                </Button>
              )}
              {(selectedIncident?.status === 'acknowledged' || selectedIncident?.status === 'in_progress') && (
                <Button 
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleStatusChange(selectedIncident.id, 'resolved')}
                  disabled={isUpdating}
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Mark Resolved
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
