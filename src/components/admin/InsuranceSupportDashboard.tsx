import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield, AlertTriangle, Clock, CheckCircle, RefreshCw, FileText, Car, User, Calendar, CreditCard, Eye, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInDays, isPast } from 'date-fns';

interface InsuranceTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  city: string;
  region: string;
  driver_id: string | null;
  owner_id: string | null;
  vehicle_id: string | null;
  created_at: string;
  scheduled_date: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
}

interface VehicleDetails {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vin: string | null;
  color: string | null;
  owner_id: string;
}

interface OwnerProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface InsuranceDocument {
  id: string;
  document_type: string;
  file_name: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  verified_at: string | null;
}

const statusConfig = {
  pending_verification: { label: 'Pending Verification', color: 'bg-amber-500', icon: Clock },
  documents_requested: { label: 'Documents Requested', color: 'bg-blue-500', icon: FileText },
  under_review: { label: 'Under Review', color: 'bg-purple-500', icon: Shield },
  approved: { label: 'Approved', color: 'bg-green-600', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-destructive', icon: AlertTriangle },
  expired: { label: 'Expired', color: 'bg-muted-foreground', icon: AlertTriangle },
};

export const InsuranceSupportDashboard = () => {
  const [tasks, setTasks] = useState<InsuranceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [filterExpiry, setFilterExpiry] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<InsuranceTask | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetails | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [documents, setDocuments] = useState<InsuranceDocument[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [insuranceEnabled, setInsuranceEnabled] = useState(true);
  const [togglingInsurance, setTogglingInsurance] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchInsuranceSetting();
  }, []);

  const fetchInsuranceSetting = async () => {
    const { data } = await supabase
      .from('voip_settings')
      .select('is_enabled')
      .eq('feature_key', 'insurance_support')
      .maybeSingle();
    if (data) setInsuranceEnabled(data.is_enabled);
  };

  const toggleInsuranceSupport = async (enabled: boolean) => {
    setTogglingInsurance(true);
    try {
      const { error } = await supabase
        .from('voip_settings')
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('feature_key', 'insurance_support');
      if (error) throw error;
      setInsuranceEnabled(enabled);
      toast.success(`Insurance support ${enabled ? 'enabled' : 'disabled'} for owners`);
    } catch (error) {
      console.error('Error toggling insurance support:', error);
      toast.error('Failed to update insurance support setting');
    } finally {
      setTogglingInsurance(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('support_tasks')
        .select('*')
        .eq('task_type', 'insurance')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching insurance tasks:', error);
      toast.error('Failed to load insurance tasks');
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskDetails = async (task: InsuranceTask) => {
    setDetailsLoading(true);
    setSelectedTask(task);
    
    try {
      // Fetch vehicle details if vehicle_id exists
      if (task.vehicle_id) {
        const { data: vehicle } = await supabase
          .from('vehicles')
          .select('*')
          .eq('id', task.vehicle_id)
          .maybeSingle();
        
        setVehicleDetails(vehicle);

        // Fetch owner profile if vehicle has owner_id
        if (vehicle?.owner_id) {
          const { data: owner } = await supabase
            .from('profiles')
            .select('user_id, full_name, email, phone')
            .eq('user_id', vehicle.owner_id)
            .maybeSingle();
          
          setOwnerProfile(owner);
        }

        // Fetch related documents
        const { data: docs } = await supabase
          .from('user_documents')
          .select('*')
          .eq('vehicle_id', task.vehicle_id)
          .in('document_type', ['insurance', 'registration', 'license'])
          .order('created_at', { ascending: false });
        
        setDocuments(docs || []);
      } else if (task.owner_id) {
        // Fetch owner profile directly
        const { data: owner } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .eq('user_id', task.owner_id)
          .maybeSingle();
        
        setOwnerProfile(owner);

        // Fetch owner's documents
        const { data: docs } = await supabase
          .from('user_documents')
          .select('*')
          .eq('user_id', task.owner_id)
          .in('document_category', ['vehicle', 'insurance'])
          .order('created_at', { ascending: false });
        
        setDocuments(docs || []);
      }
    } catch (error) {
      console.error('Error fetching task details:', error);
      toast.error('Failed to load task details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedTask(null);
    setVehicleDetails(null);
    setOwnerProfile(null);
    setDocuments([]);
  };

  const getStatusBadge = (task: InsuranceTask) => {
    const status = task.resolved_at ? 'approved' : 'pending_verification';
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending_verification;
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-destructive text-destructive-foreground',
      medium: 'bg-warning text-warning-foreground',
      low: 'bg-muted text-muted-foreground',
    };
    return <Badge className={colors[priority] || colors.medium}>{priority}</Badge>;
  };

  const getExpiryBadge = (expiryDate: string | null) => {
    if (!expiryDate) return <Badge variant="outline">No expiry set</Badge>;
    
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = differenceInDays(expiry, new Date());
    
    if (isPast(expiry)) {
      return <Badge className="bg-destructive text-destructive-foreground">Expired</Badge>;
    } else if (daysUntilExpiry <= 7) {
      return <Badge className="bg-destructive text-destructive-foreground">Expires in {daysUntilExpiry} days</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge className="bg-amber-500 text-white">Expires in {daysUntilExpiry} days</Badge>;
    } else {
      return <Badge className="bg-green-600 text-white">Valid ({daysUntilExpiry} days)</Badge>;
    }
  };

  const getDocumentStatusBadge = (status: string) => {
    const config: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-amber-500', label: 'Pending' },
      verified: { color: 'bg-green-600', label: 'Verified' },
      rejected: { color: 'bg-destructive', label: 'Rejected' },
    };
    const statusInfo = config[status] || config.pending;
    return <Badge className={`${statusInfo.color} text-white`}>{statusInfo.label}</Badge>;
  };

  const filteredTasks = tasks.filter(task => {
    if (filterRegion !== 'all' && task.region.toLowerCase() !== filterRegion) return false;
    return true;
  });

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => !t.resolved_at).length,
    approved: tasks.filter(t => t.resolved_at).length,
    highPriority: tasks.filter(t => t.priority === 'high' && !t.resolved_at).length,
    expiringDocs: documents.filter(d => {
      if (!d.expires_at) return false;
      const daysUntil = differenceInDays(new Date(d.expires_at), new Date());
      return daysUntil <= 30 && daysUntil > 0;
    }).length,
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master Switch */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="insurance-toggle" className="text-base font-medium">
                Insurance Support Availability
              </Label>
              <p className="text-sm text-muted-foreground">
                {insuranceEnabled
                  ? 'Owners can submit insurance support requests from their dashboard'
                  : 'Insurance support is disabled — owners cannot submit requests'}
              </p>
            </div>
            <Switch
              id="insurance-toggle"
              checked={insuranceEnabled}
              disabled={togglingInsurance}
              onCheckedChange={toggleInsuranceSupport}
            />
          </div>
        </CardContent>
      </Card>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cases</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Shield className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold text-amber-500">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Priority</p>
                <p className="text-2xl font-bold text-destructive">{stats.highPriority}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Insurance Support Portal
              </CardTitle>
              <CardDescription>
                Manage vehicle insurance verification, ownership, licensing, and documentation
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={filterRegion} onValueChange={setFilterRegion}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="usa">USA</SelectItem>
                  <SelectItem value="nigeria">Nigeria</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterExpiry} onValueChange={setFilterExpiry}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Expiry Status" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="expiring">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="valid">Valid</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchTasks}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No insurance cases found</p>
              <p className="text-sm">Insurance verification tasks will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {task.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(task)}</TableCell>
                    <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{task.city}</p>
                        <p className="text-xs text-muted-foreground">{task.region}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(task.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchTaskDetails(task)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && closeDetails()}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Insurance Case Details
            </DialogTitle>
            <DialogDescription>
              View vehicle particulars, ownership, licensing, and document expiry information
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="max-h-[70vh]">
              <Tabs defaultValue="vehicle" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="vehicle">
                    <Car className="h-4 w-4 mr-2" />
                    Vehicle
                  </TabsTrigger>
                  <TabsTrigger value="ownership">
                    <User className="h-4 w-4 mr-2" />
                    Ownership
                  </TabsTrigger>
                  <TabsTrigger value="documents">
                    <FileText className="h-4 w-4 mr-2" />
                    Documents
                  </TabsTrigger>
                  <TabsTrigger value="licensing">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Licensing
                  </TabsTrigger>
                </TabsList>

                {/* Vehicle Particulars Tab */}
                <TabsContent value="vehicle" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Car className="h-5 w-5" />
                        Vehicle Particulars
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {vehicleDetails ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Make</p>
                            <p className="font-medium">{vehicleDetails.make}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Model</p>
                            <p className="font-medium">{vehicleDetails.model}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Year</p>
                            <p className="font-medium">{vehicleDetails.year}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Color</p>
                            <p className="font-medium">{vehicleDetails.color || 'Not specified'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">License Plate</p>
                            <p className="font-medium font-mono">{vehicleDetails.license_plate}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">VIN</p>
                            <p className="font-medium font-mono text-sm">{vehicleDetails.vin || 'Not recorded'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Car className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No vehicle information available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Task Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Case Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Case Title</p>
                          <p className="font-medium">{selectedTask?.title}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Priority</p>
                          {selectedTask && getPriorityBadge(selectedTask.priority)}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Location</p>
                          <p className="font-medium flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {selectedTask?.city}, {selectedTask?.region}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Status</p>
                          {selectedTask && getStatusBadge(selectedTask)}
                        </div>
                        {selectedTask?.description && (
                          <div className="col-span-2 space-y-1">
                            <p className="text-sm text-muted-foreground">Description</p>
                            <p className="text-sm">{selectedTask.description}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Ownership Tab */}
                <TabsContent value="ownership" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Owner Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {ownerProfile ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Full Name</p>
                            <p className="font-medium">{ownerProfile.full_name || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium">{ownerProfile.email || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Phone</p>
                            <p className="font-medium">{ownerProfile.phone || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Owner ID</p>
                            <p className="font-mono text-xs">{ownerProfile.user_id}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No owner information available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {vehicleDetails && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Ownership Verification</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div>
                              <p className="font-medium">Vehicle Registration</p>
                              <p className="text-sm text-muted-foreground">Proof of vehicle ownership</p>
                            </div>
                            {documents.find(d => d.document_type === 'registration') ? (
                              getDocumentStatusBadge(documents.find(d => d.document_type === 'registration')!.status)
                            ) : (
                              <Badge variant="outline">Not uploaded</Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div>
                              <p className="font-medium">Title Certificate</p>
                              <p className="text-sm text-muted-foreground">Vehicle title documentation</p>
                            </div>
                            <Badge variant="outline">Not uploaded</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Documents Tab */}
                <TabsContent value="documents" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Insurance & Expiry Dates
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {documents.length > 0 ? (
                        <div className="space-y-3">
                          {documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium capitalize">{doc.document_type.replace('_', ' ')}</p>
                                  {getDocumentStatusBadge(doc.status)}
                                </div>
                                <p className="text-sm text-muted-foreground">{doc.file_name}</p>
                                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                  <span>Uploaded: {format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
                                  {doc.verified_at && (
                                    <span>Verified: {format(new Date(doc.verified_at), 'MMM d, yyyy')}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {doc.expires_at && (
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Expiry Date</p>
                                    <p className="text-sm font-medium">{format(new Date(doc.expires_at), 'MMM d, yyyy')}</p>
                                    {getExpiryBadge(doc.expires_at)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No documents found</p>
                          <p className="text-sm">Insurance and registration documents will appear here</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Expiry Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Expiry Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-muted rounded-lg text-center">
                          <p className="text-2xl font-bold text-green-600">
                            {documents.filter(d => d.expires_at && differenceInDays(new Date(d.expires_at), new Date()) > 30).length}
                          </p>
                          <p className="text-sm text-muted-foreground">Valid</p>
                        </div>
                        <div className="p-4 bg-muted rounded-lg text-center">
                          <p className="text-2xl font-bold text-amber-500">
                            {documents.filter(d => {
                              if (!d.expires_at) return false;
                              const days = differenceInDays(new Date(d.expires_at), new Date());
                              return days > 0 && days <= 30;
                            }).length}
                          </p>
                          <p className="text-sm text-muted-foreground">Expiring Soon</p>
                        </div>
                        <div className="p-4 bg-muted rounded-lg text-center">
                          <p className="text-2xl font-bold text-destructive">
                            {documents.filter(d => d.expires_at && isPast(new Date(d.expires_at))).length}
                          </p>
                          <p className="text-sm text-muted-foreground">Expired</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Licensing Tab */}
                <TabsContent value="licensing" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Licensing Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {/* Driver's License */}
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">Driver's License</h4>
                            {documents.find(d => d.document_type === 'license') ? (
                              getDocumentStatusBadge(documents.find(d => d.document_type === 'license')!.status)
                            ) : (
                              <Badge variant="outline">Not uploaded</Badge>
                            )}
                          </div>
                          {documents.find(d => d.document_type === 'license') && (
                            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                              <div>
                                <p className="text-muted-foreground">File</p>
                                <p className="font-medium">{documents.find(d => d.document_type === 'license')?.file_name}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Expiry</p>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {documents.find(d => d.document_type === 'license')?.expires_at 
                                      ? format(new Date(documents.find(d => d.document_type === 'license')!.expires_at!), 'MMM d, yyyy')
                                      : 'Not set'}
                                  </p>
                                  {documents.find(d => d.document_type === 'license')?.expires_at && 
                                    getExpiryBadge(documents.find(d => d.document_type === 'license')!.expires_at)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Vehicle Registration */}
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">Vehicle Registration</h4>
                            {documents.find(d => d.document_type === 'registration') ? (
                              getDocumentStatusBadge(documents.find(d => d.document_type === 'registration')!.status)
                            ) : (
                              <Badge variant="outline">Not uploaded</Badge>
                            )}
                          </div>
                          {vehicleDetails && (
                            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                              <div>
                                <p className="text-muted-foreground">Plate Number</p>
                                <p className="font-medium font-mono">{vehicleDetails.license_plate}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Expiry</p>
                                <div className="flex items-center gap-2">
                                  {documents.find(d => d.document_type === 'registration')?.expires_at ? (
                                    <>
                                      <p className="font-medium">
                                        {format(new Date(documents.find(d => d.document_type === 'registration')!.expires_at!), 'MMM d, yyyy')}
                                      </p>
                                      {getExpiryBadge(documents.find(d => d.document_type === 'registration')!.expires_at)}
                                    </>
                                  ) : (
                                    <p className="font-medium">Not set</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Insurance Policy */}
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">Insurance Policy</h4>
                            {documents.find(d => d.document_type === 'insurance') ? (
                              getDocumentStatusBadge(documents.find(d => d.document_type === 'insurance')!.status)
                            ) : (
                              <Badge variant="outline">Not uploaded</Badge>
                            )}
                          </div>
                          {documents.find(d => d.document_type === 'insurance') && (
                            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                              <div>
                                <p className="text-muted-foreground">Policy Document</p>
                                <p className="font-medium">{documents.find(d => d.document_type === 'insurance')?.file_name}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Policy Expiry</p>
                                <div className="flex items-center gap-2">
                                  {documents.find(d => d.document_type === 'insurance')?.expires_at ? (
                                    <>
                                      <p className="font-medium">
                                        {format(new Date(documents.find(d => d.document_type === 'insurance')!.expires_at!), 'MMM d, yyyy')}
                                      </p>
                                      {getExpiryBadge(documents.find(d => d.document_type === 'insurance')!.expires_at)}
                                    </>
                                  ) : (
                                    <p className="font-medium">Not set</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Regional Requirements */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Regional Licensing Requirements</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">🇺🇸</span>
                            <h4 className="font-medium">USA Requirements</h4>
                          </div>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Valid Driver's License</li>
                            <li>• Vehicle Registration</li>
                            <li>• Rideshare Insurance Coverage</li>
                            <li>• State Inspection (if applicable)</li>
                          </ul>
                        </div>
                        <div className="p-4 bg-muted rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">🇳🇬</span>
                            <h4 className="font-medium">Nigeria Requirements</h4>
                          </div>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Valid Driver's License</li>
                            <li>• Vehicle Registration (FRSC)</li>
                            <li>• Third-Party Insurance</li>
                            <li>• Vehicle Particulars</li>
                            <li>• Road Worthiness Certificate</li>
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
