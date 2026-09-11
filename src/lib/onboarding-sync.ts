export interface SyncedDisruptionPolicy {
  version: string;
  region: 'USA' | 'Nigeria' | 'All';
  syncedAt: string;
  syncedBy?: string;
  policySummary: string;
  clauses: {
    telematicsConsent: string;
    serviceDisruptionRules: string;
    stationarySafetyMandate: string;
    vehicleCallInProtocol: string;
    refereeFraudClause: string;
  };
  rawClauseText: string;
}

const STORAGE_KEY = 'rentmaikar_synced_service_disruption_policy';
const SYNC_EVENT_NAME = 'rentmaikar:service-disruption-policy-synced';

export const DEFAULT_SERVICE_DISRUPTION_CLAUSES = {
  USA: {
    version: '2.4',
    region: 'USA' as const,
    policySummary: 'Telematics, Service Disruption (Remote Starter Restriction) & 24-Hour Call-In Protocol under US Jurisdiction.',
    clauses: {
      telematicsConsent: 'The vehicle is actively equipped with continuous GPS telematics and remote electronic starter control.',
      serviceDisruptionRules: 'Service disruption (remote starter cut) may be initiated upon payment default exceeding grace periods (36h daily / 72h weekly), unapproved state/boundary crossing, or non-compliance with inspection orders.',
      stationarySafetyMandate: 'STATIONARY ONLY: Remote starter restriction is strictly engaged only when telematics verify vehicle is stationary (speed < 2 mph, engine off). It will never be engaged on an active roadway.',
      vehicleCallInProtocol: 'Call-In Directives require the driver to contact operations or present the vehicle within 24 hours. Failure to comply within 24 hours triggers immediate service disruption.',
      refereeFraudClause: 'Adverse or fraudulent reports from verified referees or guarantors authorize immediate vehicle recall and ignition restriction.',
    },
    rawClauseText: `3. TELEMATICS, SERVICE DISRUPTION & VEHICLE CALL-IN (USA)
The DRIVER acknowledges and explicitly consents that the vehicle is equipped with active GPS tracking and remote telematics control.
- Service Disruption (Remote Ignition Restriction): In the event of payment default beyond grace windows (36h for daily, 72h for weekly), failure to respond to official call-ins, unapproved state/boundary crossing, adverse referee fraud report, or vehicle safety hazard, the platform or OWNER may initiate service disruption (remote starter restriction).
- Stationary Safety Protocol: Service disruption shall strictly and only be engaged when telematics verify that the vehicle is stationary (speed < 2 mph, engine/ignition turned off). Under no circumstances will service disruption be initiated while the vehicle is in motion on a roadway.
- Vehicle Call-In & Inspection: The platform or OWNER may issue a formal Call-In Notice requiring the DRIVER to check in, present the vehicle for physical inspection, or return it to a designated hub within 24 hours. Failure to comply with a call-in within 24 hours authorizes immediate service disruption and field recovery.`,
  },
  Nigeria: {
    version: '2.4',
    region: 'Nigeria' as const,
    policySummary: 'Telematics, Service Disruption (Remote Starter Restriction) & 24-Hour Call-In Protocol under Nigerian Jurisdiction.',
    clauses: {
      telematicsConsent: 'The vehicle is actively equipped with continuous GPS telematics and remote immobilizer technology.',
      serviceDisruptionRules: 'Service disruption (remote immobilizer activation) may be initiated upon payment default exceeding grace periods (36h daily / 72h weekly), unapproved interstate travel without prior clearance, or safety concerns.',
      stationarySafetyMandate: 'STATIONARY ONLY: Remote starter restriction is strictly engaged only when telematics verify vehicle is parked and stationary (speed < 2 mph, engine off). Never while vehicle is moving.',
      vehicleCallInProtocol: 'Call-In Directives require the driver to report to the nearest verified hub within 24 hours. Failure to comply authorizes immediate immobilizer activation and asset recovery.',
      refereeFraudClause: 'Adverse referee or guarantor findings constitute contractual breach and immediate vehicle recall.',
    },
    rawClauseText: `3. TELEMATICS, SERVICE DISRUPTION & VEHICLE CALL-IN (NIGERIA)
The DRIVER acknowledges and explicitly consents that the vehicle is equipped with active GPS tracking and remote telematics control.
- Service Disruption (Remote Ignition Restriction): In the event of payment default beyond grace windows (36h for daily, 72h for weekly), failure to respond to official call-ins, unapproved interstate movement, adverse referee fraud report, or vehicle safety hazard, the platform or OWNER may initiate service disruption (remote starter restriction).
- Stationary Safety Protocol: Service disruption shall strictly and only be engaged when telematics verify that the vehicle is stationary (speed < 2 mph, engine/ignition turned off). Under no circumstances will service disruption be initiated while the vehicle is in motion on a roadway.
- Vehicle Call-In & Inspection: The platform or OWNER may issue a formal Call-In Notice requiring the DRIVER to check in, present the vehicle for physical inspection, or return it to a designated hub within 24 hours. Failure to comply with a call-in within 24 hours authorizes immediate service disruption and field recovery.`,
  },
};

export function getSyncedDisruptionPolicy(region: 'USA' | 'Nigeria' | (string & {}) = 'USA'): SyncedDisruptionPolicy {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, SyncedDisruptionPolicy>;
      if (parsed[region]) return parsed[region];
      if (parsed['default']) return parsed['default'];
    }
  } catch {
    // fall back to default
  }

  const base = region === 'Nigeria' ? DEFAULT_SERVICE_DISRUPTION_CLAUSES.Nigeria : DEFAULT_SERVICE_DISRUPTION_CLAUSES.USA;
  return {
    version: base.version,
    region: base.region,
    syncedAt: new Date().toISOString(),
    syncedBy: 'System Auto-Sync',
    policySummary: base.policySummary,
    clauses: base.clauses,
    rawClauseText: base.rawClauseText,
  };
}

export function saveSyncedDisruptionPolicy(
  region: 'USA' | 'Nigeria',
  policy: Partial<SyncedDisruptionPolicy> & { version: string; rawClauseText: string }
): SyncedDisruptionPolicy {
  let store: Record<string, SyncedDisruptionPolicy> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) store = JSON.parse(raw);
  } catch {
    store = {};
  }

  const base = region === 'Nigeria' ? DEFAULT_SERVICE_DISRUPTION_CLAUSES.Nigeria : DEFAULT_SERVICE_DISRUPTION_CLAUSES.USA;
  const fullPolicy: SyncedDisruptionPolicy = {
    version: policy.version || base.version,
    region,
    syncedAt: new Date().toISOString(),
    syncedBy: policy.syncedBy || 'Admin Legal Management',
    policySummary: policy.policySummary || base.policySummary,
    clauses: policy.clauses || base.clauses,
    rawClauseText: policy.rawClauseText || base.rawClauseText,
  };

  store[region] = fullPolicy;
  store['default'] = fullPolicy;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail: fullPolicy }));
  return fullPolicy;
}

export function extractDisruptionClauseFromTemplate(content: string, region: 'USA' | 'Nigeria'): {
  found: boolean;
  clauseText: string;
} {
  const match = content.match(/3\.\s*TELEMATICS[^\n]*\n([\s\S]*?)(?=\n\s*(?:4\.|EXECUTION|IN WITNESS|$))/i);
  if (match && match[0]) {
    return { found: true, clauseText: match[0].trim() };
  }

  const altMatch = content.match(/(?:SERVICE DISRUPTION|REMOTE IGNITION RESTRICTION|VEHICLE CALL-IN)[\s\S]*?(?=\n\s*(?:4\.|EXECUTION|IN WITNESS|$))/i);
  if (altMatch && altMatch[0]) {
    return { found: true, clauseText: altMatch[0].trim() };
  }

  return {
    found: false,
    clauseText: region === 'Nigeria' ? DEFAULT_SERVICE_DISRUPTION_CLAUSES.Nigeria.rawClauseText : DEFAULT_SERVICE_DISRUPTION_CLAUSES.USA.rawClauseText,
  };
}
