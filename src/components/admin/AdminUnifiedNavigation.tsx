import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  UsersRound, 
  Building2, 
  Headphones, 
  HelpCircle, 
  Share2, 
  BookOpen, 
  ChevronDown, 
  Wrench,
  ShieldCheck,
  CreditCard,
  FileText,
  FileDown,
  AlertTriangle,
  PhoneCall,
  Compass,
  BarChart3,
  Key,
  Car,
  Fingerprint,
  Users,
  UserCheck,
  Scale,
  Receipt,
  PhoneForwarded
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollableStrip } from '@/components/ui/scrollable-strip';
import { AdminNotificationsBell } from '@/components/admin/AdminNotificationsBell';
import { 
  type PortalType, 
  type PortalTab, 
  crmTabs, 
  erpTabs, 
  supportTabs, 
  contentEditorTabs, 
  marketingTabs, 
  docsTabs 
} from '@/components/admin/PortalNavigation';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export interface AdminToolItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  category: 'Audits & Compliance' | 'Financial & Settlement' | 'Fleet & Operations' | 'Identity & Verification' | 'Content & Training';
  allowed: boolean;
}

interface AdminUnifiedNavigationProps {
  activePortal: PortalType;
  activeTab: string;
  onPortalChange: (portal: PortalType) => void;
  onTabChange: (tab: string) => void;
  excludeTabs?: string[];
  excludePortals?: PortalType[];
  storageScope?: string;
  allowedTools?: {
    canAudit?: boolean;
    canPayments?: boolean;
    canSupport?: boolean;
    canComms?: boolean;
    canContent?: boolean;
    canReports?: boolean;
    canVehicles?: boolean;
  };
}

const STORAGE_PREFIX = 'rentmaikar:portal-nav:last';

export function AdminUnifiedNavigation({
  activePortal,
  activeTab,
  onPortalChange,
  onTabChange,
  excludeTabs,
  excludePortals,
  storageScope = 'admin',
  allowedTools = {
    canAudit: true,
    canPayments: true,
    canSupport: true,
    canComms: true,
    canContent: true,
    canReports: true,
    canVehicles: true,
  },
}: AdminUnifiedNavigationProps) {
  const excludedTabSet = new Set(excludeTabs || []);
  const excludedPortalSet = new Set(excludePortals || []);

  // Per-user last tab memory
  const [userId, setUserId] = useState<string | null>(null);
  const [last, setLast] = useState<Partial<Record<PortalType, string>>>({});

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const id = data.user?.id ?? 'anon';
      setUserId(id);
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}:${storageScope}:${id}`);
        if (raw) setLast(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    });
    return () => {
      mounted = false;
    };
  }, [storageScope]);

  const remember = (portal: PortalType, tab: string) => {
    setLast((prev) => {
      const next = { ...prev, [portal]: tab };
      if (userId) {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}:${storageScope}:${userId}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  const getTabsForPortal = (portal: PortalType): PortalTab[] => {
    const base = (() => {
      switch (portal) {
        case 'crm': return crmTabs;
        case 'erp': return erpTabs;
        case 'support': return supportTabs;
        case 'content-editor':
        case 'content': return contentEditorTabs;
        case 'marketing': return marketingTabs;
        case 'docs': return docsTabs;
      }
    })();
    return base.filter((t) => !excludedTabSet.has(t.value));
  };

  const portals: { key: PortalType; label: string; icon: React.ReactNode; description: string }[] = [
    { key: 'crm', label: 'CRM', icon: <UsersRound className="h-4 w-4" />, description: 'Customer relationships & agreements' },
    { key: 'erp', label: 'ERP', icon: <Building2 className="h-4 w-4" />, description: 'Operations, assets & telemetry' },
    { key: 'support', label: 'Support', icon: <Headphones className="h-4 w-4" />, description: 'Communications & task queues' },
    { key: 'content-editor', label: 'Content', icon: <HelpCircle className="h-4 w-4" />, description: 'Legal, policy, FAQs & tour guides' },
    { key: 'marketing', label: 'Marketing', icon: <Share2 className="h-4 w-4" />, description: 'Social & outreach campaigns' },
    { key: 'docs', label: 'Docs', icon: <BookOpen className="h-4 w-4" />, description: 'Technical system documentation' },
  ].filter((p) => !excludedPortalSet.has(p.key));

  const allAdminTools: AdminToolItem[] = [
    { title: 'Security Audit Log', href: '/admin/audit-log', icon: <ShieldCheck className="h-4 w-4 text-primary" />, category: 'Audits & Compliance', allowed: allowedTools.canAudit ?? true },
    { title: 'Document Export Audit', href: '/admin/export-audit', icon: <FileDown className="h-4 w-4 text-primary" />, category: 'Audits & Compliance', allowed: allowedTools.canAudit ?? true },
    { title: 'Document Failure Alerts', href: '/admin/document-failures', icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, category: 'Audits & Compliance', allowed: allowedTools.canSupport ?? true },
    { title: 'Rental Authorizations', href: '/admin/authorizations', icon: <Key className="h-4 w-4 text-emerald-500" />, category: 'Audits & Compliance', allowed: allowedTools.canVehicles ?? true },

    { title: 'Payments Viewer', href: '/admin/payments', icon: <CreditCard className="h-4 w-4 text-emerald-600" />, category: 'Financial & Settlement', allowed: allowedTools.canPayments ?? true },
    { title: 'Reconciliation Logs', href: '/admin/reconciliation', icon: <FileText className="h-4 w-4 text-blue-500" />, category: 'Financial & Settlement', allowed: allowedTools.canPayments ?? true },
    { title: 'Settlement Reconciliation', href: '/admin/settlement-reconciliation', icon: <Receipt className="h-4 w-4 text-indigo-500" />, category: 'Financial & Settlement', allowed: allowedTools.canPayments ?? true },

    { title: 'Vehicle Submission Queue', href: '/admin/vehicle-queue', icon: <Car className="h-4 w-4 text-primary" />, category: 'Fleet & Operations', allowed: allowedTools.canVehicles ?? true },
    { title: 'Call Center Desk', href: '/admin/call-center', icon: <PhoneCall className="h-4 w-4 text-primary" />, category: 'Fleet & Operations', allowed: allowedTools.canComms ?? true },
    { title: 'Inbound Forwarding', href: '/admin/inbound-forwarding', icon: <PhoneForwarded className="h-4 w-4 text-primary" />, category: 'Fleet & Operations', allowed: allowedTools.canComms ?? true },
    { title: 'Mobile Call-In Desk', href: '/m/call-in', icon: <PhoneCall className="h-4 w-4 text-emerald-600" />, category: 'Fleet & Operations', allowed: allowedTools.canComms ?? true },

    { title: 'Persona Templates', href: '/admin/persona-templates', icon: <Fingerprint className="h-4 w-4 text-purple-500" />, category: 'Identity & Verification', allowed: allowedTools.canContent ?? true },
    { title: 'Persona Inquiries', href: '/admin/persona-inquiries', icon: <Users className="h-4 w-4 text-purple-500" />, category: 'Identity & Verification', allowed: allowedTools.canContent ?? true },
    { title: 'Persona Manual Review', href: '/admin/persona-review', icon: <UserCheck className="h-4 w-4 text-purple-600" />, category: 'Identity & Verification', allowed: allowedTools.canContent ?? true },

    { title: 'Legal Templates Preview', href: '/admin/legal-templates/preview', icon: <Scale className="h-4 w-4 text-slate-500" />, category: 'Content & Training', allowed: allowedTools.canContent ?? true },
    { title: 'Tour Step Configuration', href: '/admin/tour-config', icon: <Compass className="h-4 w-4 text-amber-500" />, category: 'Content & Training', allowed: allowedTools.canContent ?? true },
    { title: 'Tour Analytics', href: '/admin/tour-analytics', icon: <BarChart3 className="h-4 w-4 text-indigo-500" />, category: 'Content & Training', allowed: allowedTools.canReports ?? true },
  ];

  const visibleTools = allAdminTools.filter((t) => t.allowed);

  // Group visible tools by category
  const categories: Array<AdminToolItem['category']> = [
    'Audits & Compliance',
    'Financial & Settlement',
    'Fleet & Operations',
    'Identity & Verification',
    'Content & Training',
  ];

  const currentTabs = getTabsForPortal(activePortal);
  const currentTabMeta = currentTabs.find((t) => t.value === activeTab);
  const currentPortalMeta = portals.find((p) => p.key === activePortal || (p.key === 'content-editor' && activePortal === 'content'));

  return (
    <div className="space-y-3 mb-6">
      {/* Tier 1: Primary Portal Switcher + Admin Tools Menu + Notifications */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl border bg-card text-card-foreground shadow-xs">
        {/* Portal Pills */}
        <div className="flex flex-wrap items-center gap-1.5" data-tour="admin-portals">
          {portals.map((p) => {
            const isActive = activePortal === p.key || (p.key === 'content-editor' && activePortal === 'content');
            return (
              <Button
                key={p.key}
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  onPortalChange(p.key);
                }}
                className={cn(
                  'gap-2 h-9 px-3 text-xs font-medium transition-all rounded-lg',
                  isActive
                    ? 'shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {p.icon}
                <span>{p.label}</span>
              </Button>
            );
          })}
        </div>

        {/* Right side controls: Tools dropdown & Notifications */}
        <div className="flex items-center gap-2 ml-auto">
          {visibleTools.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 px-3 text-xs font-medium border-border/80"
                  aria-label="Open administrative tools menu"
                  data-tour="admin-tools-menu"
                >
                  <Wrench className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">Admin Tools</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-0.5">
                    {visibleTools.length}
                  </Badge>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 max-h-[min(480px,80dvh)] overflow-y-auto bg-popover z-50 p-1.5"
              >
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
                  Administrative Utilities & Audits
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {categories.map((cat) => {
                  const toolsInCat = visibleTools.filter((t) => t.category === cat);
                  if (toolsInCat.length === 0) return null;
                  return (
                    <div key={cat} className="py-1">
                      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                        {cat}
                      </div>
                      {toolsInCat.map((tool) => (
                        <DropdownMenuItem key={tool.href} asChild className="cursor-pointer gap-2 py-2">
                          <Link to={tool.href} className="flex items-center gap-2 text-xs">
                            {tool.icon}
                            <span className="flex-1 font-medium">{tool.title}</span>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div data-tour="admin-notifications">
            <AdminNotificationsBell />
          </div>
        </div>
      </div>

      {/* Tier 2: Contextual Active Portal Tab Strip */}
      <div className="rounded-xl border bg-card/60 p-2 shadow-xs" data-tour="admin-tab-strip">
        <ScrollableStrip ariaLabel={`${currentPortalMeta?.label || 'Active portal'} tabs`} step={200}>
          <div className="flex items-center gap-1.5">
            {currentTabs.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <Button
                  key={tab.value}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    onTabChange(tab.value);
                    remember(activePortal, tab.value);
                  }}
                  className={cn(
                    'gap-2 h-8 px-3 text-xs shrink-0 rounded-md transition-all',
                    isActive
                      ? 'shadow-xs font-medium'
                      : 'bg-background hover:bg-accent text-muted-foreground hover:text-foreground border-border/60'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </Button>
              );
            })}
          </div>
        </ScrollableStrip>

        {/* Current Path Breadcrumb */}
        <div className="flex items-center justify-between gap-2 pt-2 px-1 text-[11px] text-muted-foreground border-t border-border/40 mt-2">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-foreground">{currentPortalMeta?.label}</span>
            <span>→</span>
            <span className="font-medium text-foreground truncate">{currentTabMeta?.label || activeTab}</span>
          </div>
          <span className="text-[10px] opacity-75 shrink-0">
            {currentTabs.length} tabs in this portal
          </span>
        </div>
      </div>
    </div>
  );
}
