import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  Inbox, 
  Phone, 
  Headphones, 
  HandshakeIcon,
  AlertTriangle,
  FileText,
  Car,
  Cpu,
  Package,
  Wrench,
  Home,
  WifiOff,
  UserPlus,
  Clock
} from "lucide-react";
import { type PortalType } from "./PortalNavigation";

interface PortalAnalyticsCardsProps {
  activePortal: PortalType;
  onNavigate?: (portal: PortalType, tab: string) => void;
}

interface MetricCard {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  targetTab: string;
  targetPortal: PortalType;
}

export const PortalAnalyticsCards = ({ activePortal, onNavigate }: PortalAnalyticsCardsProps) => {
  // Fetch support metrics
  const { data: supportMetrics, isLoading: supportLoading } = useQuery({
    queryKey: ['support-metrics'],
    queryFn: async () => {
      const [inboxRes, callsRes, tasksRes] = await Promise.all([
        supabase.from('inbox_conversations').select('id', { count: 'exact' }).eq('status', 'open'),
        supabase.from('voip_call_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('support_tasks').select('id', { count: 'exact' }).in('legal_status', ['document_review', 'pending_signature']),
      ]);
      
      return {
        openInbox: inboxRes.count || 0,
        pendingCalls: callsRes.count || 0,
        activeTasks: tasksRes.count || 0,
      };
    },
    enabled: activePortal === 'support',
    staleTime: 30000,
  });

  // Fetch CRM metrics
  const { data: crmMetrics, isLoading: crmLoading } = useQuery({
    queryKey: ['crm-metrics'],
    queryFn: async () => {
      const [negotiationsRes, defaultsRes, agreementsRes, rtoRes, pendingAppsRes, reviewAppsRes] = await Promise.all([
        supabase.from('price_negotiations').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('payment_defaults').select('id', { count: 'exact' }).eq('status', 'active'),
        supabase.from('legal_agreements').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('rent_to_own_listings').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('applications').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('applications').select('id', { count: 'exact' }).eq('status', 'under_review'),
      ]);
      
      return {
        pendingNegotiations: negotiationsRes.count || 0,
        activeDefaults: defaultsRes.count || 0,
        pendingAgreements: agreementsRes.count || 0,
        pendingRTO: rtoRes.count || 0,
        pendingApplications: pendingAppsRes.count || 0,
        reviewApplications: reviewAppsRes.count || 0,
      };
    },
    enabled: activePortal === 'crm',
    staleTime: 30000,
  });

  // Fetch ERP metrics
  const { data: erpMetrics, isLoading: erpLoading } = useQuery({
    queryKey: ['erp-metrics'],
    queryFn: async () => {
      const [vehiclesRes, devicesRes, ordersRes, incidentsRes, recallsRes] = await Promise.all([
        supabase.from('vehicles').select('id', { count: 'exact' }).eq('status', 'active'),
        supabase.from('iot_devices').select('id', { count: 'exact' }).eq('status', 'inactive'),
        supabase.from('iot_device_orders').select('id', { count: 'exact' }).eq('shipping_status', 'pending'),
        supabase.from('vehicle_incidents').select('id', { count: 'exact' }).in('status', ['reported', 'in_progress']),
        supabase.from('vehicle_recalls').select('id', { count: 'exact' }).in('status', ['initiated', 'in_progress']),
      ]);
      
      return {
        activeVehicles: vehiclesRes.count || 0,
        inventoryDevices: devicesRes.count || 0,
        pendingOrders: ordersRes.count || 0,
        openIncidents: incidentsRes.count || 0,
        activeRecalls: recallsRes.count || 0,
      };
    },
    enabled: activePortal === 'erp',
    staleTime: 30000,
  });

  const getSupportCards = (): MetricCard[] => [
    {
      label: "Open Inbox",
      value: supportMetrics?.openInbox ?? 0,
      icon: <Inbox className="h-5 w-5" />,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      targetTab: "inbox",
      targetPortal: "support",
    },
    {
      label: "Pending Callbacks",
      value: supportMetrics?.pendingCalls ?? 0,
      icon: <Phone className="h-5 w-5" />,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      targetTab: "call-center",
      targetPortal: "support",
    },
    {
      label: "Active Tasks",
      value: supportMetrics?.activeTasks ?? 0,
      icon: <Headphones className="h-5 w-5" />,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      targetTab: "support-tasks",
      targetPortal: "support",
    },
  ];

  const getCRMCards = (): MetricCard[] => [
    {
      label: "Pending Applications",
      value: crmMetrics?.pendingApplications ?? 0,
      icon: <UserPlus className="h-5 w-5" />,
      color: "text-sky-600",
      bgColor: "bg-sky-100",
      targetTab: "applications",
      targetPortal: "crm",
    },
    {
      label: "Under Review",
      value: crmMetrics?.reviewApplications ?? 0,
      icon: <Clock className="h-5 w-5" />,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      targetTab: "applications",
      targetPortal: "crm",
    },
    {
      label: "Pending Negotiations",
      value: crmMetrics?.pendingNegotiations ?? 0,
      icon: <HandshakeIcon className="h-5 w-5" />,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
      targetTab: "negotiations",
      targetPortal: "crm",
    },
    {
      label: "Payment Defaults",
      value: crmMetrics?.activeDefaults ?? 0,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: "text-red-600",
      bgColor: "bg-red-100",
      targetTab: "defaults",
      targetPortal: "crm",
    },
    {
      label: "Pending Agreements",
      value: crmMetrics?.pendingAgreements ?? 0,
      icon: <FileText className="h-5 w-5" />,
      color: "text-indigo-600",
      bgColor: "bg-indigo-100",
      targetTab: "legal-agreements",
      targetPortal: "crm",
    },
    {
      label: "Pending RTO",
      value: crmMetrics?.pendingRTO ?? 0,
      icon: <Home className="h-5 w-5" />,
      color: "text-teal-600",
      bgColor: "bg-teal-100",
      targetTab: "rent-to-own",
      targetPortal: "crm",
    },
  ];

  const getERPCards = (): MetricCard[] => [
    {
      label: "Active Vehicles",
      value: erpMetrics?.activeVehicles ?? 0,
      icon: <Car className="h-5 w-5" />,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
      targetTab: "tracking",
      targetPortal: "erp",
    },
    {
      label: "Devices in Inventory",
      value: erpMetrics?.inventoryDevices ?? 0,
      icon: <Cpu className="h-5 w-5" />,
      color: "text-cyan-600",
      bgColor: "bg-cyan-100",
      targetTab: "hardware",
      targetPortal: "erp",
    },
    {
      label: "Pending Orders",
      value: erpMetrics?.pendingOrders ?? 0,
      icon: <Package className="h-5 w-5" />,
      color: "text-violet-600",
      bgColor: "bg-violet-100",
      targetTab: "device-orders",
      targetPortal: "erp",
    },
    {
      label: "Open Incidents",
      value: erpMetrics?.openIncidents ?? 0,
      icon: <Wrench className="h-5 w-5" />,
      color: "text-rose-600",
      bgColor: "bg-rose-100",
      targetTab: "incidents",
      targetPortal: "erp",
    },
    {
      label: "Active Recalls",
      value: erpMetrics?.activeRecalls ?? 0,
      icon: <WifiOff className="h-5 w-5" />,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      targetTab: "recalls",
      targetPortal: "erp",
    },
  ];

  const getCards = (): MetricCard[] => {
    switch (activePortal) {
      case 'support': return getSupportCards();
      case 'crm': return getCRMCards();
      case 'erp': return getERPCards();
      default: return [];
    }
  };

  const isLoading = 
    (activePortal === 'support' && supportLoading) ||
    (activePortal === 'crm' && crmLoading) ||
    (activePortal === 'erp' && erpLoading);

  const cards = getCards();

  const handleCardClick = (card: MetricCard) => {
    if (onNavigate) {
      onNavigate(card.targetPortal, card.targetTab);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-12" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 ${cards.length > 4 ? 'lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8' : 'lg:grid-cols-4 xl:grid-cols-6'} gap-3 mb-6`}>
      {cards.map((card, index) => (
        <Card 
          key={index} 
          className="p-4 hover:shadow-md transition-all cursor-pointer hover:ring-2 hover:ring-primary/20 active:scale-[0.98]"
          onClick={() => handleCardClick(card)}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
            <div className={`w-8 h-8 rounded-lg ${card.bgColor} flex items-center justify-center ${card.color}`}>
              {card.icon}
            </div>
          </div>
          <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
        </Card>
      ))}

    </div>
  );
};
