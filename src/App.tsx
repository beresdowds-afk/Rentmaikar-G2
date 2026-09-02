import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { RegionProvider } from "@/contexts/RegionContext";
import { UserTypeProvider } from "@/contexts/UserTypeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import CookieConsent from "@/components/CookieConsent";
import MessageConsent from "@/components/MessageConsent";
import PageSkeleton from "@/components/PageSkeleton";
import ErrorBoundary from "@/components/errors/ErrorBoundary";
import CanonicalRedirects, { VehicleAliasRedirect as VehicleRedirect } from "@/components/seo/CanonicalRedirects";
import DynamicMetaTagManager from "@/components/seo/DynamicMetaTagManager";
import { RouteProgressBar, SuspenseProgressTracker } from "@/components/navigation/RouteProgressBar";
import { AdminProfiler } from "@/components/profiling/AdminProfiler";
import SkipToContent from "@/components/SkipToContent";
import LiveAnnouncer from "@/components/LiveAnnouncer";
import MetaPixelRouteTracker from "@/components/MetaPixelRouteTracker";
import NativeDeepLinkBridge from "@/service/native/deep-links";
import DocumentExpiryInAppNotifier from "@/components/notifications/DocumentExpiryInAppNotifier";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useApplicationApprovalNotifier } from "@/hooks/useApplicationApprovalNotifier";
import { useNativePush } from "@/hooks/useNativePush";
import { useEffect } from "react";
import { installOnboardingDeepLinkListener } from "@/lib/onboarding-deep-link";

// Global background worker: keeps PWA + native mobile builds in sync with the
// website by streaming DB changes and registering native push devices.
const AppLiveSync = () => {
  const { user } = useAuth();
  // Guests on public pages (landing, auth, legal) need no realtime worker —
  // running it there caused constant global cache invalidation and visible
  // re-render churn on the landing page.
  useRealtimeSync(!!user);
  useApplicationApprovalNotifier();
  useNativePush();
  return null;
};


// Lazy-loaded pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const DriverRegistration = lazy(() => import("./pages/DriverRegistration"));
const OwnerRegistration = lazy(() => import("./pages/OwnerRegistration"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const DriverOnboarding = lazy(() => import("./pages/DriverOnboarding"));
const OwnerOnboarding = lazy(() => import("./pages/OwnerOnboarding"));
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard"));
const OwnerSignIn = lazy(() => import("./pages/OwnerSignIn"));
const AdminSignIn = lazy(() => import("./pages/AdminSignIn"));

const Catalogue = lazy(() => import("./pages/Catalogue"));
const VehicleDetails = lazy(() => import("./pages/VehicleDetails"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminAssistantDashboard = lazy(() => import("./pages/AdminAssistantDashboard"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const SmsOptIn = lazy(() => import("./pages/SmsOptIn"));
const FAQ = lazy(() => import("./pages/FAQ"));
const HowItWorksPage = lazy(() => import("./pages/HowItWorksPage"));
const RentingVsOwning = lazy(() => import("./pages/guides/RentingVsOwning"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LegalSupportDashboard = lazy(() => import("./pages/LegalSupportDashboard"));
const IoTSupportDashboard = lazy(() => import("./pages/IoTSupportDashboard"));
const VehicleSupportDashboard = lazy(() => import("./pages/VehicleSupportDashboard"));
const InsuranceSupportDashboard = lazy(() => import("./pages/InsuranceSupportDashboard"));
const DriverTraining = lazy(() => import("./pages/DriverTraining"));
const RefereeAttestation = lazy(() => import("./pages/RefereeAttestation"));
const MobileCallIn = lazy(() => import("./pages/MobileCallIn"));
const MobileNotificationPreferences = lazy(() => import("./pages/MobileNotificationPreferences"));
const PaymentReceipt = lazy(() => import("./pages/PaymentReceipt"));
const ReconciliationLogsPage = lazy(() => import("./pages/admin/ReconciliationLogsPage"));
const AdminSettlementRunsPage = lazy(() => import("./pages/admin/AdminSettlementRunsPage"));
const CredentialHealthPage = lazy(() => import("./pages/admin/CredentialHealthPage"));
const PaymentProviderSettingsPage = lazy(() => import("./pages/admin/PaymentProviderSettingsPage"));
const BillingReconciliationPage = lazy(() => import("./pages/admin/BillingReconciliationPage"));
const AdminOwnerWithdrawalsPage = lazy(() => import("./pages/admin/AdminOwnerWithdrawalsPage"));
const AdminInvoiceStatusPage = lazy(() => import("./pages/admin/AdminInvoiceStatusPage"));
const AdminRentalReconciliationPage = lazy(() => import("./pages/admin/AdminRentalReconciliationPage"));
const AdminLedgerReconciliationPage = lazy(() => import("./pages/admin/AdminLedgerReconciliationPage"));
const AdminDisputesPage = lazy(() => import("./pages/admin/AdminDisputesPage"));
const TelemetryStreamPage = lazy(() => import("./pages/TelemetryStreamPage"));
const AdminTreasuryPage = lazy(() => import("./pages/admin/AdminTreasuryPage"));

const AdminDocumentExportAuditPage = lazy(() => import("./pages/admin/AdminDocumentExportAuditPage"));
const AdminDocumentFailuresPage = lazy(() => import("./pages/admin/AdminDocumentFailuresPage"));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage"));
const PaymentsViewerPage = lazy(() => import("./pages/admin/PaymentsViewerPage"));
const TourStepConfigPage = lazy(() => import("./pages/admin/TourStepConfigPage"));
const AdminLegalTemplatePreviewPage = lazy(() => import("./pages/admin/AdminLegalTemplatePreviewPage"));
const TourAnalyticsPage = lazy(() => import("./pages/admin/TourAnalyticsPage"));
const AdminVehicleCataloguePage = lazy(() => import("./pages/admin/AdminVehicleCataloguePage"));
const AdminVehicleAuthorizationsPage = lazy(() => import("./pages/admin/AdminVehicleAuthorizationsPage"));
const CancelAuthorizationPage = lazy(() => import("./pages/CancelAuthorizationPage"));
const AdminVehicleImportsPage = lazy(() => import("./pages/admin/AdminVehicleImportsPage"));
const HologramDeviceDetailPage = lazy(() => import("./pages/admin/HologramDeviceDetailPage"));
const AdminNotificationRetryPage = lazy(() => import("./pages/admin/AdminNotificationRetryPage"));
const AdminSmsConsentAuditPage = lazy(() => import("./pages/admin/AdminSmsConsentAuditPage"));
const AdminEmailDeliveryPage = lazy(() => import("./pages/admin/AdminEmailDeliveryPage"));
const MessagingCenterPage = lazy(() => import("./pages/admin/MessagingCenterPage"));
const AdminSmsDeliveryPage = lazy(() => import("./pages/admin/AdminSmsDeliveryPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const AdminVehicleTelemetryPage = lazy(() => import("./pages/admin/AdminVehicleTelemetryPage"));

const AdminVehicleQueuePage = lazy(() => import("./pages/admin/AdminVehicleQueuePage"));
const AdminProximityMatchingPage = lazy(() => import("./pages/admin/AdminProximityMatchingPage"));
const AdminDriverMatchingPage = lazy(() => import("./pages/admin/AdminDriverMatchingPage"));

const UserUuidAssignmentsPage = lazy(() => import("./pages/admin/UserUuidAssignmentsPage"));
const TraccarCommandAuditPage = lazy(() => import("./pages/admin/TraccarCommandAuditPage"));
const OnboardingDiagnosticsPage = lazy(() => import("./pages/admin/OnboardingDiagnosticsPage"));
const OnboardingAuditTimelinePage = lazy(() => import("./pages/admin/OnboardingAuditTimelinePage"));
const AdminImpersonateDashboardPage = lazy(() => import("./pages/admin/AdminImpersonateDashboardPage"));
const AdminPersonaInquiriesPage = lazy(() => import("./pages/admin/AdminPersonaInquiriesPage"));
const AdminPersonaReviewPage = lazy(() => import("./pages/admin/AdminPersonaReviewPage"));
const AdminPersonaTemplatesPage = lazy(() => import("./pages/admin/AdminPersonaTemplatesPage"));
const AdminTrainingReviewPage = lazy(() => import("./pages/admin/AdminTrainingReviewPage"));
const OrchestratorPage = lazy(() => import("./pages/admin/OrchestratorPage"));

const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage"));
const BillingHistoryPage = lazy(() => import("./pages/BillingHistoryPage"));
const SubscriptionSuccessPage = lazy(() => import("./pages/SubscriptionSuccessPage"));
const ProxyConsentPage = lazy(() => import("./pages/ProxyConsentPage"));
const PortalRouteGuard = lazy(() => import("./components/onboarding/PortalRouteGuard"));
const OnboardingRedirect = lazy(() => import("./pages/OnboardingRedirect"));
const OnboardingLegalAgreement = lazy(() => import("./pages/OnboardingLegalAgreement"));
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettingsPage"));
const NotificationPreferencesPage = lazy(() => import("./pages/NotificationPreferencesPage"));

const ProfileCompletionWizard = lazy(() => import("./pages/ProfileCompletionWizard"));
const VerificationStatusPage = lazy(() => import("./pages/VerificationStatusPage"));
import { OnboardingStageToaster } from "@/components/onboarding/OnboardingStageToaster";
import PhoneVerificationPrompt from "@/components/phone/PhoneVerificationPrompt";


const queryClient = new QueryClient();

const PageLoader = () => (
  <SuspenseProgressTracker>
    <PageSkeleton />
  </SuspenseProgressTracker>
);

const App = () => (
  
          <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RegionProvider>
        <UserTypeProvider>

          <BrowserRouter>
            <RouteProgressBar />

            <TooltipProvider>

              <AppLiveSync /> 
              <DynamicMetaTagManager />
              <MetaPixelRouteTracker />
              <NativeDeepLinkBridge />
              <DocumentExpiryInAppNotifier />
              <OnboardingStageToaster />
              <PhoneVerificationPrompt />


              <SkipToContent />
              <LiveAnnouncer />

              <CookieConsent />
              <MessageConsent />

              <Toaster />
              <Sonner />

              <Suspense fallback={<PageLoader />}>

                {/* Skip-link target only. Pages render their own <main>
                    landmark, so this wrapper must NOT be a <main> — nested /
                    duplicate main landmarks break screen-reader navigation. */}
                <div id="main-content" tabIndex={-1} className="outline-none">
                  <CanonicalRedirects />
                  <Routes>

                    <Route path="/" element={<Index />} />
                    <Route path="/index" element={<Navigate to="/" replace />} />
                    <Route path="/home" element={<Navigate to="/" replace />} />
                    <Route path="/catalogue" element={<Navigate to="/catalogue/budget" replace />} />
                    <Route path="/vehicles/:id" element={<VehicleRedirect />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/owner/sign-in" element={<OwnerSignIn />} />
                    <Route path="/owner/signin" element={<Navigate to="/owner/sign-in" replace />} />
                    <Route path="/admin/sign-in" element={<AdminSignIn />} />
                    <Route path="/admin/signin" element={<Navigate to="/admin/sign-in" replace />} />

                
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/referee-attest" element={<RefereeAttestation />} />
                  <Route path="/proxy/consent" element={<ProxyConsentPage />} />
                  <Route path="/cancel-authorization/:token" element={<CancelAuthorizationPage />} />
                  <Route path="/cancel-authorization" element={<CancelAuthorizationPage />} />
                  <Route path="/m/call-in" element={<ProtectedRoute><MobileCallIn /></ProtectedRoute>} />
                  <Route path="/m/call-in/:type" element={<ProtectedRoute><MobileCallIn /></ProtectedRoute>} />
                  <Route path="/m/settings/notifications" element={<ProtectedRoute><MobileNotificationPreferences /></ProtectedRoute>} />
                  <Route path="/m/notifications" element={<Navigate to="/m/settings/notifications" replace />} />
                  <Route path="/driver/register" element={<DriverRegistration />} />
                  <Route path="/owner/register" element={<OwnerRegistration />} />
                  <Route path="/register/driver" element={<Navigate to="/driver/register" replace />} />
                  <Route path="/register/owner" element={<Navigate to="/owner/register" replace />} />
                  <Route path="/driver/signup" element={<Navigate to="/driver/register" replace />} />
                  <Route path="/owner/signup" element={<Navigate to="/owner/register" replace />} />
                  {/* Aliases cited in the A2P 10DLC submission packet */}
                  <Route path="/driver-registration" element={<Navigate to="/driver/register" replace />} />
                  <Route path="/owner-registration" element={<Navigate to="/owner/register" replace />} />

                  <Route 
                    path="/driver/registration" 
                    element={
                      <ProtectedRoute allowedRoles={['driver']}>
                        <DriverRegistration />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/owner/registration" 
                    element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <OwnerRegistration />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="/driver/dashboard" element={<DriverDashboard />} />
                  <Route path="/driver/onboarding" element={<DriverOnboarding />} />
                  <Route path="/owner/dashboard" element={<OwnerDashboard />} />
                  <Route path="/owner/onboarding" element={<OwnerOnboarding />} />
                  <Route path="/onboarding/legal-agreement" element={<OnboardingLegalAgreement />} />
                  <Route path="/catalogue/:category" element={<Catalogue />} />
                  <Route path="/vehicle/:id" element={<VehicleDetails />} />
                  <Route 
                    path="/api-docs" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <ApiDocs />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/sms-opt-in" element={<SmsOptIn />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/how-it-works" element={<HowItWorksPage />} />
                  <Route path="/guides/renting-vs-owning-for-rideshare" element={<RentingVsOwning />} />
                  <Route 
                    path="/admin" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="AdminDashboard">
                          <AdminDashboard />
                        </AdminProfiler>
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/admin-assistant" 
                    element={
                      <ProtectedRoute allowedRoles={['admin_assistant', 'admin']}>
                        <AdminProfiler id="AdminAssistantDashboard">
                          <AdminAssistantDashboard />
                        </AdminProfiler>
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/support/legal" 
                    element={
                      <ProtectedRoute allowedRoles={['legal_support', 'admin']}>
                        <LegalSupportDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/support/iot" 
                    element={
                      <ProtectedRoute allowedRoles={['iot_support', 'admin']}>
                        <IoTSupportDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/support/vehicle" 
                    element={
                      <ProtectedRoute allowedRoles={['vehicle_support', 'admin']}>
                        <VehicleSupportDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/support/insurance" 
                    element={
                      <ProtectedRoute allowedRoles={['insurance_support', 'admin']}>
                        <InsuranceSupportDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/driver/training" 
                    element={
                      <ProtectedRoute allowedRoles={['driver', 'admin']}>
                        <DriverTraining />
                      </ProtectedRoute>
                    } 
                  />
                  <Route
                    path="/rentals/:rentalId/payments/:paymentId"
                    element={
                      <ProtectedRoute allowedRoles={['driver', 'admin']}>
                        <PaymentReceipt />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/settlement-reconciliation"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="AdminSettlementRunsPage">
                          <AdminSettlementRunsPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/reconciliation"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="ReconciliationLogsPage">
                          <ReconciliationLogsPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/credential-health"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <CredentialHealthPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/payment-settings"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <PaymentProviderSettingsPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/owner-withdrawals"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminOwnerWithdrawalsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/billing-reconciliation"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <BillingReconciliationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/invoice-status"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminInvoiceStatusPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/rental-reconciliation"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminRentalReconciliationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/ledger-reconciliation"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminLedgerReconciliationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/disputes"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDisputesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/stream"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'iot_support']}>
                        <TelemetryStreamPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/stream"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'iot_support']}>
                        <TelemetryStreamPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/treasury"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="AdminTreasuryPage">
                          <AdminTreasuryPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/authorizations"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminVehicleAuthorizationsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/export-audit"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDocumentExportAuditPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/document-failures"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDocumentFailuresPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/audit-log"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="AuditLogPage">
                          <AuditLogPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/payments"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="PaymentsViewerPage">
                          <PaymentsViewerPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/tour-config"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <TourStepConfigPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/legal-templates/preview"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminLegalTemplatePreviewPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/tour-analytics"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <TourAnalyticsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/proximity-matching"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminProximityMatchingPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/driver-matching"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminDriverMatchingPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/vehicle-telemetry"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant', 'iot_support']}>
                        <AdminProfiler id="AdminVehicleTelemetryPage">
                          <AdminVehicleTelemetryPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/vehicle-queue"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminProfiler id="AdminVehicleQueuePage">
                          <AdminVehicleQueuePage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/vehicle-catalogue"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminVehicleCataloguePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/hologram/devices/:deviceId"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'iot_support']}>
                        <HologramDeviceDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/vehicle-imports"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminProfiler id="AdminVehicleImportsPage">
                          <AdminVehicleImportsPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/notification-retry"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminNotificationRetryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/messaging"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminProfiler id="MessagingCenterPage">
                          <MessagingCenterPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/email-delivery"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminEmailDeliveryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/sms-delivery"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminSmsDeliveryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/messages"
                    element={
                      <ProtectedRoute>
                        <MessagesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/sms-consent-audit"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminSmsConsentAuditPage />
                      </ProtectedRoute>
                    }
                  />



                  <Route
                    path="/admin/uuid-assignments"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <UserUuidAssignmentsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/traccar-commands"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <TraccarCommandAuditPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/orchestrator"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="OrchestratorPage">
                          <OrchestratorPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/onboarding-diagnostics"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminProfiler id="OnboardingDiagnosticsPage">
                          <OnboardingDiagnosticsPage />
                        </AdminProfiler>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/onboarding-audit"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <OnboardingAuditTimelinePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/persona-inquiries"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminPersonaInquiriesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/persona-review"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminPersonaReviewPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/persona-templates"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminPersonaTemplatesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/training-review"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminTrainingReviewPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/impersonate/:role/:userId"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'admin_assistant']}>
                        <AdminImpersonateDashboardPage />
                      </ProtectedRoute>
                    }
                  />




                  <Route
                    path="/subscriptions"
                    element={
                      <ProtectedRoute>
                        <SubscriptionsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/subscriptions/success"
                    element={
                      <ProtectedRoute>
                        <SubscriptionSuccessPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/billing"
                    element={
                      <ProtectedRoute>
                        <BillingHistoryPage />
                      </ProtectedRoute>
                    }
                  />



                  <Route path="/driver/portal/:portalKey" element={<PortalRouteGuard role="driver" />} />
                  <Route path="/owner/portal/:portalKey" element={<PortalRouteGuard role="owner" />} />
                  <Route
                    path="/settings/profile"
                    element={
                      <ProtectedRoute>
                        <ProfileSettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/profile-settings" element={<Navigate to="/settings/profile" replace />} />

                  <Route
                    path="/settings/notifications"
                    element={
                      <ProtectedRoute>
                        <NotificationPreferencesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/notification-preferences" element={<Navigate to="/settings/notifications" replace />} />

                  <Route path="/onboarding-redirect" element={<OnboardingRedirect />} />
                  <Route path="/verify-email" element={<OnboardingRedirect />} />
                  <Route
                    path="/onboarding/complete-profile"
                    element={
                      <ProtectedRoute>
                        <ProfileCompletionWizard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/onboarding/verification-status"
                    element={
                      <ProtectedRoute>
                        <VerificationStatusPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Legacy / alternate URL aliases — keep deep links working
                      instead of dropping visitors on the 404 page. */}
                  <Route path="/profile/settings" element={<Navigate to="/settings/profile" replace />} />
                  <Route path="/profile" element={<Navigate to="/settings/profile" replace />} />
                  <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
                  <Route path="/login" element={<Navigate to="/auth" replace />} />
                  <Route path="/signin" element={<Navigate to="/auth" replace />} />
                  <Route path="/signup" element={<Navigate to="/auth" replace />} />
                  <Route path="/register" element={<Navigate to="/driver/register" replace />} />
                  <Route path="/dashboard" element={<OnboardingRedirect />} />
                  <Route path="/catalogue" element={<Navigate to="/catalogue/standard" replace />} />
                  <Route path="/forgot-password" element={<Navigate to="/auth?forgot=1" replace />} />
                  <Route path="/~oauth/*" element={<Navigate to="/auth" replace />} />
                  <Route path="/~oauth" element={<Navigate to="/auth" replace />} />

                  <Route path="*" element={<NotFound />} />

                  </Routes>
                </div>

              </Suspense>

            </TooltipProvider>

          </BrowserRouter>

        </UserTypeProvider>
      </RegionProvider>
    </AuthProvider>
  </QueryClientProvider>
</ErrorBoundary>
  );
export default App;
