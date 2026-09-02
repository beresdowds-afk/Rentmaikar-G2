import { Link } from "react-router-dom";
import { MessageSquareText } from "lucide-react";
import { SMS_KEYWORDS, SMS_OPT_IN_TIMING } from "@/components/registration/sms-program";

/**
 * SMS program keywords + opt-in timing disclosures.
 *
 * Shown wherever SMS consent is collected so the A2P 10DLC reviewer can see the
 * exact keyword set and when messages start/stop after an opt-in.
 */

export { SMS_KEYWORDS, SMS_OPT_IN_TIMING };


interface SmsProgramDetailsProps {
  /** Renders without the outer card chrome when embedded in an existing panel. */
  bare?: boolean;
}

export function SmsProgramDetails({ bare = false }: SmsProgramDetailsProps) {
  const body = (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Program keywords</p>
        <ul className="space-y-2">
          {SMS_KEYWORDS.map((k) => (
            <li key={k.keyword} className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{k.keyword}</span> — {k.meaning}
              <br />
              <span className="italic">&ldquo;{k.reply}&rdquo;</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">When messages start and stop</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          {SMS_OPT_IN_TIMING.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-muted-foreground">
        Message frequency varies. Message and data rates may apply. Consent is not a
        condition of purchasing or using Rentmaikar services. See our{" "}
        <Link to="/terms" className="text-primary hover:underline">Terms</Link> and{" "}
        <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        Rentmaikar does not sell, rent, or share mobile phone numbers or SMS consent
        information with third parties or affiliates for their own marketing or
        promotional purposes.
      </p>
    </div>
  );

  if (bare) return body;

  return (
    <div className="p-4 bg-muted/50 rounded-lg space-y-4" data-testid="sms-program-details">
      <div className="flex items-start gap-3">
        <MessageSquareText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">SMS program details</p>
          <p className="text-sm text-muted-foreground">
            Keywords you can text us at any time, and exactly when messages begin after
            you opt in.
          </p>
        </div>
      </div>
      <div className="pl-8">{body}</div>
    </div>
  );
}

export default SmsProgramDetails;
