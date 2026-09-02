import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Code, FileText, Shield, HelpCircle, Cookie, MessageSquare } from "lucide-react";
import rentmaikarLogo from "@/assets/rentmaikar-logo.jpg";
import { useAuth } from "@/contexts/AuthContext";
import { useRegion } from "@/contexts/RegionContext";
import { useCategoryYearSpecs } from "@/hooks/useCategoryYearSpecs";
import { COMPANY_INFO } from "@/lib/email-config";
import { openCookiePreferences } from "@/hooks/useCookieConsent";

const FALLBACK_YEARS: Record<string, string> = {
  budget: "2015 - 2016",
  standard: "2017 - 2020",
  premium: "2021 - 2025",
};

const Footer = () => {
  const { userRole } = useAuth();
  const { country, supportEmail, companyInfo } = useRegion();
  const { getForCategory, formatRange, visible: yearsVisible } = useCategoryYearSpecs(country);
  const yearsFor = (key: "budget" | "standard" | "premium") => {
    if (!yearsVisible) return "";
    const spec = getForCategory(key);
    return spec ? formatRange(spec) : FALLBACK_YEARS[key];
  };
  const yearLabel = (key: "budget" | "standard" | "premium") => {
    const range = yearsFor(key);
    return range ? ` (${range})` : "";
  };
  
  const isUSA = country === "USA";
  const fallback = isUSA ? COMPANY_INFO.USA : COMPANY_INFO.NIGERIA;
  const company = {
    companyName: companyInfo?.companyName || fallback.companyName,
    phone: companyInfo?.phone || fallback.phone,
    phoneRaw: companyInfo?.phoneRaw || fallback.phoneRaw,
  };
  const locations = isUSA
    ? ["Washington DC, USA", "Maryland, USA", "Virginia, USA"]
    : ["Lagos, Nigeria", "Abuja, Nigeria", "Port Harcourt, Nigeria"];
  const tagline = isUSA
    ? "Connecting rideshare drivers with quality vehicles across the United States."
    : "Connecting rideshare drivers with quality vehicles across Nigeria.";

  return (
    <footer className="bg-primary text-primary-foreground" role="contentinfo">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="block">
              <img 
                src={rentmaikarLogo} 
                alt="Rentmaikar" 
                className="h-12 w-auto object-contain bg-white rounded-lg p-1"
              />
            </Link>
            <p className="text-primary-foreground/70 text-sm">{tagline}</p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/catalogue/budget" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Budget Cars{yearLabel("budget")}
                </Link>
              </li>
              <li>
                <Link to="/catalogue/standard" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Standard Cars{yearLabel("standard")}
                </Link>
              </li>
              <li>
                <Link to="/catalogue/premium" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Premium Cars{yearLabel("premium")}
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  How it Works
                </Link>
              </li>
              <li>
                <Link to="/driver/register" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Driver Registration
                </Link>
              </li>
              <li>
                <Link to="/owner/register" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  {isUSA ? "List Your Vehicle" : "Register Your Vehicle"}
                </Link>
              </li>
              {userRole === 'admin' && (
                <li>
                  <Link to="/api-docs" className="text-primary-foreground/70 hover:text-accent transition-colors flex items-center gap-1">
                    <Code className="w-3 h-3" />
                    API Documentation
                  </Link>
                </li>
              )}
              <li>
                <Link to="/terms" className="text-primary-foreground/70 hover:text-accent transition-colors flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-primary-foreground/70 hover:text-accent transition-colors flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/sms-opt-in" className="text-primary-foreground/70 hover:text-accent transition-colors flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  SMS Opt-In
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-primary-foreground/70 hover:text-accent transition-colors flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" />
                  FAQ
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openCookiePreferences()}
                  className="text-primary-foreground/70 hover:text-accent transition-colors flex items-center gap-1"
                >
                  <Cookie className="w-3 h-3" />
                  Cookie Preferences
                </button>
              </li>
            </ul>
          </div>


          {/* Locations */}
          <div>
            <h4 className="font-display font-semibold mb-4">
              {isUSA ? "US Locations" : "Nigeria Locations"}
            </h4>
            <ul className="space-y-2 text-sm text-primary-foreground/70">
              {locations.map((loc) => (
                <li key={loc} className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {loc}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold mb-4">Contact</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li>
                <p className="font-medium text-primary-foreground">{company.companyName}</p>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0" />
                <a href={`tel:${company.phoneRaw}`} className="hover:text-accent transition-colors">
                  {company.phone}
                </a>
              </li>
              {supportEmail && (
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 shrink-0" />
                  <a href={`mailto:${supportEmail}`} className="hover:text-accent transition-colors">
                    {supportEmail}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-8 pt-8 text-center text-sm text-primary-foreground/60">
          <p>&copy; {new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
