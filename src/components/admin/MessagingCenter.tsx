import { useState, useEffect } from 'react';
import { MessageSquare, PenSquare, FileText, Bell, Activity, Radio, Layers } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AdminMessageConsole } from '@/components/admin/messaging/AdminMessageConsole';
import { MessageComposer } from '@/components/admin/MessageComposer';
import { CannedRepliesManager } from '@/components/admin/CannedRepliesManager';
import TwilioTemplateManager from '@/components/admin/TwilioTemplateManager';
import { InboxNotificationSettings } from '@/components/admin/InboxNotificationSettings';
import OutboundDeliveryLogPanel from '@/components/admin/OutboundDeliveryLogPanel';
import { MessagingGatewaysPanel } from '@/components/admin/messaging/MessagingGatewaysPanel';
import { BulkMessageStatusTracker } from '@/components/admin/messaging/BulkMessageStatusTracker';
import { useAssistantPermissions } from '@/hooks/useAssistantPermissions';

interface MessagingCenterProps {
  initialTab?: string;
  onTabChange?: (tab: string) => void;
}

/**
 * Central Messaging Center & Admin Console:
 * Unified hub featuring:
 * 1. Message Reader, Live Drafting & Replying Console (Emails, SMS, WhatsApp)
 * 2. Outbound Message Editor (Omnichannel Composer)
 * 3. Bulk Message Status Tracker & Selective Retry Engine
 * 4. Canned Responses & Meta WhatsApp HSM Templates
 * 5. Real-time Outbound Delivery Log & Audit
 * 6. Messaging Gateways & Alert Notification Rules
 */
export function MessagingCenter({ initialTab = 'console', onTabChange }: MessagingCenterProps) {
  const [tab, setTab] = useState(initialTab);
  const [failedCount, setFailedCount] = useState(0);
  const { isFullAdmin, perms, loading } = useAssistantPermissions();
  // Full admins always compose; assistants need the send-communications grant.
  const canCompose = loading || isFullAdmin || !!perms?.can_send_communications;

  useEffect(() => {
    if (initialTab && initialTab !== tab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  // Read failed count from bulk tracker storage
  useEffect(() => {
    const updateFailedCount = () => {
      try {
        const raw = localStorage.getItem('rentmaikar_bulk_tracker_items');
        if (raw) {
          const parsed = JSON.parse(raw);
          const failed = Array.isArray(parsed)
            ? parsed.filter((i: any) => i.status === 'failed').length
            : 0;
          setFailedCount(failed);
        }
      } catch {
        /* storage unavailable */
      }
    };

    updateFailedCount();
    window.addEventListener('comms_activity_update', updateFailedCount);
    return () => window.removeEventListener('comms_activity_update', updateFailedCount);
  }, []);

  const handleTabChange = (nextTab: string) => {
    setTab(nextTab);
    onTabChange?.(nextTab);
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList className="flex w-full flex-wrap justify-start gap-1 p-1 bg-muted/60 rounded-xl border">
        <TabsTrigger value="console" className="gap-2 text-xs">
          <MessageSquare className="h-4 w-4" /> Message Console
        </TabsTrigger>
        {canCompose && (
          <TabsTrigger value="compose" className="gap-2 text-xs">
            <PenSquare className="h-4 w-4" /> Message Editor
          </TabsTrigger>
        )}
        <TabsTrigger value="bulk-tracker" className="gap-2 text-xs">
          <Layers className="h-4 w-4" /> Bulk Tracker
          {failedCount > 0 && (
            <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px] h-4">
              {failedCount}
            </Badge>
          )}
        </TabsTrigger>
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
        <AdminMessageConsole onComposeNew={() => handleTabChange('compose')} />
      </TabsContent>

      {/* Upgraded Message Editor */}
      {canCompose && (
        <TabsContent value="compose" className="mt-0">
          <MessageComposer onSent={() => handleTabChange('console')} />
        </TabsContent>
      )}

      {/* Bulk Message Status Tracker & Retry Mechanism */}
      <TabsContent value="bulk-tracker" className="mt-0">
        <BulkMessageStatusTracker />
      </TabsContent>

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
