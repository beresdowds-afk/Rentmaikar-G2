import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  Inbox,
  Users,
  Car,
  CreditCard,
  Settings,
  AlertTriangle,
  Camera,
  FileText,
  Home,
  Package,
  GraduationCap,
  Globe,
  Phone,
  BarChart3,
  Megaphone,
  Mail,
  Search,
  Wrench,
  ClipboardList,
  HelpCircle,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegion, type Country } from "@/contexts/RegionContext";
import { useTourAnalytics } from "@/hooks/useTourAnalytics";
import { supabase } from "@/integrations/supabase/client";
import rentmaikarLogo from "@/assets/rentmaikar-logo.jpg";

export interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string;
  icon?: React.ElementType;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

/**
 * Resolves a suitable icon for any dynamically configured step.
 */
export function resolveStepIcon(id: string, target?: string): React.ElementType {
  const key = `${id} ${target || ""}`.toLowerCase();
  if (key.includes("portal")) return Settings;
  if (key.includes("tool") || key.includes("config") || key.includes("wrench")) return Wrench;
  if (key.includes("search") || key.includes("command")) return Search;
  if (key.includes("operation") || key.includes("diagnostics") || key.includes("status")) return Shield;
  if (key.includes("metric") || key.includes("revenue") || key.includes("financial") || key.includes("count")) return BarChart3;
  if (key.includes("task") || key.includes("todo") || key.includes("approval")) return ClipboardList;
  if (key.includes("inbox") || key.includes("telephony") || key.includes("sms") || key.includes("message")) return Inbox;
  if (key.includes("call") || key.includes("phone") || key.includes("voip")) return Phone;
  if (key.includes("user") || key.includes("account") || key.includes("driver") || key.includes("owner")) return Users;
  if (key.includes("vehicle") || key.includes("asset") || key.includes("fleet") || key.includes("car")) return Car;
  if (key.includes("incident")) return AlertTriangle;
  if (key.includes("inspection")) return Camera;
  if (key.includes("agreement") || key.includes("contract")) return FileText;
  if (key.includes("rto") || key.includes("rent-to-own")) return Home;
  if (key.includes("order") || key.includes("device") || key.includes("hardware")) return Package;
  if (key.includes("training")) return GraduationCap;
  if (key.includes("regional") || key.includes("region") || key.includes("globe")) return Globe;
  if (key.includes("marketing") || key.includes("social")) return Megaphone;
  if (key.includes("contact") || key.includes("email")) return Mail;
  if (key.includes("tour") || key.includes("help")) return HelpCircle;
  return Shield;
}

/**
 * Default fallback curated steps for Admin Dashboard.
 * Accurately covers key navigation areas and operational tools.
 * Preserves region-specific keywords (Twilio for USA, Termii for Nigeria)
 * and keeps identical step IDs across regions to satisfy test suites.
 */
export const buildTourSteps = (input: Country | string): TourStep[] => {
  const country: Country = input === "Nigeria" ? "Nigeria" : "USA";
  const isNG = country === "Nigeria";

  const smsProvider = isNG ? "Termii" : "Twilio";
  const hubs = isNG ? "Lagos, Abuja, Port Harcourt" : "DC, Maryland, Virginia";
  const idDocs = isNG ? "NIN/BVN" : "SSN/VIN";
  const currencyDesc = isNG ? "live NGN/USD conversions" : "USD";
  const gatewayDesc = isNG ? "Paystack / OPay" : "PayPal / USD";

  return [
    {
      id: "welcome",
      title: isNG ? "Welcome, Admin — Nigeria Operations 🛡️" : "Welcome, Admin — USA Operations 🛡️",
      description: `Welcome to the Rentmaikar Admin Dashboard (${country} Operations)! This interactive tour introduces you to key navigation portals, fleet management tools, and operational workflows across ${hubs}.`,
      icon: Shield,
      position: "center",
    },
    {
      id: "portal-nav",
      title: "Primary Portals Navigation",
      description: "The dashboard is divided into 6 core domains: CRM (customers, agreements), ERP (vehicles, telemetry), Support (inbox, call center), Content (legal templates, tours), Marketing, and Docs.",
      target: "[data-tour='admin-portals']",
      icon: Settings,
      position: "bottom",
    },
    {
      id: "admin-tools",
      title: "Operational Admin Tools Menu",
      description: "Open this menu for 15+ specialized utilities: Security Audit Logs, Payments Viewer, Settlement Reconciliation, Vehicle Queue, Call Center Desk, Persona Review, and Tour Step Configuration.",
      target: "[data-tour='admin-tools-menu']",
      icon: Wrench,
      position: "bottom",
    },
    {
      id: "global-search",
      title: "Global Search Command Palette (⌘K)",
      description: "Press Ctrl+K (or ⌘K on Mac) to immediately search and jump to any user account, vehicle identifier, portal tab, or operational tool across the entire system.",
      target: "[data-tour='admin-search']",
      icon: Search,
      position: "bottom",
    },
    {
      id: "operations-bar",
      title: "Operations Status Bar & Diagnostics",
      description: `Monitor the active admin persona, gateway health (${gatewayDesc}), communications VoIP status, and backend bridge connectivity in real-time.`,
      target: "[data-tour='admin-operations-bar']",
      icon: Shield,
      position: "bottom",
    },
    {
      id: "operational-metrics",
      title: "Operational Fleet & Financial Metrics",
      description: `Track high-level metrics: enrolled active vehicles, verified active drivers, monthly gross revenue, and admin net platform balance in ${currencyDesc}.`,
      target: "[data-tour='admin-metrics']",
      icon: BarChart3,
      position: "bottom",
    },
    {
      id: "daily-tasks",
      title: "Daily Operations To-Do & Approvals",
      description: `High-priority action items requiring immediate administrator review: pending vehicle enrollments, ${idDocs} checks, price negotiations, and tri-party agreements.`,
      target: "[data-tour='admin-daily-tasks']",
      icon: ClipboardList,
      position: "bottom",
    },
    {
      id: "tab-strip",
      title: "Contextual Portal Sub-Tabs",
      description: "Each portal provides dedicated workspace tabs. Under Support, easily access Task Portal, Unified Inbox, Call Center, Contact Settings, and Expiry Notifications.",
      target: "[data-tour='admin-tab-strip']",
      icon: Settings,
      position: "bottom",
    },
    {
      id: "unified-inbox",
      title: `Unified Inbox & Telephony (${smsProvider})`,
      description: `Manage customer inquiries from SMS (${smsProvider}), email, WhatsApp, and voice with automatic thread routing, local forwarding numbers, and recording playback.`,
      target: "[data-tour='admin-tab-strip']",
      icon: Inbox,
      position: "bottom",
    },
    {
      id: "tour-config-tool",
      title: "Tour Step Configuration Infrastructure",
      description: "You can customize, reorder, or add steps to this tour per region anytime using Tour Step Configuration under Admin Tools. All saved steps update the live tour dynamically!",
      target: "[data-tour='admin-tools-menu']",
      icon: Wrench,
      position: "bottom",
    },
    {
      id: "tour-help",
      title: "Guided Tour & Help Trigger",
      description: "New administrators can restart this walkthrough at any time by clicking the Tour button in the header, or explore our documentation portal for technical guides.",
      target: "[data-tour='admin-tour-button']",
      icon: HelpCircle,
      position: "bottom",
    },
    {
      id: "complete",
      title: "You're Ready to Operate! 🎉",
      description: "You have full visibility and control over fleet operations, financial settlements, and customer communications. Explore the dashboard or open Admin Tools to get started.",
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
  const defaultSteps = useMemo(() => buildTourSteps(country), [country]);

  const [dbSteps, setDbSteps] = useState<TourStep[] | null>(null);
  const [isCustomConfig, setIsCustomConfig] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Fetch dynamic configuration from Supabase tour_step_configs table
  useEffect(() => {
    let isCancelled = false;

    async function fetchConfig() {
      try {
        const { data, error } = await supabase
          .from("tour_step_configs")
          .select("steps, is_active")
          .eq("tour_name", "admin")
          .eq("country", country)
          .maybeSingle();

        if (isCancelled) return;

        if (!error && data?.is_active && Array.isArray(data.steps) && data.steps.length > 0) {
          const parsed: TourStep[] = (data.steps as any[]).map((s) => ({
            id: s.id,
            title: s.title,
            description: s.content || s.description || "",
            target: s.target,
            position: s.placement || s.position || "bottom",
            icon: resolveStepIcon(s.id, s.target),
          }));
          setDbSteps(parsed);
          setIsCustomConfig(true);
        } else {
          setDbSteps(null);
          setIsCustomConfig(false);
        }
      } catch (err) {
        if (!isCancelled) {
          setDbSteps(null);
          setIsCustomConfig(false);
        }
      }
    }

    if (isOpen) {
      fetchConfig();
    }

    return () => {
      isCancelled = true;
    };
  }, [country, isOpen]);

  const tourSteps = useMemo(() => {
    return dbSteps && dbSteps.length > 0 ? dbSteps : defaultSteps;
  }, [dbSteps, defaultSteps]);

  useEffect(() => {
    setCurrentStep(0);
  }, [country, isOpen]);

  const step = tourSteps[currentStep] || tourSteps[0];
  const progress = tourSteps.length > 0 ? ((currentStep + 1) / tourSteps.length) * 100 : 0;

  useTourAnalytics("admin", country, isOpen, currentStep, step?.id, tourSteps.length);

  const updateTargetRect = useCallback(() => {
    if (!step?.target) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
      // Smoothly scroll target into view if outside viewport
      if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      setTargetRect(null);
    }
  }, [step?.target]);

  useEffect(() => {
    if (isOpen) {
      updateTargetRect();
      const timer = setTimeout(updateTargetRect, 100);
      window.addEventListener("resize", updateTargetRect);
      window.addEventListener("scroll", updateTargetRect);
      return () => {
        clearTimeout(timer);
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

  // Keyboard navigation support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep, tourSteps.length]);

  if (!isOpen || !step) return null;

  const getCardPosition = () => {
    if (!targetRect || step.position === "center") {
      return {
        position: "fixed" as const,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const padding = 16;
    const cardWidth = 440;
    const cardHeight = 280;

    switch (step.position) {
      case "top":
        return {
          position: "fixed" as const,
          top: Math.max(padding, targetRect.top - cardHeight - padding),
          left: Math.min(
            window.innerWidth - cardWidth - padding,
            Math.max(padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)
          ),
        };
      case "bottom":
        return {
          position: "fixed" as const,
          top: Math.min(window.innerHeight - cardHeight - padding, targetRect.bottom + padding),
          left: Math.min(
            window.innerWidth - cardWidth - padding,
            Math.max(padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)
          ),
        };
      case "left":
        return {
          position: "fixed" as const,
          top: Math.max(padding, targetRect.top + targetRect.height / 2 - cardHeight / 2),
          left: Math.max(padding, targetRect.left - cardWidth - padding),
        };
      case "right":
        return {
          position: "fixed" as const,
          top: Math.max(padding, targetRect.top + targetRect.height / 2 - cardHeight / 2),
          left: Math.min(window.innerWidth - cardWidth - padding, targetRect.right + padding),
        };
      default:
        return {
          position: "fixed" as const,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        };
    }
  };

  const Icon = step.icon || resolveStepIcon(step.id, step.target);

  return createPortal(
    <div className="fixed inset-0 z-[100] select-none font-sans">
      {/* Backdrop overlay with click to dismiss/skip */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={handleSkip}
        aria-label="Close tour overlay"
      />

      {/* Target Spotlight cutout */}
      {targetRect && (
        <div
          className="absolute border-2 border-primary rounded-xl pointer-events-none transition-all duration-300 ease-out z-[100]"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow:
              "0 0 0 9999px rgba(0, 0, 0, 0.65), 0 0 0 4px hsl(var(--primary) / 0.4), 0 0 25px hsl(var(--primary) / 0.6)",
          }}
        />
      )}

      {/* Tour Dialogue Card */}
      <Card
        className={cn(
          "w-[440px] max-w-[calc(100vw-32px)] z-[101] shadow-2xl border-primary/30 bg-card text-card-foreground",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
        style={getCardPosition()}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
      >
        {currentStep === 0 && (
          <div className="flex justify-center pt-5 pb-1">
            <img
              src={rentmaikarLogo}
              alt="Rentmaikar Logo"
              className="h-14 w-auto rounded-lg shadow-xs border border-border/40"
            />
          </div>
        )}

        <CardHeader className={cn("pb-2.5", currentStep === 0 && "pt-2")}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              {currentStep !== 0 && (
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
              )}
              <div>
                <CardTitle className="text-base sm:text-lg font-bold leading-tight">
                  {step.title}
                </CardTitle>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    {country}
                  </Badge>
                  {isCustomConfig && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                      <Sparkles className="h-2.5 w-2.5 text-primary" />
                      Live Config
                    </Badge>
                  )}
                  {step.target && (
                    <span className="text-[11px] text-muted-foreground hidden sm:inline truncate max-w-[170px]">
                      {step.target.replace(/[\[\]']/g, "")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground shrink-0"
              title="Close tour (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pb-3.5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step.description}
          </p>

          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>
                Step {currentStep + 1} of {tourSteps.length}
              </span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between pt-0 pb-3.5 px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-xs text-muted-foreground h-8 px-2.5"
            >
              Skip
            </Button>
            <Link
              to="/admin/tour-config"
              onClick={handleSkip}
              className="text-[11px] text-muted-foreground hover:text-primary underline flex items-center gap-1"
              title="Edit steps in Tour Step Configuration"
            >
              Config
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button size="sm" onClick={handleNext} className="h-8 px-3 text-xs gap-1">
              {currentStep === tourSteps.length - 1 ? "Finish Tour" : "Next"}
              {currentStep < tourSteps.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>,
    document.body
  );
};

export default AdminOnboardingTour;
