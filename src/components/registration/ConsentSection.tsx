import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Link } from "react-router-dom";
import { MessageSquare, ShieldCheck } from "lucide-react";
import SmsConsentCheckboxes from "@/components/registration/SmsConsentCheckboxes";

export type MessagingChannel = "none" | "sms" | "whatsapp";

interface ConsentSectionProps {
  messagingConsent: boolean;
  messagingChannel: MessagingChannel;
  dataSharingConsent: boolean;
  onMessagingConsentChange: (value: boolean) => void;
  onMessagingChannelChange: (value: MessagingChannel) => void;
  onDataSharingConsentChange: (value: boolean) => void;
  messagingError?: string;
  channelError?: string;
  dataSharingError?: string;
  /** Optional A2P 10DLC SMS opt-in (rendered only when handlers are supplied). */
  smsServiceConsent?: boolean;
  smsMarketingConsent?: boolean;
  onSmsServiceConsentChange?: (value: boolean) => void;
  onSmsMarketingConsentChange?: (value: boolean) => void;
}

/**
 * Registration consent block: messaging notification consent (email is
 * mandatory, plus exactly one of SMS/WhatsApp) and third-party data sharing
 * consent required for identity, payment and telematics providers.
 */
export function ConsentSection({
  messagingConsent,
  messagingChannel,
  dataSharingConsent,
  onMessagingConsentChange,
  onMessagingChannelChange,
  onDataSharingConsentChange,
  messagingError,
  channelError,
  dataSharingError,
  smsServiceConsent,
  smsMarketingConsent,
  onSmsServiceConsentChange,
  onSmsMarketingConsentChange,
}: ConsentSectionProps) {
  const showSmsConsent = !!onSmsServiceConsentChange && !!onSmsMarketingConsentChange;

  return (
    <div className="space-y-6">
      {showSmsConsent && (
        <SmsConsentCheckboxes
          smsServiceConsent={!!smsServiceConsent}
          smsMarketingConsent={!!smsMarketingConsent}
          onSmsServiceConsentChange={onSmsServiceConsentChange!}
          onSmsMarketingConsentChange={onSmsMarketingConsentChange!}
        />
      )}
      {/* Messaging notifications consent */}
      <div className="p-4 bg-muted/50 rounded-lg space-y-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Messaging notifications</p>
            <p className="text-sm text-muted-foreground">
              Email notifications are mandatory for account, payment and agreement
              activity. Choose one additional channel for reminders and alerts.
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 pl-8">
          <Checkbox
            id="messagingConsent"
            checked={messagingConsent}
            onCheckedChange={(checked) => onMessagingConsentChange(checked as boolean)}
          />
          <label htmlFor="messagingConsent" className="text-sm text-foreground cursor-pointer leading-relaxed">
            I consent to receive service messages from Rentmaikar by email and by my
            selected channel below. Message and data rates may apply. I can opt out at
            any time by replying STOP or updating my notification preferences.
          </label>
        </div>
        {messagingError && <p className="text-destructive text-sm pl-8">{messagingError}</p>}

        <div className="pl-8">
          <RadioGroup
            value={messagingChannel}
            onValueChange={(v) => onMessagingChannelChange(v as MessagingChannel)}
            className="flex items-center gap-6"
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="sms" id="channel-sms" />
              <span className="text-sm text-foreground">SMS</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="whatsapp" id="channel-whatsapp" />
              <span className="text-sm text-foreground">WhatsApp</span>
            </label>
          </RadioGroup>
          {channelError && <p className="text-destructive text-sm mt-2">{channelError}</p>}
        </div>
      </div>

      {/* Third-party data sharing consent */}
      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Third-party data sharing</p>
            <p className="text-sm text-muted-foreground">
              To operate your account we share limited personal data with service
              providers: identity verification, payment processing, messaging delivery,
              and vehicle telematics partners.
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 pl-8">
          <Checkbox
            id="dataSharingConsent"
            checked={dataSharingConsent}
            onCheckedChange={(checked) => onDataSharingConsentChange(checked as boolean)}
          />
          <label htmlFor="dataSharingConsent" className="text-sm text-foreground cursor-pointer leading-relaxed">
            I consent to Rentmaikar sharing my personal data with these third-party
            processors strictly for verification, payment, communication and vehicle
            monitoring purposes, as described in the{" "}
            <Link to="/privacy" className="text-primary hover:underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </label>
        </div>
        {dataSharingError && <p className="text-destructive text-sm pl-8">{dataSharingError}</p>}
      </div>
    </div>
  );
}

export default ConsentSection;
