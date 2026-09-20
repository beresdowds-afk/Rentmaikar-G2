import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Phone, 
  Mail, 
  PhoneCall, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ShieldCheck, 
  ExternalLink,
  Radio,
  Clock,
  Sparkles,
  Zap,
  Globe,
  Share2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProviderStatusInfo } from '@/server/marketing/types';
import { useToast } from '@/hooks/use-toast';

export const MarketingCommunicationsHub: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState<ProviderStatusInfo[]>([]);

  // Quick Dispatch Studio state
  const [selectedProvider, setSelectedProvider] = useState<'sentdm' | 'twilio' | 'resend' | 'manychat'>('sentdm');
  const [selectedChannel, setSelectedChannel] = useState<'sms' | 'whatsapp' | 'email' | 'call'>('sms');
  const [destination, setDestination] = useState('');
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchStatuses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/communications/status');
      if (res.ok) {
        const json = await res.json();
        setStatuses(json.providers || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const handleQuickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) {
      toast({
        title: 'Missing recipient',
        description: 'Provide a destination phone number or email address.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedChannel !== 'call' && !messageText.trim()) {
      toast({
        title: 'Missing content',
        description: 'Please write a message to dispatch.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/marketing/communications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          channel: selectedChannel,
          to: destination.trim(),
          text: messageText.trim(),
          subject: subject.trim() || 'RentMaikar Notification',
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: 'Dispatch successful',
          description: `Dispatched via ${selectedProvider.toUpperCase()} (${data.externalId || 'queued'})`,
        });
        setMessageText('');
        setSubject('');
      } else {
        throw new Error(data.error || 'Dispatch returned failure');
      }
    } catch (err: any) {
      toast({
        title: 'Dispatch failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const getProviderIcon = (platform: string) => {
    switch (platform) {
      case 'manychat':
        return <Share2 className="h-5 w-5 text-blue-500" />;
      case 'sentdm':
        return <MessageSquare className="h-5 w-5 text-emerald-500" />;
      case 'twilio':
        return <Phone className="h-5 w-5 text-rose-500" />;
      case 'resend':
        return <Mail className="h-5 w-5 text-amber-500" />;
      default:
        return <Radio className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            Marketing Communications Hub
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
              Omnichannel Gateway
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unified control for ManyChat social automation, SENT.dm SMS/WhatsApp, Twilio Voice VoIP, and Resend email via notify.rentmaikar.com.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatuses}
          disabled={loading}
          className="h-9 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Providers
        </Button>
      </div>

      {/* 4 Provider Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statuses.length === 0 ? (
          <div className="col-span-4 py-8 text-center text-xs text-muted-foreground border rounded-lg">
            Checking communications infrastructure status...
          </div>
        ) : (
          statuses.map((item) => (
            <Card key={item.platform} className="shadow-sm border-border flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    {getProviderIcon(item.platform)}
                  </div>
                  <Badge
                    variant={item.status === 'connected' ? 'default' : item.status === 'error' ? 'destructive' : 'secondary'}
                    className={`text-[10px] font-semibold uppercase ${
                      item.status === 'connected'
                        ? 'bg-emerald-500 text-white'
                        : item.status === 'not_connected'
                        ? 'bg-muted text-muted-foreground'
                        : ''
                    }`}
                  >
                    {item.status.replace('_', ' ')}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-semibold mt-3">
                  {item.displayName}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {item.apiStatus}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs space-y-2">
                <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                  <span className="font-medium text-foreground">Identifier: </span>
                  <span className="font-mono">{item.accountId || 'Environment Configuration'}</span>
                </div>
                {item.accountName && (
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Account: </span>
                    <span>{item.accountName}</span>
                  </div>
                )}
                <div className="pt-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                    Capabilities
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-[9px] bg-muted/80 text-foreground px-1.5 py-0.5 rounded"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Quick Dispatch Studio & Architecture Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Dispatch Form */}
        <Card className="shadow-sm border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Direct Communication Dispatch Studio
            </CardTitle>
            <CardDescription className="text-xs">
              Execute test dispatches or manual outreach across any configured communication provider with live DLR receipts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleQuickSend} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground block mb-1">Provider Service</label>
                  <Select
                    value={selectedProvider}
                    onValueChange={(v: any) => {
                      setSelectedProvider(v);
                      if (v === 'sentdm') setSelectedChannel('sms');
                      else if (v === 'twilio') setSelectedChannel('call');
                      else if (v === 'resend') setSelectedChannel('email');
                      else if (v === 'manychat') setSelectedChannel('sms');
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sentdm">SENT.dm (SMS & WhatsApp CPaaS)</SelectItem>
                      <SelectItem value="twilio">Twilio (Voice & VoIP)</SelectItem>
                      <SelectItem value="resend">Resend (notify.rentmaikar.com)</SelectItem>
                      <SelectItem value="manychat">ManyChat (Social Messenger & IG DM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1">Channel Medium</label>
                  <Select
                    value={selectedChannel}
                    onValueChange={(v: any) => setSelectedChannel(v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sms">SMS Text Message</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp Message</SelectItem>
                      <SelectItem value="email">Email Notification</SelectItem>
                      <SelectItem value="call">VoIP Call Initiation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-muted-foreground block mb-1">
                  Recipient Destination ({selectedChannel === 'email' ? 'Email Address' : 'Phone Number in E.164'})
                </label>
                <Input
                  placeholder={selectedChannel === 'email' ? 'driver@example.com' : '+2348030000000 or +18320000000'}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {selectedChannel === 'email' && (
                <div>
                  <label className="text-muted-foreground block mb-1">Email Subject</label>
                  <Input
                    placeholder="e.g. Action Required: Complete your RentMaikar driver verification"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              )}

              {selectedChannel !== 'call' ? (
                <div>
                  <label className="text-muted-foreground block mb-1">Message Body</label>
                  <Textarea
                    placeholder="Type dispatch content here..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={4}
                    className="text-xs resize-none"
                  />
                </div>
              ) : (
                <div className="p-3 bg-muted/40 rounded border border-border text-xs text-muted-foreground">
                  Dispatching a VoIP call will bridge the destination number to the RentMaikar call queue via Twilio's master number (<strong className="text-foreground">+1 (848) 203-5389</strong>).
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <span className="text-[11px] text-muted-foreground">
                  Outgoing sender: <strong className="text-foreground">{selectedChannel === 'email' ? 'notify.rentmaikar.com' : 'RentMaikar Verified Sender'}</strong>
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSending}
                  className="h-9 text-xs font-medium"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {isSending ? 'Dispatching...' : 'Dispatch Message'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Operational Guidelines & Compliance Card */}
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Compliance & Protocol Standards
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div className="p-3 bg-muted/30 rounded border border-border space-y-1.5">
              <div className="font-semibold text-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Verified Outbound Domain
              </div>
              <p className="text-[11px]">
                All transactional and marketing campaign emails strictly originate from <strong className="text-foreground">notify.rentmaikar.com</strong> with authenticated SPF, DKIM, and DMARC alignment.
              </p>
            </div>

            <div className="p-3 bg-muted/30 rounded border border-border space-y-1.5">
              <div className="font-semibold text-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Opt-Out & STOP Enforcement
              </div>
              <p className="text-[11px]">
                SENT.dm enforces 10DLC and telecom regulatory compliance. Inbound messages containing keywords like <span className="font-mono text-foreground font-bold">STOP</span>, <span className="font-mono text-foreground font-bold">CANCEL</span>, or <span className="font-mono text-foreground font-bold">UNSUBSCRIBE</span> automatically opt out the recipient.
              </p>
            </div>

            <div className="p-3 bg-muted/30 rounded border border-border space-y-1.5">
              <div className="font-semibold text-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Social DM Automation
              </div>
              <p className="text-[11px]">
                ManyChat handles top-of-funnel inbound queries from Facebook Messenger and Instagram DM, extracting campaign tags and synchronizing verified leads into the RentMaikar pipeline.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
