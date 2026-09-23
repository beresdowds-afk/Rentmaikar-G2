import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Clock, MessageSquareText, Globe } from "lucide-react";
import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRegion, type Country } from "@/contexts/RegionContext";
import { usePublishedCompanyInfo } from "@/hooks/usePublishedCompanyInfo";
import { EMAIL_CONFIG } from "@/lib/email-config";
import { buildWhatsAppLink } from "@/lib/contact-links";

/**
 * Public contact page.
 *
 * Referenced by the SMS program HELP keyword reply ("visit rentmaikar.com/contact")
 * and by the A2P 10DLC campaign registration. Organization phone numbers and
 * addresses are region-aware and sourced from the published regional contact
 * records (admin-managed), exactly like the Terms of Use and Privacy Policy pages.
 */

const MESSAGING_HOURS: Record<Country, string> = {
  USA: "9:00 AM – 9:00 PM Eastern Time (ET)",
  Nigeria: "8:00 AM – 8:00 PM West Africa Time (WAT)",
};

const REGIONS: Country[] = ["USA", "Nigeria"];

const Contact = () => {
  const { country } = useRegion();
  const { infoFor } = usePublishedCompanyInfo();

  const current: Country = country === "USA" || country === "Nigeria" ? country : "USA";
  const currentInfo = infoFor(current);
  const supportEmail = currentInfo?.supportEmail || EMAIL_CONFIG.support;
  const orderedRegions: Country[] = [
    current,
    ...REGIONS.filter((r) => r !== current),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Seo
        title="Contact Rentmaikar | Support for Drivers & Vehicle Owners"
        description="Contact Rentmaikar support by email, phone or WhatsApp. Region-aware support for the United States and Nigeria, including SMS program help (START, STOP, HELP)."
        path="/contact"
      />
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Contact Rentmaikar</h1>
        </div>

        <p className="text-muted-foreground mb-8">
          Our team mediates every rental between drivers and vehicle owners. Reach us
          through any channel below — support is region-aware, so you always get the
          right office for your country.
        </p>

        {/* Corporate Identity & Verified Registry Info */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Corporate Identity &amp; Registered Business Information
            </CardTitle>
            <CardDescription>
              Rentmaikar is the official vehicle rental brand wholly owned and operated by INTE-GRITTY LLC USA.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block font-medium">Legal Owner:</span>
              <span className="font-semibold text-foreground">INTE-GRITTY LLC USA</span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Brand / DBA:</span>
              <span className="font-semibold text-foreground">Rentmaikar</span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">US Voice Hotline:</span>
              <a href="tel:+16085489220" className="font-semibold text-primary hover:underline">+1 (608) 548-9220</a>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Twilio 10DLC Route:</span>
              <span className="font-semibold text-foreground">+1 (608) 384-3932</span>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Email support
            </CardTitle>
            <CardDescription>
              Fastest way to reach us. Include your account email and, if applicable,
              your booking or vehicle reference.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              General support:{" "}
              <a href={`mailto:${supportEmail || EMAIL_CONFIG.support}`} className="text-primary hover:underline font-medium">
                {supportEmail || EMAIL_CONFIG.support}
              </a>
            </p>
            <p>
              Privacy requests:{" "}
              <a href={`mailto:${EMAIL_CONFIG.privacy}`} className="text-primary hover:underline font-medium">
                {EMAIL_CONFIG.privacy}
              </a>
            </p>
            <p>
              Compliance &amp; 10DLC:{" "}
              <a href="mailto:compliance@rentmaikar.com" className="text-primary hover:underline font-medium">
                compliance@rentmaikar.com
              </a>
            </p>
            <p>
              Legal notices:{" "}
              <a href={`mailto:${EMAIL_CONFIG.legal}`} className="text-primary hover:underline font-medium">
                {EMAIL_CONFIG.legal}
              </a>
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          {orderedRegions.map((r) => {
            const info = infoFor(r);
            const whatsappNumber = info.whatsapp || info.phoneRaw || info.phone;
            const whatsapp = buildWhatsAppLink(whatsappNumber);
            return (
              <Card key={r} data-testid={`contact-region-${r.toLowerCase()}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    {r === "USA" ? "United States" : "Nigeria"}
                    {r === current && (
                      <span className="text-xs font-normal text-muted-foreground">(your region)</span>
                    )}
                  </CardTitle>
                  <CardDescription>{info.companyName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {info.phone && (
                    <p className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <a href={`tel:${info.phoneRaw || info.phone}`} className="text-primary hover:underline">
                        {info.phone}
                      </a>
                    </p>
                  )}
                  {whatsapp && (
                    <p className="flex items-start gap-2">
                      <MessageSquareText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Chat on WhatsApp
                      </a>
                    </p>
                  )}
                  {info.fullAddress && (
                    <p className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{info.fullAddress}</span>
                    </p>
                  )}
                  <p className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Phone &amp; message hours: {MESSAGING_HOURS[r]}
                    </span>
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="w-5 h-5 text-primary" />
              Text message (SMS) program help
            </CardTitle>
            <CardDescription>
              Rentmaikar text messages are optional. You can manage your consent at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Reply <strong className="text-foreground">STOP</strong> to any Rentmaikar text message to opt out,
              <strong className="text-foreground"> START</strong> to re-subscribe, or{" "}
              <strong className="text-foreground">HELP</strong> for help. Message frequency varies.
              Message and data rates may apply.
            </p>
            <p>
              Full program details, keywords and message timing:{" "}
              <Link to="/sms-opt-in" className="text-primary hover:underline">
                SMS opt-in &amp; text message program
              </Link>
              . See also our{" "}
              <Link to="/terms" className="text-primary hover:underline">Terms of Use</Link> and{" "}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
            <p className="font-medium text-foreground">
              No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All other categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties. Wireless carriers (including T-Mobile, AT&amp;T, and Verizon) are not liable for delayed or undelivered messages.
            </p>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
