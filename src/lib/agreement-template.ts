/**
 * Shared placeholder engine for legal agreement templates.
 *
 * Agreement bodies are NEVER hard-coded in the app: they live in
 * `legal_agreement_templates` and are edited by admins in the agreement editor.
 * This module only knows how to resolve the `{{token}}` placeholders those
 * templates use, so every surface (onboarding, admin creation, signing modal,
 * PDF/print) renders identical text from the same source of truth.
 */

export const AGREEMENT_TEMPLATE_KEY = 'owner_driver_agreement';
export const AGREEMENT_TYPE = 'vehicle_rental';

export interface AgreementParty {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  stateZip?: string | null;
}

export interface AgreementVehicleInfo {
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  licensePlate?: string | null;
  vin?: string | null;
  color?: string | null;
}

export interface AgreementTerms {
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  rentalPrice?: string | number | null;
  currency?: string | null;
  weeklyMileageLimit?: string | number | null;
  excessMileageFee?: string | number | null;
  previousMileage?: string | number | null;
  presentMileage?: string | number | null;
  negotiationId?: string | null;
}

export interface AgreementContext {
  driver: AgreementParty;
  owner: AgreementParty;
  vehicle: AgreementVehicleInfo;
  terms?: AgreementTerms;
  region?: string;
  agreementDate?: Date;
  supportEmail?: string;
  supportPhone?: string;
  platformEntity?: string;
}

/** Tokens an admin may use inside a template body, surfaced in the editor. */
export const AGREEMENT_PLACEHOLDERS: { token: string; description: string }[] = [
  { token: '{{agreement_date}}', description: 'Date the agreement was generated' },
  { token: '{{region}}', description: 'Operating region (USA / Nigeria)' },
  { token: '{{platform_entity}}', description: 'Legal platform entity name' },
  { token: '{{support_email}}', description: 'Platform support email' },
  { token: '{{support_phone}}', description: 'Platform support phone' },
  { token: '{{owner_full_name}}', description: 'Vehicle owner full name' },
  { token: '{{owner_email}}', description: 'Vehicle owner email' },
  { token: '{{owner_phone}}', description: 'Vehicle owner phone' },
  { token: '{{owner_address}}', description: 'Vehicle owner address' },
  { token: '{{driver_full_name}}', description: 'Driver (renter) full name' },
  { token: '{{driver_email}}', description: 'Driver email' },
  { token: '{{driver_phone}}', description: 'Driver phone' },
  { token: '{{driver_address}}', description: 'Driver street address' },
  { token: '{{driver_city}}', description: 'Driver city' },
  { token: '{{driver_state_zip}}', description: 'Driver state / postal code' },
  { token: '{{vehicle_make_model_year}}', description: 'Vehicle make, model and year' },
  { token: '{{vehicle_vin}}', description: 'Vehicle identification number' },
  { token: '{{vehicle_color}}', description: 'Vehicle colour' },
  { token: '{{license_plate}}', description: 'Vehicle licence plate' },
  { token: '{{previous_mileage}}', description: 'Mileage at previous handover' },
  { token: '{{present_mileage}}', description: 'Mileage at this handover' },
  { token: '{{contract_start_date}}', description: 'Contract start date' },
  { token: '{{contract_start_time}}', description: 'Contract start time' },
  { token: '{{contract_end_date}}', description: 'Contract end date' },
  { token: '{{contract_end_time}}', description: 'Contract end time' },
  { token: '{{currency}}', description: 'Regional currency code' },
  { token: '{{basic_rental_price}}', description: 'Agreed basic rental price' },
  { token: '{{weekly_mileage_limit}}', description: 'Weekly mileage allowance' },
  { token: '{{excess_mileage_fee}}', description: 'Fee charged per excess mile' },
  { token: '{{negotiation_id}}', description: 'Reference of the approved negotiation' },
];

const BLANK = '__________';

const val = (v: unknown): string => {
  if (v === null || v === undefined) return BLANK;
  const s = String(v).trim();
  return s.length ? s : BLANK;
};

export const buildAgreementValues = (ctx: AgreementContext): Record<string, string> => {
  const { driver, owner, vehicle, terms = {}, region } = ctx;
  const date = ctx.agreementDate ?? new Date();
  const makeModelYear = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return {
    agreement_date: date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    region: val(region),
    platform_entity: val(ctx.platformEntity ?? 'Rentmaikar.com (Inte-gritty LLC)'),
    support_email: val(ctx.supportEmail),
    support_phone: val(ctx.supportPhone),

    owner_full_name: val(owner.name),
    owner_email: val(owner.email),
    owner_phone: val(owner.phone),
    owner_address: val(owner.address),

    driver_full_name: val(driver.name),
    driver_email: val(driver.email),
    driver_phone: val(driver.phone),
    driver_address: val(driver.address),
    driver_city: val(driver.city),
    driver_state_zip: val(driver.stateZip),

    vehicle_make_model_year: val(makeModelYear),
    vehicle_vin: val(vehicle.vin),
    vehicle_color: val(vehicle.color),
    license_plate: val(vehicle.licensePlate),

    previous_mileage: val(terms.previousMileage),
    present_mileage: val(terms.presentMileage),
    contract_start_date: val(terms.startDate),
    contract_start_time: val(terms.startTime),
    contract_end_date: val(terms.endDate),
    contract_end_time: val(terms.endTime),
    currency: val(terms.currency),
    basic_rental_price: val(terms.rentalPrice),
    weekly_mileage_limit: val(terms.weeklyMileageLimit),
    excess_mileage_fee: val(terms.excessMileageFee),
    negotiation_id: val(terms.negotiationId),
  };
};

/** Substitutes `{{token}}` occurrences; unknown tokens fall back to a blank rule. */
export const renderAgreementTemplate = (
  content: string,
  values: Record<string, string>,
): string =>
  (content ?? '').replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => {
    const v = values[key.toLowerCase()];
    return v === undefined ? BLANK : v;
  });
