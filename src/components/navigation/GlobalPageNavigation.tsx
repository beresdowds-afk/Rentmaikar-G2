import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Minimize2, Maximize2, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HistoryEntry {
  path: string;
  title: string;
  timestamp: number;
}

const STORAGE_KEY = "rentmaikar_nav_history_stack_v1";
const INDEX_KEY = "rentmaikar_nav_history_index_v1";
const COLLAPSED_KEY = "rentmaikar_nav_controls_collapsed_v1";

export function resolvePageTitle(pathname: string): string {
  if (!pathname || pathname === "/") return "Home";
  if (pathname.startsWith("/catalogue/budget")) return "Budget Cars";
  if (pathname.startsWith("/catalogue/standard")) return "Standard Cars";
  if (pathname.startsWith("/catalogue/premium")) return "Premium Cars";
  if (pathname.startsWith("/catalogue")) return "Vehicle Catalogue";
  if (pathname.startsWith("/vehicle/")) return "Vehicle Details";
  if (pathname === "/driver/dashboard") return "Driver Dashboard";
  if (pathname === "/driver/register" || pathname === "/register/driver") return "Driver Registration";
  if (pathname === "/driver/onboarding") return "Driver Onboarding";
  if (pathname === "/driver/training") return "Driver Training";
  if (pathname === "/owner/dashboard") return "Owner Dashboard";
  if (pathname === "/owner/register" || pathname === "/register/owner") return "Owner Registration";
  if (pathname === "/owner/onboarding") return "Owner Onboarding";
  if (pathname === "/owner/portal-access") return "Owner Portal";
  if (pathname === "/admin") return "Admin Dashboard";
  if (pathname === "/admin-assistant") return "Admin Assistant";
  if (pathname === "/admin/features-report") return "Platform Report";
  if (pathname === "/auth") return "Sign In";
  if (pathname === "/terms") return "Terms of Service";
  if (pathname === "/privacy") return "Privacy Policy";
  if (pathname === "/faq") return "FAQ & Help";
  if (pathname === "/how-it-works") return "How It Works";
  if (pathname === "/sms-opt-in") return "SMS Opt-In";
  if (pathname === "/api-docs") return "API Docs";
  if (pathname === "/support/legal") return "Legal Support";
  if (pathname === "/support/iot") return "IoT Support";
  if (pathname === "/support/vehicle") return "Vehicle Support";
  if (pathname === "/support/insurance") return "Insurance Support";
  if (pathname === "/settings/profile" || pathname === "/profile-settings") return "Profile Settings";
  if (pathname === "/settings/notifications") return "Notification Settings";

  // Generic fallback from route segments
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    return last
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return "Page";
}

export interface FlowRoute {
  path: string;
  title: string;
}

export const PRIMARY_NAVIGATION_FLOW: FlowRoute[] = [
  { path: "/", title: "Home" },
  { path: "/catalogue/budget", title: "Budget Cars" },
  { path: "/catalogue/standard", title: "Standard Cars" },
  { path: "/catalogue/premium", title: "Premium Cars" },
  { path: "/how-it-works", title: "How It Works" },
  { path: "/driver/register", title: "Driver Registration" },
  { path: "/driver/onboarding", title: "Driver Onboarding" },
  { path: "/owner/register", title: "Owner Registration" },
  { path: "/owner/portal-access", title: "Owner Portal" },
  { path: "/faq", title: "FAQ & Help" },
  { path: "/terms", title: "Terms of Service" },
  { path: "/privacy", title: "Privacy Policy" },
];

export function getSmartNavigationTargets(
  currentPath: string,
  historyStack: HistoryEntry[],
  currentIndex: number
): {
  previousPath: string;
  previousTitle: string;
  nextPath: string;
  nextTitle: string;
  isStackPrevious: boolean;
  isStackNext: boolean;
} {
  // Check if we have history backward
  let previousPath = "";
  let previousTitle = "";
  let isStackPrevious = false;

  if (currentIndex > 0 && historyStack[currentIndex - 1]) {
    previousPath = historyStack[currentIndex - 1].path;
    previousTitle = historyStack[currentIndex - 1].title;
    isStackPrevious = true;
  } else {
    const cleanPath = currentPath.split("?")[0].split("#")[0];
    const flowIdx = PRIMARY_NAVIGATION_FLOW.findIndex(
      (r) => r.path === cleanPath || (r.path !== "/" && cleanPath.startsWith(r.path))
    );
    if (flowIdx > 0) {
      const target = PRIMARY_NAVIGATION_FLOW[flowIdx - 1];
      previousPath = target.path;
      previousTitle = target.title;
    } else if (flowIdx === 0) {
      const target = PRIMARY_NAVIGATION_FLOW[PRIMARY_NAVIGATION_FLOW.length - 1];
      previousPath = target.path;
      previousTitle = target.title;
    } else {
      previousPath = "/";
      previousTitle = "Home";
    }
  }

  // Check if we have history forward
  let nextPath = "";
  let nextTitle = "";
  let isStackNext = false;

  if (currentIndex < historyStack.length - 1 && historyStack[currentIndex + 1]) {
    nextPath = historyStack[currentIndex + 1].path;
    nextTitle = historyStack[currentIndex + 1].title;
    isStackNext = true;
  } else {
    const cleanPath = currentPath.split("?")[0].split("#")[0];
    const flowIdx = PRIMARY_NAVIGATION_FLOW.findIndex(
      (r) => r.path === cleanPath || (r.path !== "/" && cleanPath.startsWith(r.path))
    );
    if (flowIdx >= 0 && flowIdx < PRIMARY_NAVIGATION_FLOW.length - 1) {
      const target = PRIMARY_NAVIGATION_FLOW[flowIdx + 1];
      nextPath = target.path;
      nextTitle = target.title;
    } else if (flowIdx === PRIMARY_NAVIGATION_FLOW.length - 1) {
      const target = PRIMARY_NAVIGATION_FLOW[0];
      nextPath = target.path;
      nextTitle = target.title;
    } else {
      nextPath = "/catalogue/budget";
      nextTitle = "Budget Cars";
    }
  }

  return {
    previousPath,
    previousTitle,
    nextPath,
    nextTitle,
    isStackPrevious,
    isStackNext,
  };
}

export function useSmartPageNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const [historyStack, setHistoryStack] = useState<HistoryEntry[]>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [
      {
        path: location.pathname + location.search,
        title: resolvePageTitle(location.pathname),
        timestamp: Date.now(),
      },
    ];
  });

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(INDEX_KEY);
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return 0;
  });

  // Keep sessionStorage in sync
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(historyStack));
      sessionStorage.setItem(INDEX_KEY, currentIndex.toString());
    } catch {
      /* ignore */
    }
  }, [historyStack, currentIndex]);

  // Track location changes
  useEffect(() => {
    const currentPath = location.pathname + location.search;
    const pageTitle = resolvePageTitle(location.pathname);

    setHistoryStack((prevStack) => {
      if (prevStack[currentIndex] && prevStack[currentIndex].path === currentPath) {
        return prevStack;
      }

      if (currentIndex > 0 && prevStack[currentIndex - 1]?.path === currentPath) {
        setCurrentIndex(currentIndex - 1);
        return prevStack;
      }
      if (currentIndex < prevStack.length - 1 && prevStack[currentIndex + 1]?.path === currentPath) {
        setCurrentIndex(currentIndex + 1);
        return prevStack;
      }

      const nextStack = prevStack.slice(0, currentIndex + 1);
      nextStack.push({
        path: currentPath,
        title: pageTitle,
        timestamp: Date.now(),
      });
      setCurrentIndex(nextStack.length - 1);
      return nextStack;
    });
  }, [location.pathname, location.search]);

  // Listen to popstate
  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname + window.location.search;
      setHistoryStack((prevStack) => {
        const foundIdx = prevStack.findIndex((e) => e.path === currentPath);
        if (foundIdx !== -1) {
          setCurrentIndex(foundIdx);
        }
        return prevStack;
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const targets = useMemo(() => {
    return getSmartNavigationTargets(
      location.pathname + location.search,
      historyStack,
      currentIndex
    );
  }, [location.pathname, location.search, historyStack, currentIndex]);

  const currentTitle = useMemo(() => {
    return historyStack[currentIndex]?.title || resolvePageTitle(location.pathname);
  }, [historyStack, currentIndex, location.pathname]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0 && historyStack[currentIndex - 1]) {
      const prevEntry = historyStack[currentIndex - 1];
      setCurrentIndex((idx) => Math.max(0, idx - 1));
      navigate(prevEntry.path);
      return;
    }

    const { previousPath } = getSmartNavigationTargets(
      location.pathname + location.search,
      historyStack,
      currentIndex
    );
    if (previousPath) {
      navigate(previousPath);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [currentIndex, historyStack, location.pathname, location.search, navigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < historyStack.length - 1 && historyStack[currentIndex + 1]) {
      const nextEntry = historyStack[currentIndex + 1];
      setCurrentIndex((idx) => Math.min(historyStack.length - 1, idx + 1));
      navigate(nextEntry.path);
      return;
    }

    const { nextPath } = getSmartNavigationTargets(
      location.pathname + location.search,
      historyStack,
      currentIndex
    );
    if (nextPath) {
      navigate(nextPath);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(1);
    } else {
      navigate("/catalogue/budget");
    }
  }, [currentIndex, historyStack, location.pathname, location.search, navigate]);

  return {
    historyStack,
    currentIndex,
    currentTitle,
    targets,
    handlePrevious,
    handleNext,
  };
}

export const GlobalPageNavigation: React.FC = () => {
  const { currentTitle, targets, handlePrevious, handleNext } = useSmartPageNavigation();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Global Keyboard shortcuts: Alt + ArrowLeft (Previous), Alt + ArrowRight (Next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevious();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrevious, handleNext]);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <nav
      id="global-page-navigator"
      aria-label="Universal page navigation"
      className="fixed bottom-4 left-4 z-40 print:hidden select-none transition-all duration-200"
    >
      <div className="flex items-center gap-1.5 p-1 bg-background/95 dark:bg-card/95 backdrop-blur-md border border-border/80 shadow-lg rounded-full text-foreground text-xs">
        {/* Previous Page Button - Always Enabled */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="nav-btn-prev-page"
              type="button"
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              aria-label={`Go to previous page: ${targets.previousTitle}`}
              className="h-8 px-2.5 rounded-full text-xs font-semibold gap-1 hover:bg-muted text-foreground cursor-pointer transition-all active:scale-95 shadow-xs"
            >
              <ChevronLeft className="h-4 w-4 shrink-0 text-foreground" />
              <span className={isCollapsed ? "sr-only" : "inline"}>Previous</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <span>
              Previous: <strong>{targets.previousTitle}</strong>{" "}
              <kbd className="text-[10px] text-muted-foreground ml-1">Alt+←</kbd>
            </span>
          </TooltipContent>
        </Tooltip>

        {/* Current Page Indicator (visible in expanded mode) */}
        {!isCollapsed && (
          <div className="hidden sm:flex items-center gap-1 px-2 border-x border-border/60 max-w-[150px] md:max-w-[200px]">
            <Compass className="h-3 w-3 text-primary shrink-0" />
            <span
              className="truncate text-[11px] font-medium text-muted-foreground"
              title={currentTitle}
            >
              {currentTitle}
            </span>
          </div>
        )}

        {/* Next Page Button - Always Enabled */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="nav-btn-next-page"
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleNext}
              aria-label={`Go to next page: ${targets.nextTitle}`}
              className="h-8 px-2.5 rounded-full text-xs font-semibold gap-1 hover:bg-muted text-foreground cursor-pointer transition-all active:scale-95 shadow-xs"
            >
              <span className={isCollapsed ? "sr-only" : "inline"}>Next</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <span>
              Next: <strong>{targets.nextTitle}</strong>{" "}
              <kbd className="text-[10px] text-muted-foreground ml-1">Alt+→</kbd>
            </span>
          </TooltipContent>
        </Tooltip>

        {/* Compact / Expand Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              id="nav-btn-toggle-expand"
              type="button"
              onClick={toggleCollapsed}
              className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors ml-0.5"
              aria-label={isCollapsed ? "Expand page navigation label" : "Minimize page navigation"}
            >
              {isCollapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isCollapsed ? "Expand page title" : "Compact buttons"}
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
};

export default GlobalPageNavigation;
