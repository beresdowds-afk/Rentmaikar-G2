import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from './SignaturePad';
import LegalAgreementDocument from './LegalAgreementDocument';
import { supabase } from '@/integrations/supabase/client';
import { useAgreementTemplate } from '@/hooks/useAgreementTemplate';
import { buildAgreementValues, renderAgreementTemplate } from '@/lib/agreement-template';

interface Party {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

interface VehicleInfo {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string;
}

interface AgreementSigningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Party;
  owner: Party;
  vehicle: VehicleInfo;
  userRole: 'driver' | 'owner' | 'admin';
  existingAgreement?: {
    id: string;
    driverSignature?: string | null;
    ownerSignature?: string | null;
    adminWitnessSignature?: string | null;
    driverSignedAt?: string | null;
    ownerSignedAt?: string | null;
    adminWitnessedAt?: string | null;
    status: string;
  } | null;
  onSuccess?: () => void;
}

const AgreementSigningModal: React.FC<AgreementSigningModalProps> = ({
  open,
  onOpenChange,
  driver,
  owner,
  vehicle,
  userRole,
  existingAgreement,
  onSuccess,
}) => {
  const [signature, setSignature] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { template, entity, region } = useAgreementTemplate();

  const canSign = () => {
    if (!existingAgreement) return userRole === 'admin'; // Admin creates new agreements
    
    if (userRole === 'driver' && !existingAgreement.driverSignature) return true;
    if (userRole === 'owner' && !existingAgreement.ownerSignature) return true;
    if (userRole === 'admin' && 
        existingAgreement.driverSignature && 
        existingAgreement.ownerSignature && 
        !existingAgreement.adminWitnessSignature) return true;
    
    return false;
  };

  const getSignatureLabel = () => {
    if (userRole === 'driver') return 'Driver Signature';
    if (userRole === 'owner') return 'Owner Signature';
    return 'Admin Witness Signature';
  };

  // The body is never hard-coded: it is the active template published in the
  // admin agreement editor, with the parties/vehicle placeholders resolved.
  const generateAgreementContent = () =>
    renderAgreementTemplate(
      template?.content ?? '',
      buildAgreementValues({
        driver,
        owner,
        vehicle,
        region,
        supportEmail: entity?.email ?? undefined,
        supportPhone: entity?.phone ?? undefined,
        platformEntity: entity?.name,
      }),
    );

  const handleSubmit = async () => {
    if (!signature) {
      toast.error('Please provide your signature');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (!existingAgreement) {
        if (!template) {
          toast.error('No active agreement template is published for this region.');
          setIsSubmitting(false);
          return;
        }
        // Create new agreement (admin only)
        const { data: newAgreement, error: createError } = await supabase
          .from('legal_agreements')
          .insert({
            driver_id: driver.id,
            owner_id: owner.id,
            vehicle_id: vehicle.id,
            agreement_content: generateAgreementContent(),
            admin_witness_signature: signature,
            admin_witnessed_at: new Date().toISOString(),
            admin_witness_id: user.id,
            status: 'pending_signatures',
          })
          .select()
          .single();

        if (createError) throw createError;

        toast.success('Agreement created and witnessed. Awaiting driver and owner signatures.');
      } else {
        // Drivers and owners sign via SECURITY DEFINER RPC that only allows
        // updating their own signature/timestamp columns. Admins still update
        // directly (their RLS policy scopes the row).
        if (userRole === 'driver' || userRole === 'owner') {
          const { error: rpcError } = await supabase.rpc('sign_legal_agreement', {
            _agreement_id: existingAgreement.id,
            _signature: signature,
          });
          if (rpcError) throw rpcError;
        } else if (userRole === 'admin') {
          const updates: Record<string, unknown> = {
            admin_witness_signature: signature,
            admin_witnessed_at: new Date().toISOString(),
            admin_witness_id: user.id,
          };
          if (existingAgreement.driverSignature && existingAgreement.ownerSignature) {
            updates.status = 'completed';
          }
          const { error: updateError } = await supabase
            .from('legal_agreements')
            .update(updates)
            .eq('id', existingAgreement.id);
          if (updateError) throw updateError;
        }

        // Determine completion for notification purposes
        const willBeComplete =
          (userRole === 'driver' || existingAgreement.driverSignature) &&
          (userRole === 'owner' || existingAgreement.ownerSignature) &&
          (userRole === 'admin' || existingAgreement.adminWitnessSignature);

        // If completed, send email notification
        if (willBeComplete) {
          try {
            await supabase.functions.invoke('send-agreement-email', {
              body: {
                agreementId: existingAgreement.id,
                driverEmail: driver.email,
                driverName: driver.name,
                ownerEmail: owner.email,
                ownerName: owner.name,
                vehicleInfo: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
              },
            });
          } catch (emailError) {
            console.error('Failed to send agreement email:', emailError);
          }
          toast.success('Agreement fully executed! Emails sent to both parties.');
        } else {
          toast.success('Signature recorded successfully');
        }
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error signing agreement:', error);
      toast.error('Failed to sign agreement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Vehicle Rental Agreement
          </DialogTitle>
          <DialogDescription>
            {canSign() 
              ? 'Review the agreement below and provide your signature.'
              : 'View the rental agreement details.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <LegalAgreementDocument
            driver={{ name: driver.name, email: driver.email, phone: driver.phone }}
            owner={{ name: owner.name, email: owner.email, phone: owner.phone }}
            vehicle={vehicle}
            driverSignature={existingAgreement?.driverSignature}
            ownerSignature={existingAgreement?.ownerSignature}
            adminWitnessSignature={existingAgreement?.adminWitnessSignature}
            driverSignedAt={existingAgreement?.driverSignedAt ? new Date(existingAgreement.driverSignedAt) : null}
            ownerSignedAt={existingAgreement?.ownerSignedAt ? new Date(existingAgreement.ownerSignedAt) : null}
            adminWitnessedAt={existingAgreement?.adminWitnessedAt ? new Date(existingAgreement.adminWitnessedAt) : null}
          />
        </ScrollArea>

        {canSign() && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <div>
              <h3 className="font-medium mb-2">{getSignatureLabel()}</h3>
              <SignaturePad onSignatureChange={setSignature} />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!signature || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Sign Agreement
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AgreementSigningModal;
