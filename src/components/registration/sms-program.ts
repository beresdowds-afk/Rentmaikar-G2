/**
 * SMS program keyword + opt-in timing disclosures (A2P 10DLC).
 *
 * Kept in a component-free module so both UI and the consent audit logger can
 * snapshot the exact wording that was shown to the user.
 */

export const SMS_KEYWORDS: { keyword: string; meaning: string; reply: string }[] = [
  {
    keyword: "START",
    meaning: "Re-subscribe after opting out",
    reply:
      "Rentmaikar: You are re-subscribed to Rentmaikar text messages. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.",
  },
  {
    keyword: "STOP",
    meaning: "Opt out of all Rentmaikar text messages",
    reply:
      "Rentmaikar: You have been unsubscribed and will receive no further messages. Reply START to re-subscribe.",
  },
  {
    keyword: "HELP",
    meaning: "Get support contact details",
    reply:
      "Rentmaikar: For help email support@rentmaikar.com or visit rentmaikar.com/contact. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.",
  },
];

export const SMS_OPT_IN_TIMING: string[] = [
  "Consent takes effect immediately when you check the box and submit the form on this page.",
  "Verification codes are sent within seconds of you requesting one.",
  "Account, application, payment and rental service messages start as soon as the related event happens on your account — typically within minutes.",
  "Payment reminders are sent up to 72 hours before a due date, then at 12-hour intervals until the payment clears.",
  "Optional promotional messages, if you opted in to them, are sent no more than a few times per month.",
  "Messages are only sent during 9:00 AM – 9:00 PM ET (United States) or 8:00 AM – 8:00 PM WAT (Nigeria), except for security and verification codes you request.",
  "Opting out takes effect immediately: reply STOP, or uncheck the box in Profile Settings, and no further messages of that type are sent.",
];
