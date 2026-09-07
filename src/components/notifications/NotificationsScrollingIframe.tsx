import React, { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Inbox,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationDeepLink } from "@/lib/notification-links";

export interface UserNotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  related_user_id?: string | null;
  related_stage?: string | null;
  related_access_level?: string | null;
  read_at: string | null;
  created_at: string;
  metadata?: unknown;
}

const KIND_COLORS: Record<string, string> = {
  onboarding_stage: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  access_grant: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  access_revoke: "bg-red-500/15 text-red-700 dark:text-red-300",
  applications_created: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  applications_status: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  invoices_created: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  invoices_status: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  payments_status: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  legal_agreements_created: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  legal_agreements_status: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  price_negotiations_created: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  price_negotiations_status: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  vehicle_review: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  vehicles_catalogue_live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  other: "bg-muted text-muted-foreground",
};

const KIND_LABEL: Record<string, string> = {
  onboarding_stage: "Onboarding",
  access_grant: "Grant",
  access_revoke: "Revoke",
  vehicle_review: "Vehicle review",
  vehicles_catalogue_live: "Catalogue live",
};

const kindClass = (kind: string) => KIND_COLORS[kind] ?? KIND_COLORS.other;
const kindLabel = (kind: string) =>
  KIND_LABEL[kind] ??
  kind
    .replace(/_(created|status)$/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

interface NotificationsScrollingIframeProps {
  notifications: UserNotificationItem[];
  loading?: boolean;
  userRole?: string | null;
  onMarkOne?: (id: string) => void;
  onNavigate?: (path: string) => void;
  height?: number;
}

export const NotificationsScrollingIframe: React.FC<NotificationsScrollingIframeProps> = ({
  notifications,
  loading = false,
  userRole,
  onMarkOne,
  onNavigate,
  height = 390,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScrollability = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const el = doc.scrollingElement || doc.documentElement || doc.body;
      const top = el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;
      setCanScrollUp(top > 10);
      setCanScrollDown(top + clientHeight < scrollHeight - 10);
    } catch {
      /* ignore cross-origin check issues */
    }
  }, []);

  const setupIframeDocument = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      if (!doc.getElementById("notifications-iframe-mount-root")) {
        doc.open();
        doc.write(`<!DOCTYPE html>
<html lang="en" class="${document.documentElement.className}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      overflow-y: auto;
      overflow-x: hidden;
      scroll-behavior: smooth;
    }
    /* Accessible custom scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.4);
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(100, 116, 139, 0.7);
    }
  </style>
</head>
<body class="${document.body.className} bg-transparent">
  <div id="notifications-iframe-mount-root" class="w-full"></div>
</body>
</html>`);
        doc.close();

        // Copy parent CSS stylesheets so Tailwind and component styles apply
        const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
        styleElements.forEach((el) => {
          doc.head.appendChild(el.cloneNode(true));
        });

        // Add scroll listener for smooth button toggles
        doc.addEventListener("scroll", checkScrollability, { passive: true });
      }

      // Sync dark mode class
      doc.documentElement.className = document.documentElement.className;

      const root = doc.getElementById("notifications-iframe-mount-root") || doc.body;
      setMountNode(root);
      setTimeout(checkScrollability, 100);
    } catch (err) {
      console.warn("Notifications iframe setup error:", err);
    }
  }, [checkScrollability]);

  useEffect(() => {
    setupIframeDocument();

    const observer = new MutationObserver(() => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (doc) {
        doc.documentElement.className = document.documentElement.className;
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [setupIframeDocument]);

  useEffect(() => {
    checkScrollability();
  }, [notifications, checkScrollability]);

  const scrollIframe = (direction: "up" | "down") => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const el = doc.scrollingElement || doc.documentElement || doc.body;
      const distance = direction === "up" ? -220 : 220;
      el.scrollBy({ top: distance, behavior: "smooth" });
      setTimeout(checkScrollability, 300);
    } catch (e) {
      console.warn("Scroll action error:", e);
    }
  };

  const totalCount = notifications.length;

  return (
    <div
      id="user-notifications-scrolling-container"
      className="relative flex flex-col w-full bg-background border-y border-border/60"
    >
      {/* Visual Scrolling Control Sub-header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/50 text-[11px] text-muted-foreground select-none">
        <div className="flex items-center gap-1.5">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>User Notifications iFrame</span>
          <span>•</span>
          <span>{totalCount} {totalCount === 1 ? "notification" : "notifications"}</span>
        </div>

        {/* Scroll Up & Scroll Down Buttons */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
            onClick={() => scrollIframe("up")}
            disabled={!canScrollUp}
            title="Scroll up"
            aria-label="Scroll notifications up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
            onClick={() => scrollIframe("down")}
            disabled={!canScrollDown && totalCount <= 3}
            title="Scroll down"
            aria-label="Scroll notifications down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Embedded Scrolling iFrame */}
      <iframe
        ref={iframeRef}
        id="user-notifications-iframe"
        title="User Notifications Scrolling iFrame"
        scrolling="yes"
        className="w-full border-0 bg-transparent"
        style={{ height: `${height}px`, minHeight: `${height}px` }}
        onLoad={setupIframeDocument}
      >
        {mountNode &&
          createPortal(
            <div className="w-full">
              {loading && totalCount === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-primary" />
                  Loading notifications…
                </div>
              )}

              {!loading && totalCount === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="font-medium text-foreground">You're all caught up</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No notifications right now.</p>
                </div>
              )}

              <ul className="divide-y divide-border/60">
                {notifications.map((n) => {
                  const link = notificationDeepLink(n.metadata, n.kind, userRole);
                  const handleOpen = () => {
                    if (!n.read_at && onMarkOne) onMarkOne(n.id);
                    if (link && onNavigate) onNavigate(link);
                  };

                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "flex gap-3 p-3 text-sm transition-colors",
                        !n.read_at && "bg-muted/40",
                        link && "cursor-pointer hover:bg-muted/60",
                      )}
                      onClick={link ? handleOpen : undefined}
                      role={link ? "button" : undefined}
                      tabIndex={link ? 0 : undefined}
                      onKeyDown={
                        link
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleOpen();
                              }
                            }
                          : undefined
                      }
                    >
                      <Badge className={cn("h-fit shrink-0", kindClass(n.kind))} variant="secondary">
                        {kindLabel(n.kind)}
                      </Badge>

                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center gap-1 text-foreground">
                          {n.title}
                          {link && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        </div>
                        {n.body && (
                          <div className="text-muted-foreground text-xs mt-0.5 break-words">
                            {n.body}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                          <span>{new Date(n.created_at).toLocaleString()}</span>
                          {link && <span className="text-primary hover:underline">Open record</span>}
                        </div>
                      </div>

                      {!n.read_at && onMarkOne && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkOne(n.id);
                          }}
                          title="Mark read"
                          aria-label="Mark notification as read"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>,
            mountNode,
          )}
      </iframe>
    </div>
  );
};

export default NotificationsScrollingIframe;
