import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MessageSquare, X } from "lucide-react";
import { Link } from "react-router-dom";

const MESSAGE_CONSENT_KEY = "rentmaikar_message_consent";

const MessageConsent = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [secondChannel, setSecondChannel] = useState<'none' | 'sms' | 'whatsapp'>('none');

  useEffect(() => {
    const consent = localStorage.getItem(MESSAGE_CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(
      MESSAGE_CONSENT_KEY,
      JSON.stringify({ sms: secondChannel === 'sms', whatsapp: secondChannel === 'whatsapp', accepted: true })
    );
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem(
      MESSAGE_CONSENT_KEY,
      JSON.stringify({ sms: false, whatsapp: false, accepted: false })
    );
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slide-up">
      <div className="container mx-auto max-w-4xl">
        <div className="bg-card border border-border rounded-xl shadow-lg p-4 md:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="font-medium text-foreground">Stay Updated via SMS & WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  We'd like to send you important updates about your rentals, payments, and account activity 
                  via SMS and WhatsApp. You can opt out anytime. See our{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  for details.
                </p>
              </div>
              <button
                onClick={handleDecline}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pl-9">
              <RadioGroup
                value={secondChannel}
                onValueChange={(v) => setSecondChannel(v as 'none' | 'sms' | 'whatsapp')}
                className="flex items-center gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="sms" />
                  <span className="text-sm font-medium text-foreground">SMS</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="whatsapp" />
                  <span className="text-sm font-medium text-foreground">WhatsApp</span>
                </label>
              </RadioGroup>

              <div className="flex items-center gap-2 sm:ml-auto">
                <Button variant="outline" size="sm" onClick={handleDecline}>
                  No Thanks
                </Button>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  disabled={secondChannel === 'none'}
                >
                  Opt In
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageConsent;
