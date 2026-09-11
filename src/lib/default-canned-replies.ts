import { CannedReply } from '@/hooks/useCannedReplies';

export const DEFAULT_COORDINATED_OWNER_TEMPLATES: Omit<CannedReply, 'created_at'>[] = [
  {
    id: 'canned_owner_compliance_sms',
    title: 'Owner Vehicle & Profile Compliance Notice (SMS)',
    channel: 'sms',
    region: null,
    sort_order: 1,
    is_active: true,
    body: 'Rentmaikar: Hello [OWNER NAME]. Please visit your owner portal: [INDIVIDUAL PORTAL LINK] to complete the required fields for each of your listed vehicles and update or verify your phone number. A verified phone number is required to enable personal withdrawals from your vehicle earnings. Please also update the pickup location for each vehicle, as this is required for the vehicle to be listed in the Rentmaikar catalog. For your security, do not share your portal link with anyone. If you have already provided the requested information, please disregard this message. We apologize for any inconvenience. For assistance, contact Rentmaikar Support.',
  },
  {
    id: 'canned_owner_compliance_email',
    title: 'Owner Account & Vehicle Information Notice (Email)',
    channel: 'email',
    region: null,
    sort_order: 2,
    is_active: true,
    body: `Dear [OWNER NAME],

We are contacting you regarding the information associated with your Rentmaikar owner account.

Please visit your owner portal using your individual link below:

[INDIVIDUAL PORTAL LINK]

Please review and complete the required information for each vehicle currently listed on your account, and update or verify your registered phone number.

A verified phone number is required to enable you to make personal withdrawals from your vehicle earnings.

In addition, please ensure that the pickup location for each vehicle is accurately provided. A pickup location is a required vehicle detail before that vehicle can be listed in the Rentmaikar catalog.

Security notice: Your portal link is intended for you only. Please do not forward, share, or disclose your individual portal link to any third party.

If you have already supplied all of the requested information, no further action is required and you may disregard this message.

We acknowledge that completing these updates may cause some inconvenience, and we sincerely apologize for any disruption. These requirements are intended to ensure that your owner and vehicle information is complete and that applicable account functions can operate correctly.

If you need assistance, please contact Rentmaikar Support.

Regards,
Rentmaikar Support
THE SMART PLATFORM FOR RIDESHARE VEHICLE RENTALS AND MANAGEMENT`,
  },
  {
    id: 'canned_owner_compliance_whatsapp',
    title: 'Owner Vehicle & Phone Verification Notice (WhatsApp)',
    channel: 'whatsapp',
    region: null,
    sort_order: 3,
    is_active: true,
    body: `Hello [OWNER NAME],

This is Rentmaikar Support regarding your registered owner account.

Please visit your individual owner portal:

[INDIVIDUAL PORTAL LINK]

Kindly complete the required fields for each of your listed vehicles and update or verify your registered phone number.

A verified phone number is required to enable personal withdrawals from your vehicle earnings.

Please also make sure that the pickup location for each vehicle is updated. A pickup location is required before a vehicle can be listed in the Rentmaikar catalog.

🔒 Security: Your portal link is intended only for you. Please do not share or forward it to any third party.

If you have already supplied all the requested information, please disregard this message.

We apologize for any inconvenience these updates may cause and appreciate your cooperation.

If you require assistance, please contact Rentmaikar Support.`,
  },
  {
    id: 'canned_vehicle_inspection_sms',
    title: 'Vehicle Inspection & Deadline Notice (SMS)',
    channel: 'sms',
    region: null,
    sort_order: 4,
    is_active: true,
    body: 'Rentmaikar: Hi [OWNER NAME], your [VEHICLE_MAKE] [VEHICLE_MODEL] is scheduled for compliance inspection due by [DUE_DATE]. Please review pickup at [PICKUP_LOCATION] or submit records via your portal: [INDIVIDUAL PORTAL LINK]. For questions, contact [SUPPORT_PHONE].',
  },
  {
    id: 'canned_vehicle_payment_email',
    title: 'Vehicle Rental & Due Date Notice (Email)',
    channel: 'email',
    region: null,
    sort_order: 5,
    is_active: true,
    body: `Dear [FIRST_NAME],

This is an important update regarding your assigned [VEHICLE_MAKE] [VEHICLE_MODEL] (Registration: [LICENSE_PLATE]).

Upcoming Deadline: [DUE_DATE]
Outstanding Balance / Due Amount: [AMOUNT_DUE]
Designated Pickup/Hub: [PICKUP_LOCATION]

Please visit your portal link to review complete vehicle status and settle any pending actions:
[INDIVIDUAL PORTAL LINK]

Security Notice: This link is unique to your account. Do not share it with third parties.

Regards,
[COMPANY_NAME] Operations Team
Support: [SUPPORT_EMAIL] | [SUPPORT_PHONE]`,
  },
  {
    id: 'canned_vehicle_dispatch_whatsapp',
    title: 'Vehicle Status & Renewal Reminder (WhatsApp)',
    channel: 'whatsapp',
    region: null,
    sort_order: 6,
    is_active: true,
    body: `Hello [OWNER NAME],

This is an automated notification from [COMPANY_NAME] regarding your [VEHICLE_MAKE] [VEHICLE_MODEL].

📅 Action Due Date: [DUE_DATE]
🚗 Vehicle: [VEHICLE_MAKE] [VEHICLE_MODEL] ([LICENSE_PLATE])
📍 Fleet Depot: [PICKUP_LOCATION]

Please click your secure portal link below to complete the verification before [DUE_DATE]:
[INDIVIDUAL PORTAL LINK]

If you need any assistance, our support team is available at [SUPPORT_PHONE].`,
  },
];

