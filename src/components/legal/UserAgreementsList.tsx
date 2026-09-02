import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileText, Download, Eye, PenTool, CheckCircle, CalendarClock } from 'lucide-react';

const renewalDaysLeft = (expiresAt: string) =>
  Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import LegalAgreementDocument from './LegalAgreementDocument';
import SignaturePad from './SignaturePad';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface AgreementWithDetails {
  id: string;
  driver_id: string;
  owner_id: string;
  vehicle_id: string;
  driver_signature: string | null;
  owner_signature: string | null;
  admin_witness_signature: string | null;
  driver_signed_at: string | null;
  owner_signed_at: string | null;
  admin_witnessed_at: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  renewal_count: number | null;

  // Joined data
  driver_name: string;
  driver_email: string;
  owner_name: string;
  owner_email: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_plate: string;
  admin_witness_name: string | null;
}

interface UserAgreementsListProps {
  userType: 'driver' | 'owner';
}

export default function UserAgreementsList({ userType }: UserAgreementsListProps) {
  const { user } = useAuth();
  const [agreements, setAgreements] = useState<AgreementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgreement, setSelectedAgreement] = useState<AgreementWithDetails | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchAgreements();
  }, [user]);

  const fetchAgreements = async () => {
    if (!user) return;
    
    try {
      const column = userType === 'driver' ? 'driver_id' : 'owner_id';
      
      // Fetch agreements
      const { data: agreementsData, error: agreementsError } = await supabase
        .from('legal_agreements')
        .select('*')
        .eq(column, user.id)
        .order('created_at', { ascending: false });

      if (agreementsError) throw agreementsError;
      
      if (!agreementsData || agreementsData.length === 0) {
        setAgreements([]);
        setLoading(false);
        return;
      }

      // Fetch related data
      const driverIds = [...new Set(agreementsData.map(a => a.driver_id))];
      const ownerIds = [...new Set(agreementsData.map(a => a.owner_id))];
      const vehicleIds = [...new Set(agreementsData.map(a => a.vehicle_id))];
      const adminIds = [...new Set(agreementsData.map(a => a.admin_witness_id).filter(Boolean))];

      const [driversResult, ownersResult, vehiclesResult, adminsResult] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email').in('user_id', driverIds),
        supabase.from('profiles').select('user_id, full_name, email').in('user_id', ownerIds),
        supabase.from('vehicles').select('id, make, model, year, license_plate'),
        adminIds.length > 0 
          ? supabase.from('profiles').select('user_id, full_name').in('user_id', adminIds)
          : Promise.resolve({ data: [] })
      ]);

      const driversMap = new Map((driversResult.data || []).map(d => [d.user_id, d]));
      const ownersMap = new Map((ownersResult.data || []).map(o => [o.user_id, o]));
      const vehiclesMap = new Map((vehiclesResult.data || []).map(v => [v.id, v]));
      const adminsMap = new Map((adminsResult.data || []).map(a => [a.user_id, a]));

      const enrichedAgreements: AgreementWithDetails[] = agreementsData.map(agreement => {
        const driver = driversMap.get(agreement.driver_id);
        const owner = ownersMap.get(agreement.owner_id);
        const vehicle = vehiclesMap.get(agreement.vehicle_id);
        const admin = agreement.admin_witness_id ? adminsMap.get(agreement.admin_witness_id) : null;

        return {
          id: agreement.id,
          driver_id: agreement.driver_id,
          owner_id: agreement.owner_id,
          vehicle_id: agreement.vehicle_id,
          driver_signature: agreement.driver_signature,
          owner_signature: agreement.owner_signature,
          admin_witness_signature: agreement.admin_witness_signature,
          driver_signed_at: agreement.driver_signed_at,
          owner_signed_at: agreement.owner_signed_at,
          admin_witnessed_at: agreement.admin_witnessed_at,
          status: agreement.status,
          created_at: agreement.created_at,
          expires_at: (agreement as { expires_at?: string | null }).expires_at ?? null,
          renewal_count: (agreement as { renewal_count?: number | null }).renewal_count ?? null,

          driver_name: driver?.full_name || 'Unknown Driver',
          driver_email: driver?.email || '',
          owner_name: owner?.full_name || 'Unknown Owner',
          owner_email: owner?.email || '',
          vehicle_make: vehicle?.make || 'Unknown',
          vehicle_model: vehicle?.model || '',
          vehicle_year: vehicle?.year || 0,
          vehicle_plate: vehicle?.license_plate || '',
          admin_witness_name: admin?.full_name || null,
        };
      });

      setAgreements(enrichedAgreements);
    } catch (err) {
      console.error('Error fetching agreements:', err);
      toast.error('Failed to load agreements');
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!selectedAgreement || !signature) {
      toast.error('Please provide your signature');
      return;
    }

    setSigning(true);
    try {
      const { error } = await supabase.rpc('sign_legal_agreement', {
        _agreement_id: selectedAgreement.id,
        _signature: signature,
      });

      if (error) throw error;

      toast.success('Agreement signed successfully!');
      setSignDialogOpen(false);
      setSignature(null);
      fetchAgreements();
    } catch (err) {
      console.error('Error signing agreement:', err);
      toast.error('Failed to sign agreement');
    } finally {
      setSigning(false);
    }
  };

  const downloadPDF = async (agreement: AgreementWithDetails) => {
    setDownloading(true);
    try {
      // Create a temporary container for the document
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '800px';
      document.body.appendChild(container);

      // Render the document
      const { createRoot } = await import('react-dom/client');
      const root = createRoot(container);
      
      await new Promise<void>((resolve) => {
        root.render(
          <LegalAgreementDocument
            driver={{ name: agreement.driver_name, email: agreement.driver_email }}
            owner={{ name: agreement.owner_name, email: agreement.owner_email }}
            vehicle={{
              make: agreement.vehicle_make,
              model: agreement.vehicle_model,
              year: agreement.vehicle_year,
              licensePlate: agreement.vehicle_plate,
            }}
            agreementDate={new Date(agreement.created_at)}
            driverSignature={agreement.driver_signature}
            ownerSignature={agreement.owner_signature}
            adminWitnessSignature={agreement.admin_witness_signature}
            adminWitnessName={agreement.admin_witness_name || 'RentMaiKar Administrator'}
            driverSignedAt={agreement.driver_signed_at ? new Date(agreement.driver_signed_at) : null}
            ownerSignedAt={agreement.owner_signed_at ? new Date(agreement.owner_signed_at) : null}
            adminWitnessedAt={agreement.admin_witnessed_at ? new Date(agreement.admin_witnessed_at) : null}
          />
        );
        setTimeout(resolve, 500);
      });

      // Convert to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download
      const fileName = `RentMaiKar_Agreement_${agreement.vehicle_make}_${agreement.vehicle_model}_${format(new Date(agreement.created_at), 'yyyy-MM-dd')}.pdf`;
      pdf.save(fileName);

      // Cleanup
      root.unmount();
      document.body.removeChild(container);

      toast.success('Agreement downloaded successfully!');
    } catch (err) {
      console.error('Error downloading PDF:', err);
      toast.error('Failed to download agreement');
    } finally {
      setDownloading(false);
    }
  };

  const getStatusBadge = (agreement: AgreementWithDetails) => {
    const hasSigned = userType === 'driver' 
      ? agreement.driver_signature 
      : agreement.owner_signature;

    if (agreement.status === 'completed') {
      return <Badge className="bg-green-500">Completed</Badge>;
    }
    if (hasSigned) {
      return <Badge variant="secondary">You Signed</Badge>;
    }
    return <Badge variant="destructive">Pending Your Signature</Badge>;
  };

  const canSign = (agreement: AgreementWithDetails) => {
    const hasSigned = userType === 'driver' 
      ? agreement.driver_signature 
      : agreement.owner_signature;
    return !hasSigned && agreement.status !== 'completed';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Legal Agreements
          </CardTitle>
          <CardDescription>
            View and sign your rental agreements
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                No agreements found. Agreements will appear here once created by the admin.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {agreements.map((agreement) => (
                <div
                  key={agreement.id}
                  className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">
                        {agreement.vehicle_year} {agreement.vehicle_make} {agreement.vehicle_model}
                      </h4>
                      {getStatusBadge(agreement)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {userType === 'driver' 
                        ? `Owner: ${agreement.owner_name}` 
                        : `Driver: ${agreement.driver_name}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created: {format(new Date(agreement.created_at), 'MMM dd, yyyy')}
                      {agreement.renewal_count ? ` • Renewal #${agreement.renewal_count}` : ''}
                    </p>
                    {agreement.expires_at && agreement.status !== 'superseded' && (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${
                        renewalDaysLeft(agreement.expires_at) <= 3 ? 'text-destructive' : 'text-muted-foreground'
                      }`}>
                        <CalendarClock className="h-3 w-3" />
                        {renewalDaysLeft(agreement.expires_at) > 0
                          ? `Monthly renewal in ${renewalDaysLeft(agreement.expires_at)} day(s) — expires ${format(new Date(agreement.expires_at), 'MMM dd, yyyy')}`
                          : `Renewal due — expired ${format(new Date(agreement.expires_at), 'MMM dd, yyyy')}`}
                      </p>
                    )}

                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAgreement(agreement);
                        setViewDialogOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>

                    {canSign(agreement) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedAgreement(agreement);
                          setSignDialogOpen(true);
                        }}
                      >
                        <PenTool className="h-4 w-4 mr-1" />
                        Sign
                      </Button>
                    )}

                    {agreement.status === 'completed' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => downloadPDF(agreement)}
                        disabled={downloading}
                      >
                        {downloading ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1" />
                        )}
                        PDF
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Agreement Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Legal Agreement</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[70vh]">
            {selectedAgreement && (
              <LegalAgreementDocument
                driver={{ name: selectedAgreement.driver_name, email: selectedAgreement.driver_email }}
                owner={{ name: selectedAgreement.owner_name, email: selectedAgreement.owner_email }}
                vehicle={{
                  make: selectedAgreement.vehicle_make,
                  model: selectedAgreement.vehicle_model,
                  year: selectedAgreement.vehicle_year,
                  licensePlate: selectedAgreement.vehicle_plate,
                }}
                agreementDate={new Date(selectedAgreement.created_at)}
                driverSignature={selectedAgreement.driver_signature}
                ownerSignature={selectedAgreement.owner_signature}
                adminWitnessSignature={selectedAgreement.admin_witness_signature}
                adminWitnessName={selectedAgreement.admin_witness_name || undefined}
                driverSignedAt={selectedAgreement.driver_signed_at ? new Date(selectedAgreement.driver_signed_at) : null}
                ownerSignedAt={selectedAgreement.owner_signed_at ? new Date(selectedAgreement.owner_signed_at) : null}
                adminWitnessedAt={selectedAgreement.admin_witnessed_at ? new Date(selectedAgreement.admin_witnessed_at) : null}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Sign Agreement Dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Sign Agreement
            </DialogTitle>
          </DialogHeader>
          
          {selectedAgreement && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  By signing, you agree to the terms outlined in the Vehicle Rental Agreement for the{' '}
                  <strong>
                    {selectedAgreement.vehicle_year} {selectedAgreement.vehicle_make} {selectedAgreement.vehicle_model}
                  </strong>.
                </AlertDescription>
              </Alert>

              <div>
                <p className="text-sm font-medium mb-2">Your Signature</p>
                <SignaturePad
                  onSignatureChange={setSignature}
                  disabled={signing}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSignDialogOpen(false);
                    setSignature(null);
                  }}
                  disabled={signing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSign}
                  disabled={!signature || signing}
                >
                  {signing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    <>
                      <PenTool className="h-4 w-4 mr-2" />
                      Sign Agreement
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
