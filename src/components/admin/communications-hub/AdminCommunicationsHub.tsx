import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Phone,
  PhoneCall,
  MessageSquare,
  Clock,
  Sparkles,
  X,
  Minimize2,
  Maximize2,
  Headphones,
  ShieldCheck,
  Send,
  Inbox,
  PenSquare,
  Users,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunicationsHub, HubTab } from './CommunicationsHubContext';
import { HubCallDialer } from './HubCallDialer';
import { HubMessageComposer } from './HubMessageComposer';
import { HubConversationHistory } from './HubConversationHistory';
import { HubContextActions } from './HubContextActions';
import { HubMessageConsole } from './HubMessageConsole';
import { HubBulkMessaging } from './HubBulkMessaging';
import { AdminCommunicationsHubErrorBoundary } from './AdminCommunicationsHubErrorBoundary';

const ADMIN_EMAILS = [
  'adebayoolusola39@gmail.com',
  'beresdowds@gmail.com',
  'beresanddowds@gmail.com',
  'eastfortemain@gmail.com',
];

export const AdminCommunicationsHub: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userRole, hasRole } = useAuth();
  const {
    isOpen,
    setIsOpen,
    toggleOpen,
    isMinimized,
    setIsMinimized,
    activeTab,
    setActiveTab,
    activeCall,
    unreadCount,
  } = useCommunicationsHub();

  const [isExpandedFull, setIsExpandedFull] = React.useState(false);

  // Staff and Admin Authorization Check:
  // Accessible to authenticated Admin and Admin Assistant staff accounts.
  const isAuthorizedStaff = useMemo(() => {
    if (!user) return false;
    if (
      userRole === 'admin' ||
      userRole === 'admin_assistant' ||
      hasRole('admin') ||
      hasRole('admin_assistant')
    ) {
      return true;
    }
    const email = user.email?.trim().toLowerCase();
    if (email && ADMIN_EMAILS.includes(email)) {
      return true;
    }
    if (
      user.app_metadata?.role === 'admin' ||
      user.user_metadata?.role === 'admin' ||
      user.app_metadata?.role === 'admin_assistant' ||
      user.user_metadata?.role === 'admin_assistant'
    ) {
      return true;
    }
    return false;
  }, [user, userRole, hasRole]);

  const isCallInProgress = Boolean(activeCall && activeCall.status !== 'completed' && activeCall.status !== 'failed');

  // Dedicated standalone operational communication pages (suppress floating launcher unless an active call is running)
  const isDedicatedCommsPage =
    location.pathname === '/admin/call-center' ||
    location.pathname === '/admin/messaging' ||
    location.pathname.startsWith('/m/call-in');

  // Auto-close floating hub window when navigating between routes or tabs so it never obstructs target pages
  const lastLocationRef = React.useRef(location.pathname + location.search);
  React.useEffect(() => {
    const currentLoc = location.pathname + location.search;
    if (lastLocationRef.current !== currentLoc) {
      lastLocationRef.current = currentLoc;
      // Close floating window if open and no phone call is currently in progress
      if (!isCallInProgress && isOpen) {
        setIsOpen(false);
      }
    }
  }, [location.pathname, location.search, isCallInProgress, isOpen, setIsOpen]);

  // Handle ESC key to dismiss open floating window
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isCallInProgress) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCallInProgress, setIsOpen]);

  // Ensure this Hub is active across operational pages or when explicitly opened or in active call
  const shouldRender = useMemo(() => {
    if (!isAuthorizedStaff) return false;
    // Suppress on dedicated full-screen communications routes unless a call is running
    if (isDedicatedCommsPage && !isCallInProgress) return false;
    // Always render if open, minimized, or when a telephony call is in progress
    if (isOpen || isMinimized || isCallInProgress) return true;
    // Render launcher across Admin, VoIP Call Center, Reports, and Operations pages
    return (
      location.pathname.startsWith('/admin') ||
      location.pathname.startsWith('/m/') ||
      location.pathname.startsWith('/call-center') ||
      location.pathname === '/report' ||
      location.pathname === '/features-report' ||
      location.pathname.startsWith('/dashboard')
    );
  }, [isAuthorizedStaff, isDedicatedCommsPage, isOpen, isMinimized, isCallInProgress, location.pathname]);

  // If user is not authorized or not on an operational surface, do not render
  if (!shouldRender) {
    return null;
  }

  // Normalize message tab for backward compatibility
  const currentTab = activeTab === 'message' ? 'editor' : activeTab;

  return (
    <AdminCommunicationsHubErrorBoundary>
      {/* Floating Trigger Launcher (Shown when Hub window is closed or minimized) */}
      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in zoom-in-95 duration-200">
          <Button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
            }}
            className={`h-11 px-4 rounded-full shadow-xl flex items-center gap-2.5 transition-all text-xs font-semibold ${
              isCallInProgress
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse ring-4 ring-emerald-500/30'
                : 'bg-primary hover:bg-primary/95 text-primary-foreground border border-primary/20'
            }`}
            title="Open Rentmaikar Admin Communications Hub"
          >
            {isCallInProgress ? (
              <PhoneCall className="h-4 w-4 animate-bounce" />
            ) : (
              <Headphones className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isCallInProgress ? 'Active Call In Progress' : 'Communications Hub'}
            </span>

            {/* Unread / Active Badge */}
            {isCallInProgress && (
              <span className="h-2 w-2 rounded-full bg-white" />
            )}
            {!isCallInProgress && unreadCount > 0 && (
              <Badge variant="destructive" className="text-[10px] h-4 min-w-[16px] px-1 py-0 rounded-full font-mono">
                {unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      )}

      {/* Floating Window (Shown when Open & not Minimized) */}
      {isOpen && !isMinimized && (
        <div
          className={`fixed z-50 bg-background border border-border shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all duration-200 ${
            isExpandedFull
              ? 'top-4 bottom-4 left-4 right-4 sm:top-8 sm:bottom-8 sm:left-12 sm:right-12 max-w-5xl mx-auto'
              : 'bottom-6 right-6 w-[94vw] sm:w-[480px] max-h-[88vh] h-[640px]'
          }`}
          role="dialog"
          aria-label="Rentmaikar Admin Communications Hub"
        >
          {/* Header Bar */}
          <div className="px-4 py-3 bg-muted/60 border-b border-border/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Headphones className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-foreground">Communications Hub</h3>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono bg-background">
                    ADMIN
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  Console, Editor, Bulk Engine, VoIP & History
                </p>
              </div>
            </div>

            {/* Window Controls */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin?tab=inbox')}
                className="h-7 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground hidden sm:flex"
                title="Open Central Messaging Center"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Center</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsExpandedFull((prev) => !prev)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title={isExpandedFull ? 'Restore normal size' : 'Expand window'}
              >
                {isExpandedFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(true)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="Minimize to floating button"
              >
                <Minimize2 className="h-3.5 w-3.5 rotate-45" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="Close Communications Hub"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <Tabs
            value={currentTab}
            onValueChange={(val) => setActiveTab(val as HubTab)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="px-3 pt-2 pb-1.5 border-b border-border/60 bg-background shrink-0 overflow-x-auto">
              <TabsList className="grid grid-cols-6 h-8 bg-muted/60 p-0.5 min-w-[420px] w-full">
                <TabsTrigger value="console" className="text-[11px] h-7 gap-1 px-1">
                  <Inbox className="h-3 w-3 text-blue-600" />
                  <span className="truncate">Console</span>
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="text-[8px] h-3.5 min-w-[12px] px-1 py-0 rounded-full font-mono">
                      {unreadCount}
                    </Badge>
                  )}
                </TabsTrigger>

                <TabsTrigger value="editor" className="text-[11px] h-7 gap-1 px-1">
                  <PenSquare className="h-3 w-3 text-indigo-600" />
                  <span className="truncate">Editor</span>
                </TabsTrigger>

                <TabsTrigger value="bulk" className="text-[11px] h-7 gap-1 px-1">
                  <Users className="h-3 w-3 text-emerald-600" />
                  <span className="truncate">Bulk</span>
                </TabsTrigger>

                <TabsTrigger value="call" className="text-[11px] h-7 gap-1 px-1">
                  <Phone className="h-3 w-3 text-emerald-600" />
                  <span className="truncate">Softphone</span>
                  {isCallInProgress && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  )}
                </TabsTrigger>

                <TabsTrigger value="history" className="text-[11px] h-7 gap-1 px-1">
                  <Clock className="h-3 w-3 text-amber-600" />
                  <span className="truncate">History</span>
                </TabsTrigger>

                <TabsTrigger value="context" className="text-[11px] h-7 gap-1 px-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="truncate">Context</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              <TabsContent value="console" className="mt-0 focus-visible:outline-hidden h-full">
                <HubMessageConsole />
              </TabsContent>

              <TabsContent value="editor" className="mt-0 focus-visible:outline-hidden">
                <HubMessageComposer />
              </TabsContent>

              <TabsContent value="bulk" className="mt-0 focus-visible:outline-hidden">
                <HubBulkMessaging />
              </TabsContent>

              <TabsContent value="call" className="mt-0 focus-visible:outline-hidden">
                <HubCallDialer />
              </TabsContent>

              <TabsContent value="history" className="mt-0 focus-visible:outline-hidden">
                <HubConversationHistory />
              </TabsContent>

              <TabsContent value="context" className="mt-0 focus-visible:outline-hidden">
                <HubContextActions />
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer Bar */}
          <div className="px-4 py-2 bg-muted/30 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
            <div className="flex items-center gap-1.5 font-mono">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              <span>Twilio • Sent.dm • Resend</span>
            </div>
            <span>Fail-isolated overlay</span>
          </div>
        </div>
      )}
    </AdminCommunicationsHubErrorBoundary>
  );
};

