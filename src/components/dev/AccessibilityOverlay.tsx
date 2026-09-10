import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  scanDomForAccessibility,
  A11yIssue,
  A11yIssueType,
  categorizePage,
} from "@/lib/a11y/accessibilityScanner";
import {
  applyA11yFix,
  applyAllA11yFixes,
  generateCodeRemediationReport,
  FixResult,
} from "@/lib/a11y/a11yFixer";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  Crosshair,
  FileDown,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Wand2,
  Code,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const AccessibilityOverlay: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userRole, hasRole } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [highlightOnPage, setHighlightOnPage] = useState(true);
  const [issues, setIssues] = useState<A11yIssue[]>([]);
  const [filterType, setFilterType] = useState<"all" | "labels" | "contrast" | "registration" | "dashboard">("all");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date>(new Date());
  const [fixedSessionCount, setFixedSessionCount] = useState<number>(0);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [recentFixResults, setRecentFixResults] = useState<FixResult[]>([]);

  const ADMIN_EMAILS = useMemo(
    () => [
      "eastfortemain@gmail.com",
      "adebayoolusola39@gmail.com",
    ],
    []
  );

  // Strict Admin Check: A11y inspector tab and mapping are visible ONLY to Admin
  const isAdmin = useMemo(() => {
    // 1. Direct role verification from Supabase auth state
    if (userRole === "admin" || hasRole("admin")) {
      return true;
    }

    // 2. Email verification against registered admin accounts
    const email = user?.email?.trim().toLowerCase();
    if (email && ADMIN_EMAILS.includes(email)) {
      return true;
    }

    // 3. User metadata role check
    if (
      user?.app_metadata?.role === "admin" ||
      user?.user_metadata?.role === "admin"
    ) {
      return true;
    }

    // 4. Stored verified admin session
    if (typeof window !== "undefined") {
      try {
        const storedRole = window.localStorage.getItem("rentmaikar_admin_role");
        const isAdminActive = window.localStorage.getItem("rentmaikar_admin_active") === "true";
        if (storedRole === "admin" && isAdminActive) {
          return true;
        }
      } catch {
        // ignore
      }
    }

    return false;
  }, [user, userRole, hasRole, ADMIN_EMAILS]);

  const runScan = useCallback(() => {
    if (!isAdmin) return;
    setIsScanning(true);
    // Slight delay to allow DOM render to settle
    setTimeout(() => {
      try {
        const found = scanDomForAccessibility(document.body, window.location.pathname);
        setIssues(found);
        setLastScanTime(new Date());
      } catch (err) {
        console.warn("[A11y Scanner] Scan error:", err);
      } finally {
        setIsScanning(false);
      }
    }, 150);
  }, [isAdmin]);

  // Re-scan when location changes (Only if user is Admin)
  useEffect(() => {
    if (!isAdmin) return;
    runScan();
  }, [location.pathname, location.search, isAdmin, runScan]);

  // MutationObserver to auto-update scan on modal / dynamic form updates (Only if user is Admin)
  useEffect(() => {
    if (!isAdmin) return;

    let timeoutId: NodeJS.Timeout;
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        runScan();
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [isAdmin, runScan]);

  // Filter issues according to active tab
  const filteredIssues = useMemo(() => {
    if (filterType === "all") return issues;
    if (filterType === "labels") {
      return issues.filter(
        (i) =>
          i.type === "missing-label" ||
          i.type === "placeholder-only" ||
          i.type === "missing-button-label" ||
          i.type === "missing-image-alt"
      );
    }
    if (filterType === "contrast") {
      return issues.filter(
        (i) => i.type === "contrast-violation" || i.type === "contrast-warning"
      );
    }
    if (filterType === "registration") {
      return issues.filter((i) => i.pageCategory === "registration");
    }
    if (filterType === "dashboard") {
      return issues.filter((i) => i.pageCategory === "dashboard");
    }
    return issues;
  }, [issues, filterType]);

  const labelIssuesCount = useMemo(
    () =>
      issues.filter(
        (i) =>
          i.type === "missing-label" ||
          i.type === "placeholder-only" ||
          i.type === "missing-button-label" ||
          i.type === "missing-image-alt"
      ).length,
    [issues]
  );

  const contrastIssuesCount = useMemo(
    () =>
      issues.filter(
        (i) => i.type === "contrast-violation" || i.type === "contrast-warning"
      ).length,
    [issues]
  );

  const currentPageCategory = categorizePage(location.pathname);

  // Scroll to and highlight element
  const locateElement = (issue: A11yIssue) => {
    setSelectedIssueId(issue.id);
    if (issue.element && typeof issue.element.scrollIntoView === "function") {
      issue.element.scrollIntoView({ behavior: "smooth", block: "center" });

      // Add temporary pulsating highlight
      issue.element.classList.add("a11y-target-pulse");
      setTimeout(() => {
        issue.element.classList.remove("a11y-target-pulse");
      }, 3000);
    }
  };

  // Apply single fix in the live DOM
  const handleFixSingle = (issue: A11yIssue) => {
    const result = applyA11yFix(issue);
    setRecentFixResults((prev) => [result, ...prev.filter((r) => r.issueId !== issue.id)]);
    if (result.success) {
      setFixedSessionCount((c) => c + 1);
      toast.success("Accessibility fix applied", {
        description: result.message,
      });
      // Slight delay to allow DOM update then re-scan
      setTimeout(() => {
        runScan();
      }, 100);
    } else {
      toast.error("Failed to apply fix", {
        description: result.message,
      });
    }
  };

  // Apply all fixes in the live DOM
  const handleFixAll = () => {
    const targets = filteredIssues.length > 0 ? filteredIssues : issues;
    if (targets.length === 0) return;

    setIsFixing(true);
    try {
      const batchResult = applyAllA11yFixes(targets);
      setRecentFixResults(batchResult.results);
      setFixedSessionCount((c) => c + batchResult.fixed);
      
      toast.success(`Applied ${batchResult.fixed} accessibility fix${batchResult.fixed === 1 ? '' : 'es'}!`, {
        description: "DOM elements updated with accessible labels, alt tags, and WCAG AA contrast.",
      });

      setTimeout(() => {
        runScan();
        setIsFixing(false);
      }, 200);
    } catch (err: any) {
      setIsFixing(false);
      toast.error("Error during auto-remediation", {
        description: err.message,
      });
    }
  };

  // Copy code remediation guide to clipboard
  const handleCopyCode = () => {
    const report = generateCodeRemediationReport(issues, recentFixResults);
    navigator.clipboard.writeText(report);
    setCopiedCode(true);
    toast.success("Remediation code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Export Audit Report
  const exportReport = () => {
    const lines = [
      `# RentMaikar Accessibility Audit Report`,
      `Date: ${new Date().toISOString()}`,
      `Route: ${window.location.pathname}`,
      `Page Category: ${currentPageCategory}`,
      `Total Issues: ${issues.length} (${labelIssuesCount} label/name issues, ${contrastIssuesCount} contrast issues)`,
      ``,
      `## Summary`,
      `- Missing Form Labels / Names: ${labelIssuesCount}`,
      `- Contrast Violations / Warnings: ${contrastIssuesCount}`,
      ``,
      `## Detailed Issues`,
    ];

    issues.forEach((issue, idx) => {
      lines.push(`### ${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.message}`);
      lines.push(`- **Criterion**: ${issue.wcagCriterion}`);
      lines.push(`- **Selector**: \`${issue.selector}\``);
      lines.push(`- **Element**: \`<${issue.tagName}>\``);
      lines.push(`- **Snippet**: \`${issue.snippet}\``);
      if (issue.contrastDetails) {
        lines.push(
          `- **Contrast Details**: Ratio ${issue.contrastDetails.ratio}:1 (Required: ${issue.contrastDetails.required}:1) | Text: ${issue.contrastDetails.fgColor} | Background: ${issue.contrastDetails.bgColor}`
        );
      }
      lines.push(`- **Suggested Fix**: ${issue.suggestedFix}`);
      lines.push(``);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `a11y-audit-${location.pathname.replace(/[^a-zA-Z0-9]/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      {/* Injected CSS for target pulse effect & overlays */}
      <style>{`
        .a11y-target-pulse {
          outline: 3px solid #ef4444 !important;
          outline-offset: 4px !important;
          animation: a11y-pulse 0.8s ease-in-out infinite alternate !important;
        }
        @keyframes a11y-pulse {
          from { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          to { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
        }
        .a11y-fixed-pulse {
          outline: 3px solid #10b981 !important;
          outline-offset: 4px !important;
          animation: a11y-fixed-anim 0.6s ease-in-out 3 !important;
        }
        @keyframes a11y-fixed-anim {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>

      {/* ------------------------------------------------------------- */}
      {/* 1. In-Page Visual Highlights & Interactive Pins (DOM Mapping) */}
      {/* ------------------------------------------------------------- */}
      {highlightOnPage && (
        <div data-a11y-overlay="true" className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden">
          {issues.map((issue) => {
            const rect = issue.element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return null;

            const isLabelIssue =
              issue.type === "missing-label" ||
              issue.type === "placeholder-only" ||
              issue.type === "missing-button-label" ||
              issue.type === "missing-image-alt";

            const borderColor = isLabelIssue ? "rgba(239, 68, 68, 0.85)" : "rgba(245, 158, 11, 0.85)";
            const badgeBg = isLabelIssue ? "bg-red-600" : "bg-amber-600";
            const badgeLabel = isLabelIssue
              ? issue.type === "placeholder-only"
                ? "Placeholder Only"
                : "Missing Label"
              : `Contrast ${issue.contrastDetails?.ratio ?? ""}:1`;

            return (
              <div
                key={issue.id}
                style={{
                  position: "absolute",
                  left: `${rect.left + window.scrollX}px`,
                  top: `${rect.top + window.scrollY}px`,
                  width: `${rect.width}px`,
                  height: `${rect.height}px`,
                  boxShadow: `0 0 0 2px ${borderColor}`,
                  borderRadius: "4px",
                }}
                className="transition-all"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    setSelectedIssueId(issue.id);
                  }}
                  className={`pointer-events-auto absolute -top-3.5 -left-1 px-1.5 py-0.5 text-[10px] font-bold text-white rounded shadow-md flex items-center gap-1 ${badgeBg} hover:scale-105 transition`}
                  title={`${issue.message} - Click to view details in inspector`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {badgeLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. Floating Admin Trigger Tab & Mapping Controls */}
      {/* ------------------------------------------------------------- */}
      <div
        data-a11y-overlay="true"
        className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2"
      >
        <button
          type="button"
          onClick={() => setHighlightOnPage((prev) => !prev)}
          className={`flex items-center justify-center h-8 px-2.5 rounded-full shadow-lg border backdrop-blur-md text-xs font-medium transition ${
            highlightOnPage
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background/90 text-muted-foreground hover:text-foreground border-border"
          }`}
          title={highlightOnPage ? "A11y DOM Mapping Active (Click to Hide)" : "A11y DOM Mapping Hidden (Click to Show)"}
          aria-label={highlightOnPage ? "Hide A11y DOM Mapping" : "Show A11y DOM Mapping"}
        >
          {highlightOnPage ? (
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-[11px]">Mapping On</span>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <EyeOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-[11px]">Mapping Off</span>
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border backdrop-blur-md text-xs font-semibold transition-all duration-200 ${
            issues.length === 0
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-700 hover:bg-emerald-900"
              : issues.some((i) => i.severity === "violation")
                ? "bg-red-950/90 text-red-300 border-red-700 hover:bg-red-900"
                : "bg-amber-950/90 text-amber-300 border-amber-700 hover:bg-amber-900"
          }`}
          aria-label="Open Accessibility Inspector (Admin Only)"
        >
          <span className="text-sm">♿</span>
          <span>A11y Inspector</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              issues.length === 0 ? "bg-emerald-700 text-white" : "bg-red-600 text-white"
            }`}
          >
            {issues.length}
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. Comprehensive Accessibility Inspector Drawer */}
      {/* ------------------------------------------------------------- */}
      {isOpen && (
        <div
          data-a11y-overlay="true"
          className="fixed bottom-16 right-4 z-[9999] w-[460px] max-w-[calc(100vw-32px)] max-h-[82vh] flex flex-col bg-card border border-border shadow-2xl rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
        >
          {/* Header */}
          <div className="p-4 bg-muted/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">♿</span>
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  A11y Inspector
                  <Badge variant="outline" className="text-[10px] uppercase font-mono bg-primary/10 text-primary border-primary/30">
                    Admin
                  </Badge>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {currentPageCategory}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                  {location.pathname}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition"
                onClick={handleFixAll}
                disabled={isFixing || issues.length === 0}
                title="Automatically fix all accessibility issues on current page"
              >
                <Wand2 className={`h-3.5 w-3.5 ${isFixing ? "animate-spin" : ""}`} />
                <span>{isFixing ? "Fixing..." : `Fix All (${issues.length})`}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => setShowCodeModal(true)}
                title="View React/TSX code patch"
              >
                <Code className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Patches</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={runScan}
                disabled={isScanning}
                title="Re-scan current page"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setIsOpen(false)}
                title="Close inspector"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Page Jump Shortcuts */}
          <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <span className="text-muted-foreground shrink-0 font-medium">Test:</span>
            <button
              type="button"
              onClick={() => navigate("/driver/register")}
              className={`px-2 py-0.5 rounded border whitespace-nowrap transition ${
                location.pathname === "/driver/register"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted text-foreground border-border"
              }`}
            >
              Driver Register
            </button>
            <button
              type="button"
              onClick={() => navigate("/owner/register")}
              className={`px-2 py-0.5 rounded border whitespace-nowrap transition ${
                location.pathname === "/owner/register"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted text-foreground border-border"
              }`}
            >
              Owner Register
            </button>
            <button
              type="button"
              onClick={() => navigate("/driver/dashboard")}
              className={`px-2 py-0.5 rounded border whitespace-nowrap transition ${
                location.pathname === "/driver/dashboard"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted text-foreground border-border"
              }`}
            >
              Driver Dashboard
            </button>
            <button
              type="button"
              onClick={() => navigate("/owner/dashboard")}
              className={`px-2 py-0.5 rounded border whitespace-nowrap transition ${
                location.pathname === "/owner/dashboard"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted text-foreground border-border"
              }`}
            >
              Owner Dashboard
            </button>
          </div>

          {/* Toolbar: Highlights Toggle & Category Filters */}
          <div className="p-3 border-b border-border bg-background space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setHighlightOnPage((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition font-medium"
              >
                {highlightOnPage ? (
                  <Eye className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                <span>{highlightOnPage ? "DOM Mapping Active" : "DOM Mapping Hidden"}</span>
              </button>

              <button
                type="button"
                onClick={exportReport}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
                title="Download markdown report"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Export Report</span>
              </button>
            </div>

            {/* Filter Chips */}
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`px-2 py-1 rounded-md transition ${
                  filterType === "all"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({issues.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("labels")}
                className={`px-2 py-1 rounded-md transition ${
                  filterType === "labels"
                    ? "bg-red-600 text-white font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Labels & Alt ({labelIssuesCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("contrast")}
                className={`px-2 py-1 rounded-md transition ${
                  filterType === "contrast"
                    ? "bg-amber-600 text-white font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Contrast ({contrastIssuesCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("registration")}
                className={`px-2 py-1 rounded-md transition ${
                  filterType === "registration"
                    ? "bg-blue-600 text-white font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Registration Focus
              </button>
              <button
                type="button"
                onClick={() => setFilterType("dashboard")}
                className={`px-2 py-1 rounded-md transition ${
                  filterType === "dashboard"
                    ? "bg-purple-600 text-white font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Dashboard Focus
              </button>
            </div>
          </div>

          {/* Issue List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredIssues.length === 0 ? (
              <div className="text-center py-10 px-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-foreground">No Accessibility Issues Detected</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  {filterType === "all"
                    ? "All form inputs have accessible labels, buttons have accessible names, images have alt tags, and text passes WCAG AA contrast thresholds."
                    : `No issues matching the "${filterType}" filter were found on this view.`}
                </p>
                <Button variant="outline" size="sm" onClick={runScan} className="mt-4 text-xs">
                  Re-scan DOM
                </Button>
              </div>
            ) : (
              filteredIssues.map((issue) => {
                const isSelected = selectedIssueId === issue.id;
                const isLabelType =
                  issue.type === "missing-label" ||
                  issue.type === "placeholder-only" ||
                  issue.type === "missing-button-label" ||
                  issue.type === "missing-image-alt";

                return (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-lg border text-xs transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:border-muted-foreground/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            issue.severity === "violation" ? "bg-red-500" : "bg-amber-500"
                          }`}
                        />
                        <span className="text-foreground">
                          {isLabelType
                            ? issue.type === "placeholder-only"
                              ? "Placeholder Used as Only Label"
                              : issue.type === "missing-button-label"
                                ? "Icon Button Missing Accessible Name"
                                : issue.type === "missing-image-alt"
                                  ? "Image Missing Alt Text"
                                  : "Missing Form Label"
                            : `Low Color Contrast (${issue.contrastDetails?.ratio}:1)`}
                        </span>
                      </div>

                      <Badge
                        variant={issue.severity === "violation" ? "destructive" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {issue.severity}
                      </Badge>
                    </div>

                    <p className="text-muted-foreground mt-1 leading-relaxed">{issue.message}</p>

                    {/* Contrast Color Swatches */}
                    {issue.contrastDetails && (
                      <div className="mt-2 p-2 rounded bg-muted/40 border border-border/60 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span
                              className="inline-block w-3.5 h-3.5 rounded-full border"
                              style={{ backgroundColor: issue.contrastDetails.fgColor }}
                            />
                            <span className="font-mono text-[10px]">{issue.contrastDetails.fgColor}</span>
                          </div>
                          <span className="text-muted-foreground">on</span>
                          <div className="flex items-center gap-1">
                            <span
                              className="inline-block w-3.5 h-3.5 rounded-full border"
                              style={{ backgroundColor: issue.contrastDetails.bgColor }}
                            />
                            <span className="font-mono text-[10px]">{issue.contrastDetails.bgColor}</span>
                          </div>
                        </div>

                        <div className="font-mono font-bold text-amber-500">
                          {issue.contrastDetails.ratio}:1 &lt; {issue.contrastDetails.required}:1
                        </div>
                      </div>
                    )}

                    {/* Element Selector & Snippet */}
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px] truncate max-w-[200px]">
                        {issue.selector}
                      </code>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[11px] px-2 gap-1"
                          onClick={() => locateElement(issue)}
                        >
                          <Crosshair className="h-3 w-3 text-primary" />
                          <span>Locate</span>
                        </Button>

                        <Button
                          variant="default"
                          size="sm"
                          className="h-6 text-[11px] px-2 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                          onClick={() => handleFixSingle(issue)}
                          title="Apply immediate accessible fix to DOM"
                        >
                          <Wand2 className="h-3 w-3" />
                          <span>Fix</span>
                        </Button>
                      </div>
                    </div>

                    {/* Actionable Fix */}
                    <div className="mt-2 pt-2 border-t border-border/40 text-[11px] text-foreground/80">
                      <span className="font-semibold text-primary">Fix: </span>
                      <span>{issue.suggestedFix}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-muted/40 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Last scan: {lastScanTime.toLocaleTimeString()}</span>
              {fixedSessionCount > 0 && (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {fixedSessionCount} fixed
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              <span>WCAG 2.1 AA Compliance Checker</span>
            </div>
          </div>
        </div>
      )}

      {/* Code Patches Modal */}
      {showCodeModal && (
        <div
          data-a11y-overlay="true"
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm text-foreground">
                  Accessibility Code Remediation Patches
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleCopyCode}
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedCode ? "Copied!" : "Copy Patches"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowCodeModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs bg-muted/20 whitespace-pre-wrap leading-relaxed">
              {generateCodeRemediationReport(issues, recentFixResults)}
            </div>

            <div className="p-3 bg-muted/40 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
              <span>Apply these patches to components to permanently enforce WCAG AA standards.</span>
              <Button size="sm" onClick={() => setShowCodeModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AccessibilityOverlay;
