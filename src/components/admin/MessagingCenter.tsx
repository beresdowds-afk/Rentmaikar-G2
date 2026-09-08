import { useState } from 'react';
import { MessageSquare, PenSquare, FileText, Bell, Activity, Radio } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminMessageConsole } from '@/components/admin/messaging/AdminMessageConsole';
import { MessageComposer } from '@/components/admin/MessageComposer';
import { CannedRepliesManager } from '@/components/admin/CannedRepliesManager';
import TwilioTemplateManager from '@/components/admin/TwilioTemplateManager';
import { InboxNotificationSettings } from '@/components/admin/InboxNotificationSettings';
import OutboundDeliveryLogPanel from '@/components/admin/OutboundDeliveryLogPanel';
import { MessagingGatewaysPanel } from '@/components/admin/messaging/MessagingGatewaysPanel';
import { useAssistantPermissions } from '@/hooks/useAssistantPermissions';

/**
 * Central Messaging Center & Admin Console:
 * Unified hub featuring:
 * 1. Message Reader, Live Drafting & Replying Console (Emails, SMS, WhatsApp)
 * 2. Outbound Message Editor (Omnichannel Composer)
 * 3. Canned Responses & Meta WhatsApp HSM Templates
 * 4. Real-time Outbound Delivery Log & Audit
 * 5. Messaging Gateways & Alert Notification Rules
 */
export function MessagingCenter() {
  const [tab, setTab] = useState('console');
  const { isFullAdmin, perms, loading } = useAssistantPermissions();
  // Full admins always compose; assistants need the send-communications grant.
  const canCompose = loading || isFullAdmin || !!perms?.can_send_communications;

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="flex w-full flex-wrap justify-start gap-1 p-1 bg-muted/60 rounded-xl border">
        <TabsTrigger value="console" className="gap-2 text-xs">
          <MessageSquare className="h-4 w-4" /> Message Console
        </TabsTrigger>
        {canCompose && (
          <TabsTrigger value="compose" className="gap-2 text-xs">
            <PenSquare className="h-4 w-4" /> Message Editor
          </TabsTrigger>
        )}
        <TabsTrigger value="templates" className="gap-2 text-xs">
          <FileText className="h-4 w-4" /> Canned Replies & HSM
        </TabsTrigger>
        <TabsTrigger value="delivery" className="gap-2 text-xs">
          <Activity className="h-4 w-4" /> Delivery Log
        </TabsTrigger>
        <TabsTrigger value="gateways" className="gap-2 text-xs">
          <Radio className="h-4 w-4" /> Gateway Status
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-2 text-xs">
          <Bell className="h-4 w-4" /> Alerts & Settings
        </TabsTrigger>
      </TabsList>

      {/* Primary Message Console: Reader, Drafting & Replying */}
      <TabsContent value="console" className="mt-0">
        <AdminMessageConsole onComposeNew={() => setTab('compose')} />
      </TabsContent>

      {/* Upgraded Message Editor */}
      {canCompose && (
        <TabsContent value="compose" className="mt-0">
          <MessageComposer onSent={() => setTab('console')} />
        </TabsContent>
      )}

      {/* Templates: Canned & WhatsApp HSM */}
      <TabsContent value="templates" className="mt-0 space-y-6">
        <CannedRepliesManager />
        <TwilioTemplateManager />
      </TabsContent>

      {/* Delivery Log */}
      <TabsContent value="delivery" className="mt-0">
        <OutboundDeliveryLogPanel />
      </TabsContent>

      {/* Gateways Status */}
      <TabsContent value="gateways" className="mt-0">
        <MessagingGatewaysPanel />
      </TabsContent>

      {/* Settings & Alerts */}
      <TabsContent value="settings" className="mt-0">
        <InboxNotificationSettings />
      </TabsContent>
    </Tabs>
  );
}

export default MessagingCenter;
