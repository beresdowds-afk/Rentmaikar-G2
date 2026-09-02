import React, { useState, useEffect } from 'react';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Plus,
  Search,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import SignaturePad from '@/components/legal/SignaturePad';
import LegalAgreementDocument from '@/components/legal/LegalAgreementDocument';
import { SplitPane } from '@/components/ui/split-pane';
import { Checkbox } from '@/components/ui/checkbox';
import { useAgreementTemplate } from '@/hooks/useAgreementTemplate';
import { buildAgreementValues, renderAgreementTemplate } from '@/lib/agreement-template';

const PAGE_SIZE = 10;

interface Agreement {
  id: string;
  driver_id: string;
  owner_id: string;
  vehicle_id: string | null;
  status: string;
  driver_signature: string | null;
  owner_signature: string | null;
  admin_witness_signature: string | null;
  driver_signed_at: string | null;
  owner_signed_at: string | null;
  admin_witnessed_at: string | null;
  created_at: string;
  email_sent_at: string | null;
  driver_profile?: { full_name: string; email: string };
  owner_profile?: { full_name: string; email: string };
  vehicle?: { make: string; model: string; year: number; license_plate: string; vin: string | null };
}

interface Profile {
  user_id: string;
  full_name: string;
  email: string;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vin: string | null;
  owner_id: string;
}

const LegalAgreementsManagement: React.FC = () => {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [owners, setOwners] = useState<Profile[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // New agreement form state
  const [showNewAgreementDialog, setShowNewAgreementDialog] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { template, entity, region } = useAgreementTemplate();
  
  // View agreement state
  const [viewAgreement, setViewAgreement] = useState<Agreement | null>(null);
  const [isWitnessing, setIsWitnessing] = useState(false);
  const [witnessSignature, setWitnessSignature] = useState<string | null>(null);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<null | 'resend' | 'clear'>(null);
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch agreements
      const { data: agreementsData, error: agreementsError } = await supabase
        .from('legal_agreements')
        .select('*')
        .order('created_at', { ascending: false });

      if (agreementsError) throw agreementsError;

      // Fetch profiles for drivers and owners
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name, email');

      // Fetch user roles to identify drivers and owners
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const driverIds = rolesData?.filter(r => r.role === 'driver').map(r => r.user_id) || [];
      const ownerIds = rolesData?.filter(r => r.role === 'owner').map(r => r.user_id) || [];

      setDrivers(profilesData?.filter(p => driverIds.includes(p.user_id)) || []);
      setOwners(profilesData?.filter(p => ownerIds.includes(p.user_id)) || []);

      // Fetch vehicles
      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select('*');

      setVehicles(vehiclesData || []);

      // Enrich agreements with profile and vehicle data
      const enrichedAgreements = agreementsData?.map(agreement => {
        const driverProfile = profilesData?.find(p => p.user_id === agreement.driver_id);
        const ownerProfile = profilesData?.find(p => p.user_id === agreement.owner_id);
        const vehicle = vehiclesData?.find(v => v.id === agreement.vehicle_id);

        return {
          ...agreement,
          driver_profile: driverProfile ? { full_name: driverProfile.full_name || 'Unknown', email: driverProfile.email || '' } : undefined,
          owner_profile: ownerProfile ? { full_name: ownerProfile.full_name || 'Unknown', email: ownerProfile.email || '' } : undefined,
          vehicle: vehicle || undefined,
        };
      }) || [];

      setAgreements(enrichedAgreements);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load agreements');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgreement = async () => {
    if (!selectedDriver || !selectedOwner || !selectedVehicle || !adminSignature) {
      toast.error('Please fill all fields and provide your witness signature');
      return;
    }

    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const driver = drivers.find(d => d.user_id === selectedDriver);
      const owner = owners.find(o => o.user_id === selectedOwner);
      const vehicle = vehicles.find(v => v.id === selectedVehicle);

      if (!template) {
        toast.error('No active agreement template is published for this region.');
        setIsCreating(false);
        return;
      }

      // Body comes from the template published in the agreement editor.
      const agreementContent = renderAgreementTemplate(
        template.content,
        buildAgreementValues({
          driver: { name: driver?.full_name, email: driver?.email },
          owner: { name: owner?.full_name, email: owner?.email },
          vehicle: {
            make: vehicle?.make,
            model: vehicle?.model,
            year: vehicle?.year,
            licensePlate: vehicle?.license_plate,
            vin: vehicle?.vin,
          },
          region,
          supportEmail: entity?.email ?? undefined,
          supportPhone: entity?.phone ?? undefined,
          platformEntity: entity?.name,
        }),
      );

      const { error } = await supabase
        .from('legal_agreements')
        .insert({
          driver_id: selectedDriver,
          owner_id: selectedOwner,
          vehicle_id: selectedVehicle,
          agreement_content: agreementContent,
          admin_witness_signature: adminSignature,
          admin_witnessed_at: new Date().toISOString(),
          admin_witness_id: user.id,
          status: 'pending_signatures',
        });

      if (error) throw error;

      toast.success('Agreement created successfully. Awaiting signatures from driver and owner.');
      setShowNewAgreementDialog(false);
      setSelectedDriver('');
      setSelectedOwner('');
      setSelectedVehicle('');
      setAdminSignature(null);
      fetchData();
    } catch (error) {
      console.error('Error creating agreement:', error);
      toast.error('Failed to create agreement');
    } finally {
      setIsCreating(false);
    }
  };

  const handleWitnessAgreement = async (agreementId: string) => {
    if (!witnessSignature) {
      toast.error('Please provide your witness signature');
      return;
    }

    setIsWitnessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const agreement = agreements.find(a => a.id === agreementId);
      const willBeComplete = agreement?.driver_signature && agreement?.owner_signature;

      const updates: Record<string, unknown> = {
        admin_witness_signature: witnessSignature,
        admin_witnessed_at: new Date().toISOString(),
        admin_witness_id: user.id,
      };

      if (willBeComplete) {
        updates.status = 'completed';
      }

      const { error } = await supabase
        .from('legal_agreements')
        .update(updates)
        .eq('id', agreementId);

      if (error) throw error;

      // Send email if completed
      if (willBeComplete && agreement) {
        try {
          await supabase.functions.invoke('send-agreement-email', {
            body: {
              agreementId,
              driverEmail: agreement.driver_profile?.email,
              driverName: agreement.driver_profile?.full_name,
              ownerEmail: agreement.owner_profile?.email,
              ownerName: agreement.owner_profile?.full_name,
              vehicleInfo: agreement.vehicle 
                ? `${agreement.vehicle.year} ${agreement.vehicle.make} ${agreement.vehicle.model}`
                : 'Vehicle',
            },
          });
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
        }
      }

      toast.success(willBeComplete 
        ? 'Agreement completed and emails sent to both parties!'
        : 'Witness signature recorded');
      setViewAgreement(null);
      setWitnessSignature(null);
      fetchData();
    } catch (error) {
      console.error('Error witnessing agreement:', error);
      toast.error('Failed to witness agreement');
    } finally {
      setIsWitnessing(false);
    }
  };

  const getStatusBadge = (status: string, agreement: Agreement) => {
    if (status === 'completed') {
      return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
    }
    
    const pendingSignatures = [];
    if (!agreement.driver_signature) pendingSignatures.push('Driver');
    if (!agreement.owner_signature) pendingSignatures.push('Owner');
    if (!agreement.admin_witness_signature) pendingSignatures.push('Admin');
    
    if (pendingSignatures.length > 0) {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-600">
          <Clock className="h-3 w-3 mr-1" />
          Pending: {pendingSignatures.join(', ')}
        </Badge>
      );
    }
    
    return <Badge variant="secondary">{status}</Badge>;
  };

  const filteredAgreements = agreements.filter(agreement => {
    const matchesSearch = 
      agreement.driver_profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agreement.owner_profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agreement.vehicle?.license_plate?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || agreement.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAgreements.length / PAGE_SIZE));
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  const pagedAgreements = filteredAgreements.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const selectedAgreements = filteredAgreements.filter((a) => selectedBulkIds.has(a.id));

  const runBulkResend = async () => {
    const completed = selectedAgreements.filter((a) => a.status === 'completed');
    if (completed.length === 0) {
      toast.error('Only completed agreements can be re-sent');
      return;
    }
    setIsBulkRunning(true);
    toast.loading(`Re-sending ${completed.length} agreement(s)...`, { id: 'bulk-resend' });
    let ok = 0;
    for (const a of completed) {
      try {
        await supabase.functions.invoke('send-agreement-email', {
          body: {
            agreementId: a.id,
            driverEmail: a.driver_profile?.email,
            driverName: a.driver_profile?.full_name,
            ownerEmail: a.owner_profile?.email,
            ownerName: a.owner_profile?.full_name,
            vehicleInfo: a.vehicle
              ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}`
              : 'Vehicle',
          },
        });
        ok += 1;
      } catch (err) {
        console.error('Resend failed for', a.id, err);
      }
    }
    setIsBulkRunning(false);
    toast.success(`Re-sent ${ok} of ${completed.length} agreement(s)`, { id: 'bulk-resend' });
  };

  const ownerVehicles = vehicles.filter(v => v.owner_id === selectedOwner);





  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Legal Agreements
            </CardTitle>
            <CardDescription>
              Manage and witness rental agreements between drivers and owners
            </CardDescription>
          </div>
          <Dialog open={showNewAgreementDialog} onOpenChange={setShowNewAgreementDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Agreement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Rental Agreement</DialogTitle>
                <DialogDescription>
                  Select the parties and vehicle for this agreement. You will witness the agreement as an administrator.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Owner</label>
                    <Select value={selectedOwner} onValueChange={(v) => { setSelectedOwner(v); setSelectedVehicle(''); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {owners.filter(owner => owner.user_id).map(owner => (
                          <SelectItem key={owner.user_id} value={owner.user_id}>
                            {owner.full_name || owner.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Driver</label>
                    <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.filter(driver => driver.user_id).map(driver => (
                          <SelectItem key={driver.user_id} value={driver.user_id}>
                            {driver.full_name || driver.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Vehicle</label>
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle} disabled={!selectedOwner}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedOwner ? "Choose a vehicle" : "Select owner first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {ownerVehicles.filter(vehicle => vehicle.id).map(vehicle => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Live Draft Preview */}
                {(() => {
                  const driver = drivers.find(d => d.user_id === selectedDriver);
                  const owner = owners.find(o => o.user_id === selectedOwner);
                  const vehicle = vehicles.find(v => v.id === selectedVehicle);
                  if (!driver || !owner || !vehicle) return null;
                  return (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Live Draft Preview</label>
                      <div className="h-[420px] overflow-auto rounded-md border bg-muted/30">
                        <div className="scale-[0.78] origin-top-left w-[128%]">
                          <LegalAgreementDocument
                            driver={{ name: driver.full_name || driver.email || 'Driver', email: driver.email || '' }}
                            owner={{ name: owner.full_name || owner.email || 'Owner', email: owner.email || '' }}
                            vehicle={{
                              make: vehicle.make,
                              model: vehicle.model,
                              year: vehicle.year,
                              licensePlate: vehicle.license_plate,
                              vin: vehicle.vin || undefined,
                            }}
                            adminWitnessSignature={adminSignature}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Administrator Witness Signature</label>
                  <SignaturePad onSignatureChange={setAdminSignature} />
                </div>


                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowNewAgreementDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateAgreement} disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Create & Witness
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or license plate..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_signatures">Pending Signatures</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Agreements Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAgreements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No agreements found</p>
          </div>
        ) : (
          <>
            {/* Table view — mobile / laptop */}
            <div className="xl:hidden">
              {selectedBulkIds.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
                  <span>{selectedBulkIds.size} selected (persists across pages)</span>
                  <div className="flex items-center gap-2">
                    {selectedBulkIds.size < filteredAgreements.length && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelectedBulkIds(new Set(filteredAgreements.map((a) => a.id)))
                        }
                      >
                        Select all {filteredAgreements.length} matching
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmAction('clear')}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all on this page"
                        checked={
                          pagedAgreements.length > 0 &&
                          pagedAgreements.every((a) => selectedBulkIds.has(a.id))
                        }
                        onCheckedChange={(v) => {
                          setSelectedBulkIds((prev) => {
                            const next = new Set(prev);
                            if (v) pagedAgreements.forEach((a) => next.add(a.id));
                            else pagedAgreements.forEach((a) => next.delete(a.id));
                            return next;
                          });
                        }}
                      />
                    </TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedAgreements.map((agreement) => (
                    <TableRow key={agreement.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select agreement ${agreement.id}`}
                          checked={selectedBulkIds.has(agreement.id)}
                          onCheckedChange={(v) => {
                            setSelectedBulkIds((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(agreement.id);
                              else next.delete(agreement.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{agreement.driver_profile?.full_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{agreement.driver_profile?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{agreement.owner_profile?.full_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{agreement.owner_profile?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {agreement.vehicle ? (
                          <div>
                            <p className="font-medium">{agreement.vehicle.year} {agreement.vehicle.make} {agreement.vehicle.model}</p>
                            <p className="text-sm text-muted-foreground">{agreement.vehicle.license_plate}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No vehicle</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(agreement.status, agreement)}</TableCell>
                      <TableCell>{format(new Date(agreement.created_at), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewAgreement(agreement)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Split-pane list + detail on xl+ */}
            <div className="hidden xl:block">
              {(() => {
                const selectedAgreement =
                  filteredAgreements.find((a) => a.id === selectedAgreementId) ?? null;
                const selectedCount = selectedBulkIds.size;
                const hasSelection = selectedCount > 0;
                const allOnPageSelected =
                  pagedAgreements.length > 0 &&
                  pagedAgreements.every((a) => selectedBulkIds.has(a.id));
                const allMatchingSelected =
                  filteredAgreements.length > 0 &&
                  selectedCount >= filteredAgreements.length;

                const handleBulkExport = () => {
                  if (selectedAgreements.length === 0) return;
                  const rows = [
                    ['ID', 'Driver', 'Driver Email', 'Owner', 'Owner Email', 'Vehicle', 'Status', 'Created'],
                    ...selectedAgreements.map((a) => [
                      a.id,
                      a.driver_profile?.full_name ?? '',
                      a.driver_profile?.email ?? '',
                      a.owner_profile?.full_name ?? '',
                      a.owner_profile?.email ?? '',
                      a.vehicle ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}` : '',
                      a.status,
                      format(new Date(a.created_at), 'yyyy-MM-dd'),
                    ]),
                  ];
                  const csv = rows
                    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
                    .join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `legal-agreements-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                  toast.success(`Exported ${selectedAgreements.length} agreement(s)`);
                };

                const bulkBar = (
                  <div
                    className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      hasSelection ? 'border-primary/40 bg-primary/10' : 'border-dashed bg-muted/40'
                    }`}
                    role="toolbar"
                    aria-label="Bulk actions"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Checkbox
                        aria-label={allOnPageSelected ? 'Unselect page' : 'Select current page'}
                        checked={allOnPageSelected}
                        onCheckedChange={(v) => {
                          setSelectedBulkIds((prev) => {
                            const next = new Set(prev);
                            if (v) pagedAgreements.forEach((a) => next.add(a.id));
                            else pagedAgreements.forEach((a) => next.delete(a.id));
                            return next;
                          });
                        }}
                      />
                      <span className={hasSelection ? 'font-medium' : 'text-muted-foreground'}>
                        {hasSelection
                          ? `${selectedCount} of ${filteredAgreements.length} selected · persists across pages`
                          : `Select agreements to enable bulk actions (${filteredAgreements.length} matching)`}
                      </span>
                      {hasSelection && !allMatchingSelected && (
                        <Button
                          size="sm"
                          variant="link"
                          className="h-auto p-0"
                          onClick={() =>
                            setSelectedBulkIds(new Set(filteredAgreements.map((a) => a.id)))
                          }
                        >
                          Select all {filteredAgreements.length} matching results
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!hasSelection || isBulkRunning}
                        onClick={() => setConfirmAction('resend')}
                        title={hasSelection ? 'Re-send completed agreement emails' : 'Select rows first'}
                      >
                        <Send className="h-4 w-4 mr-1" /> Resend emails
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!hasSelection}
                        onClick={handleBulkExport}
                        title={hasSelection ? 'Export selected as CSV' : 'Select rows first'}
                      >
                        <Download className="h-4 w-4 mr-1" /> Export CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!hasSelection}
                        onClick={() => setConfirmAction('clear')}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                );


                const list = (
                  <div className="space-y-2">
                    {pagedAgreements.map((agreement) => {
                      const isSelected = selectedAgreementId === agreement.id;
                      return (
                        <div
                          key={agreement.id}
                          className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${
                            isSelected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:bg-accent/40'
                          }`}
                        >
                          <Checkbox
                            aria-label={`Select ${agreement.id}`}
                            checked={selectedBulkIds.has(agreement.id)}
                            onCheckedChange={(v) => {
                              setSelectedBulkIds((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(agreement.id);
                                else next.delete(agreement.id);
                                return next;
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedAgreementId(agreement.id)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">
                                {agreement.driver_profile?.full_name || 'Unknown driver'}
                              </p>
                              {getStatusBadge(agreement.status, agreement)}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              Owner: {agreement.owner_profile?.full_name || 'Unknown'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {agreement.vehicle
                                ? `${agreement.vehicle.year} ${agreement.vehicle.make} ${agreement.vehicle.model}`
                                : 'No vehicle'} · {format(new Date(agreement.created_at), 'MMM dd, yyyy')}
                            </p>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );

                const detail = selectedAgreement && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm text-muted-foreground">Agreement</p>
                        <p className="font-semibold">
                          {selectedAgreement.driver_profile?.full_name || 'Unknown'} ↔{' '}
                          {selectedAgreement.owner_profile?.full_name || 'Unknown'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewAgreement(selectedAgreement)}
                      >
                        <Eye className="h-4 w-4 mr-1" /> Open full view
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase">Status</p>
                        <div className="mt-1">
                          {getStatusBadge(selectedAgreement.status, selectedAgreement)}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase">Created</p>
                        <p className="mt-1">
                          {format(new Date(selectedAgreement.created_at), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground uppercase">Vehicle</p>
                        <p className="mt-1">
                          {selectedAgreement.vehicle
                            ? `${selectedAgreement.vehicle.year} ${selectedAgreement.vehicle.make} ${selectedAgreement.vehicle.model} (${selectedAgreement.vehicle.license_plate})`
                            : 'No vehicle attached'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase">Driver signed</p>
                        <p className="mt-1">
                          {selectedAgreement.driver_signed_at
                            ? format(new Date(selectedAgreement.driver_signed_at), 'MMM dd, yyyy HH:mm')
                            : 'Pending'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase">Owner signed</p>
                        <p className="mt-1">
                          {selectedAgreement.owner_signed_at
                            ? format(new Date(selectedAgreement.owner_signed_at), 'MMM dd, yyyy HH:mm')
                            : 'Pending'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground uppercase">Admin witnessed</p>
                        <p className="mt-1">
                          {selectedAgreement.admin_witnessed_at
                            ? format(new Date(selectedAgreement.admin_witnessed_at), 'MMM dd, yyyy HH:mm')
                            : 'Not yet witnessed'}
                        </p>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <>
                    {bulkBar}
                    <SplitPane
                      list={list}
                      detail={detail}
                      hasSelection={!!selectedAgreement}
                      emptyState={
                        <div className="text-center text-sm text-muted-foreground py-16">
                          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                          {hasSelection ? (
                            <>
                              <p className="font-medium text-foreground">
                                {selectedCount} agreement{selectedCount === 1 ? '' : 's'} selected for bulk actions
                              </p>
                              <p className="mt-1">Click a row's name to preview signatures and status.</p>
                            </>
                          ) : (
                            'Select an agreement to preview signatures and status.'
                          )}
                        </div>
                      }
                    />
                  </>
                );
              })()}
            </div>

            {/* Pagination controls (shared) */}
            {filteredAgreements.length > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, filteredAgreements.length)} of{' '}
                  {filteredAgreements.length}
                  {selectedBulkIds.size > 0 && ` · ${selectedBulkIds.size} selected across pages`}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Bulk action confirmation */}
        <AlertDialog
          open={confirmAction !== null}
          onOpenChange={(open) => !open && setConfirmAction(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction === 'resend'
                  ? `Re-send ${selectedAgreements.filter((a) => a.status === 'completed').length} agreement email(s)?`
                  : 'Clear current selection?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction === 'resend' ? (
                  <>
                    This will re-send completed agreement emails to both driver and owner for each
                    selected row. Non-completed agreements in the selection will be skipped.
                  </>
                ) : (
                  <>
                    You have {selectedBulkIds.size} agreement(s) selected across pages. Clearing will
                    remove all of them from your selection.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBulkRunning}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isBulkRunning}
                onClick={async (e) => {
                  e.preventDefault();
                  if (confirmAction === 'resend') {
                    await runBulkResend();
                  } else if (confirmAction === 'clear') {
                    setSelectedBulkIds(new Set());
                  }
                  setConfirmAction(null);
                }}
              >
                {confirmAction === 'resend' ? 'Re-send emails' : 'Clear selection'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        {/* View Agreement Dialog */}
        <Dialog open={!!viewAgreement} onOpenChange={(open) => !open && setViewAgreement(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Agreement Details</DialogTitle>
              <DialogDescription>
                Review the agreement and signatures
              </DialogDescription>
            </DialogHeader>
            
            {viewAgreement && (
              <>
                <ScrollArea className="flex-1 pr-4">
                  <LegalAgreementDocument
                    driver={{
                      name: viewAgreement.driver_profile?.full_name || 'Unknown',
                      email: viewAgreement.driver_profile?.email || '',
                    }}
                    owner={{
                      name: viewAgreement.owner_profile?.full_name || 'Unknown',
                      email: viewAgreement.owner_profile?.email || '',
                    }}
                    vehicle={{
                      make: viewAgreement.vehicle?.make || 'Unknown',
                      model: viewAgreement.vehicle?.model || '',
                      year: viewAgreement.vehicle?.year || 0,
                      licensePlate: viewAgreement.vehicle?.license_plate || '',
                      vin: viewAgreement.vehicle?.vin || undefined,
                    }}
                    agreementDate={new Date(viewAgreement.created_at)}
                    driverSignature={viewAgreement.driver_signature}
                    ownerSignature={viewAgreement.owner_signature}
                    adminWitnessSignature={viewAgreement.admin_witness_signature}
                    driverSignedAt={viewAgreement.driver_signed_at ? new Date(viewAgreement.driver_signed_at) : null}
                    ownerSignedAt={viewAgreement.owner_signed_at ? new Date(viewAgreement.owner_signed_at) : null}
                    adminWitnessedAt={viewAgreement.admin_witnessed_at ? new Date(viewAgreement.admin_witnessed_at) : null}
                  />
                </ScrollArea>

                {/* Admin can witness if not yet witnessed but both parties have signed */}
                {!viewAgreement.admin_witness_signature && 
                 viewAgreement.driver_signature && 
                 viewAgreement.owner_signature && (
                  <div className="border-t pt-4 mt-4 space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Add Your Witness Signature</h3>
                      <SignaturePad onSignatureChange={setWitnessSignature} />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        onClick={() => handleWitnessAgreement(viewAgreement.id)}
                        disabled={!witnessSignature || isWitnessing}
                      >
                        {isWitnessing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Witnessing...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Witness & Complete
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default LegalAgreementsManagement;
