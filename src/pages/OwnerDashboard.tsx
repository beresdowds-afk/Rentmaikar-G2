import { useState, useEffect } from 'react';
import OwnerActivityPanel from '@/components/owner/OwnerActivityPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useRegion } from '@/contexts/RegionContext';
import { useCategoryYearSpecs } from '@/hooks/useCategoryYearSpecs';
import { formatCurrency, PAYMENT_CONFIG } from '@/lib/payment-config';
import { OwnerPriceNegotiation } from '@/components/negotiation/OwnerPriceNegotiation';
import { PhoneVerification } from '@/components/phone/PhoneVerification';
import { EmailVerification } from '@/components/auth/EmailVerification';
import { NotificationPreferences } from '@/components/phone/NotificationPreferences';
import { ProfileEditor } from '@/components/profile/ProfileEditor';
import { IoTDevicePurchase } from '@/components/owner/IoTDevicePurchase';
import { OwnerWeeklyReportReview } from '@/components/inspection/OwnerWeeklyReportReview';
import UserAgreementsList from '@/components/legal/UserAgreementsList';
import { OwnerRentToOwnListing } from '@/components/owner/OwnerRentToOwnListing';
import { VehiclePickupLocation } from '@/components/owner/VehiclePickupLocation';
import { VehiclePhotoManager } from '@/components/owner/VehiclePhotoManager';
import { VehicleVerificationAction } from '@/components/owner/VehicleVerificationAction';
import { PublishVehicleButton } from '@/components/owner/PublishVehicleButton';

import { AddVehicleDialog } from '@/components/owner/AddVehicleDialog';
import VehicleSubmissionTracker, { VehicleSubmissionBadge } from '@/components/owner/VehicleSubmissionTracker';
import { useQueryClient } from '@tanstack/react-query';

import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { VehicleDocumentUpload } from '@/components/documents/VehicleDocumentUpload';
import { OwnerInsuranceSupport } from '@/components/owner/OwnerInsuranceSupport';
import { UnifiedBillingPanel } from '@/components/payments/UnifiedBillingPanel';
import { InvoiceStatusPanel } from '@/components/payments/InvoiceStatusPanel';

import { OwnerOverviewTab } from '@/components/dashboard/OwnerOverviewTab';
import SupportChatWidget from '@/components/support/SupportChatWidget';
import { InstallAppBanner } from '@/components/pwa/InstallAppBanner';
import { UserIdentityCard } from '@/components/profile/UserIdentityCard';
import { CallSupportButton } from '@/components/support/CallSupportButton';

import { VoiceCallHistory } from '@/components/voice/VoiceCallHistory';
import { useVoiceCall } from '@/hooks/useVoiceCall';

import { AdminViewBanner } from '@/components/admin/AdminViewBanner';
import { AdminNotificationsBell as NotificationsBell } from "@/components/admin/AdminNotificationsBell";
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useOwnerDashboard } from '@/hooks/useOwnerDashboard';
import { RecallApprovalPanel } from '@/components/recall/RecallApprovalPanel';
import { OwnerWithdrawalPanel } from "@/components/owner/OwnerWithdrawalPanel";
import { PortalGate } from '@/components/onboarding/PortalGate';
import { OnboardingReconciliationBanner } from '@/components/onboarding/OnboardingReconciliationBanner';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import {
  Car,
  Plus,
  
  TrendingUp,
  Calendar,
  MapPin,
  Users,
  Wallet,
  ArrowDownToLine,
  Clock,
  CheckCircle,
  AlertTriangle,
  Building2,
  FileText,
  Settings,
  Eye,
  MessageSquare,
  ImageIcon,
  Home,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardAuthGate } from '@/components/auth/DashboardAuthGate';
import { useRegistrationProgress } from '@/hooks/useRegistrationProgress';
import { ViewOnlyDashboardShell } from '@/components/registration/ViewOnlyDashboardShell';
import { UserMessagesPanel } from '@/components/dashboard/UserMessagesPanel';
import PageSkeleton from '@/components/PageSkeleton';
import { WithdrawalAuthorizationGate } from '@/components/payments/WithdrawalAuthorizationGate';
import { usePersistedTab } from '@/hooks/usePersistedTab';



const VEHICLE_CATEGORY_DEFS = [
  { value: 'smart-start', label: 'Smart Start', specKey: 'budget', maxWeekly: 250 },
  { value: 'earnings-optimizer', label: 'Earnings Optimizer', specKey: 'standard', maxWeekly: 300 },
  { value: 'top-earner', label: 'Top Earner', specKey: 'premium', maxWeekly: 350 },
] as const;

const FALLBACK_CATEGORY_YEARS: Record<string, string> = {
  budget: '2015-2016',
  standard: '2017-2020',
  premium: '2021-2025',
};

export default function OwnerDashboard() {
  const { country, currency } = useRegion();
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();

  const isAdminView = userRole === 'admin';
  const [activeTab, setActiveTab] = usePersistedTab('overview');
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const { callHistory, isLoading: callsLoading, refreshHistory } = useVoiceCall('owner');
  const {
    vehicles: dbVehicles,
    rentals: dbRentals,
    totalEarnings: dbTotalEarnings,
    availableBalance: dbAvailableBalance,
    activeRentals: dbActiveRentals,
  } = useOwnerDashboard();

  const isUSA = country === 'USA';
  const multiplier = isUSA ? 1 : 500;

  const { getForCategory: getCategorySpec, formatRange: formatCategoryRange, visible: yearSpecsVisible } = useCategoryYearSpecs(country);
  const vehicleCategories = VEHICLE_CATEGORY_DEFS.map((def) => {
    const spec = getCategorySpec(def.specKey);
    const range = yearSpecsVisible && spec ? formatCategoryRange(spec) : FALLBACK_CATEGORY_YEARS[def.specKey];
    return { ...def, label: range ? `${def.label} (${range})` : def.label };
  });

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

  // Use real data 
  const totalEarnings = dbTotalEarnings || 0;
  const availableBalance = dbAvailableBalance || 0;
  const activeVehicles = dbActiveRentals || 0;

  const [withdrawing, setWithdrawing] = useState(false);

  const handleWithdraw = async (authorizationId: string) => {
    const amount = parseFloat(withdrawAmount);
    if (!selectedVehicle) {
      toast.error('Please select a vehicle');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (amount > availableBalance) {
      toast.error('Insufficient available balance');
      return;
    }

    setWithdrawing(true);
    try {
      // Pick the owner's default payout account for this currency.
      const { data: account, error: accountError } = await supabase
        .from('owner_payout_accounts')
        .select('id, provider, currency')
        .eq('owner_id', user?.id ?? '')
        .eq('currency', currency)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (accountError) throw accountError;
      if (!account) {
        toast.error('Add a payout account before requesting a withdrawal.');
        return;
      }

      const fnName = account.provider === 'paypal'
        ? 'initiate-paypal-payout'
        : 'initiate-paystack-transfer';

      const { data, error } = await supabase.functions.invoke(fnName, {
        body: {
          amount,
          payoutAccountId: account.id,
          authorizationId,
          note: 'RentMaikar owner withdrawal',
          reason: 'RentMaikar owner withdrawal',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      toast.success(`Withdrawal of ${formatCurrency(amount, currency)} submitted for processing.`);
      setIsWithdrawOpen(false);
      setWithdrawAmount('');
      setSelectedVehicle(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };


  const authGate = useDashboardAuthGate({ allowedRoles: ['owner'], label: 'Owner Dashboard' });
  const { data: progress, isLoading: progressLoading } = useRegistrationProgress();
  if (authGate) return <>{authGate}</>;
  if (progressLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!isAdminView && progress && progress.access_level === 'view_only') {
    return <ViewOnlyDashboardShell role="owner" progress={progress} />;
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="pt-24 pb-16">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 xl:max-w-[1600px] 2xl:max-w-[1800px]">
          {/* Admin View Banner */}
          <AdminViewBanner dashboardType="owner" />

          {/* Install App Banner */}
          <div className="mb-6">
            <InstallAppBanner appName="Rentmaikar Owner" />
          </div>

          <UserIdentityCard role="Owner" />

          <div className="my-4">
            <OnboardingChecklist />
          </div>



          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold">Owner Dashboard</h1>
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <MapPin className="h-4 w-4" />
                {country} Region • {isUSA ? '🇺🇸' : '🇳🇬'} {currency}
              </p>
            </div>
            <div className="flex gap-3">
              <NotificationsBell />
              <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <ArrowDownToLine className="h-4 w-4" />
                    Withdraw Funds
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Withdraw Funds</DialogTitle>
                    <DialogDescription>
                      Withdraw earnings from your vehicle rentals. 
                      Withdrawals are limited to earnings from your vehicles only.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Select Vehicle</Label>
                      <Select value={selectedVehicle || ''} onValueChange={setSelectedVehicle}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a vehicle" />
                        </SelectTrigger>
                        <SelectContent>
                          {dbVehicles.map(vehicle => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                              {vehicle.make} {vehicle.model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount ({currency})</Label>
                      <Input 
                        type="number" 
                        placeholder="Enter amount"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Withdrawal Method</Label>
                      <Select defaultValue="bank_transfer">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">
                            {isUSA ? 'Bank Transfer (ACH)' : 'Bank Transfer'}
                          </SelectItem>
                          {isUSA && <SelectItem value="paypal">PayPal</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Withdrawals are processed on Fridays. 
                        Management fee (20%) has already been deducted.
                      </AlertDescription>
                    </Alert>
                    <WithdrawalAuthorizationGate
                      requestType="owner_payout"
                      amount={parseFloat(withdrawAmount) || 0}
                      currency={currency as 'USD' | 'NGN' | (string & {})}
                      destinationRef={selectedVehicle}
                      disabled={!selectedVehicle}
                      metadata={{ vehicle_id: selectedVehicle }}
                    >
                      {(authorizationId) => (
                        <Button
                          onClick={() => handleWithdraw(authorizationId)}
                          disabled={withdrawing}
                          className="w-full"
                        >
                          {withdrawing ? 'Processing…' : 'Request Withdrawal'}
                        </Button>
                      )}

                    </WithdrawalAuthorizationGate>

                  </div>
                </DialogContent>
              </Dialog>
              
              <AddVehicleDialog />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 2xl:grid-cols-8 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Vehicles</p>
                    <p className="text-2xl font-bold">{dbVehicles.length}</p>
                  </div>
                  <Car className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Rentals</p>
                    <p className="text-2xl font-bold">{activeVehicles}</p>
                  </div>
                  <Users className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Earnings</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalEarnings, currency)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Available Balance</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(availableBalance, currency)}</p>
                  </div>
                  <Wallet className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <OnboardingReconciliationBanner />
            <TabsList className="flex flex-wrap w-full h-auto gap-1.5 p-1.5 justify-start bg-muted/60 rounded-lg [&>[role=tab]]:flex-none [&>[role=tab]]:h-9 [&>[role=tab]]:px-3 [&>[role=tab]]:text-xs md:[&>[role=tab]]:text-sm [&>[role=tab]]:rounded-md [&>[role=tab]]:transition-colors [&>[role=tab][data-state=active]]:bg-background [&>[role=tab][data-state=active]]:shadow-sm">
              <TabsTrigger value="overview" data-tour="owner-overview">Overview</TabsTrigger>
              <TabsTrigger value="vehicles" data-tour="owner-vehicles">My Vehicles</TabsTrigger>
              <TabsTrigger value="pickup-locations" className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                Pickup Locations
              </TabsTrigger>
              <TabsTrigger value="iot-device" data-tour="owner-iot">Vehicle Tracking</TabsTrigger>
              <TabsTrigger value="inspections" className="flex items-center gap-1" data-tour="owner-inspections">
                <ImageIcon className="h-4 w-4" />
                Inspections
              </TabsTrigger>
              <TabsTrigger value="pricing" className="gap-2" data-tour="owner-pricing">
                <MessageSquare className="h-4 w-4" />
                Pricing
              </TabsTrigger>
              <TabsTrigger value="rent-to-own" className="flex items-center gap-1" data-tour="owner-rto">
                <Home className="h-4 w-4" />
                Rent to Own
              </TabsTrigger>
              <TabsTrigger value="insurance" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Insurance Support Service
              </TabsTrigger>
              <TabsTrigger value="agreements" className="flex items-center gap-1" data-tour="owner-agreements">
                <FileText className="h-4 w-4" />
                Agreements
              </TabsTrigger>
              <TabsTrigger value="earnings" data-tour="owner-earnings">Earnings</TabsTrigger>
              <TabsTrigger value="payments" className="flex items-center gap-1">
                <Wallet className="h-4 w-4" />
                Payments
              </TabsTrigger>
              <TabsTrigger value="withdrawals" data-tour="owner-withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="call-history">Call History</TabsTrigger>
              <TabsTrigger value="recalls">Recalls</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="settings" data-tour="owner-settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <OwnerOverviewTab onNavigateTab={setActiveTab} />
            </TabsContent>


            <TabsContent value="recalls">
              <PortalGate portal="Vehicle Recalls" require="approved">
                <RecallApprovalPanel mode="owner" />
              </PortalGate>
            </TabsContent>

            {/* Pickup Locations Tab */}
            <TabsContent value="pickup-locations">
              <PortalGate portal="Pickup Locations" require="documents">
                <VehiclePickupLocation />
              </PortalGate>
            </TabsContent>


            {/* IoT Device Tab */}
            <TabsContent value="iot-device">
  <PortalGate portal="Vehicle Tracking" require="verification">
    <IoTDevicePurchase />
  </PortalGate>
</TabsContent>

            {/* Inspections Tab */}
            <TabsContent value="inspections">
              <PortalGate portal="Weekly Inspections" require="verification">
                <OwnerWeeklyReportReview />
              </PortalGate>
            </TabsContent>

            {/* Pricing Tab */}
            <TabsContent value="pricing">
              <PortalGate portal="Price Negotiation" require="verification">
                <OwnerPriceNegotiation />
              </PortalGate>
            </TabsContent>

            {/* Insurance Tab */}
            <TabsContent value="insurance" className="space-y-6">
  <PortalGate portal="Insurance & Roadside" require="authenticated">
    <div className="space-y-6">
      <OwnerInsuranceSupport />
    </div>
  </PortalGate>
</TabsContent>

            {/* Agreements Tab */}
            <TabsContent value="agreements" className="space-y-6">
              <PortalGate portal="Legal Agreements" require="email_verified">
                <UserAgreementsList userType="owner" />
              </PortalGate>
            </TabsContent>

            {/* Rent to Own Tab */}
            <TabsContent value="rent-to-own">
              <PortalGate portal="Rent to Own Listing" require="approved">
                <OwnerRentToOwnListing />
              </PortalGate>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="space-y-6">
              <PortalGate portal="Payments" require="authenticated">
                <div className="space-y-6">
                  
                  <UnifiedBillingPanel userId={user?.id} role="owner" country={country} />
                  <InvoiceStatusPanel scope="owner" userId={user?.id} />

                </div>
              </PortalGate>
            </TabsContent>

       {/* Vehicles Tab */}
       <TabsContent value="vehicles" className="space-y-6">
  <PortalGate
    portal="My Vehicles"
    require="documents"
    hint="upload your ownership documents to add and manage vehicles."
  >
    <VehicleSubmissionTracker vehicles={dbVehicles as any} />

    <div className="grid gap-6">
      {dbVehicles.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No vehicles listed yet. Click "Add Vehicle" to get started.
        </p>
      ) : (
        dbVehicles.map(vehicle => (
          <Card key={vehicle.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </CardTitle>
                  <CardDescription>{vehicle.license_plate}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <PublishVehicleButton
                      vehicle={vehicle as any}
                      onPublished={() => queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] })}
                    />
                    <VehicleSubmissionBadge status={(vehicle as any).review_status} />
                    <Badge variant="secondary" className="capitalize">{vehicle.status}</Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <VehiclePhotoManager
                vehicleId={vehicle.id}
                ownerId={(vehicle as any).owner_id}
                photoUrls={((vehicle as any).photo_urls as string[]) || []}
                onChange={() => queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] })}
              />
              <VehicleVerificationAction
                vehicleId={vehicle.id}
                photoUrls={((vehicle as any).photo_urls as string[]) || []}
                reviewStatus={(vehicle as any).review_status}
                reviewNotes={(vehicle as any).review_notes}
                onDone={() => queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] })}
              />
            </CardContent>

          </Card>
        ))

      )}
    </div>

    <div className="[&>button]:w-full [&>button]:py-8">
      <AddVehicleDialog />
    </div>

  </PortalGate>
</TabsContent>

            {/* Earnings Tab */}
            <TabsContent value="earnings" className="space-y-6">
              <PortalGate portal="Earnings" require="approved"><div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Earnings Overview</CardTitle>
                  <CardDescription>
                    Your earnings after platform management fee (20%)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Earnings Summary */}
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Gross Earnings</p>
                        <p className="text-2xl font-bold">{formatCurrency(totalEarnings * 1.25, currency)}</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Management Fee (20%)</p>
                        <p className="text-2xl font-bold text-destructive">
                          -{formatCurrency(totalEarnings * 0.25, currency)}
                        </p>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Net Earnings</p>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(totalEarnings, currency)}</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Per Vehicle Earnings */}
                    <div>
                      <h4 className="font-semibold mb-4">Earnings by Vehicle</h4>
                      <div className="space-y-4">
                        {dbVehicles.map(vehicle => (
                          <div key={vehicle.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-4">
                              {((vehicle as any).photo_urls?.[0]) ? (
                                <img
                                  src={(vehicle as any).photo_urls[0]}
                                  alt={`${vehicle.make} ${vehicle.model}`}
                                  loading="lazy"
                                  className="h-12 w-12 rounded-lg object-cover border"
                                />
                              ) : (
                                <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center">
                                  <Car className="h-6 w-6" />
                                </div>
                              )}

                              <div>
                                <p className="font-medium">{vehicle.make} {vehicle.model}</p>
                                <p className="text-sm text-muted-foreground">{vehicle.license_plate}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">{vehicle.make} {vehicle.model}</p>
                              <p className="text-sm text-muted-foreground capitalize">{vehicle.status}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Earnings Calculator */}
              <Card>
                <CardHeader>
                  <CardTitle>Earnings Calculator</CardTitle>
                  <CardDescription>Estimate your potential weekly earnings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Vehicle Category</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehicleCategories.map(cat => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Weekly Rental Rate ({currency})</Label>
                        <Input type="number" placeholder={isUSA ? '300' : '150000'} />
                      </div>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="font-semibold mb-4">Estimated Weekly Payout</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Weekly Rate</span>
                          <span>{formatCurrency(300 * multiplier, currency)}</span>
                        </div>
                        <div className="flex justify-between text-destructive">
                          <span>Management Fee (20%)</span>
                          <span>-{formatCurrency(60 * multiplier, currency)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between font-bold text-lg">
                          <span>You Receive</span>
                          <span className="text-green-600">{formatCurrency(240 * multiplier, currency)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              </div></PortalGate>
            </TabsContent>

            {/* Withdrawals Tab */}
            <TabsContent value="withdrawals" className="space-y-6">
              <PortalGate portal="Withdrawals" require="approved" hint="complete approval before withdrawing to your bank or PayPal.">
                <OwnerWithdrawalPanel />
              </PortalGate>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="activity" className="space-y-6">
              <OwnerActivityPanel />
            </TabsContent>
            <TabsContent value="messages" className="space-y-6">
              <UserMessagesPanel />
            </TabsContent>
            <TabsContent value="settings" className="space-y-6">
              {/* Editable personal info (email/phone changes trigger re-verification) */}
              <ProfileEditor subjectRole="owner" />

              {/* Email Verification */}
              <EmailVerification />

              {/* Phone Verification */}
              <PhoneVerification onVerified={() => setPhoneVerified(true)} />

              {/* Notification Preferences */}
              <NotificationPreferences phoneVerified={phoneVerified} />
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-6">
              {/* Identification Documents */}
              <DocumentUpload userType="owner" />

              {/* Vehicle Documents */}
              <VehicleDocumentUpload />
            </TabsContent>
            {/* Call History Tab */}
            <TabsContent value="call-history" className="space-y-6">
              <VoiceCallHistory
                calls={callHistory}
                isLoading={callsLoading}
                onRefresh={refreshHistory}
                userRole="owner"
              />
            </TabsContent>
          </Tabs>
        </div>
        </main>

        <Footer />
        <SupportChatWidget />
        <CallSupportButton userType="owner" variant="floating" />
      </div>
    </>
  );
}
