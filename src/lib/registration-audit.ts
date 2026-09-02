import { supabase } from '@/integrations/supabase/client';

/**
 * Fire-and-forget writer for public.registration_audit_log.
 *
 * The RPC is SECURITY DEFINER and derives user_id from auth.uid() on the
 * server, so nothing here can be spoofed by the client. Logging must never
 * break a registration or sign-in flow, so all failures are swallowed.
 */
export async function logRegistrationEvent(
  eventType:
    | 'signin_redirect_existing_email'
    | 'registration_form_submitted'
    | 'registration_upsert_succeeded'
    | 'registration_upsert_failed'
    | (string & {}),
  opts: {
    email?: string | null;
    applicationId?: string | null;
    applicationType?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await supabase.rpc('log_registration_event', {
      _event_type: eventType,
      _email: opts.email ? opts.email.trim().toLowerCase() : null,
      _application_id: opts.applicationId ?? null,
      _application_type: opts.applicationType ?? null,
      _metadata: (opts.metadata ?? {}) as never,
    });
  } catch {
    // Audit logging is best-effort — never surface to the user.
  }
}
