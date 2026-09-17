import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Mail,
  Smartphone,
  Sparkles,
  Search,
  Loader2,
  CheckCircle2,
  FileText,
  User,
  BellRing,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useCommunicationsHub } from './CommunicationsHubContext';

type MessageChannel = 'sms' | 'whatsapp' | 'email' | 'in_app';

interface QuickTemplate {
  id: string;
  title: string;
  channel: MessageChannel;
  subject?: string;
  body: string;
}

const TEMPLATES: QuickTemplate[] = [
  {
    id: 'inspection_due',
    title: 'Weekly Inspection Reminder',
    channel: 'sms',
    body: 'Rentmaikar Alert: Your weekly vehicle inspection is due within 24 hours. Please complete your check via your driver dashboard to avoid dispatch holds.',
  },
  {
    id: 'document_update',
    title: 'Document Update Required',
    channel: 'sms',
    body: 'Rentmaikar Admin: Please upload an updated driver license or insurance card to maintain active status on the platform.',
  },
  {
    id: 'payout_processed',
    title: 'Owner Payout Released',
    channel: 'email',
    subject: 'Your Rentmaikar Payout Has Been Initiated',
    body: 'Hello, your weekly rental revenue disbursement has been initiated to your designated bank account. You can view the full ledger breakdown in your Owner Dashboard.',
  },
  {
    id: 'urgent_checkin',
    title: 'Urgent Admin Check-in',
    channel: 'whatsapp',
    body: 'Hello from Rentmaikar Admin Team. Please check in with dispatch regarding your active vehicle assignment at your earliest convenience.',
  },
  {
    id: 'in_app_notice',
    title: 'Platform System Notice',
    channel: 'in_app',
    subject: 'Account Notice from Administration',
    body: 'Admin update: Please review the latest schedule policy in your dashboard. Contact support if you have any questions.',
  },
];

export const HubMessageComposer: React.FC = () => {
  const { user } = useAuth();
  const { prefillRecipient, clearPrefill } = useCommunicationsHub();

  const [channel, setChannel] = useState<MessageChannel>('sms');
  const [recipientName, setRecipientName] = useState('');
  const [recipientContact, setRecipientContact] = useState('');
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Search directory
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Handle prefill
  useEffect(() => {
    if (prefillRecipient) {
      if (prefillRecipient.name) setRecipientName(prefillRecipient.name);
      if (prefillRecipient.userId) setRecipientUserId(prefillRecipient.userId);
      if (prefillRecipient.subject) setSubject(prefillRecipient.subject);
      if (prefillRecipient.suggestedBody) setBody(prefillRecipient.suggestedBody);

      if (prefillRecipient.defaultChannel) {
        setChannel(prefillRecipient.defaultChannel);
      }

      if (channel === 'email' && prefillRecipient.email) {
        setRecipientContact(prefillRecipient.email);
      } else if (prefillRecipient.phone) {
        setRecipientContact(prefillRecipient.phone);
      } else if (prefillRecipient.email) {
        setRecipientContact(prefillRecipient.email);
        setChannel('email');
      }
    }
  }, [prefillRecipient, channel]);

  // Adjust contact field when channel changes
  const handleChannelChange = (newChan: MessageChannel) => {
    setChannel(newChan);
    if (prefillRecipient) {
      if (newChan === 'email' && prefillRecipient.email) {
        setRecipientContact(prefillRecipient.email);
      } else if (prefillRecipient.phone) {
        setRecipientContact(prefillRecipient.phone);
      }
    }
  };

  // Search user directory
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
          .limit(5);

        if (error) throw error;
        setSearchResults(profiles || []);
      } catch (err) {
        console.error('Directory lookup error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectUser = (u: any) => {
    setRecipientUserId(u.user_id);
    setRecipientName(u.full_name || u.email || 'User');
    if (channel === 'email') {
      setRecipientContact(u.email || '');
    } else {
      setRecipientContact(u.phone || u.email || '');
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleApplyTemplate = (tpl: QuickTemplate) => {
    setChannel(tpl.channel);
    if (tpl.subject) setSubject(tpl.subject);
    setBody(tpl.body);
  };

  const handleSendMessage = async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast.error('Please enter a message body');
      return;
    }

    if (channel !== 'in_app' && !recipientContact.trim()) {
      toast.error(`Please provide a recipient ${channel === 'email' ? 'email' : 'phone number'}`);
      return;
    }

    setIsSending(true);
    try {
      if (channel === 'in_app') {
        if (!recipientUserId) {
          toast.error('Select a specific registered user for in-app messaging');
          setIsSending(false);
          return;
        }

        const { error } = await supabase.from('in_app_messages' as never).insert({
          recipient_id: recipientUserId,
          sender_name: 'Rentmaikar Admin',
          category: 'admin_broadcast',
          subject: subject.trim() || 'Notice from Rentmaikar Admin',
          body: trimmedBody,
        } as never);

        if (error) throw error;
        toast.success('In-app message sent to user inbox');
      } else if (channel === 'email') {
        const { data, error } = await supabase.functions.invoke('send-outbound-email', {
          body: {
            to: recipientContact.trim(),
            subject: subject.trim() || 'Notice from Rentmaikar Admin',
            body: trimmedBody,
            recipientName: recipientName.trim() || undefined,
          },
        });

        if (error) throw error;
        toast.success(`Email dispatched to ${recipientContact.trim()}`);
      } else {
        // SMS or WhatsApp
        const { data, error } = await supabase.functions.invoke('send-sms-notification', {
          body: {
            phone: recipientContact.trim(),
            message: trimmedBody,
            channel: channel === 'whatsapp' ? 'whatsapp' : 'sms',
            recipientName: recipientName.trim() || undefined,
          },
        });

        if (error) throw error;
        toast.success(`${channel.toUpperCase()} message sent to ${recipientContact.trim()}`);
      }

      // Reset fields
      setBody('');
      setSubject('');
      clearPrefill();
    } catch (err: any) {
      console.error('Failed to send message:', err);
      toast.error(err.message || 'Failed to dispatch message via provider');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Channel Switcher */}
      <div className="flex items-center justify-between">
        <Tabs value={channel} onValueChange={(val) => handleChannelChange(val as MessageChannel)} className="w-full">
          <TabsList className="grid grid-cols-4 h-8 bg-muted/60 p-0.5">
            <TabsTrigger value="sms" className="text-xs h-7 gap-1">
              <Smartphone className="h-3 w-3" />
              <span>SMS</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="text-xs h-7 gap-1">
              <MessageSquare className="h-3 w-3 text-emerald-600" />
              <span>WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="email" className="text-xs h-7 gap-1">
              <Mail className="h-3 w-3 text-blue-600" />
              <span>Email</span>
            </TabsTrigger>
            <TabsTrigger value="in_app" className="text-xs h-7 gap-1">
              <BellRing className="h-3 w-3 text-amber-600" />
              <span>In-App</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Recipient Details & Lookup */}
      <div className="space-y-2 relative">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground">Recipient</Label>
          <div className="relative w-48">
            <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find user..."
              className="h-7 pl-7 text-[11px] bg-background"
            />
          </div>
        </div>

        {/* Directory Autocomplete Dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 z-30 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-border/50">
            {searchResults.map((u) => (
              <button
                key={u.user_id}
                type="button"
                onClick={() => handleSelectUser(u)}
                className="w-full text-left px-3 py-2 hover:bg-muted/80 transition flex items-center justify-between text-xs"
              >
                <div className="truncate pr-2">
                  <span className="font-medium text-foreground">{u.full_name || 'User'}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                    {u.phone || u.email}
                  </span>
                </div>
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Name (e.g. John Doe)"
            className="h-8 text-xs bg-background"
          />
          <Input
            value={recipientContact}
            onChange={(e) => setRecipientContact(e.target.value)}
            placeholder={channel === 'email' ? 'email@example.com' : '+1 or +234 phone'}
            className="h-8 text-xs font-mono bg-background"
          />
        </div>
      </div>

      {/* Subject Line (For Email / In-App) */}
      {(channel === 'email' || channel === 'in_app') && (
        <div className="space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">Subject Line</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Action Required: Verification Update"
            className="h-8 text-xs bg-background"
          />
        </div>
      )}

      {/* Message Content & Character Counter */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground">Message Body</Label>
          <span className="text-[10px] text-muted-foreground font-mono">
            {body.length} chars
            {channel === 'sms' && ` (${Math.ceil(body.length / 160) || 1} SMS)`}
          </span>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compose message..."
          rows={4}
          className="text-xs bg-background resize-none"
        />
      </div>

      {/* Quick Templates Selector */}
      <div className="space-y-1 pt-0.5">
        <Label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>Quick Response Templates</span>
        </Label>
        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleApplyTemplate(tpl)}
              className="text-[10px] bg-muted/70 hover:bg-muted text-foreground border border-border/70 rounded-md px-2 py-0.5 transition truncate max-w-[200px]"
              title={tpl.body}
            >
              {tpl.title}
            </button>
          ))}
        </div>
      </div>

      {/* Send Action */}
      <div className="pt-1">
        <Button
          type="button"
          onClick={handleSendMessage}
          disabled={isSending || !body.trim()}
          className="w-full h-9 text-xs font-medium gap-2 bg-primary text-primary-foreground"
        >
          {isSending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Transmitting...</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>Send via {channel.toUpperCase()}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
