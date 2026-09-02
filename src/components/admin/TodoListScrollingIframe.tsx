import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ListTodo, Users, DollarSign, FileText, Handshake, 
  Wrench, MessageSquare, Car, Shield, CheckCircle2,
  Clock, ArrowDown, ChevronDown
} from 'lucide-react';

export interface DailyTask {
  id: string;
  task_date: string;
  category: string;
  title: string;
  description: string | null;
  priority: string;
  is_completed: boolean;
  completed_at: string | null;
  source_table?: string | null;
  created_at?: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  applications: <Users className="h-4 w-4" />,
  payment_defaults: <DollarSign className="h-4 w-4" />,
  expiring_documents: <FileText className="h-4 w-4" />,
  pending_negotiations: <Handshake className="h-4 w-4" />,
  support_tasks: <Wrench className="h-4 w-4" />,
  inbox: <MessageSquare className="h-4 w-4" />,
  recalls: <Car className="h-4 w-4" />,
  rent_to_own: <Handshake className="h-4 w-4" />,
  legal_agreements: <Shield className="h-4 w-4" />,
  custom: <ListTodo className="h-4 w-4" />,
};

const priorityBadges: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', text: 'Urgent', label: 'Urgent' },
  high: { bg: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30', text: 'High', label: 'High' },
  medium: { bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', text: 'Medium', label: 'Medium' },
  low: { bg: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30', text: 'Low', label: 'Low' },
};

interface TodoListScrollingIframeProps {
  tasks: DailyTask[];
  onToggleTask: (task: DailyTask) => void;
  isLoading?: boolean;
  onGenerateTasks?: () => void;
  isGenerating?: boolean;
}

export const TodoListScrollingIframe: React.FC<TodoListScrollingIframeProps> = ({
  tasks,
  onToggleTask,
  isLoading,
  onGenerateTasks,
  isGenerating,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  // Sync styles and setup iframe DOM environment
  const setupIframeDocument = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Only initialize structure once
      if (!doc.getElementById('iframe-mount-root')) {
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
    /* Sleek custom scrollbar */
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
    .task-row {
      height: 60px;
      max-height: 60px;
      transition: all 0.15s ease-in-out;
    }
  </style>
</head>
<body class="${document.body.className} bg-transparent">
  <div id="iframe-mount-root" class="p-2 space-y-1.5"></div>
</body>
</html>`);
        doc.close();

        // Copy parent CSS rules/stylesheets into iframe
        const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
        styleElements.forEach((el) => {
          doc.head.appendChild(el.cloneNode(true));
        });

        // Track scroll events inside iframe
        doc.addEventListener('scroll', () => {
          const scrollPos = doc.documentElement.scrollTop || doc.body.scrollTop;
          setHasScrolled(scrollPos > 15);
        }, { passive: true });
      }

      // Sync dark mode class
      doc.documentElement.className = document.documentElement.className;

      const root = doc.getElementById('iframe-mount-root') || doc.body;
      setMountNode(root);
    } catch (err) {
      console.warn('Iframe setup error:', err);
    }
  }, []);

  useEffect(() => {
    setupIframeDocument();

    // Listen to theme changes in the parent document
    const observer = new MutationObserver(() => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (doc) {
        doc.documentElement.className = document.documentElement.className;
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [setupIframeDocument]);

  const totalTasks = tasks.length;
  const visibleItemCount = Math.min(totalTasks, 6);

  // Calibrated iframe height: 6 items * ~61px + 10px container padding = ~376px (or ~385px)
  // This allows exactly 6 items to fit cleanly inside the frame viewport before scrolling
  const iframeHeight = 385;

  return (
    <div className="relative rounded-xl border border-border/80 bg-background/50 shadow-sm overflow-hidden">
      {/* Visual Frame Bar Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/60 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-foreground">Scrolling iFrame Viewport</span>
          <span className="text-[11px]">•</span>
          <span className="text-muted-foreground">Displaying 6 items in view</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
            {totalTasks > 6 ? `Showing 6 of ${totalTasks} items` : `${totalTasks} items`}
          </Badge>
          {totalTasks > 6 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 animate-bounce">
              <ChevronDown className="h-3 w-3 text-primary" />
              Scrollable
            </span>
          )}
        </div>
      </div>

      {/* The scrolling <iframe> element */}
      <iframe
        ref={iframeRef}
        id="admin-todo-list-iframe"
        title="Admin Daily Tasks Scrolling iFrame"
        scrolling="yes"
        className="w-full border-0 bg-transparent transition-opacity"
        style={{ height: `${iframeHeight}px`, minHeight: `${iframeHeight}px` }}
        onLoad={setupIframeDocument}
      >
        {mountNode && createPortal(
          <div className="space-y-1.5">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-2 text-muted-foreground">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-xs">Loading daily priorities...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-xs font-medium text-foreground">All daily tasks cleared!</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">No pending items remaining for today.</p>
                {onGenerateTasks && (
                  <button
                    type="button"
                    onClick={onGenerateTasks}
                    disabled={isGenerating}
                    className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors"
                  >
                    {isGenerating ? 'Generating Tasks...' : 'Generate Today\'s Tasks'}
                  </button>
                )}
              </div>
            ) : (
              tasks.map((task, idx) => {
                const badge = priorityBadges[task.priority] || priorityBadges.medium;
                const icon = categoryIcons[task.category] || <ListTodo className="h-4 w-4" />;

                return (
                  <div
                    key={task.id}
                    onClick={() => onToggleTask(task)}
                    className={`task-row flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-pointer select-none ${
                      task.is_completed
                        ? 'bg-muted/30 border-border/40 opacity-60'
                        : 'bg-card/95 hover:bg-muted/60 border-border/70 hover:border-primary/40 shadow-xs'
                    }`}
                  >
                    {/* Item Number & Checkbox */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground/60 w-4 text-center">
                        {idx + 1}
                      </span>
                      <Checkbox
                        checked={task.is_completed}
                        onCheckedChange={() => onToggleTask(task)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded"
                      />
                    </div>

                    {/* Category Icon */}
                    <div className={`p-1.5 rounded-md shrink-0 ${
                      task.is_completed ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                    }`}>
                      {icon}
                    </div>

                    {/* Task Title & Details */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium truncate ${
                          task.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'
                        }`}>
                          {task.title}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                          {task.description}
                        </p>
                      )}
                    </div>

                    {/* Priority Badge & Time */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider ${badge.bg}`}>
                        {badge.label}
                      </span>

                      {task.is_completed && task.completed_at && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap font-mono flex items-center gap-0.5">
                          ✓ {new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>,
          mountNode
        )}
      </iframe>

      {/* Floating Scroll Indicator if there are more than 6 items and user hasn't scrolled */}
      {totalTasks > 6 && !hasScrolled && (
        <div className="absolute bottom-2 right-4 pointer-events-none z-10">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background/90 backdrop-blur-xs border border-border/80 shadow-md text-[10px] text-muted-foreground font-medium animate-pulse">
            <ArrowDown className="h-2.5 w-2.5 text-primary" />
            Scroll for {totalTasks - 6} more
          </span>
        </div>
      )}
    </div>
  );
};
