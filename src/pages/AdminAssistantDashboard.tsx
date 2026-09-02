import { useEffect, useMemo, useState } from "react";
import { useAssistantPermissions } from "@/hooks/useAssistantPermissions";
import { assistantExcludedTabs, warnTabPermissionDrift } from "@/lib/admin-tab-registry";

import { Lock } from "lucide-react";
import { Shield, Car, Users, DollarSign, AlertTriangle, CheckCircle, Clock, Eye, CreditCard, Wallet, Mail, Loader2, RefreshCw, TrendingUp, HelpCircle, Inbox, Phone, Headphones } from "lucide-react";
import { CallCenterPage } from "@/components/admin/voip/CallCenterPage";
import { HardwareManagement } from "@/components/admin/HardwareManagement";
import { IoTMonitoringHub } from "@/components/admin/IoTMonitoringHub";
import { AssetsRegistry } from "@/components/admin/AssetsRegistry";
import { VehicleAuthorizationLogManagement } from "@/components/admin/VehicleAuthorizationLogManagement";
import { CategoryPricing } from "@/components/admin/CategoryPricing";
import { SecretsManagement } from "@/components/admin/SecretsManagement";
import { ApiKeyManagement } from "@/components/admin/ApiKeyManagement";
import { WebhookManagement } from "@/components/admin/WebhookManagement";
import { ApiEndpointManagement } from "@/components/admin/ApiEndpointManagement";
import { InsuranceSupportDashboard } from "@/components/admin/InsuranceSupportDashboard";
import { PaymentAccountsSupportDashboard } from "@/components/admin/PaymentAccountsSupportDashboard";
import { ExpiryNotificationsWidget } from "@/components/admin/ExpiryNotificationsWidget";
import { NigeriaDriverVerification } from "@/components/admin/NigeriaDriverVerification";
import { PoliceReportVerification } from "@/components/admin/PoliceReportVerification";
import { SocialMediaManagement } from "@/components/admin/SocialMediaManagement";
import { IoTDeviceOrders } from "@/components/admin/IoTDeviceOrders";
import { DeviceOrderRevenue } from "@/components/admin/DeviceOrderRevenue";
import { UserAccountsView } from "@/components/admin/UserAccountsView";
import { UserDeletionPortal } from "@/components/admin/UserDeletionPortal";
import { DriversOwnersManagement } from "@/components/admin/DriversOwnersManagement";
import { RoleManagement } from "@/components/admin/RoleManagement";
import { DailyPlanManagement } from "@/components/admin/DailyPlanManagement";
import { AdminIncidentManagement } from "@/components/admin/AdminIncidentManagement";
import { VehicleRecallManagement } from "@/components/admin/VehicleRecallManagement";
import { CallInMonitor } from "@/components/admin/CallInMonitor";
import { RecallApprovalPanel } from "@/components/recall/RecallApprovalPanel";
import { ReferralDeliveryTroubleshooter } from "@/components/admin/ReferralDeliveryTroubleshooter";
import { AdminWeeklyReportManagement } from "@/components/admin/AdminWeeklyReportManagement";
import { AdminPriceNegotiation } from "@/components/negotiation/AdminPriceNegotiation";
import LegalAgreementsManagement from "@/components/admin/LegalAgreementsManagement";
import { RentToOwnManagement } from "@/components/admin/RentToOwnManagement";
import { FAQManagement } from "@/components/admin/FAQManagement";
import { PolicyManagement } from "@/components/admin/PolicyManagement";
import { MessagingCenter } from "@/components/admin/MessagingCenter";
import { AdminContactSettings } from "@/components/admin/AdminContactSettings";
import { AdminSupportTaskManagement } from "@/components/admin/AdminSupportTaskManagement";
import { AdminTaskPortal } from "@/components/admin/portal/AdminTaskPortal";
import { VehiclePickupManagement } from "@/components/admin/VehiclePickupManagement";
import { ApplicationManagement } from "@/components/admin/ApplicationManagement";
import { AdminAssistantManagement } from "@/components/admin/AdminAssistantManagement";
import { PortalNavigation, type PortalType } from "@/components/admin/PortalNavigation";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";

import { TrainingModuleManagement } from "@/components/admin/TrainingModuleManagement";
import { SubscriptionManagement } from "@/components/admin/SubscriptionManagement";
import { RoadsidePartnerManagement } from "@/components/admin/RoadsidePartnerManagement";
import { PortalAnalyticsCards } from "@/components/admin/PortalAnalyticsCards";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import AdminOnboardingTour from "@/components/onboarding/AdminOnboardingTour";
import { useAdminOnboardingTour } from "@/hooks/useAdminOnboardingTour";
import { MessagingDocs } from "@/components/admin/docs/MessagingDocs";
import { EmailDocs } from "@/components/admin/docs/EmailDocs";
import { VoIPDocs } from "@/components/admin/docs/VoIPDocs";
import PlatformGlossary from "@/components/admin/docs/PlatformGlossary";
import { AdminSecurityDashboard } from "@/components/admin/AdminSecurityDashboard";
import RegionalOperationsManagement from "@/components/admin/RegionalOperationsManagement";
import { RegionAutoBuildWorker } from "@/components/admin/RegionAutoBuildWorker";
import NegativeAttestationReviewPanel from "@/components/admin/NegativeAttestationReviewPanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import VehicleTrackingMap from "@/components/tracking/VehicleTrackingMap";
import { PaymentDefaultAlert } from "@/components/payment/PaymentDefaultAlert";
import { PaymentBreakdownCard } from "@/components/payment/PaymentBreakdownCard";
import { type PaymentDefault } from "@/lib/payment-config";
import { useRegion } from "@/contexts/RegionContext";
import { useCurrencyConversion } from "@/hooks/useCurrencyConversion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminDailyTodoList } from "@/components/admin/AdminDailyTodoList";
import { VehicleMqttCredentials } from "@/components/admin/VehicleMqttCredentials";
import { DriverBehaviorLogs } from "@/components/admin/DriverBehaviorLogs";
import { CronJobManagement } from "@/components/admin/CronJobManagement";
import { TaxManagement } from "@/components/admin/TaxManagement";
import { InstallAppBanner } from '@/components/pwa/InstallAppBanner';
import { StaffSignOutButton } from '@/components/staff/StaffSignOutButton';
import { StaffOnboardingDownloads } from '@/components/staff/StaffOnboardingDownloads';
import { ScrollableStrip } from '@/components/ui/scrollable-strip';


import { useAdminFinancials, useAdminFleetCounts } from "@/hooks/useAdminFinancials";
import { usePaymentDefaults } from "@/hooks/usePaymentDefaultsList";
import { usePendingApprovals, type PendingApprovalItem } from "@/hooks/usePendingApprovals";

const AdminAssistantDashboard = () => {
  const _region = useRegion();
  const { rates, isLoading: ratesLoading, convertToUSD, refetch: refetchRates } = useCurrencyConversion();
  const { financials } = useAdminFinancials();
  const { counts } = useAdminFleetCounts();
  const { paymentDefaults } = usePaymentDefaults();
  const { approvals: pendingItems, refresh: refreshApprovals } = usePendingApprovals();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [portalView, setPortalView] = useState<PortalType>('support');
  const [activeTab, setActiveTab] = useState<string>('inbox');

  // Base admin-only tabs assistants may never see. Derived from the shared
  // registry (ADMIN_ONLY_TABS + anything unmapped in TAB_PERMISSION_MAP) so
  // this list can never drift from the Admin dashboard's tab universe.
  const BASE_EXCLUDED_TABS = useMemo<string[]>(() => assistantExcludedTabs(), []);

  // Dev-only drift warning, shared with the Admin dashboard.
  useEffect(() => {
    warnTabPermissionDrift('admin-assistant');
  }, []);


  // Role-based dynamic exclusions from admin_assistant_permissions.
  const {
    forbiddenTabs: rbacForbidden,
    canAccessTab,
    isFullAdmin,
    isAssistant,
    loading: permsLoading,
  } = useAssistantPermissions();

  const EXCLUDED_TABS = useMemo(
    () => Array.from(new Set([...BASE_EXCLUDED_TABS, ...rbacForbidden])),
    [BASE_EXCLUDED_TABS, rbacForbidden],
  );
  // Docs portal is available to admins and assistants; individual docs tabs are
  // still gated by the role management portal via TAB_PERMISSION_MAP.
  const EXCLUDED_PORTALS: PortalType[] = !isFullAdmin && !isAssistant
    ? (['marketing', 'docs'] as PortalType[])
    : [];

  // Fallback: if the active tab is no longer permitted (e.g. permissions were
  // revoked), bounce the user to the first tab they still have access to.
  useEffect(() => {
    if (permsLoading) return;
    if (canAccessTab(activeTab)) return;
    const fallback = ['inbox', 'expiry-notifications', 'contacts', 'approvals']
      .find((t) => canAccessTab(t));
    if (fallback) {
      setActiveTab(fallback);
      setPortalView('support');
    }
  }, [activeTab, canAccessTab, permsLoading]);

  const activeTabAllowed = permsLoading || canAccessTab(activeTab);
  const { isOpen: isTourOpen, completeTour, resetTour } = useAdminOnboardingTour();

  // Calculate converted values
  const incomeNgnInUsd = convertToUSD(financials.income.ngn, 'NGN');
  const totalIncomeUsd = financials.income.usd + incomeNgnInUsd;

  const payoutsNgnInUsd = convertToUSD(financials.ownerPayouts.ngn, 'NGN');
  const totalPayoutsUsd = financials.ownerPayouts.usd + payoutsNgnInUsd;

  const weeklyWithdrawalsNgnInUsd = convertToUSD(financials.adminWithdrawals.weekly.ngn, 'NGN');
  const totalWeeklyWithdrawalsUsd = financials.adminWithdrawals.weekly.usd + weeklyWithdrawalsNgnInUsd;

  const monthlyWithdrawalsNgnInUsd = convertToUSD(financials.adminWithdrawals.monthly.ngn, 'NGN');
  const totalMonthlyWithdrawalsUsd = financials.adminWithdrawals.monthly.usd + monthlyWithdrawalsNgnInUsd;

  const handleApproval = async (item: PendingApprovalItem) => {
    setApprovingId(item.id);

    try {
      const { error: approveError } = await supabase.rpc('approve_application', {
        _app_id: item.id,
        _notes: 'Approved from assistant dashboard',
      });
      if (approveError) throw approveError;

      const userType = item.type === "Owner" ? "owner" : "driver";
      const region = /lagos|abuja|port harcourt|nigeria/i.test(item.location) ? "NIGERIA" : "USA";

      await supabase.functions.invoke("send-approval-notification", {
        body: { email: item.email, name: item.name, userType, region },
      });

      refreshApprovals();

      toast.success(`${item.type} approved successfully!`, {
        description: `Notification email sent to ${item.email}`,
        icon: <Mail className="h-4 w-4" />,
      });
    } catch (error: any) {
      console.error("Error approving:", error);
      toast.error("Failed to approve application", {
        description: error.message || "Please try again",
      });
    } finally {
      setApprovingId(null);
    }
  };
  

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 xl:max-w-[1600px] 2xl:max-w-[1800px]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Admin Assistant Dashboard
                </h1>
                <p className="text-muted-foreground">Scoped admin tools available to you</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GlobalSearch 
                onNavigate={(portal, tab) => {
                  setPortalView(portal);
                  setActiveTab(tab);
                }}
              />
              <Button variant="outline" size="sm" onClick={resetTour} className="gap-2">
                <HelpCircle className="h-4 w-4" />
                Tour
              </Button>
              <StaffSignOutButton />
            </div>
          </div>

          {/* Install App Banner */}
          <div className="mb-6">
            <InstallAppBanner appName="Rentmaikar Assistant" />
          </div>

          {/* Onboarding downloads */}
          <div className="mb-6">
            <StaffOnboardingDownloads />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-4 mb-8">
            {/* Active Vehicles */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Vehicles</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{counts.activeVehicles}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-accent">
                  <Car className="w-6 h-6" />
                </div>
              </div>
            </Card>

            {/* Active Drivers */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Drivers</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{counts.activeDrivers}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-success">
                  <Users className="w-6 h-6" />
                </div>
              </div>
            </Card>

            {/* Monthly Income - Enhanced with breakdown */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">Monthly Income</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-5 w-5"
                          onClick={() => {
                            refetchRates();
                            toast.success('Exchange rates refreshed');
                          }}
                        >
                          <RefreshCw className={`h-3 w-3 ${ratesLoading ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh exchange rate</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    ${totalIncomeUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>🇺🇸</span> USD
                  </span>
                  <span className="font-medium">${financials.income.usd.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>🇳🇬</span> NGN
                  </span>
                  <span className="font-medium">₦{financials.income.ngn.toLocaleString()}</span>
                </div>
                {rates && (
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Rate: USD 1 = NGN {rates.USD_NGN.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </Card>

            {/* Monthly Payouts to Owners */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Payouts</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    ${totalPayoutsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <Wallet className="w-6 h-6" />
                </div>
              </div>
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>🇺🇸</span> USD
                  </span>
                  <span className="font-medium">${financials.ownerPayouts.usd.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>🇳🇬</span> NGN
                  </span>
                  <span className="font-medium">₦{financials.ownerPayouts.ngn.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Paid to owners (60% of income)
                </p>
              </div>
            </Card>

            {/* Admin Withdrawals */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Admin Withdrawals</p>
                  <p className="text-2xl font-bold text-primary mt-1">
                    ${totalMonthlyWithdrawalsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Weekly</span>
                  <span className="font-medium">${totalWeeklyWithdrawalsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-medium">${totalMonthlyWithdrawalsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Platform earnings (40% fee)
                </p>
              </div>
            </Card>

            {/* Admin Balance */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Admin Balance</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">
                    ${(totalIncomeUsd - totalPayoutsUsd).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CreditCard className="w-6 h-6" />
                </div>
              </div>
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>🇺🇸</span> USD
                  </span>
                  <span className="font-medium">${(financials.income.usd - financials.ownerPayouts.usd).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <span>🇳🇬</span> NGN
                  </span>
                  <span className="font-medium">₦{(financials.income.ngn - financials.ownerPayouts.ngn).toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Available platform balance
                </p>
              </div>
            </Card>

            {/* Payment Defaults */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Payment Defaults</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{counts.paymentDefaults}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-destructive">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>
            </Card>
          </div>

          {/* Daily To-Do List */}
          <div className="mb-8">
            <AdminDailyTodoList />
          </div>

          {/* Portal Navigation */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <PortalNavigation
                activePortal={portalView}
                activeTab={activeTab}
                onPortalChange={setPortalView}
                onTabChange={setActiveTab}
                excludeTabs={EXCLUDED_TABS}
                excludePortals={EXCLUDED_PORTALS}
                storageScope="admin-assistant"

              />
              <div className="ml-auto"><AdminNotificationsBell /></div>

            </div>
            {/* Independent Quick Access Buttons */}
            <ScrollableStrip ariaLabel="Quick access shortcuts">
              <Button
                variant={activeTab === 'inbox' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('support'); setActiveTab('inbox'); }}
              >
                <Inbox className="h-4 w-4" />
                Unified Inbox
              </Button>
              <Button
                variant={activeTab === 'call-center' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('support'); setActiveTab('call-center'); }}
              >
                <Phone className="h-4 w-4" />
                Call Center
              </Button>
              <Button
                variant={activeTab === 'support-tasks' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('support'); setActiveTab('support-tasks'); }}
              >
                <Headphones className="h-4 w-4" />
                Support Tasks
              </Button>
              <Button
                variant={activeTab === 'attestation-review' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('crm'); setActiveTab('attestation-review'); }}
              >
                <AlertTriangle className="h-4 w-4" />
                Referee Reviews
              </Button>
            </ScrollableStrip>

          </div>

          {/* Portal Analytics Cards */}
          <PortalAnalyticsCards 
            activePortal={portalView} 
            onNavigate={(portal, tab) => {
              setPortalView(portal);
              setActiveTab(tab);
            }}
          />

          {!activeTabAllowed && (
            <Card className="p-8 text-center border-dashed">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">You don't have access to this section</h3>
              <p className="text-sm text-muted-foreground">
                Ask an administrator to grant the required permission from Role Management &rarr; Admin Assistants.
              </p>
            </Card>
          )}

          {/* Support Portal */}
          {activeTabAllowed && portalView === 'support' && (
            <div className="space-y-6">
              {activeTab === 'task-portal' && <AdminTaskPortal />}
              {activeTab === 'inbox' && <MessagingCenter />}
              {activeTab === 'call-center' && <CallCenterPage />}
              {activeTab === 'contacts' && <AdminContactSettings />}
              {activeTab === 'support-tasks' && <AdminSupportTaskManagement />}
              {activeTab === 'insurance' && <InsuranceSupportDashboard />}
              {activeTab === 'nigeria-verification' && <NigeriaDriverVerification />}
              {activeTab === 'police-reports' && <PoliceReportVerification />}
              {activeTab === 'payment-accounts' && <PaymentAccountsSupportDashboard />}
              {activeTab === 'expiry-notifications' && <ExpiryNotificationsWidget />}
            </div>
          )}

          {/* CRM Portal */}
          {activeTabAllowed && portalView === 'crm' && (
            <div className="space-y-6">
              {activeTab === 'applications' && <ApplicationManagement />}
              {activeTab === 'attestation-review' && <NegativeAttestationReviewPanel />}
              {activeTab === 'accounts' && <UserAccountsView />}
              {activeTab === 'user-deletion' && <UserDeletionPortal />}
              {activeTab === 'drivers-owners' && <DriversOwnersManagement />}
              {activeTab === 'roles' && <RoleManagement />}
              {activeTab === 'admin-assistants' && <AdminAssistantManagement />}
              {activeTab === 'negotiations' && <AdminPriceNegotiation />}
              {activeTab === 'approvals' && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Pending Approvals ({pendingItems.length})</h3>
                  
                  {pendingItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-3 text-success" />
                      <p>All approvals have been processed!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                              <Clock className="w-5 h-5 text-warning" />
                            </div>
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-muted-foreground">{item.type} • {item.location}</p>
                              <p className="text-xs text-muted-foreground">{item.email}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline"><Eye className="w-4 h-4" /></Button>
                            <Button 
                              size="sm" 
                              variant="hero"
                              disabled={approvingId === item.id}
                              onClick={() => handleApproval(item)}
                            >
                              {approvingId === item.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Mail className="w-4 h-4 mr-1" />
                                  Approve
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </Card>
              )}
              {activeTab === 'defaults' && (
                <div className="space-y-4">
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      <h3 className="text-lg font-semibold">Payment Defaults ({paymentDefaults.length})</h3>
                    </div>
                    <div className="p-3 mb-4 rounded-lg bg-muted text-sm space-y-1">
                      <p><strong>Payment Default Protocol:</strong></p>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1">
                        <li>Auto-debit runs daily at 12:01 AM</li>
                        <li><strong>Weekly Plans:</strong> 72-hour lockdown with 3 notifications at 24-hour intervals</li>
                        <li><strong>Daily Plans:</strong> 36-hour lockdown with 3 notifications at 12-hour intervals</li>
                        <li>Daily plans become forbidden after any payment default</li>
                        <li>Deactivation only when vehicle is parked (speed &lt; 2 mph)</li>
                      </ul>
                    </div>
                  </Card>
                  
                  {paymentDefaults.map((paymentDefault) => (
                    <PaymentDefaultAlert
                      key={paymentDefault.id}
                      paymentDefault={paymentDefault}
                      onInitiateDeactivation={() => {
                        toast.info("Deactivation request initiated", {
                          description: `Vehicle ${paymentDefault.vehicleId} will be deactivated when safely parked.`,
                        });
                      }}
                      onContactSupport={() => {
                        toast.info("Contacting driver...", {
                          description: "Opening communication channel.",
                        });
                      }}
                    />
                  ))}
                </div>
              )}
              {activeTab === 'legal-agreements' && <LegalAgreementsManagement />}
              {activeTab === 'rent-to-own' && <RentToOwnManagement />}
              {activeTab === 'content' && (
                <Tabs defaultValue="faq" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="faq">FAQ Management</TabsTrigger>
                    <TabsTrigger value="policies">Policy Versions</TabsTrigger>
                  </TabsList>
                  <TabsContent value="faq">
                    <FAQManagement />
                  </TabsContent>
                  <TabsContent value="policies">
                    <PolicyManagement />
                  </TabsContent>
                </Tabs>
              )}
              {activeTab === 'subscriptions' && <SubscriptionManagement />}
              {activeTab === 'training' && <TrainingModuleManagement />}
              {activeTab === 'roadside-partners' && <RoadsidePartnerManagement />}
            </div>
          )}

          {/* ERP Portal */}
          {activeTabAllowed && portalView === 'erp' && (
            <div className="space-y-6">
              {activeTab === 'tracking' && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Live Vehicle Tracking</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Monitor vehicles across DMV states (USA) and Nigeria (Lagos, Abuja, Port Harcourt). 
                    Click on markers to view details and send remote commands.
                  </p>
                  <VehicleTrackingMap />
                </Card>
              )}
              {activeTab === 'assets' && <AssetsRegistry />}
              {activeTab === 'authorizations' && <VehicleAuthorizationLogManagement />}
              {activeTab === 'pickup-locations' && <VehiclePickupManagement />}
              {activeTab === 'iot-monitoring' && <IoTMonitoringHub />}
              {activeTab === 'hardware' && <HardwareManagement />}
              {activeTab === 'mqtt-credentials' && <VehicleMqttCredentials readOnly={false} />}
              {activeTab === 'driver-behavior' && <DriverBehaviorLogs />}
              {activeTab === 'device-orders' && <IoTDeviceOrders />}
              {activeTab === 'device-revenue' && <DeviceOrderRevenue />}
              {activeTab === 'pricing' && <CategoryPricing />}
              {activeTab === 'incidents' && <AdminIncidentManagement />}
              {activeTab === 'recalls' && (
                <div className="space-y-6">
                  <CallInMonitor />
                  <RecallApprovalPanel mode="admin" />
                  <ReferralDeliveryTroubleshooter />
                  <VehicleRecallManagement />
                </div>
              )}
              {activeTab === 'daily-plans' && <DailyPlanManagement />}
              {activeTab === 'weekly-reports' && <AdminWeeklyReportManagement />}
              {activeTab === 'fees' && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <Wallet className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Fee Structure &amp; Payment Gateways</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Illustrative fee calculations at sample rental amounts — not live revenue figures.
                  </p>
                  
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {/* USA - PayPal */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🇺🇸</span>
                        <h4 className="font-semibold">USA (PayPal)</h4>
                      </div>
                      <PaymentBreakdownCard
                        baseAmount={48}
                        currency="USD"
                        gateway="paypal"
                      />
                      <PaymentBreakdownCard
                        baseAmount={48}
                        currency="USD"
                        gateway="paypal"
                        showOwnerView
                      />
                    </div>

                    {/* Nigeria - Paystack */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🇳🇬</span>
                        <h4 className="font-semibold">Nigeria (Paystack)</h4>
                      </div>
                      <PaymentBreakdownCard
                        baseAmount={25000}
                        currency="NGN"
                        gateway="paystack"
                      />
                      <PaymentBreakdownCard
                        baseAmount={25000}
                        currency="NGN"
                        gateway="paystack"
                        showOwnerView
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted space-y-2">
                    <h5 className="font-semibold flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Payment Schedule
                    </h5>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• <strong>Daily Auto-Debit:</strong> 12:01 AM local time</li>
                      <li>• <strong>Owner Payouts:</strong> Every Friday (weekly)</li>
                      <li>• <strong>Platform Fee:</strong> 40% total (20% admin + 20% management)</li>
                    </ul>
                  </div>
                </Card>
              )}
              {activeTab === 'secrets' && <SecretsManagement />}
              {activeTab === 'api-keys' && <ApiKeyManagement />}
              {activeTab === 'webhooks' && <WebhookManagement />}
              {activeTab === 'api-endpoints' && <ApiEndpointManagement />}
              {activeTab === 'security' && <AdminSecurityDashboard />}
              {activeTab === 'cron-jobs' && <CronJobManagement />}
              {activeTab === 'tax' && <TaxManagement />}
              {activeTab === 'settings' && <RegionalOperationsManagement />}
              {activeTab === 'region-autobuild' && <RegionAutoBuildWorker />}
            </div>
          )}

          {/* Marketing Portal */}
          {activeTabAllowed && portalView === 'marketing' && (
            <div className="space-y-6">
              {activeTab === 'campaigns' && <SocialMediaManagement />}
              {activeTab === 'facebook' && <SocialMediaManagement />}
              {activeTab === 'instagram' && <SocialMediaManagement />}
              {activeTab === 'linkedin' && <SocialMediaManagement />}
              {activeTab === 'google' && <SocialMediaManagement />}
            </div>
          )}

          {/* Docs Portal */}
          {activeTabAllowed && portalView === 'docs' && (
            <div className="space-y-6">
              {activeTab === 'messaging-docs' && <MessagingDocs />}
              {activeTab === 'email-docs' && <EmailDocs />}
              {activeTab === 'voip-docs' && <VoIPDocs />}
              {activeTab === 'glossary' && <PlatformGlossary />}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <AdminOnboardingTour isOpen={isTourOpen} onComplete={completeTour} />
    </div>
  );
};

export default AdminAssistantDashboard;
