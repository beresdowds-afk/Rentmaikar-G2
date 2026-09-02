import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Shield, 
  Clock, 
  CheckCircle, 
  RefreshCw, 
  FileText, 
  User, 
  Eye,
  XCircle,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { usePagination, DataPagination } from '@/components/ui/data-pagination';

interface PoliceReportDocument {
  id: string;
  user_id: string;
  document_type: string;
  document_category: string;
  file_path: string;
  file_name: string;
  status: string;
  rejection_reason: string | null;
  expiry_date: string | null;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
}

interface DriverInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface ApplicationInfo {
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
  user_id: string | null;
  created_at: string;
}

interface PoliceReportWithDriver extends PoliceReportDocument {
  driverInfo?: DriverInfo;
  applicationInfo?: ApplicationInfo;
}

const statusConfig = {
  pending: { label: 'Pending Review', color: 'bg-amber-500', icon: Clock },
  verified: { label: 'Verified', color: 'bg-green-600', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-destructive', icon: XCircle },
};

export const PoliceReportVerification = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<PoliceReportWithDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<PoliceReportWithDriver | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    fetchPoliceReports();
  }, []);

  const fetchPoliceReports = async () => {
    setLoading(true);
    try {
      // Fetch all police report documents
      const { data: docs, error } = await supabase
        .from('user_documents')
        .select('*')
        .eq('document_type', 'police_report')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with driver info
      const enrichedDocs: PoliceReportWithDriver[] = [];
      
      for (const doc of docs || []) {
        let driverInfo: DriverInfo | undefined;
        let applicationInfo: ApplicationInfo | undefined;

        // Fetch profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .eq('user_id', doc.user_id)
          .maybeSingle();
        
        if (profile) {
          driverInfo = profile;
        }

        // Fetch application for city info
        const { data: app } = await supabase
          .from('applications')
          .select('*')
          .eq('user_id', doc.user_id)
          .eq('application_type', 'driver')
          .eq('country', 'nigeria')
          .maybeSingle();
        
        if (app) {
          applicationInfo = app;
        }

        enrichedDocs.push({
          ...doc,
          driverInfo,
          applicationInfo,
        });
      }

      setReports(enrichedDocs);
    } catch (error) {
      console.error('Error fetching police reports:', error);
      toast.error('Failed to load police reports');
    } finally {
      setLoading(false);
    }
  };

  const openVerifyDialog = (report: PoliceReportWithDriver) => {
    setSelectedReport(report);
    setRejectionReason('');
    setExpiryDate(report.expiry_date || '');
    setVerifyDialogOpen(true);
  };

  const handleVerifyDocument = async (status: 'verified' | 'rejected') => {
    if (!selectedReport || !user) return;

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
        .eq('id', selectedReport.id);

      if (error) throw error;

      toast.success(`Police report ${status === 'verified' ? 'verified' : 'rejected'} successfully`);
      setVerifyDialogOpen(false);
      fetchPoliceReports();
    } catch (error) {
      console.error('Error updating document status:', error);
      toast.error('Failed to update document status');
    }
  };

  const handleViewDocument = async (doc: PoliceReportDocument) => {
    try {
      const { data } = await supabase.storage
        .from('user-documents')
        .createSignedUrl(doc.file_path, 3600);
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      } else {
        toast.error('Could not load document');
      }
    } catch {
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

  const filteredReports = reports.filter(report => {
    if (filterStatus !== 'all' && report.status !== filterStatus) return false;
    if (filterCity !== 'all' && report.applicationInfo?.city?.toLowerCase() !== filterCity) return false;
    return true;
  });

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(filteredReports, 10);

  const stats = {
    total: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    verified: reports.filter(r => r.status === 'verified').length,
    rejected: reports.filter(r => r.status === 'rejected').length,
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
                <p className="text-sm text-muted-foreground">Total Reports</p>
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
                <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Verified</p>
                <p className="text-2xl font-bold text-green-600">{stats.verified}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-destructive">{stats.rejected}</p>
              </div>
              <XCircle className="h-8 w-8 text-destructive opacity-80" />
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
                🇳🇬 Police Report Verification
              </CardTitle>
              <CardDescription>
                Review and verify police clearance certificates for Nigerian drivers
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
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchPoliceReports}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paginatedItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No police reports found</p>
              <p className="text-sm">Police report submissions will appear here</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {report.applicationInfo 
                                ? `${report.applicationInfo.first_name} ${report.applicationInfo.last_name}`
                                : report.driverInfo?.full_name || 'Unknown'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {report.applicationInfo?.email || report.driverInfo?.email || '-'}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {report.applicationInfo 
                              ? `+${report.applicationInfo.phone_country === 'ng' ? '234' : '1'} ${report.applicationInfo.phone_number}`
                              : report.driverInfo?.phone || '-'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span>{report.applicationInfo?.city || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[100px]" title={report.file_name}>
                            {report.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(report.status)}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(report.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleViewDocument(report)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openVerifyDialog(report)}
                          >
                            Review
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <DataPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Verify Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Review Police Report
            </DialogTitle>
            <DialogDescription>
              Verify or reject this police clearance certificate
            </DialogDescription>
          </DialogHeader>

          {selectedReport && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Driver</span>
                  <span className="font-medium">
                    {selectedReport.applicationInfo 
                      ? `${selectedReport.applicationInfo.first_name} ${selectedReport.applicationInfo.last_name}`
                      : selectedReport.driverInfo?.full_name || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">File</span>
                  <span className="font-medium text-sm">{selectedReport.file_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Submitted</span>
                  <span className="font-medium text-sm">
                    {format(new Date(selectedReport.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => handleViewDocument(selectedReport)}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Document
              </Button>

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
                  placeholder="Provide a reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={() => handleVerifyDocument('rejected')}
              disabled={!rejectionReason.trim()}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              onClick={() => handleVerifyDocument('verified')}
              className="bg-green-600 hover:bg-green-700"
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

export default PoliceReportVerification;
