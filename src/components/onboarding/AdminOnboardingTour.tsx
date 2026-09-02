import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { X, ChevronLeft, ChevronRight, Shield, Inbox, MessageSquare, Users, Car, CreditCard, Settings, AlertTriangle, Camera, FileText, Home, Package, GraduationCap, Globe, Phone, BarChart3, Megaphone, Mail, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion, type Country } from "@/contexts/RegionContext";
import { useTourAnalytics } from "@/hooks/useTourAnalytics";
import rentmaikarLogo from "@/assets/rentmaikar-logo.jpg";



interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string;
  icon: React.ElementType;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

export const buildTourSteps = (input: Country | string): TourStep[] => {
  const country: Country = input === "Nigeria" ? "Nigeria" : "USA";
  const isNG = country === "Nigeria";

  const smsProvider = isNG ? "Termii" : "Twilio";
  const paymentProvider = isNG ? "Paystack/Opay (Naira)" : "PayPal (USD)";
  const hubs = isNG ? "Lagos, Abuja, Port Harcourt" : "DC, Maryland, Virginia";
  const idDocs = isNG ? "NIN/BVN" : "SSN/VIN";
  const incidentNote = isNG
    ? "Nigeria incidents may require a police report attached before closure."
    : "USA incidents may require an insurance claim reference before closure.";
  const supportHours = isNG ? "8am–8pm WAT" : "9am–9pm ET";

  return [
    {
      id: "welcome",
      title: isNG ? "Welcome, Admin — Nigeria Operations 🛡️" : "Welcome, Admin — USA Operations 🛡️",
      description: `You're viewing the ${country} admin dashboard. It's organized into 4 portals: CRM, ERP, SUPPORT, and MARKETING. Let's walk through the key features.`,
      icon: Shield,
      position: "center",
    },
    {
      id: "portal-nav",
      title: "Portal Navigation",
      description: "The dashboard is divided into CRM (users, agreements, negotiations), ERP (vehicles, hardware, tracking), SUPPORT (inbox, contacts, call center), and MARKETING (social media campaigns).",
      target: "[data-tour='admin-portal']",
      icon: Settings,
      position: "bottom",
    },
    {
      id: "global-search",
      title: "Global Search ⌘K",
      description: "Use the command palette (Ctrl+K / ⌘K) to quickly search and navigate to any portal, user, vehicle, or feature across the entire dashboard.",
      icon: Search,
      position: "center",
    },
    {
      id: "unified-inbox",
      title: "Unified Inbox",
      description: `Manage all customer messages from SMS, WhatsApp, and email in one threaded view. Replies route back through the original channel using ${smsProvider} for ${country}.`,
      target: "[data-tour='admin-inbox']",
      icon: Inbox,
      position: "bottom",
    },
    {
      id: "contact-settings",
      title: "Contact & Email Configuration",
      description: `Manage platform email addresses (support@, admin@, payments@, etc.) with inline editing. Configure ${country} contact channels for SMS, WhatsApp, and phone, plus message forwarding numbers.`,
      target: "[data-tour='admin-contacts']",
      icon: Mail,
      position: "bottom",
    },
    {
      id: "call-center",
      title: "Call Center & VoIP",
      description: `Handle inbound/outbound voice calls with call groups, conference rooms, recording playback, and call history. ${country} routes through ${smsProvider}. Support hours: ${supportHours}.`,
      icon: Phone,
      position: "center",
    },
    {
      id: "regional-ops",
      title: "Regional Operations 🌍",
      description: `Manage the country → region → city hierarchy with master switches and 17+ granular feature toggles. ${country} hubs: ${hubs}.`,
      icon: Globe,
      position: "center",
    },
    {
      id: "user-accounts",
      title: "User Management",
      description: `View and manage all drivers and owners in ${country}. Approve registrations (${idDocs} verification), manage roles, and initiate legal agreements from approved negotiations.`,
      target: "[data-tour='admin-accounts']",
      icon: Users,
      position: "bottom",
    },
    {
      id: "assets-registry",
      title: "Assets & Vehicle Tracking",
      description: "Track all vehicles with real-time IoT GPS data, current driver assignments, and device health status on an interactive map.",
      target: "[data-tour='admin-assets']",
      icon: Car,
      position: "bottom",
    },
    {
      id: "device-orders",
      title: "IoT Device Orders",
      description: "Manage hardware orders from owners — track payment status, shipping, SIM provisioning, and installation confirmations with revenue analytics.",
      target: "[data-tour='admin-device-orders']",
      icon: Package,
      position: "bottom",
    },
    {
      id: "negotiations",
      title: "Price Negotiations",
      description: `Review price modification requests from drivers and owners in ${country}. Approve, counter-offer, or reject — notifications go via the user's preferred channel.`,
      target: "[data-tour='admin-negotiations']",
      icon: CreditCard,
      position: "bottom",
    },
    {
      id: "rent-to-own",
      title: "Rent-to-Own Management",
      description: `Approve or reject rent-to-own listings with ${country} pricing (${paymentProvider}). Manage subscriptions and security deposit tracking.`,
      target: "[data-tour='admin-rto']",
      icon: Home,
      position: "bottom",
    },
    {
      id: "incidents",
      title: "Incident Management",
      description: `Monitor accidents, maintenance issues, and IoT-detected events. Late reports (>1 hour) are automatically flagged. ${incidentNote}`,
      target: "[data-tour='admin-incidents']",
      icon: AlertTriangle,
      position: "bottom",
    },
    {
      id: "inspections",
      title: "Weekly Inspections",
      description: "Review quarterly vehicle inspection reports with photo comparisons. Approve or flag issues for follow-up with automated reminders.",
      target: "[data-tour='admin-inspections']",
      icon: Camera,
      position: "bottom",
    },
    {
      id: "agreements",
      title: "Legal Agreements",
      description: `Generate, manage, and witness tri-party legal agreements between drivers, owners, and admin under ${country} jurisdiction. Export signed documents as PDFs and send via email.`,
      target: "[data-tour='admin-agreements']",
      icon: FileText,
      position: "bottom",
    },
    {
      id: "training",
      title: "Training & Insurance",
      description: `Manage mandatory ${country} driver training modules with 6-month refresh cycles. Training completion is a precondition for group insurance eligibility.`,
      target: "[data-tour='admin-training']",
      icon: GraduationCap,
      position: "bottom",
    },
    {
      id: "social-media",
      title: "Social Media Campaigns 📣",
      description: `Manage ${country} marketing campaigns across Facebook, Instagram, LinkedIn, and Google from a centralized dashboard.`,
      icon: Megaphone,
      position: "center",
    },
    {
      id: "security",
      title: "Security Dashboard 🔒",
      description: "Monitor RLS policy health, admin audit logs, active sessions, API rate limits, and 2FA compliance from a dedicated security scorecard.",
      icon: Shield,
      position: "center",
    },
    {
      id: "complete",
      title: "You're Ready! 🎉",
      description: `Explore the ${country} dashboard portals and manage your platform efficiently. You can restart this tour anytime from the settings.`,
      icon: Shield,
      position: "center",
    },
  ];
};


interface AdminOnboardingTourProps {
  onComplete: () => void;
  isOpen: boolean;
}

export const AdminOnboardingTour = ({ onComplete, isOpen }: AdminOnboardingTourProps) => {
  const { country } = useRegion();
  const tourSteps = useMemo(() => buildTourSteps(country), [country]);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setCurrentStep(0);
  }, [country]);

  const step = tourSteps[currentStep];
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  useTourAnalytics("admin", country, isOpen, currentStep, step?.id, tourSteps.length);




  const updateTargetRect = useCallback(() => {
    if (step.target) {
      const element = document.querySelector(step.target);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
    }
  }, [step.target]);

  useEffect(() => {
    if (isOpen) {
      updateTargetRect();
      window.addEventListener("resize", updateTargetRect);
      window.addEventListener("scroll", updateTargetRect);
      return () => {
        window.removeEventListener("resize", updateTargetRect);
        window.removeEventListener("scroll", updateTargetRect);
      };
    }
  }, [isOpen, currentStep, updateTargetRect]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isOpen) return null;

  const getCardPosition = () => {
    if (!targetRect || step.position === "center") {
      return {
        position: "fixed" as const,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      };
    }

    const padding = 16;
    const cardWidth = 400;
    const cardHeight = 250;

    switch (step.position) {
      case "top":
        return {
          position: "fixed" as const,
          top: Math.max(padding, targetRect.top - cardHeight - padding),
          left: Math.min(
            window.innerWidth - cardWidth - padding,
            Math.max(padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)
          )
        };
      case "bottom":
        return {
          position: "fixed" as const,
          top: Math.min(window.innerHeight - cardHeight - padding, targetRect.bottom + padding),
          left: Math.min(
            window.innerWidth - cardWidth - padding,
            Math.max(padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)
          )
        };
      case "left":
        return {
          position: "fixed" as const,
          top: Math.max(padding, targetRect.top + targetRect.height / 2 - cardHeight / 2),
          left: Math.max(padding, targetRect.left - cardWidth - padding)
        };
      case "right":
        return {
          position: "fixed" as const,
          top: Math.max(padding, targetRect.top + targetRect.height / 2 - cardHeight / 2),
          left: Math.min(window.innerWidth - cardWidth - padding, targetRect.right + padding)
        };
      default:
        return {
          position: "fixed" as const,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)"
        };
    }
  };

  const Icon = step.icon;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={handleSkip}
      />

      {/* Highlight cutout */}
      {targetRect && (
        <div
          className="absolute border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none transition-all duration-300"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: "0 0 0 4px hsl(var(--primary) / 0.3), 0 0 20px hsl(var(--primary) / 0.5)"
          }}
        />
      )}

      {/* Tour Card */}
      <Card
        className={cn(
          "w-[400px] max-w-[calc(100vw-32px)] z-[101] shadow-2xl border-primary/20",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
        style={getCardPosition()}
      >
        {currentStep === 0 && (
          <div className="flex justify-center pt-6 pb-2">
            <img 
              src={rentmaikarLogo} 
              alt="Rentmaikar Logo" 
              className="h-16 w-auto rounded-lg shadow-md"
            />
          </div>
        )}
        <CardHeader className={cn("pb-3", currentStep === 0 && "pt-2")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentStep !== 0 && (
                <div className="p-2 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              )}
              <CardTitle className="text-lg">{step.title}</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSkip} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="pb-4">
          <p className="text-muted-foreground">{step.description}</p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Step {currentStep + 1} of {tourSteps.length}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </CardContent>

        <CardFooter className="flex justify-between pt-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Skip Tour
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={handleNext}>
              {currentStep === tourSteps.length - 1 ? "Finish" : "Next"}
              {currentStep < tourSteps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>,
    document.body
  );
};

export default AdminOnboardingTour;
