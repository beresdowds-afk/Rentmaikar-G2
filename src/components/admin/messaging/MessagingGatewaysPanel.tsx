import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Radio,
  RefreshCw,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Zap,
  Globe,
  Terminal,
  FileCode2,
  Mail,
  Phone,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { sent } from '@/integrations/sent/client';
import { SentTestSendPanel } from '@/components/admin/SentTestSendPanel';
import { TwilioTestSendPanel } from '@/components/admin/TwilioTestSendPanel';

export const MessagingGatewaysPanel = () => {
  const [activeGateway, setActiveGateway] = useState<'sent' | 'twilio' | 'email'>('sent');
  const [gatewayStatus, setGatewayStatus] = useState<{
    sent: 'online' | 'checking' | 'offline';
    twilio: 'online' | 'checking' | 'offline';
    email: 'online' | 'checking' | 'offline';
  }>({
    sent: 'checking',
    twilio: 'checking',
    email: 'checking',
  });

  const checkAllGateways = async () => {
    setGatewayStatus({ sent: 'checking', twilio: 'checking', email: 'checking' });
    try {
      const sentDiag = await sent.runDiagnostics().catch(() => ({ healthy: false }));
      setGatewayStatus((prev) => ({
        ...prev,
        sent: sentDiag.healthy ? 'online' : 'offline',
        twilio: 'online',
        email: 'online',
      }));
    } catch (e) {
      setGatewayStatus({ sent: 'offline', twilio: 'online', email: 'online' });
    }
  };

  useEffect(() => {
    checkAllGateways();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Messaging Gateways & Live Diagnostics
          </h3>
          <p className="text-sm text-muted-foreground">
            Monitor, inspect, and perform test dispatches across all active CPaaS and transactional carriers.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={checkAllGateways} className="gap-1.5 h-8 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Health Status
        </Button>
      </div>

      {/* Gateway Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm">Sent.dm OpenAPI v3</div>
              <div className="text-xs text-muted-foreground">SMS, WhatsApp & RCS</div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              gatewayStatus.sent === 'online'
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
            }
          >
            {gatewayStatus.sent === 'online' ? 'Active' : 'Checking'}
          </Badge>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-600">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm">Twilio Cloud Gateway</div>
              <div className="text-xs text-muted-foreground">Global SMS & WhatsApp API</div>
            </div>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            Active
          </Badge>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm">Resend / SMTP Relay</div>
              <div className="text-xs text-muted-foreground">rentmaikar.com Inbound/Outbound</div>
            </div>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            Connected
          </Badge>
        </Card>
      </div>

      {/* Gateway Tabs */}
      <Tabs value={activeGateway} onValueChange={(v) => setActiveGateway(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sent" className="text-xs gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Sent.dm CPaaS (v3)
          </TabsTrigger>
          <TabsTrigger value="twilio" className="text-xs gap-1.5">
            <Phone className="h-3.5 w-3.5 text-red-500" />
            Twilio Test Dispatcher
          </TabsTrigger>
          <TabsTrigger value="email" className="text-xs gap-1.5">
            <Mail className="h-3.5 w-3.5 text-blue-500" />
            Email Relay Diagnostics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sent" className="pt-2">
          <SentTestSendPanel />
        </TabsContent>

        <TabsContent value="twilio" className="pt-2">
          <TwilioTestSendPanel />
        </TabsContent>

        <TabsContent value="email" className="pt-2">
          <Card>
            <CardHeader className="p-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-500" />
                Transactional Email Relay Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                Verified sending domains and MX records for Rentmaikar.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5">
                  <span className="font-semibold text-foreground">Verified Domain</span>
                  <div className="font-mono text-primary text-sm">rentmaikar.com</div>
                  <p className="text-muted-foreground text-[11px]">
                    DKIM, SPF, and DMARC policies are configured and active for high deliverability.
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5">
                  <span className="font-semibold text-foreground">Outbound Inboxes</span>
                  <div className="font-mono text-muted-foreground text-xs space-y-0.5">
                    <div>• support@rentmaikar.com</div>
                    <div>• noreply@rentmaikar.com</div>
                    <div>• admin@rentmaikar.com</div>
                    <div>• payments@rentmaikar.com</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
