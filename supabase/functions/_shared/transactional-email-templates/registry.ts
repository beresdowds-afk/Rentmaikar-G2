import type { ComponentType } from 'npm:react@18.3.1'
import { template as bookingConfirmation } from './booking-confirmation.tsx'
import { template as bookingReminder } from './booking-reminder.tsx'

export interface TemplateEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subject: string | ((data: any) => string)
  displayName?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'booking-confirmation': bookingConfirmation,
  'booking-reminder': bookingReminder,
}
