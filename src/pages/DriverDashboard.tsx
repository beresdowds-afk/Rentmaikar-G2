import { useState, useEffect } from 'react';
import { CurrencyIcon } from '@/components/ui/Currencyicon';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useRegion } from '@/contexts/RegionContext';
import { formatCurrency, PAYMENT_CONFIG } from '@/lib/payment-config';
import { PaymentOptionsSelector, type PaymentSelection } from '@/components/payment/PaymentOptionsSelector';
import { DriverPriceNegotiation } from '@/components/negotiation/DriverPriceNegotiation';
import { PhoneVerification } from '@/components/phone/PhoneVerification';
import { EmailVerification } from '@/components/auth/EmailVerification';
import { NotificationPreferences } from '@/components/phone/NotificationPreferences';
import { IncidentReportForm } from '@/components/incidents/IncidentReportForm';
import { WeeklyInspectionReport } from '@/components/inspection/WeeklyInspectionReport';
import UserAgreementsList from '@/components/legal/UserAgreementsList';
import { RentToOwnSearch } from '@/components/driver/RentToOwnSearch';
import { RideshareProfileUpload } from '@/components/driver/RideshareProfileUpload';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import SupportChatWidget from '@/components/support/SupportChatWidget';
import { PaymentReminderPreview } from '@/components/payment/PaymentReminderPreview';
import { CallSupportButton } from '@/components/support/CallSupportButton';
import { VoiceCallButton } from '@/components/voice/VoiceCallButton';
import { VoiceCallHistory } from '@/components/voice/VoiceCallHistory';
import { useVoiceCall } from '@/hooks/useVoiceCall';

import { ProfileEditor } from '@/components/profile/ProfileEditor';
import { AdminViewBanner } from '@/components/admin/AdminViewBanner';
import { AdminNotificationsBell as NotificationsBell } from "@/components/admin/AdminNotificationsBell";
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DriverBehaviorLogs } from '@/components/admin/DriverBehaviorLogs';
import { InstallAppBanner } from '@/components/pwa/InstallAppBanner';
import { UserIdentityCard } from '@/components/profile/UserIdentityCard';
import { useDriverDashboard } from '@/hooks/useDriverDashboard';
import { CallInPanel } from '@/components/driver/CallInPanel';
import { PayPalCheckout } from '@/components/payments/PayPalCheckout';
import { PaymentMethodPicker } from '@/components/payments/PaymentMethodPicker';
import { RentalPaymentStatusPanel } from '@/components/payments/RentalPaymentStatusPanel';
import { UnifiedBillingPanel } from '@/components/payments/UnifiedBillingPanel';
import { InvoiceStatusPanel } from '@/components/payments/InvoiceStatusPanel';
import { ProxyBillingSettings } from '@/components/driver/ProxyBillingSettings';
import { EnablePushButton } from '@/components/notifications/EnablePushButton';
import { installDeepLinkListener } from '@/lib/push';
import { useDashboardAuthGate } from '@/components/auth/DashboardAuthGate';
import { useRegistrationProgress } from '@/hooks/useRegistrationProgress';
import { ViewOnlyDashboardShell } from '@/components/registration/ViewOnlyDashboardShell';
import { PostApprovalTasks } from '@/components/driver/PostApprovalTasks';
import { UserMessagesPanel } from '@/components/dashboard/UserMessagesPanel';
import PageSkeleton from '@/components/PageSkeleton';

import { SubscriptionPlansPanel } from '@/components/subscriptions/SubscriptionPlansPanel';
import { SubscriptionGate } from '@/components/subscriptions/SubscriptionGate';
import { PortalGate } from '@/components/onboarding/PortalGate';
import { OnboardingReconciliationBanner } from '@/components/onboarding/OnboardingReconciliationBanner';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { TrainingComplianceBanner } from '@/components/dashboard/TrainingComplianceBanner';
import { RealtimeStatusCard } from '@/components/dashboard/RealtimeStatusCard';

import { DriverOverviewTab } from '@/components/dashboard/DriverOverviewTab';
import { useNavigate } from 'react-router-dom';
import {
  Car,
  Activity,
  CreditCard,
  Calendar,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Phone,
  Landmark,
  TrendingUp,
  FileText,
  Bell,
  Settings,
  Wrench,
  Camera,
  Home,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePersistedTab } from '@/hooks/usePersistedTab';

export default function DriverDashboard() {
  const { country, currency } = useRegion();
  const { user, userRole } = useAuth();
  const [activeTab, setActiveTab] = usePersistedTab('overview');
  const isAdminView = userRole === 'admin';
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [paymentRefreshKey, setPaymentRefreshKey] = useState(0);
  const [preferredPSP, setPreferredPSP] = useState<"paystack" | "opay" | "paypal" | undefined>();
  const navigate = useNavigate();
  useEffect(() => installDeepLinkListener(navigate), [navigate]);
  const { callHistory, isLoading: callsLoading, refreshHistory } = useVoiceCall('driver');
  const {
    activeRental,
    vehicle: dbVehicle,
    payments: dbPayments,
    totalPaid: dbTotalPaid,
    daysActive: dbDaysActive,
    isLoading: dashboardLoading,
    hasActiveRental,
  } = useDriverDashboard();

  const isUSA = country === 'USA';

  // Use real data when available, otherwise show empty state
  const vehicle = dbVehicle
    ? {
        id: dbVehicle.id,
        make: dbVehicle.make,
        model: dbVehicle.model,
        year: dbVehicle.year,
        plateNumber: dbVehicle.license_plate,
        category: 'Active',
        image: '/placeholder.svg',
      }
    : null;

  const rental = activeRental
    ? {
        id: activeRental.id,
        startDate: new Date(activeRental.start_date).toISOString().split('T')[0],
        dailyRate: Number(activeRental.daily_rate),
        weeklyRate: Number(activeRental.daily_rate) * 7,
        paymentFrequency: activeRental.payment_frequency as 'weekly' | 'daily',
        status: activeRental.status as 'active',
        nextPaymentDate: 'See payments tab',
        totalPaid: dbTotalPaid,
        daysActive: dbDaysActive,
      }
    : null;

  // Fetch phone verification status
  useEffect(() => {
    const fetchPhoneStatus = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('phone_verified')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setPhoneVerified(data.phone_verified || false);
      }
    };
    fetchPhoneStatus();
  }, [user]);

  // Calculate amounts based on real data or region defaults
  const weeklyRate = rental ? rental.weeklyRate : (isUSA ? 300 : 150000);
  const adminFee = weeklyRate * (PAYMENT_CONFIG.ADMIN_FEE_PERCENT / 100);
  const totalDue = weeklyRate + adminFee;

  const handlePaymentSubmit = async (selection: PaymentSelection) => {
    setIsProcessing(true);
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success(`Payment of ${formatCurrency(selection.totalAmount, currency)} initiated successfully!`);
      setShowPaymentModal(false);
    } catch (error) {
      toast.error('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestNegotiation = () => {
    toast.info('Price negotiation request submitted. Admin will review shortly.');
  };

  const authGate = useDashboardAuthGate({ allowedRoles: ['driver'], label: 'Driver Dashboard' });
  const { data: progress, isLoading: progressLoading } = useRegistrationProgress();
  if (authGate) return <>{authGate}</>;
  if (progressLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!isAdminView && progress && progress.access_level === 'view_only') {
    return <ViewOnlyDashboardShell role="driver" progress={progress} />;
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="pt-24 pb-16">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 xl:max-w-[1600px] 2xl:max-w-[1800px]">
          {/* Admin View Banner */}
          <AdminViewBanner dashboardType="driver" />

          {/* Install App Banner */}
          <div className="mb-6">
            <InstallAppBanner appName="Rentmaikar Driver" />
          </div>

          <UserIdentityCard role="Driver" />

          <TrainingComplianceBanner />

          <div className="my-4">
            <RealtimeStatusCard userId={user?.id ?? null} />
          </div>


          <div className="my-4">
            <OnboardingChecklist />
          </div>



          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold">Driver Dashboard</h1>
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <MapPin className="h-4 w-4" />
                {country} Region • {isUSA ? '🇺🇸' : '🇳🇬'} {currency}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <NotificationsBell />
              <Button
                variant="default"
                className="gap-2"
                onClick={() => navigate(`/catalogue/standard?radius=25&filter=nearby`)}
              >
                <MapPin className="h-4 w-4" />
                {isUSA ? 'Vehicles within 25 mi' : 'Vehicles in my city'}
              </Button>
              <Button variant="outline" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                {isUSA ? 'Contact Support' : 'WhatsApp Support'}
              </Button>
              <VoiceCallButton userRole="driver" targetRole="admin" />
            </div>
          </div>

          {/* Call-In Panel */}
          <div className="mb-8">
            <CallInPanel vehicleId={dbVehicle?.id ?? null} rentalId={activeRental?.id ?? null} />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 2xl:grid-cols-8 gap-4 mb-8">

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Vehicle</p>
                    <p className="text-2xl font-bold">{vehicle ? `${vehicle.make} ${vehicle.model}` : 'No vehicle'}</p>
                  </div>
                  <Car className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Days Active</p>
                    <p className="text-2xl font-bold">{rental?.daysActive ?? 0}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(rental?.totalPaid ?? 0, currency)}
                    </p>
                  </div>
                  <CurrencyIcon className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Next Payment</p>
                    <p className="text-2xl font-bold">{rental?.nextPaymentDate ?? 'N/A'}</p>
                  </div>
                  <Clock className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-6">
            <PostApprovalTasks onOpenDocuments={() => setActiveTab('documents')} />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <OnboardingReconciliationBanner />
            <TabsList className="flex flex-wrap w-full h-auto gap-1.5 p-1.5 justify-start bg-muted/60 rounded-lg [&>[role=tab]]:flex-none [&>[role=tab]]:h-9 [&>[role=tab]]:px-3 [&>[role=tab]]:text-xs md:[&>[role=tab]]:text-sm [&>[role=tab]]:rounded-md [&>[role=tab]]:transition-colors [&>[role=tab][data-state=active]]:bg-background [&>[role=tab][data-state=active]]:shadow-sm">
              <TabsTrigger value="overview" data-tour="driver-overview">Overview</TabsTrigger>
              <TabsTrigger value="payments" data-tour="driver-payments">Payments</TabsTrigger>
              <TabsTrigger value="negotiate" data-tour="driver-negotiate">Price Negotiation</TabsTrigger>
              <TabsTrigger value="lease-to-own" className="flex items-center gap-1" data-tour="driver-rto">
                <Home className="h-3 w-3" />
                Lease to Own
              </TabsTrigger>
              <TabsTrigger value="inspection" className="flex items-center gap-1" data-tour="driver-inspection">
                <Camera className="h-3 w-3" />
                {isUSA ? 'Monthly Report' : 'Weekly Report'}
              </TabsTrigger>
              <TabsTrigger value="rideshare-profile" className="flex items-center gap-1">
                <Upload className="h-3 w-3" />
                Rideshare Profile
              </TabsTrigger>
              <TabsTrigger value="incidents" className="flex items-center gap-1" data-tour="driver-incidents">
                <Wrench className="h-3 w-3" />
                Incidents
              </TabsTrigger>
              <TabsTrigger value="agreements" className="flex items-center gap-1" data-tour="driver-agreements">
                <FileText className="h-3 w-3" />
                Agreements
              </TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="subscriptions" className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Subscriptions
              </TabsTrigger>
              <TabsTrigger value="telemetry" className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Driving Score
              </TabsTrigger>
              <TabsTrigger value="call-history" className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Call History
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                Messages
              </TabsTrigger>
              <TabsTrigger value="settings" data-tour="driver-settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="subscriptions" className="space-y-6">
              <PortalGate portal="Subscriptions" require="authenticated">
                <div className="space-y-6">
                  <SubscriptionGate service="driver_training" label="Driver Training" hideWhenRegionDisabled>
                    <SubscriptionPlansPanel
                      title="Driver Training (compulsory · unlocks Insurance)"
                      planTypes={["training"]}
                    />
                  </SubscriptionGate>
                  <SubscriptionGate
                    service="insurance"
                    requires="driver_training"
                    label="Insurance"
                    hideWhenRegionDisabled
                  >
                    <SubscriptionPlansPanel title="Insurance (compulsory)" planTypes={["insurance"]} />
                  </SubscriptionGate>
                  <SubscriptionGate service="roadside_assistance" label="Roadside Support" hideWhenRegionDisabled>
                    <SubscriptionPlansPanel title="Roadside Support" planTypes={["roadside_support"]} />
                  </SubscriptionGate>
                </div>
              </PortalGate>
            </TabsContent>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <DriverOverviewTab onNavigateTab={setActiveTab} />
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="space-y-6">
              <PortalGate portal="Payments" require="approved">
              <div className="space-y-6">
              {rental && (
                <RentalPaymentStatusPanel
                  rentalId={rental.id}
                  refreshKey={paymentRefreshKey}
                  onRetry={(p) => {
                    const method = (p.payment_method ?? "").toLowerCase();
                    if (method === "paystack" || method === "opay" || method === "paypal") {
                      setPreferredPSP(method);
                    }
                    toast.message("Retry the failed payment below");
                    setTimeout(() => document.getElementById("payment-picker")?.scrollIntoView({ behavior: "smooth" }), 50);
                  }}
                />
              )}

              <div id="payment-picker" className="flex justify-end">
                <EnablePushButton />
              </div>

              {rental && (
                <PaymentMethodPicker
                  country={country}
                  amount={Number(totalDue.toFixed(2))}
                  rentalId={rental.id}
                  vehicleId={vehicle?.id}
                  driverId={user?.id}
                  paymentFrequency={rental.paymentFrequency}
                  description={`Rental ${rental.id.slice(0, 8)} ${rental.paymentFrequency} payment`}
                  preferredPSP={preferredPSP}
                  onSuccess={() => setPaymentRefreshKey((k) => k + 1)}
                  onError={() => setPaymentRefreshKey((k) => k + 1)}
                />
              )}

              <SubscriptionPlansPanel
                title="Add-on payments (Training · Insurance · Roadside)"
                planTypes={["training", "insurance", "roadside_support"]}
                compact
              />
              <UnifiedBillingPanel userId={user?.id} role="driver" country={country} />
              <InvoiceStatusPanel scope="driver" userId={user?.id} />
              <ProxyBillingSettings userId={user?.id} />


              {showPaymentModal ? (
                <PaymentOptionsSelector
                  baseAmount={weeklyRate}
                  currency={currency}
                  country={country}
                  onPaymentSubmit={handlePaymentSubmit}
                  isProcessing={isProcessing}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Payment History</CardTitle>
                    <CardDescription>Your recent payments and transactions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {dbPayments.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No payments yet</p>
                      ) : (
                        dbPayments.map((payment) => (
                          <div 
                            key={payment.id} 
                            className="flex items-center justify-between p-4 border rounded-lg"
                          >
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                              </div>
                              <div>
                                <p className="font-medium capitalize">{payment.payment_frequency} Payment</p>
                                <p className="text-sm text-muted-foreground">{new Date(payment.created_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">
                                {formatCurrency(Number(payment.amount), payment.currency as 'USD' | 'NGN' | (string & {}))}
                              </p>
                              <Badge variant="outline" className="text-xs capitalize">
                                {payment.payment_method || payment.status}
                              </Badge>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <Button 
                      className="w-full mt-6" 
                      onClick={() => setShowPaymentModal(true)}
                    >
                      Make New Payment
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Payment Methods Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Available Payment Methods</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <CreditCard className="h-5 w-5" />
                        <span className="font-medium">
                          {isUSA ? 'PayPal' : 'Paystack'}
                        </span>
                        <Badge>Instant</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isUSA 
                          ? 'Pay instantly with your PayPal account or credit card'
                          : 'Pay with card, bank, or USSD via Paystack'
                        }
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <Landmark className="h-5 w-5" />
                        <span className="font-medium">Bank Transfer</span>
                        <Badge variant="secondary">1-2 days</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isUSA 
                          ? 'Transfer directly to our Chase bank account'
                          : 'Transfer to our GTBank account'
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Reminder Notification Preview */}
              <PaymentReminderPreview 
                driverName={user?.user_metadata?.full_name || 'Driver'}
                amountDue={isUSA ? totalDue : totalDue}
                currency={currency}
                paymentFrequency={rental?.paymentFrequency ?? 'weekly'}
              />
              </div>
              </PortalGate>
            </TabsContent>

            {/* Price Negotiation Tab */}
            <TabsContent value="negotiate" className="space-y-6">
              <PortalGate portal="Price Negotiation" require="verification">
                <DriverPriceNegotiation />
              </PortalGate>
            </TabsContent>

            {/* Lease to Own Tab */}
            <TabsContent value="lease-to-own">
              <PortalGate portal="Lease to Own" require="approved">
                <RentToOwnSearch />
              </PortalGate>
            </TabsContent>

            {/* Vehicle Inspection Tab - Monthly for USA, Weekly for Nigeria */}
            <TabsContent value="inspection" className="space-y-6">
              <PortalGate portal="Inspection Report" require="verification">
                <WeeklyInspectionReport
                  vehicleId={vehicle.id}
                  vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                  ownerId={null}
                  region={country}
                />
              </PortalGate>
            </TabsContent>

            {/* Rideshare Profile Tab - Weekly for all */}
            <TabsContent value="rideshare-profile" className="space-y-6">
              <PortalGate portal="Rideshare Profile" require="documents">
                <RideshareProfileUpload vehicleId={vehicle.id} />
              </PortalGate>
            </TabsContent>

            {/* Incidents Tab */}
            <TabsContent value="incidents" className="space-y-6">
              <PortalGate portal="Report an Incident" require="documents">
                <IncidentReportForm
                  vehicleId={vehicle.id}
                  vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                />
              </PortalGate>
            </TabsContent>

            {/* Agreements Tab */}
            <TabsContent value="agreements" className="space-y-6">
              <PortalGate portal="Agreements" require="email_verified">
                <UserAgreementsList userType="driver" />
              </PortalGate>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-6">
              <DocumentUpload userType="driver" />
            </TabsContent>

            {/* Call History Tab */}
            <TabsContent value="call-history" className="space-y-6">
              <VoiceCallHistory
                calls={callHistory}
                isLoading={callsLoading}
                onRefresh={refreshHistory}
                userRole="driver"
              />
            </TabsContent>

            {/* Messages Tab */}
            <TabsContent value="messages" className="space-y-6">
              <UserMessagesPanel />
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              {/* Editable personal info (email/phone changes trigger re-verification) */}
              <ProfileEditor subjectRole="driver" />

              {/* Email Verification */}
              <EmailVerification />
              
              {/* Phone Verification */}
              <PhoneVerification onVerified={() => setPhoneVerified(true)} />

              {/* Notification Preferences */}
              <NotificationPreferences phoneVerified={phoneVerified} />
            </TabsContent>

            {/* Driving Score / Telemetry Tab */}
            <TabsContent value="telemetry" className="space-y-6">
              <DriverBehaviorLogs driverIdFilter={user?.id} />
            </TabsContent>
          </Tabs>
        </div>
        </main>

        <Footer />
        <SupportChatWidget />
        <CallSupportButton userType="driver" variant="floating" />
      </div>
    </>
  );
}