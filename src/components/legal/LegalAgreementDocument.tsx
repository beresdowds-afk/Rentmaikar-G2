import React, { useMemo } from 'react';
import { useRegion } from '@/contexts/RegionContext';
import { format } from 'date-fns';
import { EMAIL_CONFIG } from '@/lib/email-config';
import rentmaikarLogo from '@/assets/rentmaikar-logo.jpg';
import { useAgreementTemplate } from '@/hooks/useAgreementTemplate';
import {
  buildAgreementValues,
  renderAgreementTemplate,
  type AgreementTerms,
} from '@/lib/agreement-template';

interface Party {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  stateZip?: string;
}

interface VehicleInfo {
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string;
  color?: string;
}

interface LegalAgreementDocumentProps {
  driver: Party;
  owner: Party;
  vehicle: VehicleInfo;
  terms?: AgreementTerms;
  agreementDate?: Date;
  /** Optional frozen body (e.g. the content stored on an executed agreement). */
  templateContent?: string | null;
  driverSignature?: string | null;
  ownerSignature?: string | null;
  adminWitnessSignature?: string | null;
  adminWitnessName?: string;
  driverSignedAt?: Date | null;
  ownerSignedAt?: Date | null;
  adminWitnessedAt?: Date | null;
}

const LegalAgreementDocument: React.FC<LegalAgreementDocumentProps> = ({
  driver,
  owner,
  vehicle,
  terms,
  agreementDate = new Date(),
  templateContent,
  driverSignature,
  ownerSignature,
  adminWitnessSignature,
  adminWitnessName = 'RentMaiKar Administrator',
  driverSignedAt,
  ownerSignedAt,
  adminWitnessedAt,
}) => {
  const { country } = useRegion();
  const { template, entity, loading, error } = useAgreementTemplate();

  const body = templateContent ?? template?.content ?? '';

  const rendered = useMemo(
    () =>
      renderAgreementTemplate(
        body,
        buildAgreementValues({
          driver,
          owner,
          vehicle,
          terms,
          region: country,
          agreementDate,
          supportEmail: entity?.email ?? EMAIL_CONFIG.support,
          supportPhone: entity?.phone ?? undefined,
          platformEntity: entity?.name,
        }),
      ),
    [body, driver, owner, vehicle, terms, country, agreementDate, entity],
  );

  return (
    <div className="bg-white text-black p-8 max-w-4xl mx-auto font-serif" id="legal-agreement-document">
      {/* Header with brand mark */}
      <div className="text-center mb-8 border-b-2 border-black pb-4">
        <img
          src={rentmaikarLogo}
          alt="RentMaiKar logo"
          className="h-14 mx-auto mb-3 object-contain"
        />
        <h1 className="text-2xl font-bold uppercase tracking-wide">
          {template?.title ?? 'Owner and Driver Rental Agreement'}
        </h1>
        <p className="text-sm text-gray-600">
          Agreement Date: {format(agreementDate, 'MMMM dd, yyyy')}
          {template ? ` · Version ${template.version} · ${template.region}` : ''}
        </p>
      </div>

      {/* Agreement body — published from the admin agreement editor */}
      <section className="mb-8 text-sm leading-relaxed">
        {loading && !templateContent ? (
          <p className="text-gray-500">Loading the published agreement…</p>
        ) : rendered.trim().length === 0 ? (
          <p className="text-red-700">
            {error ?? 'No agreement template has been published for this region yet.'}
          </p>
        ) : (
          <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">{rendered}</pre>
        )}
      </section>

      {/* Signatures */}
      <section className="mb-6">
        <h2 className="text-lg font-bold mb-4 uppercase">Signatures</h2>

        <div className="grid grid-cols-2 gap-8">
          {/* Owner Signature */}
          <div className="border p-4 rounded">
            <h3 className="font-bold mb-3">OWNER SIGNATURE</h3>
            {ownerSignature ? (
              <div className="mb-2">
                <img src={ownerSignature} alt="Owner Signature" className="h-16 object-contain" />
              </div>
            ) : (
              <div className="h-16 border-b border-black mb-2"></div>
            )}
            <p className="text-sm"><strong>Name:</strong> {owner.name}</p>
            {ownerSignedAt && (
              <p className="text-sm text-gray-600">
                <strong>Date:</strong> {format(ownerSignedAt, 'MMM dd, yyyy HH:mm')}
              </p>
            )}
          </div>

          {/* Driver Signature */}
          <div className="border p-4 rounded">
            <h3 className="font-bold mb-3">DRIVER SIGNATURE</h3>
            {driverSignature ? (
              <div className="mb-2">
                <img src={driverSignature} alt="Driver Signature" className="h-16 object-contain" />
              </div>
            ) : (
              <div className="h-16 border-b border-black mb-2"></div>
            )}
            <p className="text-sm"><strong>Name:</strong> {driver.name}</p>
            {driverSignedAt && (
              <p className="text-sm text-gray-600">
                <strong>Date:</strong> {format(driverSignedAt, 'MMM dd, yyyy HH:mm')}
              </p>
            )}
          </div>
        </div>

        {/* Admin witness signature */}
        <div className="mt-6 border-2 border-primary p-4 rounded bg-primary/5">
          <h3 className="font-bold mb-3 text-center">ADMIN SIGNATURE — WITNESSED BY RENTMAIKAR</h3>
          <div className="text-center">
            {adminWitnessSignature ? (
              <div className="mb-2 flex justify-center">
                <img src={adminWitnessSignature} alt="Admin Signature" className="h-16 object-contain" />
              </div>
            ) : (
              <div className="h-16 border-b border-black mx-auto w-48 mb-2"></div>
            )}
            <p className="text-sm"><strong>Administrator:</strong> {adminWitnessName}</p>
            {adminWitnessedAt && (
              <p className="text-sm text-gray-600">
                <strong>Witnessed on:</strong> {format(adminWitnessedAt, 'MMM dd, yyyy HH:mm')}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-500 border-t pt-4">
        <img src={rentmaikarLogo} alt="RentMaiKar" className="h-8 mx-auto mb-2 object-contain opacity-80" />
        <p>This document was generated and witnessed through the RentMaiKar platform.</p>
        <p>For questions or disputes, contact: {entity?.email ?? EMAIL_CONFIG.support}</p>
        <p className="mt-2">
          Agreement Version: {template?.version ?? '—'} | Generated: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}
        </p>
      </footer>
    </div>
  );
};

export default LegalAgreementDocument;
