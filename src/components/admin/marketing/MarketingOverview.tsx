import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Eye, 
  MousePointerClick, 
  CheckCircle2, 
  ShieldCheck, 
  Car, 
  Key, 
  Percent, 
  Filter, 
  ArrowUpRight, 
  RefreshCw, 
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  MessageSquare,
  Share2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface MarketingOverviewProps {
  onNavigateTab?: (tab: string) => void;
}

export const MarketingOverview: React.FC<MarketingOverviewProps> = ({ onNavigateTab }) => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState('30d');
  const [country, setCountry] = useState('all');
  const [city, setCity] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [campaign, setCampaign] = useState('all');
  const [channel, setChannel] = useState('all');
  const [role, setRole] = useState('all');

  const [metrics, setMetrics] = useState({
    spend: 3450,
    impressions: 124800,
    clicks: 4920,
    leads: 384,
    qualifiedLeads: 215,
    registrations: 168,
    verifiedUsers: 142,
    kycCompletions: 118,
    vehiclesListed: 84,
    vehiclesApproved: 62,
    rentals: 54,
    revenue: 45900,
    costPerLead: 8.98,
    costPerQualifiedLead: 16.05,
    costPerVehicle: 55.65,
    costPerRental: 63.89,
    roas: 13.3,
    conversionFunnel: [
      { stage: 'Impressions', count: 124800, rate: '100%' },
      { stage: 'Clicks', count: 4920, rate: '3.9%' },
      { stage: 'Leads Captured', count: 384, rate: '7.8%' },
      { stage: 'Qualified Leads', count: 215, rate: '56.0%' },
      { stage: 'Registered Users', count: 168, rate: '78.1%' },
      { stage: 'KYC Verified', count: 118, rate: '70.2%' },
      { stage: 'Vehicles Approved', count: 62, rate: '52.5%' },
      { stage: 'Rentals Converted', count: 54, rate: '87.1%' },
    ],
  });

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        dateRange,
        country,
        city,
        platform,
        campaign,
        channel,
        role,
      });

      const res = await fetch(`/api/marketing/overview?${queryParams.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.overview) {
          setMetrics(json.overview);
        }
      }
    } catch {
      // Fall back to default state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [dateRange, country, city, platform, campaign, channel, role]);

  return (
    <div className="space-y-6">
      {/* Top Header & Context Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Marketing Engine Overview
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs py-0.5">
              Live Attribution
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time performance across ad networks, social conversations, and lifecycle conversions.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOverview}
            disabled={loading}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {onNavigateTab && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigateTab('leads')}
                className="h-9"
              >
                <Users className="h-4 w-4 mr-2" />
                View Unified Leads
              </Button>
              <Button
                size="sm"
                onClick={() => onNavigateTab('communications')}
                className="h-9"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Communications Hub
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Comprehensive Filter Bar */}
      <Card className="shadow-sm border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Performance Filters
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* Date Range */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Timeframe</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Country */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Country</label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  <SelectItem value="NG">Nigeria (NG)</SelectItem>
                  <SelectItem value="USA">United States (USA)</SelectItem>
                  <SelectItem value="GH">Ghana (GH)</SelectItem>
                  <SelectItem value="KE">Kenya (KE)</SelectItem>
                  <SelectItem value="UK">United Kingdom (UK)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* City */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">City</label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  <SelectItem value="Lagos">Lagos</SelectItem>
                  <SelectItem value="Abuja">Abuja</SelectItem>
                  <SelectItem value="Port Harcourt">Port Harcourt</SelectItem>
                  <SelectItem value="Houston">Houston</SelectItem>
                  <SelectItem value="Dallas">Dallas</SelectItem>
                  <SelectItem value="Atlanta">Atlanta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Platform */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Ad Platform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="meta">Meta Ads</SelectItem>
                  <SelectItem value="google">Google Ads</SelectItem>
                  <SelectItem value="tiktok">TikTok Ads</SelectItem>
                  <SelectItem value="linkedin">LinkedIn Ads</SelectItem>
                  <SelectItem value="manychat">ManyChat</SelectItem>
                  <SelectItem value="direct">Direct / Organic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campaign */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Campaign</label>
              <Select value={campaign} onValueChange={setCampaign}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  <SelectItem value="lagos_driver">Lagos Fleet Expansion</SelectItem>
                  <SelectItem value="abuja_owner">Abuja Owner Yield</SelectItem>
                  <SelectItem value="texas_driver">Texas Driver Boost</SelectItem>
                  <SelectItem value="ig_dm">IG DM Social Bookings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Channel */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Channel</label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="ad">Social / Search Ads</SelectItem>
                  <SelectItem value="sms">SMS (SENT.dm)</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (SENT.dm)</SelectItem>
                  <SelectItem value="email">Email (Resend)</SelectItem>
                  <SelectItem value="voice">Voice Call (Twilio)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target Role */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Target Persona</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Personas</SelectItem>
                  <SelectItem value="driver">Drivers</SelectItem>
                  <SelectItem value="owner">Vehicle Owners</SelectItem>
                  <SelectItem value="renter">Renters</SelectItem>
                  <SelectItem value="corporate">Corporate Fleets</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Ad Spend */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase">Ad Spend</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              ${metrics.spend.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              <span className="text-emerald-600 font-medium mr-1">4 connected</span> ad accounts
            </p>
          </CardContent>
        </Card>

        {/* Impressions & Clicks */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase">Impressions</span>
              <Eye className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {metrics.impressions.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{metrics.clicks.toLocaleString()}</span> clicks (
              {((metrics.clicks / (metrics.impressions || 1)) * 100).toFixed(1)}% CTR)
            </p>
          </CardContent>
        </Card>

        {/* Leads & Qualified */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase">Leads</span>
              <Users className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {metrics.leads.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-emerald-600">{metrics.qualifiedLeads}</span> qualified (CPL ${metrics.costPerLead})
            </p>
          </CardContent>
        </Card>

        {/* Registrations & KYC */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase">Registered / KYC</span>
              <ShieldCheck className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {metrics.registrations} <span className="text-sm font-normal text-muted-foreground">/ {metrics.kycCompletions}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.verifiedUsers} phone/email verified
            </p>
          </CardContent>
        </Card>

        {/* Vehicles Listed / Approved */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase">Vehicles Approved</span>
              <Car className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {metrics.vehiclesApproved}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.vehiclesListed} submitted (CPV ${metrics.costPerVehicle})
            </p>
          </CardContent>
        </Card>

        {/* Rentals & Attributed Revenue */}
        <Card className="shadow-sm bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium uppercase text-primary font-semibold">Rentals / ROAS</span>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-primary">
              {metrics.rentals} <span className="text-sm font-semibold">({metrics.roas}x)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">${metrics.revenue.toLocaleString()}</span> attributed revenue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Marketing Conversion Funnel */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Lifecycle Conversion Funnel
              </CardTitle>
              <CardDescription>
                Full visitor journey from top-of-funnel ad impression to verified driver/owner, approved vehicle, and completed rental.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs font-normal">
              End-to-End Retention: {((metrics.rentals / (metrics.clicks || 1)) * 100).toFixed(2)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.conversionFunnel.map((step, idx) => (
                <div
                  key={step.stage}
                  className="p-3.5 rounded-lg border border-border bg-card/60 hover:bg-muted/40 transition-colors relative"
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold inline-flex items-center justify-center">
                        {idx + 1}
                      </span>
                      {step.stage}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-medium py-0">
                      {step.rate}
                    </Badge>
                  </div>
                  <div className="text-xl font-bold text-foreground mt-2">
                    {step.count.toLocaleString()}
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2.5 overflow-hidden">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(
                          8,
                          Math.min(100, (step.count / (metrics.conversionFunnel[0]?.count || 1)) * 100 * (idx === 0 ? 1 : 12))
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Metrics Comparison Strip */}
            <div className="p-3 bg-muted/40 rounded-lg border border-border/80 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <span className="text-muted-foreground">Cost per Lead (CPL): </span>
                  <span className="font-semibold text-foreground">${metrics.costPerLead}</span>
                </div>
                <div className="h-3 w-px bg-border hidden sm:block" />
                <div>
                  <span className="text-muted-foreground">Cost per Qualified Lead (CPQL): </span>
                  <span className="font-semibold text-foreground">${metrics.costPerQualifiedLead}</span>
                </div>
                <div className="h-3 w-px bg-border hidden sm:block" />
                <div>
                  <span className="text-muted-foreground">Cost per Vehicle (CPV): </span>
                  <span className="font-semibold text-foreground">${metrics.costPerVehicle}</span>
                </div>
                <div className="h-3 w-px bg-border hidden sm:block" />
                <div>
                  <span className="text-muted-foreground">Cost per Rental (CPR): </span>
                  <span className="font-semibold text-foreground">${metrics.costPerRental}</span>
                </div>
              </div>
              <div className="font-medium text-primary flex items-center gap-1">
                Return on Ad Spend: <span className="font-bold text-base">{metrics.roas}x</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
