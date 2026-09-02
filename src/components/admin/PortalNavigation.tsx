import { useEffect, useState } from "react";
import { ChevronDown, Building2, UsersRound, Users, Headphones, LayoutGrid, Phone, MessageSquare, UserCircle, HandshakeIcon, ClipboardList, Home, Car, MapPin, Cpu, Package, BarChart3, Tag, Wrench, WifiOff, Ban, Camera, Wallet, KeyRound, Settings, HelpCircle, FileText, UserPlus, Shield, ShieldCheck, Share2, Facebook, Instagram, Linkedin, Chrome, CreditCard, TrendingUp, Webhook, Code, Bell, Flag, GraduationCap, Truck, BookOpen, Mail, Wifi, Activity, Clock, Radio, Globe, Star, Calendar, Satellite, Signal, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";


export type PortalType = 'crm' | 'erp' | 'support' | 'marketing' | 'docs';

export interface PortalTab {
  value: string;
  label: string;
  icon: React.ReactNode;
  dataTour?: string;
}

export const crmTabs: PortalTab[] = [
  { value: "applications", label: "Applications", icon: <UserPlus className="h-4 w-4" />, dataTour: "admin-applications" },
  { value: "accounts", label: "User Accounts", icon: <UserCircle className="h-4 w-4" />, dataTour: "admin-accounts" },
  { value: "drivers-owners", label: "Drivers & Owners", icon: <Users className="h-4 w-4" /> },
  { value: "roles", label: "Role Management", icon: <Shield className="h-4 w-4" />, dataTour: "admin-roles" },
  { value: "user-deletion", label: "Account Removal", icon: <UserX className="h-4 w-4" /> },
  { value: "admin-assistants", label: "Admin Assistants", icon: <ShieldCheck className="h-4 w-4" /> },
  { value: "negotiations", label: "Negotiations", icon: <HandshakeIcon className="h-4 w-4" />, dataTour: "admin-negotiations" },
  { value: "approvals", label: "Pending Approvals", icon: <ClipboardList className="h-4 w-4" /> },
  { value: "defaults", label: "Payment Defaults", icon: <Wallet className="h-4 w-4" /> },
  { value: "legal-agreements", label: "Legal Agreements", icon: <FileText className="h-4 w-4" />, dataTour: "admin-agreements" },
  { value: "rent-to-own", label: "Rent to Own", icon: <Home className="h-4 w-4" />, dataTour: "admin-rto" },
  { value: "content", label: "Content CMS", icon: <HelpCircle className="h-4 w-4" /> },
  { value: "subscriptions", label: "Subscriptions", icon: <CreditCard className="h-4 w-4" /> },
  { value: "training", label: "Driver Training", icon: <GraduationCap className="h-4 w-4" /> },
  { value: "roadside-partners", label: "Roadside Partners", icon: <Truck className="h-4 w-4" /> },
  { value: "billing", label: "Invoices & Receipts", icon: <FileText className="h-4 w-4" /> },
  { value: "proxy-billing", label: "Proxy Billing", icon: <UsersRound className="h-4 w-4" /> },
];

export const erpTabs: PortalTab[] = [
  { value: "tracking", label: "Vehicle Tracking", icon: <Car className="h-4 w-4" /> },
  { value: "assets", label: "Assets Registry", icon: <ClipboardList className="h-4 w-4" />, dataTour: "admin-assets" },
  { value: "authorizations", label: "Rental Authorizations", icon: <ShieldCheck className="h-4 w-4" /> },
  { value: "catalogue", label: "Vehicle Catalogue", icon: <Car className="h-4 w-4" /> },
  { value: "pickup-locations", label: "Pickup Locations", icon: <MapPin className="h-4 w-4" /> },
  { value: "iot-monitoring", label: "IoT Monitoring Hub", icon: <Radio className="h-4 w-4" /> },
  { value: "iot-provisioning", label: "Auto Provisioning", icon: <Cpu className="h-4 w-4" /> },
  { value: "hologram", label: "Hologram SIMs", icon: <Signal className="h-4 w-4" /> },
  { value: "traccar", label: "Traccar Tracking", icon: <Satellite className="h-4 w-4" /> },
  { value: "sync-schedule", label: "IoT Sync Schedule", icon: <Clock className="h-4 w-4" /> },
  { value: "reconciliation", label: "Billing Reconciliation", icon: <FileText className="h-4 w-4" /> },
  { value: "provider-billing", label: "Provider Billing", icon: <Wallet className="h-4 w-4" /> },
  { value: "hardware", label: "Hardware", icon: <Cpu className="h-4 w-4" /> },
  { value: "mqtt-credentials", label: "MQTT Credentials", icon: <Wifi className="h-4 w-4" /> },
  { value: "driver-behavior", label: "Driver Behavior", icon: <Activity className="h-4 w-4" /> },
  { value: "device-orders", label: "Device Orders", icon: <Package className="h-4 w-4" />, dataTour: "admin-device-orders" },
  { value: "device-revenue", label: "Device Revenue", icon: <BarChart3 className="h-4 w-4" /> },
  { value: "pricing", label: "Category Pricing", icon: <Tag className="h-4 w-4" /> },
  { value: "category-year-specs", label: "Category Year Specs", icon: <Calendar className="h-4 w-4" /> },

  { value: "incidents", label: "Incidents", icon: <Wrench className="h-4 w-4" />, dataTour: "admin-incidents" },
  { value: "recalls", label: "Vehicle Recalls", icon: <WifiOff className="h-4 w-4" /> },
  { value: "daily-plans", label: "Daily Plans", icon: <Ban className="h-4 w-4" /> },
  { value: "weekly-reports", label: "Weekly Reports", icon: <Camera className="h-4 w-4" />, dataTour: "admin-inspections" },
  { value: "fees", label: "Fee Structure", icon: <Wallet className="h-4 w-4" /> },
  { value: "tax", label: "Tax & Compliance", icon: <TrendingUp className="h-4 w-4" /> },
  { value: "secrets", label: "API Secrets", icon: <KeyRound className="h-4 w-4" /> },
  { value: "api-keys", label: "API Keys", icon: <KeyRound className="h-4 w-4" /> },
  { value: "webhooks", label: "Webhooks", icon: <Webhook className="h-4 w-4" /> },
  { value: "api-endpoints", label: "API Endpoints", icon: <Code className="h-4 w-4" /> },
  { value: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
  { value: "cron-jobs", label: "Cron Jobs", icon: <Clock className="h-4 w-4" /> },
  { value: "uuid-assignments", label: "UUID Assignments", icon: <KeyRound className="h-4 w-4" /> },
  { value: "settings", label: "Regional Operations", icon: <Settings className="h-4 w-4" /> },
  { value: "region-autobuild", label: "Region Auto-Build", icon: <Globe className="h-4 w-4" /> },
];

export const supportTabs: PortalTab[] = [
  { value: "task-portal", label: "Task Portal", icon: <LayoutGrid className="h-4 w-4" />, dataTour: "admin-portal" },
  { value: "contacts", label: "Contact Settings", icon: <MessageSquare className="h-4 w-4" />, dataTour: "admin-contacts" },
  { value: "insurance", label: "Insurance Support", icon: <Shield className="h-4 w-4" /> },
  { value: "nigeria-verification", label: "🇳🇬 Nigeria Verification", icon: <Flag className="h-4 w-4" /> },
  { value: "police-reports", label: "🇳🇬 Police Reports", icon: <FileText className="h-4 w-4" /> },
  { value: "payment-accounts", label: "Payment & Accounts", icon: <CreditCard className="h-4 w-4" /> },
  { value: "expiry-notifications", label: "Expiry Alerts", icon: <Bell className="h-4 w-4" /> },
];

export const marketingTabs: PortalTab[] = [
  { value: "campaigns", label: "Campaigns", icon: <TrendingUp className="h-4 w-4" /> },
  { value: "facebook", label: "Facebook", icon: <Facebook className="h-4 w-4" /> },
  { value: "instagram", label: "Instagram", icon: <Instagram className="h-4 w-4" /> },
  { value: "linkedin", label: "LinkedIn", icon: <Linkedin className="h-4 w-4" /> },
  { value: "google", label: "Google Ads", icon: <Chrome className="h-4 w-4" /> },
];

export const docsTabs: PortalTab[] = [
  { value: "glossary", label: "Platform Glossary", icon: <BookOpen className="h-4 w-4" /> },
  { value: "messaging-docs", label: "SMS & WhatsApp", icon: <MessageSquare className="h-4 w-4" /> },
  { value: "email-docs", label: "Email System", icon: <Mail className="h-4 w-4" /> },
  { value: "voip-docs", label: "VoIP & IVR", icon: <Phone className="h-4 w-4" /> },
];

interface PortalNavigationProps {
  activePortal: PortalType;
  activeTab: string;
  onPortalChange: (portal: PortalType) => void;
  onTabChange: (tab: string) => void;
  excludeTabs?: string[];
  excludePortals?: PortalType[];
  /** Namespace for per-user last-selection persistence (e.g. "admin", "admin-assistant"). */
  storageScope?: string;
}

type LastByPortal = Partial<Record<PortalType, string>>;

const STORAGE_PREFIX = "rentmaikar:portal-nav:last";

function useLastSelection(scope: string) {
  const [userId, setUserId] = useState<string | null>(null);
  const [last, setLast] = useState<LastByPortal>({});

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const id = data.user?.id ?? "anon";
      setUserId(id);
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}:${scope}:${id}`);
        if (raw) setLast(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    });
    return () => {
      mounted = false;
    };
  }, [scope]);

  const remember = (portal: PortalType, tab: string) => {
    setLast((prev) => {
      const next = { ...prev, [portal]: tab };
      if (userId) {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}:${scope}:${userId}`, JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
      }
      return next;
    });
  };

  return { last, remember };
}

export const PortalNavigation = ({
  activePortal,
  activeTab,
  onPortalChange,
  onTabChange,
  excludeTabs,
  excludePortals,
  storageScope = "admin",
}: PortalNavigationProps) => {
  const excludedTabSet = new Set(excludeTabs || []);
  const excludedPortalSet = new Set(excludePortals || []);
  const { last, remember } = useLastSelection(storageScope);

  const getTabsForPortal = (portal: PortalType): PortalTab[] => {
    const base = (() => {
      switch (portal) {
        case 'crm': return crmTabs;
        case 'erp': return erpTabs;
        case 'support': return supportTabs;
        case 'marketing': return marketingTabs;
        case 'docs': return docsTabs;
      }
    })();
    return base.filter(t => !excludedTabSet.has(t.value));
  };

  const getPortalIcon = (portal: PortalType) => {
    switch (portal) {
      case 'crm': return <UsersRound className="h-4 w-4" />;
      case 'erp': return <Building2 className="h-4 w-4" />;
      case 'support': return <Headphones className="h-4 w-4" />;
      case 'marketing': return <Share2 className="h-4 w-4" />;
      case 'docs': return <BookOpen className="h-4 w-4" />;
    }
  };

  const getPortalLabel = (portal: PortalType) => {
    switch (portal) {
      case 'crm': return 'CRM';
      case 'erp': return 'ERP';
      case 'support': return 'Support';
      case 'marketing': return 'Marketing';
      case 'docs': return 'Docs';
    }
  };

  const getPortalDescription = (portal: PortalType) => {
    switch (portal) {
      case 'crm': return 'Customer relationships & agreements';
      case 'erp': return 'Operations, assets & fleet management';
      case 'support': return 'Communications & task management';
      case 'marketing': return 'Social media & campaign management';
      case 'docs': return 'Communication system documentation';
    }
  };

  const currentTabs = getTabsForPortal(activePortal);
  const currentTabLabel = currentTabs.find(t => t.value === activeTab)?.label || 'Select...';
  const visiblePortals = (['crm', 'erp', 'support', 'marketing', 'docs'] as PortalType[])
    .filter(p => !excludedPortalSet.has(p));

  return (
    <div className="flex flex-col gap-4 mb-6">
      {/* Portal Buttons with Dropdowns */}
      <nav
        aria-label="Dashboard portals"
        className="flex flex-wrap items-center gap-2"
      >
        {visiblePortals.map((portal) => {
          const tabs = getTabsForPortal(portal);
          const lastTab = last[portal];
          const lastTabMeta = tabs.find(t => t.value === lastTab);
          const portalLabel = getPortalLabel(portal);
          return (
            <DropdownMenu key={portal}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activePortal === portal ? 'default' : 'outline'}
                  className={cn(
                    "gap-2 min-w-[120px] min-h-11",
                    activePortal === portal && "ring-2 ring-primary/20"
                  )}
                  aria-label={`Open ${portalLabel} portal menu`}
                >
                  {getPortalIcon(portal)}
                  {portalLabel}
                  <ChevronDown className="h-3 w-3 ml-1" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                collisionPadding={12}
                avoidCollisions
                className="w-64 max-w-[calc(100vw-1.5rem)] bg-popover z-50"
                aria-label={`${portalLabel} portal navigation`}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {getPortalDescription(portal)}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div
                  className="max-h-[min(360px,60dvh)] overflow-y-auto overscroll-contain pr-1"
                  style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                  role="presentation"
                >
                  {tabs.map((tab) => {
                    const isActive = activePortal === portal && activeTab === tab.value;
                    const isLast = !isActive && lastTab === tab.value;
                    return (
                      <DropdownMenuItem
                        key={tab.value}
                        className={cn(
                          "cursor-pointer gap-2 min-h-11",
                          isActive && "bg-accent",
                          isLast && "ring-1 ring-primary/40 bg-primary/5"
                        )}
                        aria-current={isActive ? "page" : undefined}
                        onSelect={() => {
                          onPortalChange(portal);
                          onTabChange(tab.value);
                          remember(portal, tab.value);
                        }}
                      >
                        {tab.icon}
                        <span className="flex-1">{tab.label}</span>
                        {isLast && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"
                            aria-label="Last used"
                          >
                            <Star className="h-3 w-3" aria-hidden="true" />
                            Last
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
                {lastTabMeta && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      Last used: <span className="font-medium text-foreground">{lastTabMeta.label}</span>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </nav>

      {/* Current Selection Indicator */}
      <div className="flex items-center gap-2 text-sm" aria-live="polite">
        <span className="text-muted-foreground">Current view:</span>
        <span className="font-medium text-foreground flex items-center gap-1.5">
          {getPortalIcon(activePortal)}
          {getPortalLabel(activePortal)} → {currentTabLabel}
        </span>
      </div>
    </div>
  );
};

