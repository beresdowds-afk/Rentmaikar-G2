import { supabase } from '@/integrations/supabase/client';

export interface RegistrationAuditEvent {
  event: string;
  email?: string;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export async function logRegistrationEvent(
  event: string,
  payload: {
    email?: string;
    userId?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  try {
    const record = {
      event,
      email: payload.email,
      user_id: payload.userId,
      metadata: payload.metadata ?? {},
      created_at: new Date().toISOString(),
    };

    // Attempt to log to analytics or audit table if present, otherwise log locally
    try {
      await (supabase.from('audit_logs') as any).insert([
        {
          action: `registration_${event}`,
          entity_type: 'registration',
          details: record,
        },
      ]);
    } catch {
      // Table might not exist or RPC unavailable
    }
  } catch (err) {
    console.debug('Registration audit log skipped:', err);
  }
}
