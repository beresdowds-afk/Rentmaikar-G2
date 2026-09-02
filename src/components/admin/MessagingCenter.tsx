import { useState } from 'react';
import { Inbox, PenSquare, FileText, Bell, Activity } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminUnifiedInbox } from '@/components/admin/AdminUnifiedInbox';
import { MessageComposer } from '@/components/admin/MessageComposer';
import { CannedRepliesManager } from '@/components/admin/CannedRepliesManager';
import TwilioTemplateManager from '@/components/admin/TwilioTemplateManager';
import { InboxNotificationSettings } from '@/components/admin/InboxNotificationSettings';
import OutboundDeliveryLogPanel from '@/components/admin/OutboundDeliveryLogPanel';
import { useAssistantPermissions } from '@/hooks/useAssistantPermissions';



/**
 * Central messaging center: every channel (email, SMS, WhatsApp and social)
 * lives here — reading, replying, composing new outbound messages, templates
 * and alert settings. This replaces the separate inbox-only surfaces.
 */
export function MessagingCenter() {
  const [tab, setTab] = useState('inbox');
  const { isFullAdmin, perms, loading } = useAssistantPermissions();
  // Full admins always compose; assistants need the send-communications grant.
  const canCompose = loading || isFullAdmin || !!perms?.can_send_communications;

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="flex w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="inbox" className="gap-2">
          <Inbox className="h-4 w-4" /> Inbox
        </TabsTrigger>
        {canCompose && (
          <TabsTrigger value="compose" className="gap-2">
            <PenSquare className="h-4 w-4" /> Compose
          </TabsTrigger>
        )}
        <TabsTrigger value="templates" className="gap-2">
          <FileText className="h-4 w-4" /> Templates
        </TabsTrigger>
        <TabsTrigger value="delivery" className="gap-2">
          <Activity className="h-4 w-4" /> Delivery log
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-2">
          <Bell className="h-4 w-4" /> Alerts
        </TabsTrigger>
      </TabsList>

      <TabsContent value="inbox" className="mt-0">
        <AdminUnifiedInbox />
      </TabsContent>

      {canCompose && (
        <TabsContent value="compose" className="mt-0">
          <MessageComposer onSent={() => setTab('inbox')} />
        </TabsContent>
      )}


      <TabsContent value="templates" className="mt-0 space-y-6">
        <CannedRepliesManager />
        <TwilioTemplateManager />
      </TabsContent>

      <TabsContent value="delivery" className="mt-0">
        <OutboundDeliveryLogPanel />
      </TabsContent>

      <TabsContent value="settings" className="mt-0">
        <InboxNotificationSettings />
      </TabsContent>

    </Tabs>
  );
}

export default MessagingCenter;
