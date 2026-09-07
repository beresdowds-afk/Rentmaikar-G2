/**
 * Canonical Email Template Registry for the Admin Email Composer Console
 * 
 * Links email templates directly to event triggers, message composers,
 * designated phone numbers, and Resend service provider routing.
 */

export interface EmailTemplateDefinition {
  id: string;
  name: string;
  category: "bookings" | "billing" | "fleet" | "verify" | "support" | "marketing" | "system";
  defaultSenderAlias: "support" | "billing" | "bookings" | "fleet" | "verify" | "notifications" | "admin";
  defaultSubject: string;
  defaultBody: string;
  parameters: string[];
  description: string;
  priority?: "low" | "normal" | "high" | "urgent";
}

export const EMAIL_TEMPLATES_CATALOG: EmailTemplateDefinition[] = [
  {
    id: "booking_confirmation",
    name: "Booking Confirmed & Handover Details",
    category: "bookings",
    defaultSenderAlias: "bookings",
    defaultSubject: "Your Rentmaikar Booking is Confirmed — {{vehicle_name}}",
    defaultBody: `Hi {{first_name}},

Great news! Your booking for {{vehicle_name}} (Plate: {{plate_number}}) is confirmed.

Handover Schedule:
• Pickup Date & Time: {{pickup_date}}
• Location: {{pickup_location}}
• Booking ID: {{booking_id}}

Please bring your valid driver's license and national ID to the handover hub. Complete check-in in your mobile dashboard before arrival.

Need assistance or route guidance? Reply directly to this email or call our 24/7 fleet hub at +1 (608) 384-3932 (US) or +234 800 RENTMAIKAR (Nigeria).

Drive safe,
Rentmaikar Fleet Operations`,
    parameters: ["first_name", "vehicle_name", "plate_number", "pickup_date", "pickup_location", "booking_id"],
    description: "Official vehicle handover confirmation with schedule, location, and requirement checklist.",
    priority: "high",
  },
  {
    id: "payment_receipt",
    name: "Payment Receipt & Invoice Settled",
    category: "billing",
    defaultSenderAlias: "billing",
    defaultSubject: "Payment Receipt: {{currency}} {{amount}} Received",
    defaultBody: `Hi {{first_name}},

Thank you for your payment. We have received {{currency}} {{amount}} and your invoice is now settled.

Transaction Summary:
• Reference: {{transaction_id}}
• Rental Period: {{period_start}} to {{period_end}}
• Payment Method: Verified Card / Electronic Settlement
• Status: Completed & Cleared

Your official tax invoice and PDF receipt are available in your Rentmaikar billing portal.

Regards,
Rentmaikar Billing & Accounts`,
    parameters: ["first_name", "currency", "amount", "transaction_id", "period_start", "period_end"],
    description: "Payment confirmation receipt with transaction reference and settled rental period.",
    priority: "normal",
  },
  {
    id: "payment_reminder",
    name: "Upcoming Payment Reminder",
    category: "billing",
    defaultSenderAlias: "billing",
    defaultSubject: "Payment Reminder: Invoice Due on {{due_date}}",
    defaultBody: `Hi {{first_name}},

This is a friendly reminder that your upcoming rental payment of {{currency}} {{amount}} is due on {{due_date}}.

Vehicle: {{vehicle_name}}

To avoid late fees or automatic immobilizer schedule, please ensure your card has sufficient balance or pay online through your dashboard today:
https://rentmaikar.com/dashboard/billing

If you have questions regarding your statement, reply to this email to reach our accounts team.

Regards,
Rentmaikar Billing Support`,
    parameters: ["first_name", "currency", "amount", "due_date", "vehicle_name"],
    description: "Pre-due payment reminder with due date, amount, and payment portal link.",
    priority: "normal",
  },
  {
    id: "payment_overdue",
    name: "Urgent Overdue Notice & Late Fee Warning",
    category: "billing",
    defaultSenderAlias: "billing",
    defaultSubject: "URGENT: Overdue Payment Notice — Immediate Action Required",
    defaultBody: `Hi {{first_name}},

Our records indicate that your rental payment of {{currency}} {{amount}} for {{vehicle_name}} is currently overdue by {{days_overdue}} days.

A late fee has been applied in accordance with platform terms. Continued non-payment will result in telematics ignition restriction and recovery protocols.

Please clear your outstanding balance immediately:
https://rentmaikar.com/dashboard/billing

If you are experiencing hardship or believe this is an error, contact our dispatch supervisor immediately at +1 (608) 384-3932 or reply to this message.

Rentmaikar Risk & Collections`,
    parameters: ["first_name", "currency", "amount", "vehicle_name", "days_overdue"],
    description: "Urgent overdue balance demand with late fee disclosure and resolution link.",
    priority: "urgent",
  },
  {
    id: "vehicle_assigned",
    name: "Vehicle Assigned & Ready for Handover",
    category: "fleet",
    defaultSenderAlias: "fleet",
    defaultSubject: "Vehicle Assignment Confirmed — {{vehicle_name}}",
    defaultBody: `Hi {{first_name}},

Your vehicle assignment has been completed by our fleet manager.

Assigned Vehicle: {{vehicle_name}}
Registration Plate: {{plate_number}}
Hub Location: {{pickup_location}}

Please review the digital vehicle inspection checklist and sign the rental agreement in your app before receiving the keys.

Have your physical driver's license ready at the hub counter.

Safe travels,
Rentmaikar Hub Team`,
    parameters: ["first_name", "vehicle_name", "plate_number", "pickup_location"],
    description: "Vehicle assignment notification with hub location and pre-handover protocol.",
    priority: "high",
  },
  {
    id: "vehicle_lockdown",
    name: "Vehicle Immobilizer / Lockdown Notice",
    category: "fleet",
    defaultSenderAlias: "support",
    defaultSubject: "Notice: Vehicle Ignition Access Temporarily Suspended",
    defaultBody: `Hi {{first_name}},

Please be advised that ignition access for {{vehicle_name}} ({{plate_number}}) has been temporarily locked via our fleet telematics system.

Reason: {{lockdown_reason}}

To restore vehicle ignition access:
1. Settle any outstanding invoices or pending documentation in your portal: https://rentmaikar.com/dashboard
2. Once settled, ignition restoration will automatically process within 10 minutes.

For urgent emergency assistance, call our telematics desk at +1 (608) 384-3932 (US) or +234 800 RENTMAIKAR (NG).

Rentmaikar Operations Security`,
    parameters: ["first_name", "vehicle_name", "plate_number", "lockdown_reason"],
    description: "Telematics ignition lockdown notification with cause and immediate resolution steps.",
    priority: "urgent",
  },
  {
    id: "vehicle_unlocked",
    name: "Vehicle Access Restored",
    category: "fleet",
    defaultSenderAlias: "fleet",
    defaultSubject: "Vehicle Access Restored — Ready to Drive",
    defaultBody: `Hi {{first_name}},

We are pleased to inform you that vehicle access for {{vehicle_name}} ({{plate_number}}) has been fully restored. The immobilizer has been cleared.

Thank you for resolving the outstanding requirement promptly. You are clear to continue operating on the rideshare network.

Drive safely,
Rentmaikar Fleet Operations`,
    parameters: ["first_name", "vehicle_name", "plate_number"],
    description: "Confirmation that telematics lock has been lifted and normal driving resumed.",
    priority: "high",
  },
  {
    id: "document_verified",
    name: "Documents Verified & Account Approved",
    category: "verify",
    defaultSenderAlias: "verify",
    defaultSubject: "Congratulations! Your Rentmaikar Profile is Verified & Approved",
    defaultBody: `Hi {{first_name}},

Great news! Our compliance team has reviewed and approved your identity documents and driver credentials.

Your Rentmaikar account is now fully active. You can browse available vehicles, place reservations, and manage your rentals with zero delay.

Sign in to pick your vehicle:
https://rentmaikar.com/vehicles

Welcome to the Rentmaikar community!

Warm regards,
Rentmaikar Trust & Safety`,
    parameters: ["first_name"],
    description: "KYC and compliance approval notification giving full clearance to reserve vehicles.",
    priority: "normal",
  },
  {
    id: "document_verification_failed",
    name: "Document Verification Action Required",
    category: "verify",
    defaultSenderAlias: "verify",
    defaultSubject: "Action Required: Update Your Verification Documents",
    defaultBody: `Hi {{first_name}},

Our compliance team was unable to verify one or more of your submitted documents.

Reason: The uploaded document was blurry, expired, or did not match the registered legal name.

Please upload a clear, high-resolution photo of your valid driver's license and national identity card via your verification portal:
https://rentmaikar.com/dashboard/documents

Once received, our team will expedite re-verification within 2 to 4 business hours.

Rentmaikar Compliance Team`,
    parameters: ["first_name"],
    description: "Notice requesting document re-upload with reasons and portal link.",
    priority: "high",
  },
  {
    id: "vehicle_maintenance_reminder",
    name: "Scheduled Vehicle Maintenance & Inspection",
    category: "fleet",
    defaultSenderAlias: "fleet",
    defaultSubject: "Scheduled Fleet Maintenance Notice — {{vehicle_name}}",
    defaultBody: `Hi {{first_name}},

Your vehicle {{vehicle_name}} (Plate: {{plate_number}}) is scheduled for routine preventive maintenance and mechanical safety inspection.

Scheduled Date: {{due_date}}
Service Center: {{pickup_location}}

Routine servicing preserves your vehicle performance and keeps your insurance coverage valid. Please bring the vehicle to the designated hub on time. A replacement or loaner vehicle may be arranged if extensive work is needed.

Thank you for your cooperation,
Rentmaikar Maintenance Operations`,
    parameters: ["first_name", "vehicle_name", "plate_number", "due_date", "pickup_location"],
    description: "Fleet inspection and maintenance notice specifying service hub and time.",
    priority: "normal",
  },
  {
    id: "owner_payout",
    name: "Vehicle Host / Owner Payout Processed",
    category: "billing",
    defaultSenderAlias: "billing",
    defaultSubject: "Host Payout Processed: {{currency}} {{amount}}",
    defaultBody: `Hi {{first_name}},

Good news! Your earnings payout of {{currency}} {{amount}} has been processed and transferred to your registered bank account.

Payout Reference: {{transaction_id}}
Period: {{period_start}} to {{period_end}}

You can review your detailed earnings statement, platform fees, and tax summaries in your Owner Portal:
https://rentmaikar.com/owner/earnings

Thank you for hosting your fleet with Rentmaikar!

Best regards,
Rentmaikar Partner Relations`,
    parameters: ["first_name", "currency", "amount", "transaction_id", "period_start", "period_end"],
    description: "Host earnings payout notification with amount, reference, and portal link.",
    priority: "normal",
  },
  {
    id: "support_ticket_response",
    name: "Support Case Response",
    category: "support",
    defaultSenderAlias: "support",
    defaultSubject: "Rentmaikar Support: Update on Ticket #{{record_id}}",
    defaultBody: `Hi {{first_name}},

Thank you for contacting Rentmaikar Support.

In response to your inquiry regarding ticket #{{record_id}}:

Our team has investigated the details and updated your account accordingly. If you need additional clarification, you can reply directly to this email to keep all correspondence within the same thread.

For urgent road emergencies, remember that our dispatch line is available 24/7 at +1 (608) 384-3932 (US) or +234 800 RENTMAIKAR (Nigeria).

Kind regards,
Rentmaikar Customer Care Team`,
    parameters: ["first_name", "record_id"],
    description: "Standard support ticket response linking directly into the unified thread.",
    priority: "normal",
  },
  {
    id: "accident_alert",
    name: "Incident & Road Safety Response",
    category: "support",
    defaultSenderAlias: "support",
    defaultSubject: "Urgent: Incident Report Logged — Safety Dispatch Notice",
    defaultBody: `Hi {{first_name}},

We have received an incident report for vehicle {{vehicle_name}} ({{plate_number}}).

Emergency Checklist:
1. Ensure everyone is in a safe location and seek medical attention if anyone is hurt.
2. If another vehicle was involved, obtain their contact and insurance details.
3. Take clear photos of all vehicle positions, damages, and surroundings.
4. Obtain an official police report if damage is significant.

Our safety response supervisor has been alerted and will reach out to your registered mobile phone. You may also contact our emergency line immediately at +1 (608) 384-3932.

Rentmaikar Safety & Incident Team`,
    parameters: ["first_name", "vehicle_name", "plate_number"],
    description: "Emergency incident protocol with immediate checklist and supervisor contact.",
    priority: "urgent",
  },
  {
    id: "welcome_driver",
    name: "Welcome Driver Partner",
    category: "marketing",
    defaultSenderAlias: "support",
    defaultSubject: "Welcome to Rentmaikar — Your Mobility Partner",
    defaultBody: `Hi {{first_name}},

Welcome to Rentmaikar! We're thrilled to have you join our growing network of verified rideshare and delivery drivers.

With Rentmaikar, you get:
✓ Well-maintained, fuel-efficient vehicles tailored for Uber, Bolt, and Lyft.
✓ Full insurance coverage and 24/7 roadside assistance.
✓ Flexible weekly or monthly rental terms with rent-to-own pathways.

Next Step: Complete your profile verification to unlock instant vehicle reservations:
https://rentmaikar.com/dashboard/onboarding

Let's hit the road together,
The Rentmaikar Team`,
    parameters: ["first_name"],
    description: "Warm onboarding email for newly registered drivers.",
    priority: "normal",
  },
];
