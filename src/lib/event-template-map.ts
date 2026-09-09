/**
 * Admin-facing view of the canonical event -> messaging template map.
 *
 * The data itself lives with the edge functions so runtime dispatch and the
 * Docs matrix can never drift apart.
 */
export type {
  EventChannel,
  EventTemplateMapping,
  SmsNotificationType,
} from '../../supabase/functions/_shared/event-template-map';

export {
  EVENT_TEMPLATE_MAP,
  renderEventCopy,
  resolveEventTemplate,
  mappedEventKinds,
} from '../../supabase/functions/_shared/event-template-map';
