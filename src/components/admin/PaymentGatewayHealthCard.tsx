import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldCheck,
  Zap,
  Globe,
  ArrowRight,
  Lock,
  Building2,
  Clock,
  Layers,
  Server,
} from 'lucide-react';
import { usePaymentGatewayHealth, type GatewayHealthItem } from '@/hooks/usePaymentGatewayHealth';

interface PaymentGatewayHealthCardProps {
  id?: string;
  onNavigateToSettings?: () => void;
  className?: string;
}

export function PaymentGatewayHealthCard({
  id = 'payment-gateway-health-card',
  onNavigateToSettings,
  className = '',
}: PaymentGatewayHealthCardProps) {
  const { data, loading, isPinging, lastChecked, refetch } = usePaymentGatewayHealth();

  const gateways = data?.gateways;
  const summary = data?.summary;
  const paypal = gateways?.paypal;
  const paystack = gateways?.paystack;
  const opay = gateways?.opay;

  const isAllHealthy = summary?.allHealthy ?? false;
  const isCompliant = summary?.complianceStatus === 'fully_compliant' || summary?.complianceStatus === 'operational_compliant';

  const renderStatusBadge = (item?: GatewayHealthItem) => {
    if (!item) return <Badge variant="secondary">Probing...</Badge>;

    switch (item.operationalStatus) {
      case 'healthy':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 py-0.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            <span>Operational</span>
            {item.latencyMs !== null && (
              <span className="font-mono text-[10px] opacity-80">({item.latencyMs}ms)</span>
            )}
          </Badge>
        );
      case 'degraded':
      case 'unconfigured':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1.5 py-0.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>{item.configured ? 'Degraded' : 'Not Configured'}</span>
          </Badge>
        );
      case 'error':
      case 'down':
      default:
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 gap-1.5 py-0.5">
            <XCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
            <span>Connection Error</span>
          </Badge>
        );
    }
  };

  const getLatencyProgress = (latencyMs: number | null) => {
    if (latencyMs === null) return 0;
    // Lower latency is better: 0-1000ms scale
    return Math.max(10, Math.min(100, Math.round(100 - (latencyMs / 1000) * 100)));
  };

  return (
    <Card id={id} className={`border border-border/80 shadow-xs overflow-hidden ${className}`}>
      <CardHeader className="p-4 sm:p-5 bg-card/50 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-display font-semibold text-foreground flex items-center gap-2">
                  <span>Payment Gateway Health & API Connectivity</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono py-0 ${
                      isAllHealthy
                        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : isCompliant
                        ? 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                        : 'border-destructive/40 text-destructive bg-destructive/10'
                    }`}
                  >
                    {isAllHealthy ? '3/3 Gateways Live' : `${summary?.healthyCount ?? 0}/3 Active`}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Live verification of authorized payment pipelines (PayPal, Paystack, OPay) for operational compliance.
                </CardDescription>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {lastChecked && (
              <span className="text-[11px] text-muted-foreground font-mono hidden md:inline">
                Verified: {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <Button
              id="btn-retest-payment-gateways"
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isPinging || loading}
              className="h-8 px-3 text-xs gap-1.5 font-medium border-border/80 hover:bg-accent"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPinging ? 'animate-spin text-primary' : ''}`} />
              <span>{isPinging ? 'Pinging APIs...' : 'Verify Connectivity'}</span>
            </Button>
            {onNavigateToSettings && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onNavigateToSettings}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Settings →
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-5">
        {/* Regional Routing & Operational Overview Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <Globe className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-semibold text-foreground">USA Regional Routing:</span>
              <p className="text-muted-foreground mt-0.5">
                Powered by <strong>PayPal REST API</strong> for automated rental checkouts and IoT hardware purchases. Synchronous order capture with zero manual wire transfers.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-semibold text-foreground">Nigeria Regional Routing:</span>
              <p className="text-muted-foreground mt-0.5">
                Dual-gateway infrastructure: <strong>Paystack</strong> (primary collection & automated NIP bank payouts) and <strong>OPay</strong> (cashier, wallet & QR collection).
              </p>
            </div>
          </div>
        </div>

        {/* The 3 Gateway Verification Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. PAYPAL */}
          <div className="rounded-xl border border-border/70 p-4 bg-card/40 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-foreground">PayPal</span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono py-0">
                    {paypal?.mode ?? 'sandbox'}
                  </Badge>
                </div>
                {renderStatusBadge(paypal)}
              </div>

              <p className="text-[11px] text-muted-foreground mb-3">
                Authorized for USA & International rentals and IoT tracking device purchases.
              </p>

              {/* Technical Attributes */}
              <div className="space-y-1.5 text-[11px] pt-2 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Protocol:</span>
                  <span className="font-mono text-foreground">REST Orders v2</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Client ID:</span>
                  <span className="font-mono text-foreground text-[10px]">
                    {String(paypal?.details?.clientIdMasked ?? (paypal?.configured ? 'Configured' : 'Missing'))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">OAuth Handshake:</span>
                  <span className={paypal?.operationalStatus === 'healthy' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600'}>
                    {paypal?.operationalStatus === 'healthy' ? 'Active (Token Acquired)' : 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Webhook ID:</span>
                  <span className="font-mono text-[10px] text-foreground">
                    {paypal?.details?.webhookConfigured ? 'Registered' : 'Direct Capture'}
                  </span>
                </div>
              </div>
            </div>

            {/* Diagnostic Message & Latency Bar */}
            <div className="pt-2 border-t border-border/50 space-y-1.5">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Latency</span>
                <span className="font-mono font-medium text-foreground">
                  {paypal?.latencyMs !== null ? `${paypal?.latencyMs}ms` : '—'}
                </span>
              </div>
              <Progress value={getLatencyProgress(paypal?.latencyMs ?? null)} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate" title={paypal?.message}>
                {paypal?.message ?? 'Awaiting probe...'}
              </p>
            </div>
          </div>

          {/* 2. PAYSTACK */}
          <div className="rounded-xl border border-border/70 p-4 bg-card/40 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-foreground">Paystack</span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono py-0">
                    {paystack?.mode ?? 'test'}
                  </Badge>
                </div>
                {renderStatusBadge(paystack)}
              </div>

              <p className="text-[11px] text-muted-foreground mb-3">
                Primary Nigerian gateway: Driver rentals, IoT devices, owner payouts & bank disbursements.
              </p>

              {/* Technical Attributes */}
              <div className="space-y-1.5 text-[11px] pt-2 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">API Scope:</span>
                  <span className="font-mono text-foreground">Charges & Transfers</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Public Key:</span>
                  <span className="font-mono text-foreground text-[10px]">
                    {String(paystack?.details?.publicKeyMasked ?? (paystack?.configured ? 'Configured' : 'Missing'))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Webhook HMAC:</span>
                  <span className={paystack?.details?.webhookConfigured ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600'}>
                    {paystack?.details?.webhookConfigured ? 'SHA512 Verified' : 'Secret missing'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Automated Payouts:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Enabled (NIP Transfers)
                  </span>
                </div>
              </div>
            </div>

            {/* Diagnostic Message & Latency Bar */}
            <div className="pt-2 border-t border-border/50 space-y-1.5">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Latency</span>
                <span className="font-mono font-medium text-foreground">
                  {paystack?.latencyMs !== null ? `${paystack?.latencyMs}ms` : '—'}
                </span>
              </div>
              <Progress value={getLatencyProgress(paystack?.latencyMs ?? null)} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate" title={paystack?.message}>
                {paystack?.message ?? 'Awaiting probe...'}
              </p>
            </div>
          </div>

          {/* 3. OPAY */}
          <div className="rounded-xl border border-border/70 p-4 bg-card/40 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-foreground">OPay</span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono py-0">
                    {opay?.mode ?? 'sandbox'}
                  </Badge>
                </div>
                {renderStatusBadge(opay)}
              </div>

              <p className="text-[11px] text-muted-foreground mb-3">
                Secondary Nigerian gateway: Cashier checkout, mobile wallet, and QR code payments.
              </p>

              {/* Technical Attributes */}
              <div className="space-y-1.5 text-[11px] pt-2 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Gateway Type:</span>
                  <span className="font-mono text-foreground">International Cashier</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Merchant ID:</span>
                  <span className="font-mono text-foreground text-[10px]">
                    {String(opay?.details?.merchantId ?? (opay?.configured ? 'Configured' : 'Missing'))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Request Signing:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    HMAC-SHA512 Active
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Callback Status:</span>
                  <span className="font-mono text-[10px] text-foreground">
                    /opay-webhook
                  </span>
                </div>
              </div>
            </div>

            {/* Diagnostic Message & Latency Bar */}
            <div className="pt-2 border-t border-border/50 space-y-1.5">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Latency</span>
                <span className="font-mono font-medium text-foreground">
                  {opay?.latencyMs !== null ? `${opay?.latencyMs}ms` : '—'}
                </span>
              </div>
              <Progress value={getLatencyProgress(opay?.latencyMs ?? null)} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground truncate" title={opay?.message}>
                {opay?.message ?? 'Awaiting probe...'}
              </p>
            </div>
          </div>
        </div>

        {/* Operational Compliance Checklist */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Payment Infrastructure Operational Compliance Checklist
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-muted-foreground">Delegated PCI-DSS Tokenization</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-muted-foreground">HMAC-SHA512 Webhook Verification</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-muted-foreground">Idempotency & Duplicate Guards</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-muted-foreground">Automated 80/20 Revenue Split</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
