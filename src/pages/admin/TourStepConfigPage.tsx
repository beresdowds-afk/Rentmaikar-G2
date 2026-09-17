import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  CheckCircle2,
  Play,
  ArrowUp,
  ArrowDown,
  Copy,
  ExternalLink,
  Sparkles,
  Compass,
  RotateCcw,
  Target
} from "lucide-react";
import { TourPreviewModal } from "@/components/admin/TourPreviewModal";

const TOURS = ["admin", "landing", "vehicle-support", "iot-support", "legal-support"];
const COUNTRIES = ["USA", "Nigeria"];

interface TourStep {
  id: string;
  title: string;
  content: string;
  target?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

interface ValidationIssue {
  index: number;
  field: string;
  message: string;
}

const ADMIN_TARGET_PRESETS = [
  { label: "Primary Portals Navigation", value: "[data-tour='admin-portals']", desc: "CRM, ERP, Support, Content, Marketing, Docs switcher" },
  { label: "Operational Admin Tools Menu", value: "[data-tour='admin-tools-menu']", desc: "15+ utilities: Audits, Payments, Queue, Tour Config" },
  { label: "Global Command Search (⌘K)", value: "[data-tour='admin-search']", desc: "Command palette to jump anywhere in the system" },
  { label: "Operations Bar & Diagnostics", value: "[data-tour='admin-operations-bar']", desc: "Persona toggle, Gateway status, VoIP, Backend bridge" },
  { label: "Fleet & Financial Metrics", value: "[data-tour='admin-metrics']", desc: "Active vehicles, drivers, monthly income & balance" },
  { label: "Daily Operations To-Do", value: "[data-tour='admin-daily-tasks']", desc: "Pending vehicle approvals, KYC/ID checks, negotiations" },
  { label: "Contextual Portal Sub-Tabs", value: "[data-tour='admin-tab-strip']", desc: "Active workspace tabs for the selected portal" },
  { label: "Admin Notifications Bell", value: "[data-tour='admin-notifications']", desc: "Alerts, broadcast messages, unread updates" },
  { label: "Guided Tour & Help Button", value: "[data-tour='admin-tour-button']", desc: "Tour re-trigger in the dashboard header" },
  { label: "Center Modal (No target)", value: "", desc: "Centered greeting or conclusion modal dialog" },
];

const CURATED_ADMIN_STEPS: Record<string, TourStep[]> = {
  USA: [
    {
      id: "welcome",
      title: "Welcome, Admin — USA Operations 🛡️",
      content: "Welcome to the Rentmaikar Admin Dashboard (USA Operations)! This interactive tour introduces you to key navigation portals, fleet management tools, and operational workflows across DC, Maryland, and Virginia.",
      placement: "center",
    },
    {
      id: "portal-nav",
      title: "Primary Portals Navigation",
      content: "The dashboard is divided into 6 core domains: CRM (customers, agreements), ERP (vehicles, telemetry), Support (inbox, call center), Content (legal templates, tours), Marketing, and Docs.",
      target: "[data-tour='admin-portals']",
      placement: "bottom",
    },
    {
      id: "admin-tools",
      title: "Operational Admin Tools Menu",
      content: "Open this menu for 15+ specialized utilities: Security Audit Logs, Payments Viewer, Settlement Reconciliation, Vehicle Queue, Call Center Desk, Persona Review, and Tour Step Configuration.",
      target: "[data-tour='admin-tools-menu']",
      placement: "bottom",
    },
    {
      id: "global-search",
      title: "Global Search Command Palette (⌘K)",
      content: "Press Ctrl+K (or ⌘K on Mac) to immediately search and jump to any user account, vehicle VIN/plate, portal tab, or operational tool across the entire system.",
      target: "[data-tour='admin-search']",
      placement: "bottom",
    },
    {
      id: "operations-bar",
      title: "Operations Status Bar & Diagnostics",
      content: "Monitor the active admin persona, gateway health (PayPal / USD), communications VoIP status, and backend bridge connectivity in real-time.",
      target: "[data-tour='admin-operations-bar']",
      placement: "bottom",
    },
    {
      id: "operational-metrics",
      title: "Operational Fleet & Financial Metrics",
      content: "Track high-level metrics: enrolled active vehicles, verified active drivers, monthly gross revenue, and admin net platform balance in USD.",
      target: "[data-tour='admin-metrics']",
      placement: "bottom",
    },
    {
      id: "daily-tasks",
      title: "Daily Operations To-Do & Approvals",
      content: "High-priority action items requiring immediate administrator review: pending vehicle enrollments, SSN/VIN checks, price negotiations, and tri-party agreements.",
      target: "[data-tour='admin-daily-tasks']",
      placement: "bottom",
    },
    {
      id: "tab-strip",
      title: "Contextual Portal Sub-Tabs",
      content: "Each portal provides dedicated workspace tabs. Under Support, easily access Task Portal, Unified Inbox, Call Center, Contact Settings, and Expiry Notifications.",
      target: "[data-tour='admin-tab-strip']",
      placement: "bottom",
    },
    {
      id: "unified-inbox",
      title: "Unified Inbox & Telephony (Twilio)",
      content: "Manage customer inquiries from SMS (Twilio), email, WhatsApp, and voice with automatic thread routing, local US forwarding numbers, and recording playback.",
      target: "[data-tour='admin-tab-strip']",
      placement: "bottom",
    },
    {
      id: "tour-config-tool",
      title: "Tour Step Configuration Infrastructure",
      content: "You can customize, reorder, or add steps to this tour per region anytime using Tour Step Configuration under Admin Tools. All saved steps update the live tour dynamically!",
      target: "[data-tour='admin-tools-menu']",
      placement: "bottom",
    },
    {
      id: "tour-help",
      title: "Guided Tour & Help Trigger",
      content: "New administrators can restart this walkthrough at any time by clicking the Tour button in the header, or explore our documentation portal for technical guides.",
      target: "[data-tour='admin-tour-button']",
      placement: "bottom",
    },
    {
      id: "complete",
      title: "You're Ready to Operate! 🎉",
      content: "You have full visibility and control over fleet operations, financial settlements, and customer communications. Explore the dashboard or open Admin Tools to get started.",
      placement: "center",
    },
  ],
  Nigeria: [
    {
      id: "welcome",
      title: "Welcome, Admin — Nigeria Operations 🛡️",
      content: "Welcome to the Rentmaikar Admin Dashboard (Nigeria Operations)! This interactive tour introduces you to key navigation portals, fleet management tools, and operational workflows across Lagos, Abuja, and Port Harcourt.",
      placement: "center",
    },
    {
      id: "portal-nav",
      title: "Primary Portals Navigation",
      content: "The dashboard is divided into 6 core domains: CRM (customers, agreements), ERP (vehicles, telemetry), Support (inbox, call center), Content (legal templates, tours), Marketing, and Docs.",
      target: "[data-tour='admin-portals']",
      placement: "bottom",
    },
    {
      id: "admin-tools",
      title: "Operational Admin Tools Menu",
      content: "Open this menu for 15+ specialized utilities: Security Audit Logs, Payments Viewer, Settlement Reconciliation, Vehicle Queue, Call Center Desk, Persona Review, and Tour Step Configuration.",
      target: "[data-tour='admin-tools-menu']",
      placement: "bottom",
    },
    {
      id: "global-search",
      title: "Global Search Command Palette (⌘K)",
      content: "Press Ctrl+K (or ⌘K on Mac) to immediately search and jump to any user account, vehicle plate, portal tab, or operational tool across the entire system.",
      target: "[data-tour='admin-search']",
      placement: "bottom",
    },
    {
      id: "operations-bar",
      title: "Operations Status Bar & Diagnostics",
      content: "Monitor the active admin persona, gateway health (Paystack / OPay NGN), communications VoIP status, and backend bridge connectivity in real-time.",
      target: "[data-tour='admin-operations-bar']",
      placement: "bottom",
    },
    {
      id: "operational-metrics",
      title: "Operational Fleet & Financial Metrics",
      content: "Track high-level metrics: enrolled active vehicles, verified active drivers, monthly gross revenue, and admin net platform balance with live NGN/USD conversions.",
      target: "[data-tour='admin-metrics']",
      placement: "bottom",
    },
    {
      id: "daily-tasks",
      title: "Daily Operations To-Do & Approvals",
      content: "High-priority action items requiring immediate administrative action: pending vehicle enrollments, NIN/BVN checks, price negotiations, and tri-party agreements.",
      target: "[data-tour='admin-daily-tasks']",
      placement: "bottom",
    },
    {
      id: "tab-strip",
      title: "Contextual Portal Sub-Tabs",
      content: "Each portal provides dedicated workspace tabs. Under Support, easily access Task Portal, Unified Inbox, Call Center, Nigeria Driver Verification, and Police Reports.",
      target: "[data-tour='admin-tab-strip']",
      placement: "bottom",
    },
    {
      id: "unified-inbox",
      title: "Unified Inbox & Telephony (Termii)",
      content: "Manage customer inquiries from SMS (Termii), email, WhatsApp, and voice with automatic thread routing, local Nigerian forwarding numbers, and recording playback.",
      target: "[data-tour='admin-tab-strip']",
      placement: "bottom",
    },
    {
      id: "tour-config-tool",
      title: "Tour Step Configuration Infrastructure",
      content: "You can customize, reorder, or add steps to this tour per region anytime using Tour Step Configuration under Admin Tools. All saved steps update the live tour dynamically!",
      target: "[data-tour='admin-tools-menu']",
      placement: "bottom",
    },
    {
      id: "tour-help",
      title: "Guided Tour & Help Trigger",
      content: "New administrators can restart this walkthrough at any time by clicking the Tour button in the header, or explore our documentation portal for technical guides.",
      target: "[data-tour='admin-tour-button']",
      placement: "bottom",
    },
    {
      id: "complete",
      title: "You're Ready to Operate! 🎉",
      content: "You have full visibility and control over fleet operations, financial settlements, and customer communications. Explore the dashboard or open Admin Tools to get started.",
      placement: "center",
    },
  ],
};

function validateSteps(steps: TourStep[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(steps) || steps.length === 0) {
    return [{ index: -1, field: "steps", message: "At least one step is required" }];
  }
  const seenIds = new Set<string>();
  steps.forEach((s, i) => {
    if (!s.id?.trim()) issues.push({ index: i, field: "id", message: "Step ID is required" });
    else if (!/^[a-z0-9-_]+$/i.test(s.id)) issues.push({ index: i, field: "id", message: "ID must be alphanumeric, dash, or underscore" });
    else if (seenIds.has(s.id)) issues.push({ index: i, field: "id", message: `Duplicate ID "${s.id}"` });
    seenIds.add(s.id);

    if (!s.title?.trim()) issues.push({ index: i, field: "title", message: "Title is required" });
    else if (s.title.length > 120) issues.push({ index: i, field: "title", message: "Title must be under 120 characters" });

    if (!s.content?.trim()) issues.push({ index: i, field: "content", message: "Content is required" });
    else if (s.content.length > 1000) issues.push({ index: i, field: "content", message: "Content must be under 1000 characters" });

    if (s.placement && !["top", "bottom", "left", "right", "center"].includes(s.placement)) {
      issues.push({ index: i, field: "placement", message: "Placement must be top, bottom, left, right, or center" });
    }
  });
  return issues;
}

export default function TourStepConfigPage() {
  const [tour, setTour] = useState("admin");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const issues = useMemo(() => validateSteps(steps), [steps]);
  const isValid = issues.length === 0;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tour_step_configs")
      .select("*")
      .eq("tour_name", tour)
      .eq("country", country)
      .maybeSingle();

    setLoading(false);
    if (error) {
      toast.error("Failed to load tour configuration from database");
      return;
    }

    if (data) {
      setExistingId(data.id);
      setSteps((data.steps as unknown as TourStep[]) ?? []);
      setIsActive(data.is_active ?? true);
    } else {
      setExistingId(null);
      // If admin tour has no record in database, auto-populate curated steps as initial draft
      if (tour === "admin" && CURATED_ADMIN_STEPS[country]) {
        setSteps(CURATED_ADMIN_STEPS[country]);
      } else {
        setSteps([]);
      }
      setIsActive(true);
    }
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [tour, country]);

  const addStep = () =>
    setSteps((s) => [
      ...s,
      {
        id: `step-${s.length + 1}`,
        title: "",
        content: "",
        placement: "bottom",
        target: "",
      },
    ]);

  const duplicateStep = (i: number) => {
    const stepToCopy = steps[i];
    if (!stepToCopy) return;
    const cloned: TourStep = {
      ...stepToCopy,
      id: `${stepToCopy.id}-copy`,
      title: `${stepToCopy.title} (Copy)`,
    };
    const newSteps = [...steps];
    newSteps.splice(i + 1, 0, cloned);
    setSteps(newSteps);
    toast.info(`Duplicated Step ${i + 1}`);
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;
    setSteps(newSteps);
  };

  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  const updateStep = (i: number, patch: Partial<TourStep>) =>
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));

  const loadCuratedAdminTour = () => {
    const curated = CURATED_ADMIN_STEPS[country] || CURATED_ADMIN_STEPS.USA;
    setSteps(curated);
    toast.success(`Loaded curated ${country} Admin Guided Tour (${curated.length} steps)`);
  };

  const save = async () => {
    if (!isValid) {
      toast.error("Please fix validation errors before saving");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      tour_name: tour,
      country,
      steps: steps as unknown as never,
      is_active: isActive,
      updated_by: userData.user?.id ?? null,
    };

    const { error } = existingId
      ? await supabase.from("tour_step_configs").update(payload).eq("id", existingId)
      : await supabase.from("tour_step_configs").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Tour configuration saved and live on Admin Dashboard!");
    load();
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Tour Step Configuration</h1>
            <Badge variant="outline" className="gap-1 font-normal">
              <Compass className="h-3.5 w-3.5 text-primary" />
              Guided Tours
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Configure interactive onboarding walkthroughs. Changes take effect dynamically on the Admin Dashboard.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {tour === "admin" && (
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to="/admin?tour=true" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 text-primary" />
                Test Live on Dashboard
              </Link>
            </Button>
          )}
        </div>
      </div>

      {tour === "admin" && (
        <Card className="p-4 mb-4 border-primary/20 bg-primary/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Admin Dashboard Navigation & Operational Tools
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Walk new administrators through the 6 core portals, 15+ operational utilities, command palette (⌘K),
                  financial metrics, and high-priority task queues for {country}.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadCuratedAdminTour}
              className="gap-1.5 shrink-0 text-xs bg-background hover:bg-muted font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5 text-primary" />
              Reset to Curated Admin Tour
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tour Name</Label>
            <Select value={tour} onValueChange={setTour}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOURS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "admin" ? "Admin Dashboard (Key Tools)" : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Region / Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === "USA" ? "🇺🇸 USA" : "🇳🇬 Nigeria"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={isActive ? "default" : "secondary"} className="h-9 px-3 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
                  {isActive ? "Active (Live)" : "Inactive (Hidden)"}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setIsActive((v) => !v)} className="h-9">
                  Toggle
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mb-2" />
          <p className="text-sm">Loading tour configuration...</p>
        </div>
      ) : (
        <>
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                {isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Valid ({steps.length} steps configured)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">{issues.length} issue(s) detected</span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1">
                  <Plus className="w-4 h-4" />
                  Add Step
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={steps.length === 0}
                  className="gap-1"
                >
                  <Play className="w-4 h-4" />
                  Preview Tour
                </Button>
                <Button size="sm" disabled={!isValid || saving} onClick={save} className="gap-1.5 font-medium">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </Button>
              </div>
            </div>

            {!isValid && (
              <Alert variant="destructive" className="mb-2">
                <AlertDescription>
                  <ul className="list-disc ml-4 text-xs space-y-0.5">
                    {issues.slice(0, 8).map((iss, k) => (
                      <li key={k}>
                        Step {iss.index >= 0 ? iss.index + 1 : "-"} · {iss.field}: {iss.message}
                      </li>
                    ))}
                    {issues.length > 8 && <li>...and {issues.length - 8} more</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </Card>

          <div className="space-y-3">
            {steps.map((step, i) => {
              const stepIssues = issues.filter((x) => x.index === i);
              return (
                <Card
                  key={i}
                  className={`p-4 transition-all shadow-xs ${
                    stepIssues.length ? "border-destructive/60 bg-destructive/5" : "border-border/80 hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 pb-2 border-b">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {step.title || `Untitled Step ${i + 1}`}
                      </span>
                      <code className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {step.id}
                      </code>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStep(i, "up")}
                        disabled={i === 0}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStep(i, "down")}
                        disabled={i === steps.length - 1}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => duplicateStep(i)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Duplicate Step"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStep(i)}
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        title="Remove Step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                      <Label className="text-xs font-medium">Step ID (alphanumeric, dash, underscore)</Label>
                      <Input
                        value={step.id}
                        onChange={(e) => updateStep(i, { id: e.target.value })}
                        className="mt-1 font-mono text-xs"
                        placeholder="e.g. portal-nav"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Target Element Selector (CSS)</Label>
                        {tour === "admin" && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Target className="w-2.5 h-2.5" />
                            Helper below
                          </span>
                        )}
                      </div>
                      <Input
                        value={step.target ?? ""}
                        onChange={(e) => updateStep(i, { target: e.target.value })}
                        placeholder="e.g. [data-tour='admin-portals'] or blank for center"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>

                    {tour === "admin" && (
                      <div className="md:col-span-2">
                        <Label className="text-[11px] text-muted-foreground mb-1 block">
                          Quick Presets for Admin Dashboard:
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {ADMIN_TARGET_PRESETS.map((preset) => (
                            <Button
                              key={preset.label}
                              type="button"
                              variant={step.target === preset.value ? "secondary" : "outline"}
                              size="sm"
                              className={`h-6 text-[11px] px-2 py-0 ${
                                step.target === preset.value ? "border-primary/50 font-semibold" : ""
                              }`}
                              onClick={() => updateStep(i, { target: preset.value })}
                              title={preset.desc}
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="md:col-span-2">
                      <Label className="text-xs font-medium">Step Title</Label>
                      <Input
                        value={step.title}
                        onChange={(e) => updateStep(i, { title: e.target.value })}
                        maxLength={120}
                        className="mt-1 text-sm font-medium"
                        placeholder="e.g. Primary Portals Navigation"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Step Content / Instructions</Label>
                        <span className="text-[10px] text-muted-foreground">
                          {step.content?.length || 0}/1000 characters
                        </span>
                      </div>
                      <Textarea
                        value={step.content}
                        onChange={(e) => updateStep(i, { content: e.target.value })}
                        maxLength={1000}
                        rows={3}
                        className="mt-1 text-xs leading-relaxed"
                        placeholder="Describe the operational area or tool and how administrators should interact with it..."
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-medium">Tooltip Placement</Label>
                      <Select
                        value={step.placement ?? "bottom"}
                        onValueChange={(v) => updateStep(i, { placement: v as TourStep["placement"] })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["bottom", "top", "left", "right", "center"].map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {stepIssues.length > 0 && (
                    <div className="mt-3 p-2 rounded bg-destructive/10 text-xs text-destructive space-y-0.5">
                      {stepIssues.map((iss, k) => (
                        <div key={k}>• {iss.field}: {iss.message}</div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}

            {steps.length === 0 && (
              <Card className="p-10 text-center text-muted-foreground border-dashed">
                <Compass className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
                <h3 className="text-base font-semibold text-foreground">No Tour Steps Configured</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Click &ldquo;Add Step&rdquo; to build steps manually, or click &ldquo;Reset to Curated Admin Tour&rdquo; to
                  load standard steps.
                </p>
                <div className="flex justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={loadCuratedAdminTour}>
                    Load Curated Admin Tour
                  </Button>
                  <Button size="sm" onClick={addStep}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add First Step
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      <TourPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        steps={steps}
        tour={tour}
        country={country}
      />
    </div>
  );
}
