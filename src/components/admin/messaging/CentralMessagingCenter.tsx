import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Inbox,
  Send,
  FileText,
  Sparkles,
  Bot,
  Radio,
  BarChart2,
  Settings,
  Mail,
  Phone,
  MessageSquare,
  AlertCircle,
  Clock,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Users,
  Search,
} from 'lucide-react';
import { useInboxConversations } from '@/hooks/useUnifiedInbox';
import { useInboxAlerts } from '@/hooks/useInboxAlerts';
import { getSlaInfo } from '@/lib/inbox-sla';
import { useNowTick } from '@/components/admin/InboxSlaBadge';
import { OmnichannelComposer } from './OmnichannelComposer';
import { DraftsManager, getStoredDrafts } from './DraftsManager';
import { MessagingGatewaysPanel } from './MessagingGatewaysPanel';
import { CannedRepliesManager } from '@/components/admin/CannedRepliesManager';
import { AutoReplyPriorityEditor } from '@/components/admin/AutoReplyPriorityEditor';
import { AutoReplyPreview } from '@/components/admin/AutoReplyPreview';
import { AutoReplyTestMode } from '@/components/admin/AutoReplyTestMode';
import { AttachmentAccessLogPanel } from '@/components/admin/AttachmentAccessLogPanel';
import { InboxNotificationSettings } from '@/components/admin/InboxNotificationSettings';
import { InboxReplyAuditPanel } from '@/components/admin/InboxReplyAuditPanel';
import { AdminUnifiedInboxCore } from '@/components/admin/AdminUnifiedInboxCore';
import type { SavedDraft, MessagingChannel } from './types';

export const CentralMessagingCenter = () => {
  useInboxAlerts();
  const { conversations, isLoading } = useInboxConversations();
  const nowTick = useNowTick();

  const [activeTab, setActiveTab] = useState<
    'inbox' | 'compose' | 'drafts' | 'templates' | 'auto-reply' | 'gateways' | 'audit' | 'settings'
  >('inbox');

  const [activeDraft, setActiveDraft] = useState<SavedDraft | null>(null);
  const [draftsCount, setDraftsCount] = useState<number>(0);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Update drafts count
  const refreshDraftsCount = () => {
    setDraftsCount(getStoredDrafts().length);
  };

  useEffect(() => {
    refreshDraftsCount();
    const handleStorage = () => refreshDraftsCount();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Compute metrics
  const unreadTotal = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  }, [conversations]);

  const overdueCount = useMemo(() => {
    return conversations.filter((c) => getSlaInfo(c, nowTick).state === 'overdue').length;
  }, [conversations, nowTick]);

  const channelStats = useMemo(() => {
    return {
      email: conversations.filter((c) => c.channel === 'email').length,
      sms: conversations.filter((c) => c.channel === 'sms').length,
      whatsapp: conversations.filter((c) => c.channel === 'whatsapp').length,
    };
  }, [conversations]);

  // Handlers for switching views
  const handleSelectDraft = (draft: SavedDraft) => {
    setActiveDraft(draft);
    setActiveTab('compose');
  };

  const handleNewDraft = (channel?: MessagingChannel) => {
    setActiveDraft(
      channel
        ? {
            id: `draft_${Date.now()}`,
            channel,
            recipientMode: 'search',
            recipientName: '',
            recipientEmail: '',
            recipientPhone: '',
            content: '',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }
        : null
    );
    setActiveTab('compose');
  };

  const handleMessageDispatched = (conversationId: string) => {
    refreshDraftsCount();
    setSelectedConversationId(conversationId);
    setActiveTab('inbox');
  };

  return (
    <div className="space-y-6">
      {/* Master Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Central Messaging Center
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-normal">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Omnichannel Active
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground">
                Unified messaging command center: Email, SMS, WhatsApp, Live Drafting, Canned Replies & Gateways.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions & High-level KPIs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1 px-2.5 py-1 font-medium">
              <Mail className="h-3.5 w-3.5 text-blue-500" /> {channelStats.email} Email
            </Badge>
            <Badge variant="secondary" className="gap-1 px-2.5 py-1 font-medium">
              <Phone className="h-3.5 w-3.5 text-green-500" /> {channelStats.sms} SMS
            </Badge>
            <Badge variant="secondary" className="gap-1 px-2.5 py-1 font-medium">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-500" /> {channelStats.whatsapp} WhatsApp
            </Badge>
          </div>

          <Button
            size="sm"
            onClick={() => handleNewDraft()}
            className="gap-1.5 h-9 px-4 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Compose Message
          </Button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-10 p-1 w-full justify-start md:w-auto bg-muted/70">
            <TabsTrigger value="inbox" className="text-xs gap-1.5 px-3">
              <Inbox className="h-3.5 w-3.5 text-primary" />
              Inbox & Threads
              {unreadTotal > 0 && (
                <Badge className="h-4 px-1 text-[10px] ml-1 bg-primary text-primary-foreground">
                  {unreadTotal}
                </Badge>
              )}
              {overdueCount > 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px] ml-0.5">
                  {overdueCount} SLA
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="compose" className="text-xs gap-1.5 px-3">
              <Send className="h-3.5 w-3.5 text-blue-500" />
              Compose & Send
            </TabsTrigger>

            <TabsTrigger value="drafts" className="text-xs gap-1.5 px-3">
              <FileText className="h-3.5 w-3.5 text-amber-500" />
              Saved Drafts
              {draftsCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                  {draftsCount}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="templates" className="text-xs gap-1.5 px-3">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              Canned Replies
            </TabsTrigger>

            <TabsTrigger value="auto-reply" className="text-xs gap-1.5 px-3">
              <Bot className="h-3.5 w-3.5 text-emerald-500" />
              Auto-Reply Rules
            </TabsTrigger>

            <TabsTrigger value="gateways" className="text-xs gap-1.5 px-3">
              <Radio className="h-3.5 w-3.5 text-indigo-500" />
              Gateways & Diagnostics
            </TabsTrigger>

            <TabsTrigger value="audit" className="text-xs gap-1.5 px-3">
              <BarChart2 className="h-3.5 w-3.5 text-slate-500" />
              SLA & Audit Logs
            </TabsTrigger>

            <TabsTrigger value="settings" className="text-xs gap-1.5 px-3">
              <Settings className="h-3.5 w-3.5" />
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Live Inbox & Threads */}
        <TabsContent value="inbox" className="space-y-4 m-0 focus-visible:outline-none">
          <AdminUnifiedInboxCore
            initialSelectedConversationId={selectedConversationId}
            onComposeNew={() => handleNewDraft()}
          />
        </TabsContent>

        {/* Tab 2: Omnichannel Composer */}
        <TabsContent value="compose" className="space-y-4 m-0 focus-visible:outline-none">
          <OmnichannelComposer
            initialDraft={activeDraft}
            onMessageDispatched={handleMessageDispatched}
            onDraftSaved={refreshDraftsCount}
          />
        </TabsContent>

        {/* Tab 3: Saved Drafts */}
        <TabsContent value="drafts" className="space-y-4 m-0 focus-visible:outline-none">
          <DraftsManager
            onSelectDraft={handleSelectDraft}
            onNewDraft={handleNewDraft}
          />
        </TabsContent>

        {/* Tab 4: Canned Replies & Templates */}
        <TabsContent value="templates" className="space-y-4 m-0 focus-visible:outline-none">
          <CannedRepliesManager />
        </TabsContent>

        {/* Tab 5: Auto-Reply Rules & Test Mode */}
        <TabsContent value="auto-reply" className="space-y-6 m-0 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              <AutoReplyPriorityEditor />
            </div>
            <div className="lg:col-span-5 space-y-6">
              <AutoReplyPreview />
              <AutoReplyTestMode />
            </div>
          </div>
        </TabsContent>

        {/* Tab 6: Gateways & Diagnostics */}
        <TabsContent value="gateways" className="space-y-4 m-0 focus-visible:outline-none">
          <MessagingGatewaysPanel />
        </TabsContent>

        {/* Tab 7: SLA & Audit Logs */}
        <TabsContent value="audit" className="space-y-6 m-0 focus-visible:outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  Reply Audit & Canned Usage
                </CardTitle>
                <CardDescription className="text-xs">
                  Historical telemetry and staff response metrics.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <InboxReplyAuditPanel />
              </CardContent>
            </Card>

            <AttachmentAccessLogPanel />
          </div>
        </TabsContent>

        {/* Tab 8: Settings */}
        <TabsContent value="settings" className="space-y-4 m-0 focus-visible:outline-none">
          <InboxNotificationSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CentralMessagingCenter;
