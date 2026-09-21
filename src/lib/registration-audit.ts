import { supabase } from '@/integrations/supabase/client';

export interface RegistrationAuditEvent {
  event: string;
  email?: string;
  userId?: string;
  applicationId?: string;
  applicationType?: string;
  source?: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export async function logRegistrationEvent(
  event: string,
  payload: {
    email?: string;
    userId?: string;
    applicationId?: string;
    applicationType?: string;
    source?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  try {
    const record = {
      event_type: event,
      email: payload.email?.toLowerCase().trim() || null,
      user_id: payload.userId || null,
      application_id: payload.applicationId || null,
      application_type: payload.applicationType || null,
      source: payload.source || 'registration_flow',
      metadata: payload.metadata ?? {},
      created_at: new Date().toISOString(),
    };

    const { error } = await (supabase.from('registration_audit_log') as any).insert([record]);
    if (error) {
      console.debug('Registration audit log insert failed:', error.message);
    }
  } catch (err) {
    console.debug('Registration audit log skipped:', err);
  }
}
