import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { warnTabPermissionDrift, getPortalForTab, getDefaultTabForPortal } from "@/lib/admin-tab-registry";

import { Shield, Car, Users, DollarSign, AlertTriangle, CheckCircle, Clock, Eye, CreditCard, Wallet, Mail, Loader2, RefreshCw, TrendingUp, HelpCircle, Inbox, Phone, Headphones, LayoutGrid, UserPlus, ClipboardList } from "lucide-react";
import { CallCenterPage } from "@/components/admin/voip/CallCenterPage";
import { HardwareManagement } from "@/components/admin/HardwareManagement";
import { IoTMonitoringHub } from "@/components/admin/IoTMonitoringHub";
import { IoTProvisioningPanel } from "@/components/admin/IoTProvisioningPanel";
import { HologramDashboard } from "@/components/admin/HologramDashboard";
import { TraccarDashboard } from "@/components/admin/TraccarDashboard";
import { SyncScheduleSettings } from "@/components/admin/SyncScheduleSettings";
import ProviderBillingDashboard from '@/components/admin/ProviderBillingDashboard';
import BillingReconciliationPage from "@/pages/admin/BillingReconciliationPage";
import TourStepConfigPage from "@/pages/admin/TourStepConfigPage";
import TwilioTemplateManager from "@/components/admin/TwilioTemplateManager";
import { AssetsRegistry } from "@/components/admin/AssetsRegistry";
import { VehicleAuthorizationLogManagement } from "@/components/admin/VehicleAuthorizationLogManagement";
import AdminVehicleCataloguePage from "@/pages/admin/AdminVehicleCataloguePage";
import UserUuidAssignmentsPage from "@/pages/admin/UserUuidAssignmentsPage";
import { CategoryPricing } from "@/components/admin/CategoryPricing";
import { VehicleCategoryYearSpecs } from "@/components/admin/VehicleCategoryYearSpecs";

import { SecretsManagement } from "@/components/admin/SecretsManagement";
import { TechStackDocButton } from "@/components/admin/TechStackDocButton";
import { CPaaSProviderSettings } from "@/components/admin/CPaaSProviderSettings";
import { SentTestSendPanel } from "@/components/admin/SentTestSendPanel";
import { TwilioTestSendPanel } from "@/components/admin/TwilioTestSendPanel";
import { ElevenLabsTestPanel } from "@/components/admin/ElevenLabsTestPanel";
import { PSPConfigChecklist } from "@/components/admin/PSPConfigChecklist";
import { ApiKeyManagement } from "@/components/admin/ApiKeyManagement";
import { WebhookManagement } from "@/components/admin/WebhookManagement";
import { ApiEndpointManagement } from "@/components/admin/ApiEndpointManagement";
import { InsuranceSupportDashboard } from "@/components/admin/InsuranceSupportDashboard";
import { PaymentAccountsSupportDashboard } from "@/components/admin/PaymentAccountsSupportDashboard";
import { ExpiryNotificationsWidget } from "@/components/admin/ExpiryNotificationsWidget";
import { NigeriaDriverVerification } from "@/components/admin/NigeriaDriverVerification";
import { PoliceReportVerification } from "@/components/admin/PoliceReportVerification";
import { SocialMediaManagement } from "@/components/admin/SocialMediaManagement";
import SocialChannelIntegrations from "@/components/admin/SocialChannelIntegrations";
import { IoTDeviceOrders } from "@/components/admin/IoTDeviceOrders";
import { DeviceOrderRevenue } from "@/components/admin/DeviceOrderRevenue";
import { UserAccountsView } from "@/components/admin/UserAccountsView";
import { UserDeletionPortal } from "@/components/admin/UserDeletionPortal";
import { DriversOwnersManagement } from "@/components/admin/DriversOwnersManagement";
import { UserOversightPanel } from "@/components/admin/UserOversightPanel";
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
import { LegalAgreementTemplateManagement } from "@/components/admin/LegalAgreementTemplateManagement";
import { MessagingCenter } from "@/components/admin/MessagingCenter";
import { AdminContactSettings } from "@/components/admin/AdminContactSettings";
import { AdminSupportTaskManagement } from "@/components/admin/AdminSupportTaskManagement";
import { AdminTaskPortal } from "@/components/admin/portal/AdminTaskPortal";
import { VehiclePickupManagement } from "@/components/admin/VehiclePickupManagement";
import { ApplicationManagement } from "@/components/admin/ApplicationManagement";
import { AdminAssistantManagement } from "@/components/admin/AdminAssistantManagement";
import { PhoneOtpProviderSettings } from "@/components/admin/PhoneOtpProviderSettings";
import { PersonaVerificationSettings } from "@/components/admin/PersonaVerificationSettings";
import { RefereeRequirementSettings } from "@/components/admin/RefereeRequirementSettings";

import { SectionErrorBoundary, TabPageErrorBoundary } from "@/components/admin/SectionErrorBoundary";
import { useDecoupledAdminPortal } from "@/hooks/useDecoupledAdminPortal";
import { PortalNavigation, type PortalType } from "@/components/admin/PortalNavigation";
import { AdminUnifiedNavigation } from "@/components/admin/AdminUnifiedNavigation";
import { AdminOperationsBar } from "@/components/admin/AdminOperationsBar";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";

import { TrainingModuleManagement } from "@/components/admin/TrainingModuleManagement";
import { SubscriptionManagement } from "@/components/admin/SubscriptionManagement";
import { BillingDashboard } from "@/components/admin/BillingDashboard";
import { ProxyBillingPortal } from "@/components/admin/ProxyBillingPortal";
import { RoadsidePartnerManagement } from "@/components/admin/RoadsidePartnerManagement";
import { PortalAnalyticsCards } from "@/components/admin/PortalAnalyticsCards";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import AdminOnboardingTour from "@/components/onboarding/AdminOnboardingTour";
import { useAdminOnboardingTour } from "@/hooks/useAdminOnboardingTour";
import { MessagingDocs } from "@/components/admin/docs/MessagingDocs";
import { EmailDocs } from "@/components/admin/docs/EmailDocs";
import { VoIPDocs } from "@/components/admin/docs/VoIPDocs";
import PlatformGlossary from "@/components/admin/docs/PlatformGlossary";
import PlatformFeaturesReport from "@/components/admin/docs/PlatformFeaturesReport";
import { ServiceDisruptionDocs } from "@/components/admin/docs/ServiceDisruptionDocs";
import { AdminSecurityDashboard } from "@/components/admin/AdminSecurityDashboard";
import AdminEmailDeliveryPage from "@/pages/admin/AdminEmailDeliveryPage";
import RegionalOperationsManagement from "@/components/admin/RegionalOperationsManagement";
import { RegionAutoBuildWorker } from "@/components/admin/RegionAutoBuildWorker";
import NegativeAttestationReviewPanel from "@/components/admin/NegativeAttestationReviewPanel";
import { FrontendBackendDisconnectSwitch } from "@/components/admin/FrontendBackendDisconnectSwitch";
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
import ErrorBoundary from "@/components/errors/ErrorBoundary";
import { usePersistedTab } from '@/hooks/usePersistedTab';


import { useAdminFinancials, useAdminFleetCounts } from "@/hooks/useAdminFinancials";
import { usePaymentDefaults } from "@/hooks/usePaymentDefaultsList";
import { usePendingApprovals, type PendingApprovalItem } from "@/hooks/usePendingApprovals";


const AdminDashboard = () => {
  const _region = useRegion();
  // Dev-only warning shared with the Admin Assistant dashboard: surfaces any
  // tab that isn't classified in TAB_PERMISSION_MAP / ADMIN_ONLY_TABS.
  useEffect(() => {
    warnTabPermissionDrift('admin');
  }, []);

  const { rates, isLoading: ratesLoading, convertToUSD, refetch: refetchRates } = useCurrencyConversion();
  const { financials } = useAdminFinancials();
  const { counts } = useAdminFleetCounts();
  const { paymentDefaults } = usePaymentDefaults();
  const { approvals: pendingItems, refresh: refreshApprovals } = usePendingApprovals();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const {
    portalView,
    activeTab,
    setPortalView,
    setActiveTab,
    navigateTo,
  } = useDecoupledAdminPortal('support', 'task-portal', 'admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const { isOpen: isTourOpen, completeTour, resetTour } = useAdminOnboardingTour();

  // If ?tour=true or ?tour=1 is provided in URL, automatically trigger the tour
  useEffect(() => {
    const tourParam = searchParams.get('tour');
    if (tourParam === 'true' || tourParam === '1') {
      resetTour();
      const updatedParams = new URLSearchParams(searchParams);
      updatedParams.delete('tour');
      setSearchParams(updatedParams, { replace: true });
    }
  }, [searchParams, resetTour, setSearchParams]);

  // Calculate converted values from live financial records
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
        _notes: 'Approved from admin dashboard',
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
                  Admin Dashboard
                </h1>
                <p className="text-muted-foreground">Manage vehicles, drivers, and payments</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div data-tour="admin-search">
                <GlobalSearch 
                  onNavigate={(portal, tab) => {
                    setPortalView(portal);
                    setActiveTab(tab);
                  }}
                />
              </div>
              <Button variant="outline" size="sm" onClick={resetTour} className="gap-2" data-tour="admin-tour-button">
                <HelpCircle className="h-4 w-4" />
                Tour
              </Button>
              <StaffSignOutButton />
            </div>
          </div>

          {/* Operations Status Bar (Persona toggle, Bridge status, collapsible diagnostics & downloads) */}
          <AdminOperationsBar appName="Rentmaikar Admin" />

          {/* Operational & Fleet Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4" data-tour="admin-metrics">
            {/* Active Vehicles */}
            <Card className="p-5 border shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Vehicles</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{counts.activeVehicles}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Enrolled fleet</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Car className="w-5 h-5" />
                </div>
              </div>
            </Card>

            {/* Active Drivers */}
            <Card className="p-5 border shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Drivers</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{counts.activeDrivers}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Verified active</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
              </div>
            </Card>

            {/* Monthly Gross Income */}
            <Card className="p-5 border shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monthly Income</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-4 w-4 text-muted-foreground hover:text-foreground"
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
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ${totalIncomeUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">🇺🇸 USD</span>
                  <span className="font-semibold text-foreground">${financials.income.usd.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">🇳🇬 NGN</span>
                  <span className="font-semibold text-foreground">₦{financials.income.ngn.toLocaleString()}</span>
                </div>
              </div>
            </Card>

            {/* Payment Defaults */}
            <Card className="p-5 border shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Defaults</p>
                  <p className="text-2xl font-bold text-destructive mt-1">{counts.paymentDefaults}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Requires intervention</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
            </Card>
          </div>

          {/* Financial Settlements & Revenue Split */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Monthly Payouts to Owners */}
            <Card className="p-5 border shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner Payouts (60%)</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    ${totalPayoutsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">🇺🇸 USD</span>
                  <span className="font-medium text-foreground">${financials.ownerPayouts.usd.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">🇳🇬 NGN</span>
                  <span className="font-medium text-foreground">₦{financials.ownerPayouts.ngn.toLocaleString()}</span>
                </div>
              </div>
            </Card>

            {/* Platform Earnings (40%) */}
            <Card className="p-5 border shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform Earnings (40%)</p>
                  <p className="text-xl font-bold text-primary mt-0.5">
                    ${totalMonthlyWithdrawalsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Weekly</span>
                  <span className="font-medium text-foreground">${totalWeeklyWithdrawalsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-medium text-foreground">${totalMonthlyWithdrawalsUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </Card>

            {/* Admin Available Net Balance */}
            <Card className="p-5 border shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Balance</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ${(totalIncomeUsd - totalPayoutsUsd).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">🇺🇸 USD</span>
                  <span className="font-medium text-foreground">${(financials.income.usd - financials.ownerPayouts.usd).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">🇳🇬 NGN</span>
                  <span className="font-medium text-foreground">₦{(financials.income.ngn - financials.ownerPayouts.ngn).toLocaleString()}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Daily To-Do List */}
          <div className="mb-6" data-tour="admin-daily-tasks">
            <AdminDailyTodoList />
          </div>

          {/* Unified Portal Navigation & Categorized Admin Tools */}
          <AdminUnifiedNavigation
            activePortal={portalView}
            activeTab={activeTab}
            onPortalChange={setPortalView}
            onTabChange={setActiveTab}
            storageScope="admin"
          />

          {/* Portal Analytics Cards */}
          <PortalAnalyticsCards 
            activePortal={portalView} 
            onNavigate={(portal, tab) => {
              navigateTo(portal, tab);
            }}
          />

          {/* Support Portal */}
          {portalView === 'support' && (
            <SectionErrorBoundary section="SUPPORT" onSwitchPortal={setPortalView}>
              <div className="space-y-6">
                {activeTab === 'task-portal' && <AdminTaskPortal />}
                {activeTab === 'inbox' && (
                  <ErrorBoundary key="inbox">
                    <MessagingCenter />
                  </ErrorBoundary>
                )}
                {activeTab === 'call-center' && (
                  <ErrorBoundary key="call-center">
                    <CallCenterPage />
                  </ErrorBoundary>
                )}
                {activeTab === 'contacts' && <AdminContactSettings />}
                {activeTab === 'support-tasks' && <AdminSupportTaskManagement />}
                {activeTab === 'insurance' && <InsuranceSupportDashboard />}
                {activeTab === 'nigeria-verification' && <NigeriaDriverVerification />}
                {activeTab === 'police-reports' && <PoliceReportVerification />}
                {activeTab === 'payment-accounts' && <PaymentAccountsSupportDashboard />}
                {activeTab === 'expiry-notifications' && <ExpiryNotificationsWidget />}
                {activeTab === 'service-disruption-docs' && <ServiceDisruptionDocs />}
              </div>
            </SectionErrorBoundary>
          )}

          {/* CRM Portal */}
          {portalView === 'crm' && (
            <SectionErrorBoundary section="CRM" onSwitchPortal={setPortalView}>
              <div className="space-y-6">
              {activeTab === 'applications' && <ApplicationManagement />}
              {activeTab === 'attestation-review' && <NegativeAttestationReviewPanel />}
              {activeTab === 'accounts' && <UserAccountsView />}
              {activeTab === 'user-deletion' && <UserDeletionPortal />}
              {activeTab === 'drivers-owners' && (
                <div className="space-y-6">
                  <UserOversightPanel />
                  <DriversOwnersManagement />
                </div>
              )}
              {activeTab === 'roles' && <RoleManagement />}
              {activeTab === 'admin-assistants' && (
                <div className="space-y-6">
                  <AdminAssistantManagement />
                  <PersonaVerificationSettings />
                  <RefereeRequirementSettings />
                  <PhoneOtpProviderSettings />
                </div>
              )}
              {activeTab === 'phone-otp-providers' && <PhoneOtpProviderSettings />}
              {activeTab === 'persona-settings' && <PersonaVerificationSettings />}
              {activeTab === 'referee-settings' && <RefereeRequirementSettings />}

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
                            <Button
                              size="sm"
                              variant="outline"
                              title="View application details"
                              aria-label={`View application for ${item.name}`}
                              onClick={() => {
                                navigateTo('crm', 'applications');
                                toast.info(`Viewing application for ${item.name}`);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
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
                        <li><strong>Weekly Plans:</strong> 72-hour service disruption with 3 notifications at 24-hour intervals</li>
                        <li><strong>Daily Plans:</strong> 36-hour service disruption with 3 notifications at 12-hour intervals</li>
                        <li>Daily plans become forbidden after any payment default</li>
                        <li>Service disruption (remote starter restriction) only when vehicle is parked (speed &lt; 2 mph, engine off)</li>
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
              {activeTab === 'subscriptions' && <SubscriptionManagement />}
              {activeTab === 'training' && <TrainingModuleManagement />}
              {activeTab === 'roadside-partners' && <RoadsidePartnerManagement />}
              {activeTab === 'billing' && <BillingDashboard />}
              {activeTab === 'proxy-billing' && <ProxyBillingPortal />}
            </div>
          </SectionErrorBoundary>
        )}

          {/* ERP Portal */}
          {portalView === 'erp' && (
            <SectionErrorBoundary section="ERP" onSwitchPortal={setPortalView}>
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
              {activeTab === 'catalogue' && <AdminVehicleCataloguePage embedded />}
              {activeTab === 'pickup-locations' && <VehiclePickupManagement />}
              {activeTab === 'iot-monitoring' && <IoTMonitoringHub />}
              {activeTab === 'iot-provisioning' && <IoTProvisioningPanel />}
              {activeTab === 'hologram' && <HologramDashboard />}
              {activeTab === 'traccar' && <TraccarDashboard />}
              {activeTab === 'sync-schedule' && <SyncScheduleSettings />}
              {activeTab === 'reconciliation' && <BillingReconciliationPage />}
              {activeTab === 'provider-billing' && <ProviderBillingDashboard />}
              {activeTab === 'hardware' && <HardwareManagement />}
              {activeTab === 'mqtt-credentials' && <VehicleMqttCredentials readOnly={false} />}
              {activeTab === 'driver-behavior' && <DriverBehaviorLogs />}
              {activeTab === 'device-orders' && <IoTDeviceOrders />}
              {activeTab === 'device-revenue' && <DeviceOrderRevenue />}
              {activeTab === 'pricing' && <CategoryPricing />}
              {activeTab === 'category-year-specs' && <VehicleCategoryYearSpecs />}

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
              {activeTab === 'secrets' && (
                <div className="space-y-6">
                  <div className="flex justify-end">
                    <TechStackDocButton />
                  </div>
                  <PSPConfigChecklist />
                  <CPaaSProviderSettings />
                  <SentTestSendPanel />
                  <TwilioTestSendPanel />
                  <ElevenLabsTestPanel />
                  <SecretsManagement />
                </div>
              )}
              {activeTab === 'api-keys' && <ApiKeyManagement />}
              {activeTab === 'webhooks' && <WebhookManagement />}
              {activeTab === 'api-endpoints' && <ApiEndpointManagement />}
              {activeTab === 'security' && <AdminSecurityDashboard />}
              {activeTab === 'email-delivery' && <AdminEmailDeliveryPage />}
              {activeTab === 'cron-jobs' && <CronJobManagement />}
              {activeTab === 'uuid-assignments' && <UserUuidAssignmentsPage />}
              {activeTab === 'tax' && <TaxManagement />}
              {activeTab === 'settings' && <RegionalOperationsManagement />}
              {activeTab === 'region-autobuild' && <RegionAutoBuildWorker />}
            </div>
          </SectionErrorBoundary>
        )}

          {/* Content Editor Portal */}
          {(portalView === 'content-editor' || portalView === 'content') && (
            <SectionErrorBoundary section="CONTENT EDITOR" onSwitchPortal={setPortalView}>
              <div className="space-y-6">
                {(activeTab === 'faq' || activeTab === 'content') && <FAQManagement />}
                {activeTab === 'policies' && <PolicyManagement />}
                {activeTab === 'legal-templates' && <LegalAgreementTemplateManagement />}
                {activeTab === 'tour-guides' && <TourStepConfigPage />}
                {activeTab === 'message-templates' && <TwilioTemplateManager />}
              </div>
            </SectionErrorBoundary>
          )}

          {/* Marketing Portal */}
          {portalView === 'marketing' && (
            <SectionErrorBoundary section="MARKETING" onSwitchPortal={setPortalView}>
              <div className="space-y-6">
                {activeTab === 'campaigns' && <SocialMediaManagement />}
                {['facebook', 'instagram', 'linkedin', 'google'].includes(activeTab) && (
                  <>
                    <SocialChannelIntegrations />
                    <SocialMediaManagement />
                  </>
                )}
              </div>
            </SectionErrorBoundary>
          )}

          {/* Docs Portal */}
          {portalView === 'docs' && (
            <SectionErrorBoundary section="DOCS" onSwitchPortal={setPortalView}>
              <div className="space-y-6">
                {activeTab === 'service-disruption-docs' && <ServiceDisruptionDocs />}
                {activeTab === 'platform-features' && <PlatformFeaturesReport />}
                {activeTab === 'messaging-docs' && <MessagingDocs />}
                {activeTab === 'email-docs' && <EmailDocs />}
                {activeTab === 'voip-docs' && <VoIPDocs />}
                {activeTab === 'glossary' && <PlatformGlossary />}
              </div>
            </SectionErrorBoundary>
          )}
        </div>
      </main>
      <Footer />
      <AdminOnboardingTour isOpen={isTourOpen} onComplete={completeTour} />
    </div>
  );
};

export default AdminDashboard;
