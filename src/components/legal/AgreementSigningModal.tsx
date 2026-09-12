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
import { Loader2, FileText, Send, ShieldAlert, CheckCircle2, CreditCard, Lock } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from './SignaturePad';
import LegalAgreementDocument from './LegalAgreementDocument';
import { supabase } from '@/integrations/supabase/client';
import { useAgreementTemplate } from '@/hooks/useAgreementTemplate';
import { buildAgreementValues, renderAgreementTemplate } from '@/lib/agreement-template';
import { useDriverSecurityDepositStatus } from '@/hooks/useSecurityDepositPayment';
import { useSecurityDeposit } from '@/hooks/useSecurityDeposit';

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
  const { deposit: depositConfig, formatted: formattedDeposit } = useSecurityDeposit(region);
  const { isPaid: isDepositPaid, isLoading: isDepositLoading, recordPayment, isRecording: isPayingDeposit } = useDriverSecurityDepositStatus(region);
  const [showPayDepositForm, setShowPayDepositForm] = useState(false);

  // When user is a driver, require that platform security deposit / fee is paid before signing
  const isDriverDepositBlocked = userRole === 'driver' && !isDepositPaid;

  const handlePayDepositNow = async () => {
    try {
      const amount = depositConfig?.amount || (region?.toLowerCase().startsWith('nig') ? 250000 : 500);
      const currency = depositConfig?.currency || (region?.toLowerCase().startsWith('nig') ? 'NGN' : 'USD');
      await recordPayment({
        amount,
        currency,
        paymentMethod: 'Instant Card / Transfer Gateway',
      });
      toast.success('Platform Security Deposit & Fee confirmed! You are now eligible to sign.');
      setShowPayDepositForm(false);
    } catch (e: any) {
      toast.error(`Payment failed: ${e.message || 'Please try again'}`);
    }
  };

  const canSign = () => {
    if (!existingAgreement) return userRole === 'admin'; // Admin creates new agreements
    
    if (userRole === 'driver') {
      if (existingAgreement.driverSignature) return false;
      return true;
    }
    if (userRole === 'owner' && !existingAgreement.ownerSignature) return true;
    if (userRole === 'admin' && !existingAgreement.adminWitnessSignature) return true;
    
    return false;
  };

  const getSignatureLabel = () => {
    if (userRole === 'driver') return 'Driver Signature';
    if (userRole === 'owner') return 'Vehicle Owner Signature';
    return 'Admin Witness Signature';
  };

  const getSignerDefaultName = () => {
    if (userRole === 'owner') return owner.name || '';
    if (userRole === 'driver') return driver.name || '';
    return 'Authorized Staff Witness';
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
        securityDeposit: formattedDeposit || (region?.toLowerCase().startsWith('nig') ? '₦250,000 NGN' : '$500 USD'),
        supportEmail: entity?.email ?? undefined,
        supportPhone: entity?.phone ?? undefined,
        platformEntity: entity?.name,
      }),
    );

  const handleSubmit = async () => {
    if (userRole === 'driver' && !isDepositPaid) {
      toast.error('Payment of Platform Security Deposit & Fee is required before signing the agreement.');
      setShowPayDepositForm(true);
      return;
    }

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

        {/* Platform Security Deposit & Fee condition banner for drivers */}
        {userRole === 'driver' && (
          <div className="border-t pt-3">
            {isDepositPaid ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-emerald-900">Platform Security Deposit & Fee Verified</span>
                    <p className="text-emerald-700">Your deposit payment is recorded. You are authorized to sign this agreement.</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                  Paid
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-amber-900">Platform Security Deposit & Fee Required</span>
                      <p className="text-amber-800 mt-0.5">
                        Drivers must remit the refundable Platform Security Deposit & Fee ({formattedDeposit || (region?.toLowerCase().startsWith('nig') ? '₦250,000 NGN' : '$500 USD')}) before signing the owner-driver agreement.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shrink-0"
                    onClick={handlePayDepositNow}
                    disabled={isPayingDeposit}
                  >
                    {isPayingDeposit ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                    Pay Deposit Now
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {canSign() && (
          <div className="border-t pt-4 mt-4 space-y-4">
            {isDriverDepositBlocked ? (
              <div className="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-center space-y-2">
                <Lock className="h-6 w-6 text-amber-600 mx-auto" />
                <h4 className="font-semibold text-sm text-slate-900">Signature Pad Locked</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  To protect vehicle owners and maintain safety standards, you must complete your Platform Security Deposit & Fee payment before you can sign.
                </p>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 mt-2"
                  onClick={handlePayDepositNow}
                  disabled={isPayingDeposit}
                >
                  {isPayingDeposit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Pay Deposit ({formattedDeposit || (region?.toLowerCase().startsWith('nig') ? '₦250,000' : '$500')}) & Unlock Signature
                </Button>
              </div>
            ) : (
              <div>
                <SignaturePad
                  onSignatureChange={setSignature}
                  label={getSignatureLabel()}
                  signerName={getSignerDefaultName()}
                  signerRole={userRole === 'owner' ? 'Vehicle Owner' : userRole === 'admin' ? 'Admin Witness' : 'Driver'}
                />
              </div>
            )}

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
                disabled={!signature || isSubmitting || isDriverDepositBlocked}
                className={isDriverDepositBlocked ? "opacity-50 cursor-not-allowed" : ""}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {isDriverDepositBlocked ? 'Deposit Payment Required to Sign' : 'Sign Agreement'}
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
