import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Shield, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  RefreshCw, 
  FileText, 
  User, 
  Eye,
  XCircle,
  FileCheck,
  BadgeCheck,
  Car,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface DriverDocument {
  id: string;
  user_id: string;
  document_type: string;
  document_category: string;
  file_path: string;
  file_name: string;
  status: string;
  rejection_reason: string | null;
  expires_at: string | null;
  expiry_date: string | null;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
}

interface DriverProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface DriverApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  phone_country: string;
  city: string;
  region: string;
  country: string;
  status: string;
  rideshare_platforms: string[] | null;
  has_driver_license: boolean;
  created_at: string;
  user_id: string | null;
}

const documentTypeLabels: Record<string, { label: string; icon: typeof FileText; required: boolean }> = {
  driver_license: { label: "Driver's License", icon: FileCheck, required: true },
  police_report: { label: 'Police Clearance Certificate', icon: Shield, required: true },
  nin: { label: 'NIN Document', icon: BadgeCheck, required: true },
  bvn: { label: 'BVN Verification', icon: BadgeCheck, required: true },
  vehicle_insurance: { label: 'Vehicle Insurance', icon: Car, required: true },
  rideshare_approval: { label: 'Rideshare Approval', icon: FileCheck, required: true },
  national_id: { label: 'National ID', icon: FileCheck, required: true },
};

const statusConfig = {
  pending: { label: 'Pending Review', color: 'bg-amber-500', icon: Clock },
  verified: { label: 'Verified', color: 'bg-green-600', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-destructive', icon: XCircle },
};

export const NigeriaDriverVerification = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [selectedDriver, setSelectedDriver] = useState<DriverApplication | null>(null);
  const [driverDocuments, setDriverDocuments] = useState<DriverDocument[]>([]);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DriverDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('application_type', 'driver')
        .eq('country', 'nigeria')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error fetching Nigerian driver applications:', error);
      toast.error('Failed to load driver applications');
    } finally {
      setLoading(false);
    }
  };

  const fetchDriverDetails = async (application: DriverApplication) => {
    setDetailsLoading(true);
    setSelectedDriver(application);
    
    try {
      // Fetch driver profile if user_id exists
      if (application.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .eq('user_id', application.user_id)
          .maybeSingle();
        
        setDriverProfile(profile);

        // Fetch driver documents
        const { data: docs } = await supabase
          .from('user_documents')
          .select('*')
          .eq('user_id', application.user_id)
          .order('created_at', { ascending: false });
        
        setDriverDocuments(docs || []);
      } else {
        setDriverProfile(null);
        setDriverDocuments([]);
      }
    } catch (error) {
      console.error('Error fetching driver details:', error);
      toast.error('Failed to load driver details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedDriver(null);
    setDriverProfile(null);
    setDriverDocuments([]);
  };

  const openVerifyDialog = (doc: DriverDocument) => {
    setSelectedDocument(doc);
    setRejectionReason('');
    setExpiryDate(doc.expiry_date || doc.expires_at || '');
    setVerifyDialogOpen(true);
  };

  const handleVerifyDocument = async (status: 'verified' | 'rejected') => {
    if (!selectedDocument || !user) return;

    try {
      const updateData: Record<string, any> = {
        status,
        verified_at: status === 'verified' ? new Date().toISOString() : null,
        verified_by: status === 'verified' ? user.id : null,
      };

      if (status === 'rejected') {
        updateData.rejection_reason = rejectionReason;
      }

      if (expiryDate && status === 'verified') {
        updateData.expiry_date = expiryDate;
      }

      const { error } = await supabase
        .from('user_documents')
        .update(updateData)
        .eq('id', selectedDocument.id);

      if (error) throw error;

      toast.success(`Document ${status === 'verified' ? 'verified' : 'rejected'} successfully`);
      setVerifyDialogOpen(false);
      
      // Refresh documents
      if (selectedDriver?.user_id) {
        const { data: docs } = await supabase
          .from('user_documents')
          .select('*')
          .eq('user_id', selectedDriver.user_id)
          .order('created_at', { ascending: false });
        
        setDriverDocuments(docs || []);
      }
    } catch (error) {
      console.error('Error updating document status:', error);
      toast.error('Failed to update document status');
    }
  };

  const handleViewDocument = async (doc: DriverDocument) => {
    try {
      const { data } = await supabase.storage
        .from('user-documents')
        .createSignedUrl(doc.file_path, 3600);
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      } else {
        toast.error('Could not load document');
      }
    } catch (error) {
      toast.error('Error loading document');
    }
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getApplicationStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-500 text-white',
      approved: 'bg-green-600 text-white',
      rejected: 'bg-destructive text-destructive-foreground',
      under_review: 'bg-purple-500 text-white',
      needs_info: 'bg-blue-500 text-white',
    };
    return <Badge className={colors[status] || colors.pending}>{status.replace('_', ' ')}</Badge>;
  };

  const getVerificationProgress = (docs: DriverDocument[]) => {
    const requiredTypes = ['driver_license', 'police_report', 'nin', 'bvn', 'vehicle_insurance'];
    const verified = requiredTypes.filter(type => 
      docs.some(d => d.document_type === type && d.status === 'verified')
    ).length;
    return { verified, total: requiredTypes.length, percent: Math.round((verified / requiredTypes.length) * 100) };
  };

  const filteredApplications = applications.filter(app => {
    if (filterStatus !== 'all' && app.status !== filterStatus) return false;
    if (filterCity !== 'all' && app.city.toLowerCase() !== filterCity) return false;
    return true;
  });

  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    underReview: applications.filter(a => a.status === 'under_review').length,
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Drivers</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <User className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Verification</p>
                <p className="text-2xl font-bold text-warning">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-warning opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Under Review</p>
                <p className="text-2xl font-bold text-accent">{stats.underReview}</p>
              </div>
              <FileText className="h-8 w-8 text-accent opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-success">{stats.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-success opacity-80" />
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
                🇳🇬 Nigeria Driver Verification
              </CardTitle>
              <CardDescription>
                Verify insurance, police clearance, NIN, and BVN documents for Nigerian drivers
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={filterCity} onValueChange={setFilterCity}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Cities</SelectItem>
                  <SelectItem value="lagos">Lagos</SelectItem>
                  <SelectItem value="abuja">Abuja</SelectItem>
                  <SelectItem value="port harcourt">Port Harcourt</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchApplications}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredApplications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No Nigerian driver applications found</p>
              <p className="text-sm">Driver verification requests will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{app.first_name} {app.last_name}</p>
                          {app.rideshare_platforms && (
                            <p className="text-xs text-muted-foreground">
                              {app.rideshare_platforms.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {app.email}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          +{app.phone_country === 'ng' ? '234' : '1'} {app.phone_number}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{app.city}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getApplicationStatusBadge(app.status)}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(app.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchDriverDetails(app)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Verify Docs
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Driver Details Dialog */}
      <Dialog open={!!selectedDriver} onOpenChange={(open) => !open && closeDetails()}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Driver Verification - {selectedDriver?.first_name} {selectedDriver?.last_name}
            </DialogTitle>
            <DialogDescription>
              Review and verify insurance, police clearance, NIN, and BVN documents
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="max-h-[70vh]">
              <Tabs defaultValue="documents" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="documents">
                    <FileText className="h-4 w-4 mr-2" />
                    Documents
                  </TabsTrigger>
                  <TabsTrigger value="profile">
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </TabsTrigger>
                  <TabsTrigger value="progress">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Progress
                  </TabsTrigger>
                </TabsList>

                {/* Documents Tab */}
                <TabsContent value="documents" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Required Documents (Nigeria)
                      </CardTitle>
                      <CardDescription>
                        Verify each document for authenticity and validity
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Object.entries(documentTypeLabels).map(([type, config]) => {
                        const doc = driverDocuments.find(d => d.document_type === type);
                        const Icon = config.icon;
                        
                        return (
                          <div key={type} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-muted">
                                <Icon className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium flex items-center gap-2">
                                  {config.label}
                                  {config.required && (
                                    <Badge variant="outline" className="text-xs">Required</Badge>
                                  )}
                                </p>
                                {doc ? (
                                  <div className="text-sm text-muted-foreground">
                                    <p>{doc.file_name}</p>
                                    <p className="text-xs">
                                      Uploaded: {format(new Date(doc.created_at), 'MMM d, yyyy')}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Not uploaded</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {doc ? (
                                <>
                                  {getStatusBadge(doc.status)}
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => handleViewDocument(doc)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {doc.status === 'pending' && (
                                    <Button 
                                      size="sm"
                                      onClick={() => openVerifyDialog(doc)}
                                    >
                                      Verify
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Missing
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Profile Tab */}
                <TabsContent value="profile" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Driver Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDriver && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Full Name</p>
                            <p className="font-medium">{selectedDriver.first_name} {selectedDriver.last_name}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium">{selectedDriver.email}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Phone</p>
                            <p className="font-medium">
                              +{selectedDriver.phone_country === 'ng' ? '234' : '1'} {selectedDriver.phone_number}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">City</p>
                            <p className="font-medium">{selectedDriver.city}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Rideshare Platforms</p>
                            <div className="flex gap-1 flex-wrap">
                              {selectedDriver.rideshare_platforms?.map(platform => (
                                <Badge key={platform} variant="secondary">{platform}</Badge>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Has Driver's License</p>
                            <p className="font-medium">{selectedDriver.has_driver_license ? 'Yes' : 'No'}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Progress Tab */}
                <TabsContent value="progress" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Verification Progress
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const progress = getVerificationProgress(driverDocuments);
                        return (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Document Verification</span>
                              <span className="text-sm text-muted-foreground">
                                {progress.verified} / {progress.total} verified
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-success transition-all duration-300"
                                style={{ width: `${progress.percent}%` }}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-4 pt-4">
                              <div className="text-center p-4 bg-success/10 rounded-lg">
                                <p className="text-2xl font-bold text-success">
                                  {driverDocuments.filter(d => d.status === 'verified').length}
                                </p>
                                <p className="text-sm text-success">Verified</p>
                              </div>
                              <div className="text-center p-4 bg-warning/10 rounded-lg">
                                <p className="text-2xl font-bold text-warning">
                                  {driverDocuments.filter(d => d.status === 'pending').length}
                                </p>
                                <p className="text-sm text-warning">Pending</p>
                              </div>
                              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                                <p className="text-2xl font-bold text-destructive">
                                  {driverDocuments.filter(d => d.status === 'rejected').length}
                                </p>
                                <p className="text-sm text-destructive">Rejected</p>
                              </div>
                            </div>
                            {progress.percent === 100 && (
                              <div className="p-4 bg-success/10 rounded-lg border border-success/20 flex items-center gap-3">
                                <CheckCircle className="h-6 w-6 text-success" />
                                <div>
                                  <p className="font-medium text-success">All Documents Verified</p>
                                  <p className="text-sm text-success/80">Driver is fully verified and ready to operate</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Verify Document Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Document</DialogTitle>
            <DialogDescription>
              Review and verify or reject this document
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Document Type</p>
              <p className="font-medium">
                {selectedDocument && documentTypeLabels[selectedDocument.document_type]?.label}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date (if applicable)</Label>
              <Input
                id="expiryDate"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rejectionReason">Rejection Reason (if rejecting)</Label>
              <Textarea
                id="rejectionReason"
                placeholder="Enter reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setVerifyDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleVerifyDocument('rejected')}
              disabled={!rejectionReason}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button 
              onClick={() => handleVerifyDocument('verified')}
              className="bg-success hover:bg-success/90 text-success-foreground"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NigeriaDriverVerification;
