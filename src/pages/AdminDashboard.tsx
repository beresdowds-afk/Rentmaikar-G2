import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

import { SectionErrorBoundary } from "@/components/admin/SectionErrorBoundary";
import { useDecoupledAdminPortal } from "@/hooks/useDecoupledAdminPortal";
import { PortalNavigation, type PortalType } from "@/components/admin/PortalNavigation";
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
  const { isOpen: isTourOpen, completeTour, resetTour } = useAdminOnboardingTour();

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
            <InstallAppBanner appName="Rentmaikar Admin" />
          </div>

          {/* Onboarding downloads */}
          <div className="mb-6">
            <StaffOnboardingDownloads />
          </div>

          {/* Frontend-to-Backend Direct Disconnect Switch & ZIP Generator */}
          <div className="mb-6">
            <FrontendBackendDisconnectSwitch />
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

          {/* Admin Tools quick links */}
          <Card className="p-4 mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Admin Tools
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/audit-log">Security audit log</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/payments">Payments viewer</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/reconciliation">Reconciliation logs</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/settlement-reconciliation">Settlement reconciliation</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/export-audit">Document export audit</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/document-failures">Document failures</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/m/call-in">Mobile call-in</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/tour-config">Tour step config</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/tour-analytics">Tour analytics</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/authorizations">Rental authorizations log</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/vehicle-queue">Vehicle submission queue</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/persona-templates">Persona templates</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link to="/admin/legal-templates/preview">Legal templates preview</Link>
              </Button>
            </div>
          </Card>


          {/* Portal Navigation */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <PortalNavigation
                activePortal={portalView}
                activeTab={activeTab}
                onPortalChange={setPortalView}
                onTabChange={setActiveTab}
                storageScope="admin"
              />
              <div className="ml-auto"><AdminNotificationsBell /></div>


            </div>
            {/* Independent Quick Access Buttons */}
            <ScrollableStrip ariaLabel="Quick access shortcuts">
              <Button
                variant={activeTab === 'task-portal' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('support'); setActiveTab('task-portal'); }}
              >
                <LayoutGrid className="h-4 w-4" />
                Task Portal
              </Button>
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
                variant={activeTab === 'applications' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('crm'); setActiveTab('applications'); }}
              >
                <UserPlus className="h-4 w-4" />
                Applications
              </Button>
              <Button
                variant={activeTab === 'approvals' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('crm'); setActiveTab('approvals'); }}
              >
                <ClipboardList className="h-4 w-4" />
                Approvals ({pendingItems.length})
              </Button>
              <Button
                variant={activeTab === 'attestation-review' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('crm'); setActiveTab('attestation-review'); }}
              >
                <AlertTriangle className="h-4 w-4" />
                Referee Reviews
              </Button>
              <Button
                variant={activeTab === 'tracking' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('erp'); setActiveTab('tracking'); }}
              >
                <Car className="h-4 w-4" />
                Live Tracking
              </Button>
              <Button
                variant={activeTab === 'security' ? 'default' : 'outline'}
                className="gap-2 shrink-0"
                onClick={() => { setPortalView('erp'); setActiveTab('security'); }}
              >
                <Shield className="h-4 w-4" />
                Security &amp; Audits
              </Button>
            </ScrollableStrip>

          </div>

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
