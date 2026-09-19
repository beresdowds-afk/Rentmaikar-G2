import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Smartphone,
  X,
  Minus,
  Maximize2,
  Share,
  PlusSquare,
  CheckCircle2,
  WifiOff,
  Zap,
  Bell,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "rmk_pwa_cta_display_state_v2";

type CTAViewMode = "expanded" | "collapsed" | "hidden";

export const PWAInstallPopupCTA: React.FC = () => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    platformName,
    install,
    triggerSelfInstallation,
  } = usePWAInstall();

  // Mode state: 'expanded' (popup card), 'collapsed' (floating button), 'hidden' (installed or closed)
  const [viewMode, setViewMode] = useState<CTAViewMode>("collapsed");
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Initialize visibility for both new and returning visitors
  useEffect(() => {
    // If running in standalone installed PWA, do not display
    if (isInstalled) {
      setViewMode("hidden");
      return;
    }

    try {
      const savedPref = localStorage.getItem(STORAGE_KEY);

      // Delay display slightly (2.2s) so the primary page content loads smoothly first
      const timer = setTimeout(() => {
        if (savedPref === "collapsed") {
          // Returning visitor who previously collapsed it: keep it as the floating self-install button
          setViewMode("collapsed");
        } else {
          // New visitor or visitor who hasn't explicitly minimized: show the polite corner popup
          setViewMode("expanded");
        }
        setHasInitialized(true);
      }, 2200);

      return () => clearTimeout(timer);
    } catch {
      setViewMode("expanded");
      setHasInitialized(true);
    }
  }, [isInstalled]);

  const handleCollapse = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setViewMode("collapsed");
    try {
      localStorage.setItem(STORAGE_KEY, "collapsed");
    } catch {
      // storage unavailable
    }
  }, []);

  const handleExpand = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setViewMode("expanded");
    try {
      localStorage.setItem(STORAGE_KEY, "expanded");
    } catch {
      // storage unavailable
    }
  }, []);

  // Primary action: initiates self-installation
  const handleInitiateInstall = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsInstalling(true);

    try {
      // 1. If on iOS Safari, open step-by-step guidance
      if (isIOS) {
        setShowIOSModal(true);
        setIsInstalling(false);
        return;
      }

      // 2. Attempt native browser self-installation
      const result = await triggerSelfInstallation();

      if (result.outcome === "accepted") {
        toast.success("RentMaikar App installed successfully!", {
          description: "You can now launch RentMaikar directly from your home screen or apps menu.",
        });
        setViewMode("hidden");
      } else if (result.outcome === "manual_instructions") {
        setShowIOSModal(true);
      } else if (result.outcome === "dismissed") {
        toast.info("Installation postponed", {
          description: "You can click the floating Install App button anytime to resume.",
        });
        handleCollapse();
      } else {
        // Fallback for browsers that require manual menu installation or direct download
        handleTriggerDirectDownload();
      }
    } catch (err: any) {
      console.error("[PWA] Installation error:", err);
      handleTriggerDirectDownload();
    } finally {
      setIsInstalling(false);
    }
  };

  const handleTriggerDirectDownload = () => {
    toast.info("Self-Installation Triggered", {
      description: "Opening browser installation / shortcut menu for RentMaikar...",
    });

    // Provide immediate self-installation manifest download / shortcut fallback
    const link = document.createElement("a");
    link.href = "/manifest.webmanifest";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("download", "rentmaikar-platform.webmanifest");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // If still in standard browser, expand or show prompt
    if (isInstallable) {
      void install();
    }
  };

  // If already installed or not yet initialized, don't show
  if (isInstalled || !hasInitialized || viewMode === "hidden") {
    return null;
  }

  return (
    <>
      {/* ========================================================= */}
      {/* COLLAPSED STATE: Floating Self-Installation Download Button */}
      {/* ========================================================= */}
      {viewMode === "collapsed" && (
        <div
          id="pwa-collapsed-cta-container"
          className="fixed bottom-5 left-5 sm:bottom-6 sm:left-6 z-40 flex items-center gap-1.5 transition-all duration-300 transform animate-in fade-in slide-in-from-bottom-3"
        >
          {/* Main Self-Installation Trigger Button */}
          <button
            id="pwa-floating-self-install-btn"
            type="button"
            onClick={handleInitiateInstall}
            disabled={isInstalling}
            title={`Initiate self-installation download for ${platformName}`}
            aria-label={`Install RentMaikar Platform App on your ${platformName}`}
            className="group relative flex items-center gap-2.5 rounded-full bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 shadow-xl border border-primary-foreground/20 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer select-none"
          >
            {/* Animated Pulse Ring */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
            </span>

            <Download className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5" />

            <div className="flex flex-col items-start leading-none text-left">
              <span className="text-xs font-bold tracking-tight">Install App</span>
              <span className="text-[10px] text-primary-foreground/75 hidden sm:inline-block">
                RentMaikar for {platformName}
              </span>
            </div>

            <Badge
              variant="secondary"
              className="ml-1 text-[9px] px-1.5 py-0 uppercase font-semibold bg-secondary/20 text-secondary-foreground hidden sm:flex items-center gap-1 border-0"
            >
              <Sparkles className="h-2.5 w-2.5 text-secondary" />
              Direct
            </Badge>
          </button>

          {/* Quick Expand Button */}
          <button
            type="button"
            id="pwa-expand-cta-btn"
            onClick={handleExpand}
            title="View app benefits & full details"
            aria-label="Expand RentMaikar App CTA"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-background/90 hover:bg-background text-muted-foreground hover:text-foreground shadow-md border border-border/80 transition-all hover:scale-105"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* EXPANDED STATE: Non-Obstructing Pop-Up CTA Card            */}
      {/* ========================================================= */}
      {viewMode === "expanded" && (
        <aside
          id="pwa-install-popup-cta"
          aria-labelledby="pwa-install-cta-title"
          className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-40 max-w-[360px] sm:max-w-[390px] w-[calc(100vw-2rem)] rounded-2xl bg-card/98 backdrop-blur-md border border-border shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
        >

          {/* Card Header & Controls */}
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-inner shrink-0 relative overflow-hidden">
                  <Smartphone className="h-6 w-6 text-primary-foreground" />
                  <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-80" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-secondary" />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      id="pwa-install-cta-title"
                      className="font-bold text-sm sm:text-base text-foreground leading-tight"
                    >
                      Get RentMaikar App
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-primary/30 text-primary font-medium"
                    >
                      Official
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    For {platformName} • Instant Self-Install
                  </p>
                </div>
              </div>

              {/* Window Controls: Collapse and Dismiss */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="pwa-popup-minimize-btn"
                  onClick={handleCollapse}
                  title="Collapse into floating install button"
                  aria-label="Collapse into floating install button"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  id="pwa-popup-close-btn"
                  onClick={handleCollapse}
                  title="Minimize for this visit"
                  aria-label="Minimize for this visit"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Value Proposition Description */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Install RentMaikar on your device for seamless vehicle bookings, live GPS telematics, instant offline access, and real-time push alerts.
            </p>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="flex items-center gap-1.5 text-[11px] text-foreground/80 font-medium">
                <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Instant Launch</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-foreground/80 font-medium">
                <WifiOff className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>Offline Sync</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-foreground/80 font-medium">
                <Bell className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Instant Alerts</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-foreground/80 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Zero App Store Delay</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch gap-2">
              <Button
                id="pwa-popup-primary-install-btn"
                type="button"
                size="sm"
                onClick={handleInitiateInstall}
                disabled={isInstalling}
                className="w-full gap-2 text-xs font-semibold shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                {isIOS
                  ? "Install for iPhone / iPad"
                  : isAndroid
                  ? "Install for Android"
                  : `Install for ${platformName}`}
              </Button>

              <Button
                id="pwa-popup-collapse-btn"
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCollapse}
                className="w-full sm:w-auto text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                Minimize
              </Button>
            </div>

            {/* Self-Installation Direct Download Link Footer */}
            <div className="pt-1 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Fast 1-click self installation</span>
              <button
                type="button"
                id="pwa-self-install-download-link"
                onClick={handleTriggerDirectDownload}
                className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
              >
                Download package link
                <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ========================================================= */}
      {/* iOS Installation Guide Dialog Modal                       */}
      {/* ========================================================= */}
      <Dialog open={showIOSModal} onOpenChange={setShowIOSModal}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="text-left space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Install RentMaikar on iOS
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Apple Safari requires two simple taps to self-install:
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 py-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border text-xs">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-foreground">
                  Tap the <Share className="h-3.5 w-3.5 text-blue-500" /> Share button
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Located at the bottom of Safari on iPhone, or top right on iPad.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border text-xs">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-foreground">
                  Select <PlusSquare className="h-3.5 w-3.5 text-emerald-500" /> &ldquo;Add to Home Screen&rdquo;
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Scroll down the share sheet and tap Add to Home Screen, then tap <strong>Add</strong> in the top right.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>RentMaikar will appear immediately on your home screen!</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                setShowIOSModal(false);
                handleCollapse();
              }}
              className="text-xs"
            >
              Got it, thanks!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
