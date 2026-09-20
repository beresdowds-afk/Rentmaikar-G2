import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Facebook, Chrome, Globe, Linkedin, 
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, 
  ExternalLink, Clock
} from 'lucide-react';
import { toast } from 'sonner';

export interface ProviderStatus {
  platform: 'meta' | 'google' | 'tiktok' | 'linkedin';
  displayName: string;
  status: 'connected' | 'not_connected' | 'error' | 'expired';
  accountId: string | null;
  accountName: string | null;
  lastSynchronized: string | null;
  apiStatus: string;
  error?: string;
  capabilities: string[];
}

const PROVIDER_METADATA = {
  meta: {
    icon: Facebook,
    color: 'bg-blue-600 text-white',
    help: 'Meta Marketing API & Conversions API (CAPI)',
  },
  google: {
    icon: Chrome,
    color: 'bg-emerald-600 text-white',
    help: 'Google Ads API, Enhanced Conversions & GAQL',
  },
  tiktok: {
    icon: Globe,
    color: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
    help: 'TikTok Marketing API v1.3 & Events API',
  },
  linkedin: {
    icon: Linkedin,
    color: 'bg-blue-700 text-white',
    help: 'LinkedIn Marketing Platform & Conversions API',
  },
};

export function MarketingProviderStatusCard() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatuses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/providers/status');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.providers)) {
        setProviders(data.providers);
      }
    } catch (err: any) {
      console.warn('Failed to fetch marketing provider status:', err.message);
      // Fallback: accurately present NOT CONNECTED state if server or keys unavailable
      setProviders([
        {
          platform: 'meta',
          displayName: 'Meta (Facebook & Instagram)',
          status: 'not_connected',
          accountId: null,
          accountName: null,
          lastSynchronized: null,
          apiStatus: 'NOT CONNECTED (META_ACCESS_TOKEN not configured)',
          capabilities: ['Marketing API', 'Conversions API (CAPI)', 'Ad Sets', 'Webhooks'],
        },
        {
          platform: 'google',
          displayName: 'Google Ads',
          status: 'not_connected',
          accountId: null,
          accountName: null,
          lastSynchronized: null,
          apiStatus: 'NOT CONNECTED (GOOGLE_ADS_DEVELOPER_TOKEN not configured)',
          capabilities: ['Search Campaigns', 'Performance Max', 'Enhanced Conversions', 'GAQL'],
        },
        {
          platform: 'tiktok',
          displayName: 'TikTok Ads',
          status: 'not_connected',
          accountId: null,
          accountName: null,
          lastSynchronized: null,
          apiStatus: 'NOT CONNECTED (TIKTOK_ACCESS_TOKEN not configured)',
          capabilities: ['Campaigns', 'Events API', 'Spark Ads', 'Lead Generation'],
        },
        {
          platform: 'linkedin',
          displayName: 'LinkedIn Ads',
          status: 'not_connected',
          accountId: null,
          accountName: null,
          lastSynchronized: null,
          apiStatus: 'NOT CONNECTED (LINKEDIN_ACCESS_TOKEN not configured)',
          capabilities: ['Sponsored Content', 'Conversions API', 'Lead Gen Forms'],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const getStatusBadge = (status: ProviderStatus['status']) => {
    switch (status) {
      case 'connected':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30 gap-1 font-semibold">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </Badge>
        );
      case 'expired':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/30 gap-1 font-semibold">
            <AlertTriangle className="h-3 w-3" /> Token Expired
          </Badge>
        );
      case 'error':
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 border-rose-500/30 gap-1 font-semibold">
            <XCircle className="h-3 w-3" /> Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1 font-semibold">
            <XCircle className="h-3 w-3 text-muted-foreground/70" /> Not connected
          </Badge>
        );
    }
  };

  const handleOAuthConnect = (platform: 'google' | 'linkedin') => {
    window.location.href = `/api/marketing/oauth/${platform}/authorize`;
  };

  return (
    <Card className="border shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" /> Advertising Platform Connections
            </CardTitle>
            <CardDescription className="text-xs">
              Live server-side adapters for Meta, Google Ads, TikTok, and LinkedIn. Credentials remain strictly server-side.
            </CardDescription>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={fetchStatuses} 
            disabled={loading}
            className="gap-1.5 h-8 text-xs font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {providers.map((p) => {
            const meta = PROVIDER_METADATA[p.platform] || PROVIDER_METADATA.meta;
            const Icon = meta.icon;

            return (
              <div 
                key={p.platform} 
                className="p-3.5 rounded-lg border bg-card/60 hover:bg-card/90 transition-colors flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-md ${meta.color} flex items-center justify-center shrink-0`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm leading-tight">{p.displayName}</h4>
                        <p className="text-[11px] text-muted-foreground">{meta.help}</p>
                      </div>
                    </div>
                    {getStatusBadge(p.status)}
                  </div>

                  <div className="space-y-1.5 text-xs bg-muted/40 p-2.5 rounded-md border border-border/50">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Account:</span>
                      <span className="font-medium text-foreground truncate max-w-[180px]">
                        {p.accountName || p.accountId || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">API Status:</span>
                      <span className="font-mono text-[11px] text-foreground/90 truncate max-w-[200px]" title={p.apiStatus}>
                        {p.apiStatus}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Last synchronized:</span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {p.lastSynchronized ? new Date(p.lastSynchronized).toLocaleString() : 'Never'}
                      </span>
                    </div>
                  </div>

                  {p.capabilities && p.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {p.capabilities.map((cap) => (
                        <span key={cap} className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {p.status === 'connected' ? '● Live Sync Active' : '○ Standby / Disconnected'}
                  </span>
                  {(p.platform === 'google' || p.platform === 'linkedin') && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 text-xs gap-1 px-2 text-primary"
                      onClick={() => handleOAuthConnect(p.platform as 'google' | 'linkedin')}
                    >
                      OAuth Connect <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  {(p.platform === 'meta' || p.platform === 'tiktok') && p.status !== 'connected' && (
                    <span className="text-[11px] text-muted-foreground">
                      Configure env secrets
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
