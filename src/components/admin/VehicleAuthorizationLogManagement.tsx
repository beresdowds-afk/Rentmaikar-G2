import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ShieldCheck,
  ShieldAlert,
  Car,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Download,
  Copy,
  ExternalLink,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Undo2,
  FileCheck,
  Printer,
  KeyRound,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  getVehicleAuthorizations,
  cancelVehicleAuthorization,
  type VehicleRentalAuthorization,
  type AuthorizationStatus,
} from '@/services/vehicleAuthorizationService';
import { useAuth } from '@/contexts/AuthContext';

export function VehicleAuthorizationLogManagement() {
  const { user, userRole } = useAuth();
  const [authorizations, setAuthorizations] = useState<VehicleRentalAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AuthorizationStatus | 'ALL'>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<VehicleRentalAuthorization | null>(null);
  const [isCertificateOpen, setIsCertificateOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'cancel' | 'reinstate'>('cancel');
  const [adminNote, setAdminNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getVehicleAuthorizations();
      setAuthorizations(data);
    } catch (err) {
      console.error('Failed to load authorizations:', err);
      toast.error('Could not load vehicle authorization database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('rentmaikar:vehicle_authorization_updated', handleUpdate);
    return () => {
      window.removeEventListener('rentmaikar:vehicle_authorization_updated', handleUpdate);
    };
  }, []);

  const filtered = useMemo(() => {
    return authorizations.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        item.id.toLowerCase().includes(q) ||
        item.vehicle_make.toLowerCase().includes(q) ||
        item.vehicle_model.toLowerCase().includes(q) ||
        item.license_plate.toLowerCase().includes(q) ||
        (item.vin && item.vin.toLowerCase().includes(q)) ||
        item.owner_name.toLowerCase().includes(q) ||
        item.owner_email.toLowerCase().includes(q) ||
        (item.cancellation_reason && item.cancellation_reason.toLowerCase().includes(q))
      );
    });
  }, [authorizations, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = authorizations.length;
    const active = authorizations.filter((a) => a.status === 'ACTIVE').length;
    const cancelled = authorizations.filter((a) => a.status === 'CANCELLED').length;
    const inPool = authorizations.filter((a) => a.matching_status === 'matching_pool_active').length;
    const complianceRate = total > 0 ? Math.round(((total - 0) / total) * 100) : 100;

    return { total, active, cancelled, inPool, complianceRate };
  }, [authorizations]);

  const copyToClipboard = (text: string, label = 'Copied') => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const handleAdminCancel = async () => {
    if (!selectedRecord) return;
    setIsSubmitting(true);
    try {
      const res = await cancelVehicleAuthorization({
        authorizationId: selectedRecord.id,
        vehicleId: selectedRecord.vehicle_id,
        cancelledByUserId: user?.id || 'admin-user',
        cancelledByName: user?.user_metadata?.full_name || 'Admin / Assistant',
        cancelledByRole: userRole || 'admin',
        reason: `Admin Action: ${adminNote.trim() || 'Revoked via Admin Authorization Desk'}`,
      });

      if (res.success) {
        toast.success('Authorization cancelled and vehicle unpublished from Catalogue.');
        setIsActionModalOpen(false);
        setAdminNote('');
        loadData();
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportCSV = () => {
    if (authorizations.length === 0) {
      toast.info('No authorization data to export.');
      return;
    }
    const headers = [
      'Authorization ID',
      'Status',
      'Vehicle Year',
      'Make',
      'Model',
      'License Plate',
      'VIN',
      'Owner Name',
      'Owner Email',
      'Authorized At',
      'Matching Status',
      'Cancelled At',
      'Cancellation Reason',
    ];

    const rows = authorizations.map((a) => [
      a.id,
      a.status,
      a.vehicle_year,
      `"${a.vehicle_make}"`,
      `"${a.vehicle_model}"`,
      `"${a.license_plate}"`,
      `"${a.vin || ''}"`,
      `"${a.owner_name}"`,
      `"${a.owner_email}"`,
      `"${a.authorized_at}"`,
      `"${a.matching_status}"`,
      `"${a.cancelled_at || ''}"`,
      `"${(a.cancellation_reason || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rentmaikar_vehicle_authorizations_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Authorization database exported to CSV.');
  };

  return (
    <div className="space-y-6">
      {/* Header & Overview */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Rentmaikar-Owner Vehicle Rental Authorization Log
          </h2>
          <p className="text-sm text-muted-foreground">
            Central compliance database and retrievable authorization audit log across all listed fleet vehicles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Log
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Export Audit CSV
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Registered Authorizations</CardDescription>
            <CardTitle className="text-2xl font-bold">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex items-center gap-1">
            <FileCheck className="h-3.5 w-3.5 text-primary" />
            All logged owner grants
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Active in Catalogue</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">{stats.active}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Publicly rentable listings
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Driver Matching Pool</CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600">{stats.inPool}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-blue-600" />
            Vetted driver pool enabled
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Logged Cancellations</CardDescription>
            <CardTitle className="text-2xl font-bold text-destructive">{stats.cancelled}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
            Revocations &amp; mistake undos
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Vehicle Make, Model, Plate, VIN, Owner Name/Email, or Auth Ref ID..."
                className="pl-9 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-[180px] text-sm">
                  <SelectValue placeholder="Status Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses ({authorizations.length})</SelectItem>
                  <SelectItem value="ACTIVE">Active in Catalogue ({stats.active})</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled / Revoked ({stats.cancelled})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table of Authorizations */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold text-xs">Auth Ref</TableHead>
                  <TableHead className="font-semibold text-xs">Vehicle</TableHead>
                  <TableHead className="font-semibold text-xs">Owner Details</TableHead>
                  <TableHead className="font-semibold text-xs">Authorization Date</TableHead>
                  <TableHead className="font-semibold text-xs">Status</TableHead>
                  <TableHead className="font-semibold text-xs">Driver Pool Match</TableHead>
                  <TableHead className="font-semibold text-xs">Cancellation Info</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                      Loading authorization database records...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No authorization records matching your filter criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((record) => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    const cancelLink = `${origin}/cancel-authorization/${record.cancellation_token}`;
                    return (
                      <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs font-bold text-foreground">
                          <button
                            type="button"
                            className="hover:underline text-primary text-left"
                            onClick={() => {
                              setSelectedRecord(record);
                              setIsCertificateOpen(true);
                            }}
                          >
                            {record.id}
                          </button>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            {record.photo_urls?.[0] ? (
                              <img
                                src={record.photo_urls[0]}
                                alt="Vehicle"
                                className="w-11 h-9 rounded object-cover border bg-muted shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-9 rounded bg-muted border flex items-center justify-center text-muted-foreground shrink-0">
                                <Car className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-xs text-foreground">
                                {record.vehicle_year} {record.vehicle_make} {record.vehicle_model}
                              </p>
                              <p className="text-[11px] font-mono text-muted-foreground">
                                {record.license_plate}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div>
                            <p className="font-medium text-xs text-foreground">{record.owner_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                              {record.owner_email}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex flex-col">
                            <span>{format(new Date(record.authorized_at), 'MMM dd, yyyy')}</span>
                            <span className="text-[10px] opacity-75">{format(new Date(record.authorized_at), 'hh:mm a')}</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          {record.status === 'ACTIVE' ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Active (In Catalogue)
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[11px] gap-1">
                              <ShieldAlert className="w-3 h-3" /> Cancelled / Revoked
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal gap-1">
                            <Users className="w-3 h-3 text-blue-500" />
                            {record.matching_status === 'matching_pool_active'
                              ? 'Verified Pool Active'
                              : record.matching_status === 'driver_matched'
                              ? 'Driver Matched'
                              : 'Unlisted'}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-xs">
                          {record.status === 'CANCELLED' ? (
                            <div className="space-y-0.5 max-w-[160px]">
                              <p className="font-medium text-destructive text-[11px] truncate">
                                {record.cancellation_reason || 'Mistake / Error'}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {record.cancelled_at ? format(new Date(record.cancelled_at), 'MMM d, p') : ''}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View Full Authorization Certificate & Audit Trail"
                              onClick={() => {
                                setSelectedRecord(record);
                                setIsCertificateOpen(true);
                              }}
                              className="h-7 px-2 text-xs gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              title="Copy Cancellation Link"
                              onClick={() => copyToClipboard(cancelLink, 'Cancellation link')}
                              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Link
                            </Button>

                            {record.status === 'ACTIVE' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Admin Revoke Authorization"
                                onClick={() => {
                                  setSelectedRecord(record);
                                  setActionType('cancel');
                                  setIsActionModalOpen(true);
                                }}
                                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DETAILED CERTIFICATE & AUDIT TRAIL MODAL */}
      {selectedRecord && (
        <Dialog open={isCertificateOpen} onOpenChange={setIsCertificateOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="font-mono text-xs text-primary font-bold">
                  {selectedRecord.id}
                </Badge>
                {selectedRecord.status === 'ACTIVE' ? (
                  <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                    <CheckCircle2 className="w-3 h-3" /> Legally Active Authorization
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <ShieldAlert className="w-3 h-3" /> Cancelled Authorization
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl font-bold pt-1 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-primary" />
                Rentmaikar-Owner Vehicle Rental Authorization Certificate
              </DialogTitle>
              <DialogDescription className="text-xs">
                Official binding authorization log recorded and retrievable for compliance audits.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Vehicle & Owner Dossier */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted/40 rounded-xl p-3.5 border space-y-2 text-xs">
                  <h4 className="font-bold text-foreground flex items-center gap-1.5">
                    <Car className="h-4 w-4 text-primary" />
                    Vehicle Specifications
                  </h4>
                  <div className="space-y-1 text-muted-foreground">
                    <p><span className="font-medium text-foreground">Vehicle:</span> {selectedRecord.vehicle_year} {selectedRecord.vehicle_make} {selectedRecord.vehicle_model}</p>
                    <p><span className="font-medium text-foreground">License Plate:</span> <span className="font-mono">{selectedRecord.license_plate}</span></p>
                    <p><span className="font-medium text-foreground">VIN:</span> <span className="font-mono">{selectedRecord.vin || 'On File'}</span></p>
                    <p><span className="font-medium text-foreground">Pickup Hub:</span> {selectedRecord.pickup_city || 'Washington DC Region'}</p>
                    <p><span className="font-medium text-foreground">Photos Attached:</span> {selectedRecord.photo_urls?.length || 0} image(s)</p>
                  </div>
                </div>

                <div className="bg-muted/40 rounded-xl p-3.5 border space-y-2 text-xs">
                  <h4 className="font-bold text-foreground flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-primary" />
                    Authorized Owner / Host
                  </h4>
                  <div className="space-y-1 text-muted-foreground">
                    <p><span className="font-medium text-foreground">Owner Name:</span> {selectedRecord.owner_name}</p>
                    <p><span className="font-medium text-foreground">Owner Email:</span> {selectedRecord.owner_email}</p>
                    <p><span className="font-medium text-foreground">Owner ID:</span> <span className="font-mono text-[10px]">{selectedRecord.owner_id}</span></p>
                    <p><span className="font-medium text-foreground">Authorized Timestamp:</span> {format(new Date(selectedRecord.authorized_at), 'PPP p')}</p>
                    <p><span className="font-medium text-foreground">Terms Version:</span> {selectedRecord.terms_version}</p>
                  </div>
                </div>
              </div>

              {/* Exact Legally Binding Terms Statement */}
              <div className="border rounded-xl p-4 bg-primary/5 border-primary/20 space-y-2">
                <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Granted Authorization Terms &amp; Commitments
                </h5>
                <p className="text-xs leading-relaxed text-foreground bg-background p-3 rounded-lg border font-medium">
                  "{selectedRecord.authorization_text}"
                </p>
              </div>

              {/* Cancellation Details if Cancelled */}
              {selectedRecord.status === 'CANCELLED' && (
                <div className="border border-destructive/30 rounded-xl p-4 bg-destructive/5 space-y-2">
                  <h5 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                    <Undo2 className="h-4 w-4" />
                    Cancellation &amp; Revocation Record
                  </h5>
                  <div className="text-xs space-y-1 text-muted-foreground bg-background p-3 rounded-lg border border-destructive/20">
                    <p><span className="font-medium text-foreground">Cancelled At:</span> {selectedRecord.cancelled_at ? format(new Date(selectedRecord.cancelled_at), 'PPP p') : 'Logged'}</p>
                    <p><span className="font-medium text-foreground">Logged Reason:</span> <span className="text-destructive font-medium">{selectedRecord.cancellation_reason}</span></p>
                    <p><span className="font-medium text-foreground">Cancelled By User ID:</span> <span className="font-mono text-[10px]">{selectedRecord.cancelled_by || 'Owner Action'}</span></p>
                  </div>
                </div>
              )}

              {/* Chronological Audit Trail Log */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  Chronological Compliance Audit Trail ({selectedRecord.audit_trail?.length || 0} Events)
                </h5>
                <div className="border rounded-xl divide-y max-h-[180px] overflow-y-auto bg-muted/20">
                  {selectedRecord.audit_trail?.map((event) => (
                    <div key={event.id} className="p-2.5 text-xs flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono uppercase">
                            {event.action}
                          </Badge>
                          <span className="font-medium text-foreground text-[11px]">
                            {event.performed_by_name || 'Authorized Actor'} ({event.performed_by_role || 'user'})
                          </span>
                        </div>
                        <p className="text-muted-foreground text-[11px] pt-0.5">{event.notes}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.print();
                }}
                className="gap-1 text-xs"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Certificate
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsCertificateOpen(false)}>
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ADMIN REVOKE ACTION MODAL */}
      {selectedRecord && (
        <Dialog open={isActionModalOpen} onOpenChange={setIsActionModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5" />
                Administrative Authorization Revocation
              </DialogTitle>
              <DialogDescription className="text-xs">
                Revoke rental authorization and unpublish <strong>{selectedRecord.vehicle_year} {selectedRecord.vehicle_make} {selectedRecord.vehicle_model} ({selectedRecord.license_plate})</strong> from Catalogue.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <label className="text-xs font-semibold text-foreground">Admin Compliance Reason / Notes:</label>
              <textarea
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary min-h-[80px]"
                placeholder="Reason for administrative unlisting / revocation..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setIsActionModalOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleAdminCancel}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                <Undo2 className="h-4 w-4" />
                Confirm Revocation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default VehicleAuthorizationLogManagement;
