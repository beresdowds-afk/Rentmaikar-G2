import { supabase } from '@/integrations/supabase/client';

export type SmsConsentType = 'service' | 'marketing';

export interface SmsConsentRecord {
  id: string;
  user_id?: string;
  phone_number?: string | null;
  consent_type: SmsConsentType;
  granted: boolean;
  source?: string;
  disclosure_text?: string;
  created_at: string;
  user_agent?: string;
}

export interface SmsConsentState {
  service: SmsConsentRecord | null;
  marketing: SmsConsentRecord | null;
  history: SmsConsentRecord[];
}

export async function fetchSmsConsentState(userId: string): Promise<SmsConsentState> {
  try {
    const { data, error } = await supabase
      .from('sms_consent_records' as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return { service: null, marketing: null, history: [] };
    }

    const history = data as unknown as SmsConsentRecord[];
    const service = history.find((r) => r.consent_type === 'service') || null;
    const marketing = history.find((r) => r.consent_type === 'marketing') || null;

    return { service, marketing, history };
  } catch {
    return { service: null, marketing: null, history: [] };
  }
}

export async function recordSmsConsent(params: {
  userId: string;
  phoneNumber?: string | null;
  consentType: SmsConsentType;
  granted: boolean;
  source?: string;
  disclosureText?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from('sms_consent_records' as any).insert([
      {
        user_id: params.userId,
        phone_number: params.phoneNumber,
        consent_type: params.consentType,
        granted: params.granted,
        source: params.source || 'web',
        disclosure_text: params.disclosureText || 'Standard SMS notifications disclosure',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
    ]);
    return !error;
  } catch {
    return false;
  }
}

export async function recordSmsConsentPair(params: {
  userId: string;
  phoneNumber?: string | null;
  serviceConsent: boolean;
  marketingConsent: boolean;
  source?: string;
}): Promise<void> {
  await Promise.all([
    recordSmsConsent({
      userId: params.userId,
      phoneNumber: params.phoneNumber,
      consentType: 'service',
      granted: params.serviceConsent,
      source: params.source,
    }),
    recordSmsConsent({
      userId: params.userId,
      phoneNumber: params.phoneNumber,
      consentType: 'marketing',
      granted: params.marketingConsent,
      source: params.source,
    }),
  ]);
}

export async function fetchSmsConsentAudit(): Promise<SmsConsentRecord[]> {
  try {
    const { data, error } = await supabase
      .from('sms_consent_records' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data) return [];
    return data as unknown as SmsConsentRecord[];
  } catch {
    return [];
  }
}

export function smsConsentRecordsToCsv(records: SmsConsentRecord[]): string {
  const header = ['ID', 'User ID', 'Phone Number', 'Type', 'Granted', 'Source', 'Created At'];
  const rows = records.map((r) => [
    r.id,
    r.user_id || '',
    r.phone_number || '',
    r.consent_type,
    r.granted ? 'YES' : 'NO',
    r.source || '',
    r.created_at,
  ]);
  return [header.join(','), ...rows.map((row) => row.map((val) => `"${val}"`).join(','))].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv'): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
