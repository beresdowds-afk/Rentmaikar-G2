/**
 * Canonical event -> messaging template map (all channels).
 *
 * Single source of truth shared by:
 *   - supabase/functions/dispatch-event-notifications (runtime dispatch)
 *   - src/lib/event-template-map.ts (admin Docs "Event → Template" matrix)
 *
 * Every database/business event that reaches the notification outbox is mapped
 * here to the copy that must go out on each channel:
 *   email     -> send-outbound-email template + rendered subject/body
 *   sms       -> send-sms-notification notificationType (DB template first,
 *                falling back to the copy below via `general` + customMessage)
 *   whatsapp  -> same resolver as sms, WhatsApp variant of the copy
 *   push      -> web push title/body
 *
 * `useCaseId` links the event back to the canned-message use case in
 * src/lib/message-use-cases.ts so the drafts shown to agents in the Messaging
 * Center match what automation sends. Keep the two files in sync — the test in
 * src/lib/__tests__/event-template-map.test.ts enforces it.
 *
 * NOTE: this file must stay dependency free so both Deno and Vite can load it.
 */

export type EventChannel = "email" | "sms" | "whatsapp" | "push";

/** Notification types understood by supabase/functions/send-sms-notification. */
export type SmsNotificationType =
  | "general"
  | "payment_reminder"
  | "payment_received"
  | "payment_failed"
  | "payment_overdue"
  | "owner_payout"
  | "vehicle_assigned"
  | "vehicle_listed"
  | "booking_confirmation"
  | "booking_cancellation"
  | "document_verified"
  | "document_rejected"
  | "price_approved"
  | "price_rejected"
  | "price_counter_offer"
  | "price_locked"
  | "negotiation_submitted"
  | "support_ticket_created"
  | "incident_alert";

export interface EventTemplateMapping {
  /** Outbox `kind`, e.g. `payments_status`, `vehicles_catalogue_live`. */
  kind: string;
  /** Record status this mapping applies to; omit for the kind-wide default. */
  status?: string;
  /** Canned-message use case id (src/lib/message-use-cases.ts). */
  useCaseId: string;
  /** Human label used in the admin Docs matrix. */
  label: string;
  /** Who the message is written for. */
  audience: "driver" | "owner" | "staff" | "all";
  /** Channels this event must fan out to. Email is always included. */
  channels: EventChannel[];
  /** send-outbound-email template name. */
  emailTemplate: string;
  emailSubject: string;
  emailBody: string;
  /** send-sms-notification type; `general` sends `sms` copy as customMessage. */
  smsNotificationType: SmsNotificationType;
  sms: string;
  whatsapp: string;
  pushTitle: string;
  pushBody: string;
}

const SUPPORT_SIGNOFF = "— Rentmaikar Support";

export const EVENT_TEMPLATE_MAP: EventTemplateMapping[] = [
  // ---------------------------------------------------------------- Applications
  {
    kind: "applications_created",
    useCaseId: "support_ack",
    label: "Application submitted",
    audience: "all",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "We received your Rentmaikar application",
    emailBody:
      "Hi {{first_name}},\n\nYour application has been received and is being processed. We will contact you if anything else is required.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: Thanks {{first_name}}, we received your application. We'll be in touch shortly.",
    whatsapp: `Hi {{first_name}} 👋\n\nWe received your Rentmaikar application and it is being processed.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Application received",
    pushBody: "We received your Rentmaikar application.",
  },
  {
    kind: "applications_status",
    status: "approved",
    useCaseId: "document_request",
    label: "Application approved",
    audience: "all",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Your Rentmaikar application is approved",
    emailBody:
      "Hi {{first_name}},\n\nGood news — your application has been approved. Sign in to your dashboard to complete the next step.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your application is approved. Sign in to continue.",
    whatsapp: `Great news {{first_name}} 🎉\n\nYour Rentmaikar application has been approved. Sign in to your dashboard to continue.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Application approved",
    pushBody: "Your Rentmaikar application has been approved.",
  },
  {
    kind: "applications_status",
    useCaseId: "document_request",
    label: "Application status update",
    audience: "all",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Update on your Rentmaikar application",
    emailBody:
      "Hi {{first_name}},\n\nYour application status changed to {{status}}. Sign in to your dashboard for the details and any outstanding documents.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your application status is now {{status}}. Sign in for details.",
    whatsapp: `Hi {{first_name}},\n\nYour Rentmaikar application status is now *{{status}}*. Sign in to your dashboard for details.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Application updated",
    pushBody: "Your application status is now {{status}}.",
  },

  // ------------------------------------------------------------------- Invoices
  {
    kind: "invoices_created",
    useCaseId: "payment_reminder",
    label: "Invoice issued",
    audience: "driver",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "New invoice for your Rentmaikar rental",
    emailBody:
      "Hi {{first_name}},\n\nA new invoice has been issued for your rental. Please sign in to your dashboard to review and pay it before the due date.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "payment_reminder",
    sms: "Rentmaikar: {{first_name}}, a new invoice is available in your dashboard. Please pay before the due date.",
    whatsapp: `Hi {{first_name}},\n\nA new invoice is available in your Rentmaikar dashboard. Please settle it before the due date to keep your rental active.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "New invoice",
    pushBody: "A new invoice is ready in your dashboard.",
  },
  {
    kind: "invoices_status",
    status: "overdue",
    useCaseId: "overdue_warning",
    label: "Invoice overdue",
    audience: "driver",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Action needed: your invoice is overdue",
    emailBody:
      "Hi {{first_name}},\n\nOur records show your invoice is overdue. A 10% late fee applies and continued non-payment may restrict access to the vehicle.\n\nPlease settle the balance from your dashboard today, or reply to this email and our team will work with you.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "payment_overdue",
    sms: "Rentmaikar: {{first_name}}, your invoice is overdue. Settle today to avoid a late fee and service restriction.",
    whatsapp: `Hi {{first_name}},\n\nYour Rentmaikar invoice is now overdue. A 10% late fee applies and vehicle access may be restricted.\n\nPlease settle the balance today from your dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Invoice overdue",
    pushBody: "Settle your overdue invoice to avoid a late fee.",
  },
  {
    kind: "invoices_status",
    status: "paid",
    useCaseId: "payment_received",
    label: "Invoice paid",
    audience: "driver",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Payment received — invoice settled",
    emailBody:
      "Hi {{first_name}},\n\nWe have received your payment and the invoice is now settled. Your receipt is available in your dashboard.\n\nThank you,\nRentmaikar Support",
    smsNotificationType: "payment_received",
    sms: "Rentmaikar: Thanks {{first_name}}, your invoice is settled. Receipt is in your dashboard.",
    whatsapp: `Thank you {{first_name}} ✅\n\nYour invoice is settled and the receipt is available in your dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Invoice paid",
    pushBody: "Your invoice has been settled. Thank you.",
  },
  {
    kind: "invoices_status",
    useCaseId: "payment_reminder",
    label: "Invoice status update",
    audience: "driver",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Invoice update",
    emailBody:
      "Hi {{first_name}},\n\nYour invoice status changed to {{status}}. Sign in to your dashboard for the full breakdown.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your invoice status is now {{status}}. Sign in for details.",
    whatsapp: `Hi {{first_name}},\n\nYour invoice status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Invoice update",
    pushBody: "Your invoice status is now {{status}}.",
  },

  // ------------------------------------------------------------------- Payments
  {
    kind: "payments_status",
    status: "succeeded",
    useCaseId: "payment_received",
    label: "Payment succeeded",
    audience: "driver",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "Payment received",
    emailBody:
      "Hi {{first_name}},\n\nWe have received your payment. Your rental remains active and the receipt is in your dashboard.\n\nThank you,\nRentmaikar Support",
    smsNotificationType: "payment_received",
    sms: "Rentmaikar: Thanks {{first_name}}, your payment was received.",
    whatsapp: `Thank you {{first_name}} ✅\n\nYour payment was received and your rental remains active.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Payment received",
    pushBody: "Your payment was received. Thank you.",
  },
  {
    kind: "payments_status",
    status: "failed",
    useCaseId: "overdue_warning",
    label: "Payment failed",
    audience: "driver",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Your payment did not go through",
    emailBody:
      "Hi {{first_name}},\n\nYour recent payment attempt failed. Please update your payment method and retry from your dashboard to avoid a late fee.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "payment_failed",
    sms: "Rentmaikar: {{first_name}}, your payment failed. Update your payment method and retry to avoid a late fee.",
    whatsapp: `Hi {{first_name}},\n\nYour recent payment attempt failed. Please update your payment method and retry from your dashboard to avoid a late fee.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Payment failed",
    pushBody: "Your payment attempt failed. Please retry.",
  },
  {
    kind: "payments_status",
    useCaseId: "payment_reminder",
    label: "Payment status update",
    audience: "driver",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Payment update",
    emailBody:
      "Hi {{first_name}},\n\nYour payment status changed to {{status}}. Sign in to your dashboard for details.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your payment status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour payment status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Payment update",
    pushBody: "Your payment status is now {{status}}.",
  },

  // -------------------------------------------------------------------- Rentals
  {
    kind: "rentals_created",
    useCaseId: "pickup_details",
    label: "Rental created",
    audience: "all",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Your rental is set up",
    emailBody:
      "Hi {{first_name}},\n\nYour rental has been created. Handover details, including the pickup location and date, are available in your dashboard.\n\nPlease bring a valid driver licence to the handover. All communication and payments stay on the Rentmaikar platform.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "vehicle_assigned",
    sms: "Rentmaikar: {{first_name}}, your rental is set up. Handover details are in your dashboard.",
    whatsapp: `Hi {{first_name}},\n\nYour rental has been created. Pickup location and handover date are in your dashboard.\n\nBring a valid driver licence to the handover.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Rental created",
    pushBody: "Handover details are ready in your dashboard.",
  },
  {
    kind: "rentals_status",
    useCaseId: "pickup_details",
    label: "Rental status update",
    audience: "all",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Rental update",
    emailBody:
      "Hi {{first_name}},\n\nYour rental status changed to {{status}}. Sign in to your dashboard for the details.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your rental status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour rental status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Rental update",
    pushBody: "Your rental status is now {{status}}.",
  },

  // ------------------------------------------------------------------- Bookings
  {
    kind: "vehicle_booking_requests_created",
    useCaseId: "booking_confirmation",
    label: "Booking request submitted",
    audience: "driver",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "We received your booking request",
    emailBody:
      "Hi {{first_name}},\n\nYour booking request has been received. We will confirm the vehicle and share the handover details shortly.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, we received your booking request. We'll confirm shortly.",
    whatsapp: `Hi {{first_name}},\n\nWe received your booking request and will confirm the vehicle shortly.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Booking request received",
    pushBody: "We received your booking request.",
  },
  {
    kind: "vehicle_booking_requests_status",
    status: "approved",
    useCaseId: "booking_confirmation",
    label: "Booking confirmed",
    audience: "driver",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Your booking is confirmed",
    emailBody:
      "Hi {{first_name}},\n\nYour booking is confirmed. The pickup location, dates and rate are available in your dashboard, and our team will share the handover details before pickup.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "booking_confirmation",
    sms: "Rentmaikar: {{first_name}}, your booking is confirmed. Pickup details are in your dashboard.",
    whatsapp: `Great news {{first_name}} 🎉\n\nYour booking is confirmed. Pickup location, dates and rate are in your dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Booking confirmed",
    pushBody: "Your booking is confirmed. Pickup details are ready.",
  },
  {
    kind: "vehicle_booking_requests_status",
    status: "cancelled",
    useCaseId: "booking_confirmation",
    label: "Booking cancelled",
    audience: "driver",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "Your booking was cancelled",
    emailBody:
      "Hi {{first_name}},\n\nYour booking has been cancelled. If this was unexpected, reply to this email and our team will help you find another vehicle.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "booking_cancellation",
    sms: "Rentmaikar: {{first_name}}, your booking was cancelled. Reply or sign in if you need another vehicle.",
    whatsapp: `Hi {{first_name}},\n\nYour booking has been cancelled. Reply here if you would like help finding another vehicle.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Booking cancelled",
    pushBody: "Your booking has been cancelled.",
  },
  {
    kind: "vehicle_booking_requests_status",
    useCaseId: "booking_confirmation",
    label: "Booking status update",
    audience: "driver",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Booking update",
    emailBody:
      "Hi {{first_name}},\n\nYour booking status changed to {{status}}. Sign in to your dashboard for details.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your booking status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour booking status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Booking update",
    pushBody: "Your booking status is now {{status}}.",
  },

  // ------------------------------------------------------------ Vehicle listings
  {
    kind: "vehicle_review",
    useCaseId: "vehicle_live",
    label: "Vehicle review outcome",
    audience: "owner",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "Review outcome for your vehicle",
    emailBody:
      "Hi {{first_name}},\n\nYour vehicle listing review is complete. The outcome is {{status}} — sign in to your dashboard to see the reviewer notes and any required fixes.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your vehicle review outcome is {{status}}. Sign in for details.",
    whatsapp: `Hi {{first_name}},\n\nYour vehicle listing review is complete — outcome: *{{status}}*. Sign in for reviewer notes.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Vehicle review complete",
    pushBody: "Review outcome: {{status}}.",
  },
  {
    kind: "vehicles_catalogue_live",
    useCaseId: "vehicle_live",
    label: "Vehicle is live in the catalogue",
    audience: "owner",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Your vehicle is now live",
    emailBody:
      "Hi {{first_name}},\n\nYour vehicle has been reviewed and is now live in the Rentmaikar catalogue, visible to verified drivers in your region.\n\nWe will notify you as soon as a driver is matched.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "vehicle_listed",
    sms: "Rentmaikar: Good news {{first_name}} — your vehicle is now live and visible to verified drivers.",
    whatsapp: `Good news {{first_name}} 🚗\n\nYour vehicle is now live in the Rentmaikar catalogue and visible to verified drivers.\n\nWe will notify you as soon as a driver is matched.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Your vehicle is live",
    pushBody: "Your listing is now visible to verified drivers.",
  },

  // -------------------------------------------------------------- Negotiations
  {
    kind: "price_negotiations_created",
    useCaseId: "support_ack",
    label: "Price negotiation submitted",
    audience: "all",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "We received your price request",
    emailBody:
      "Hi {{first_name}},\n\nYour price negotiation request has been submitted and our team is reviewing it. We will notify you as soon as there is an outcome.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "negotiation_submitted",
    sms: "Rentmaikar: {{first_name}}, your price request was submitted. We'll review it shortly.",
    whatsapp: `Hi {{first_name}},\n\nYour price negotiation request has been submitted and is under review.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Price request submitted",
    pushBody: "Your price negotiation is under review.",
  },
  {
    kind: "price_negotiations_status",
    status: "approved",
    useCaseId: "support_ack",
    label: "Price negotiation approved",
    audience: "all",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Your price request was approved",
    emailBody:
      "Hi {{first_name}},\n\nYour price negotiation has been approved. The agreed rate is now applied to your rental — sign in to your dashboard to review it.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "price_approved",
    sms: "Rentmaikar: Good news {{first_name}} — your price request was approved. Sign in to view the new rate.",
    whatsapp: `Good news {{first_name}} ✅\n\nYour price request was approved and the agreed rate is applied to your rental.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Price approved",
    pushBody: "Your negotiated rate has been approved.",
  },
  {
    kind: "price_negotiations_status",
    status: "rejected",
    useCaseId: "support_ack",
    label: "Price negotiation declined",
    audience: "all",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "Update on your price request",
    emailBody:
      "Hi {{first_name}},\n\nYour price negotiation was not approved. You can submit a new request from your dashboard, or reply to this email and our team will help.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "price_rejected",
    sms: "Rentmaikar: {{first_name}}, your price request was not approved. Sign in to submit a new one.",
    whatsapp: `Hi {{first_name}},\n\nYour price request was not approved. You can submit a new request from your dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Price request declined",
    pushBody: "Your price request was not approved.",
  },
  {
    kind: "price_negotiations_status",
    status: "locked",
    useCaseId: "support_ack",
    label: "Price locked",
    audience: "all",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "Your rate is now locked",
    emailBody:
      "Hi {{first_name}},\n\nThe negotiated rate for your rental is now locked. To change it, submit a modification request from your dashboard.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "price_locked",
    sms: "Rentmaikar: {{first_name}}, your negotiated rate is now locked. Submit a change request to modify it.",
    whatsapp: `Hi {{first_name}},\n\nYour negotiated rate is now locked. To modify it, submit a change request from your dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Rate locked",
    pushBody: "Your negotiated rate is locked.",
  },
  {
    kind: "price_negotiations_status",
    useCaseId: "support_ack",
    label: "Price negotiation update",
    audience: "all",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Price negotiation update",
    emailBody:
      "Hi {{first_name}},\n\nYour price negotiation status changed to {{status}}. Sign in to your dashboard to respond.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "price_counter_offer",
    sms: "Rentmaikar: your price negotiation status is now {{status}}. Sign in to respond.",
    whatsapp: `Hi {{first_name}},\n\nYour price negotiation status is now *{{status}}*. Sign in to respond.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Negotiation update",
    pushBody: "Your negotiation status is now {{status}}.",
  },

  // ------------------------------------------------------------------- Payouts
  {
    kind: "owner_payouts_status",
    status: "paid",
    useCaseId: "owner_payout",
    label: "Owner payout paid",
    audience: "owner",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Payout processed",
    emailBody:
      "Hi {{first_name}},\n\nYour payout has been processed. The full earnings breakdown, including platform fees, is available in your earnings dashboard.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "owner_payout",
    sms: "Rentmaikar: {{first_name}}, your payout has been processed. Details are in your earnings dashboard.",
    whatsapp: `Hi {{first_name}},\n\nYour payout has been processed. The full breakdown is in your earnings dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Payout processed",
    pushBody: "Your payout has been processed.",
  },
  {
    kind: "owner_payouts_status",
    useCaseId: "owner_payout",
    label: "Payout status update",
    audience: "owner",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Payout update",
    emailBody:
      "Hi {{first_name}},\n\nYour payout status changed to {{status}}. Sign in to your earnings dashboard for details.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your payout status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour payout status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Payout update",
    pushBody: "Your payout status is now {{status}}.",
  },
  {
    kind: "withdrawal_authorizations_status",
    useCaseId: "owner_payout",
    label: "Withdrawal authorization update",
    audience: "owner",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "Withdrawal update",
    emailBody:
      "Hi {{first_name}},\n\nYour withdrawal request status changed to {{status}}. Sign in to your earnings dashboard for the details.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your withdrawal status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour withdrawal status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Withdrawal update",
    pushBody: "Your withdrawal status is now {{status}}.",
  },

  // ---------------------------------------------------------- Legal agreements
  {
    kind: "legal_agreements_created",
    useCaseId: "document_request",
    label: "Agreement ready to sign",
    audience: "all",
    channels: ["email", "push", "sms", "whatsapp"],
    emailTemplate: "event_notification",
    emailSubject: "Your rental agreement is ready to sign",
    emailBody:
      "Hi {{first_name}},\n\nYour rental agreement is ready. Please sign in to your dashboard to review and sign it — the rental cannot start until it is signed.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your rental agreement is ready to sign in your dashboard.",
    whatsapp: `Hi {{first_name}},\n\nYour rental agreement is ready to review and sign in your Rentmaikar dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Agreement ready",
    pushBody: "Your rental agreement is ready to sign.",
  },
  {
    kind: "legal_agreements_status",
    useCaseId: "document_request",
    label: "Agreement status update",
    audience: "all",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Agreement update",
    emailBody:
      "Hi {{first_name}},\n\nYour rental agreement status changed to {{status}}. A copy is always available in your dashboard.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your rental agreement status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour rental agreement status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Agreement update",
    pushBody: "Your agreement status is now {{status}}.",
  },

  // ----------------------------------------------------------------- Rent to own
  {
    kind: "rent_to_own_agreements_created",
    useCaseId: "document_request",
    label: "Rent-to-own agreement created",
    audience: "driver",
    channels: ["email", "push", "sms"],
    emailTemplate: "event_notification",
    emailSubject: "Your rent-to-own agreement is ready",
    emailBody:
      "Hi {{first_name}},\n\nYour rent-to-own agreement has been prepared. Please review and sign it from your dashboard to activate the plan.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your rent-to-own agreement is ready to sign.",
    whatsapp: `Hi {{first_name}},\n\nYour rent-to-own agreement is ready to review and sign in your dashboard.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Rent-to-own agreement ready",
    pushBody: "Review and sign your rent-to-own agreement.",
  },
  {
    kind: "rent_to_own_agreements_status",
    useCaseId: "document_request",
    label: "Rent-to-own status update",
    audience: "driver",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Rent-to-own update",
    emailBody:
      "Hi {{first_name}},\n\nYour rent-to-own agreement status changed to {{status}}. Sign in to your dashboard for the payment schedule and balance.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your rent-to-own agreement status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour rent-to-own agreement status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Rent-to-own update",
    pushBody: "Your agreement status is now {{status}}.",
  },

  // --------------------------------------------------------------- Subscriptions
  {
    kind: "user_subscriptions_created",
    useCaseId: "payment_received",
    label: "Subscription started",
    audience: "all",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Your subscription is active",
    emailBody:
      "Hi {{first_name}},\n\nYour subscription is now active. You can review the plan, billing date and invoices in your dashboard at any time.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your subscription is now active.",
    whatsapp: `Hi {{first_name}},\n\nYour Rentmaikar subscription is now active.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Subscription active",
    pushBody: "Your subscription is now active.",
  },
  {
    kind: "user_subscriptions_status",
    useCaseId: "payment_reminder",
    label: "Subscription status update",
    audience: "all",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Subscription update",
    emailBody:
      "Hi {{first_name}},\n\nYour subscription status changed to {{status}}. Sign in to your dashboard to manage the plan or update billing.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: your subscription status is now {{status}}.",
    whatsapp: `Hi {{first_name}},\n\nYour subscription status is now *{{status}}*.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Subscription update",
    pushBody: "Your subscription status is now {{status}}.",
  },

  // ------------------------------------------------------------------ Onboarding
  {
    kind: "onboarding_stage",
    useCaseId: "document_request",
    label: "Onboarding stage change",
    audience: "all",
    channels: ["email", "push"],
    emailTemplate: "event_notification",
    emailSubject: "Next step in your Rentmaikar onboarding",
    emailBody:
      "Hi {{first_name}},\n\nYour onboarding has moved to {{status}}. Sign in to your dashboard to complete the next step — including any outstanding documents.\n\nRegards,\nRentmaikar Support",
    smsNotificationType: "general",
    sms: "Rentmaikar: {{first_name}}, your onboarding moved to {{status}}. Sign in to continue.",
    whatsapp: `Hi {{first_name}},\n\nYour onboarding moved to *{{status}}*. Sign in to complete the next step.\n\n${SUPPORT_SIGNOFF}`,
    pushTitle: "Onboarding update",
    pushBody: "Your onboarding moved to {{status}}.",
  },
];

/** Placeholder renderer shared with message-templates.ts semantics. */
export function renderEventCopy(
  body: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return body
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      const v = values[key];
      return v === undefined || v === null ? "" : String(v);
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/**
 * Most specific mapping wins: exact kind + status, then the kind-wide default.
 * Returns null when an event has no mapped template (generic copy is used).
 */
export function resolveEventTemplate(
  kind: string,
  status?: string | null,
): EventTemplateMapping | null {
  const forKind = EVENT_TEMPLATE_MAP.filter((m) => m.kind === kind);
  if (forKind.length === 0) return null;
  if (status) {
    const exact = forKind.find(
      (m) => m.status && m.status.toLowerCase() === String(status).toLowerCase(),
    );
    if (exact) return exact;
  }
  return forKind.find((m) => !m.status) ?? null;
}

/** All mapped kinds, for the admin Docs matrix. */
export const mappedEventKinds = (): string[] =>
  Array.from(new Set(EVENT_TEMPLATE_MAP.map((m) => m.kind)));
