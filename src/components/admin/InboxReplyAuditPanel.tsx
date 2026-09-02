import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, History, Loader2, Zap, MessageSquareText, TimerReset } from 'lucide-react';
import { useInboxReplyAudit } from '@/hooks/useInboxReplyAudit';

const cooldownLabel = (entry: { cooldown_status: string; cooldown_minutes: number | null; cooldown_remaining_minutes: number | null }) => {
  switch (entry.cooldown_status) {
    case 'suppressed':
      return `Cooldown active — ${Math.max(0, Math.round(entry.cooldown_remaining_minutes ?? 0))}m left`;
    case 'elapsed':
      return `Cooldown elapsed (${entry.cooldown_minutes ?? 0}m)`;
    default:
      return 'No cooldown';
  }
};

export const InboxReplyAuditPanel = ({ conversationId }: { conversationId: string }) => {
  const { entries, isLoading } = useInboxReplyAudit(conversationId);

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <History className="h-3.5 w-3.5 mr-1" />
          Reply audit log ({entries.length})
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border bg-muted/30">
          {isLoading ? (
            <div className="p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No canned or automatic replies have been triggered on this thread yet.
            </p>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="divide-y">
                {entries.map((e) => (
                  <div key={e.id} className="p-3 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {e.reply_type === 'auto' ? (
                        <Zap className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <MessageSquareText className="h-3.5 w-3.5 text-primary" />
                      )}
                      <span className="font-medium">
                        {e.reply_type === 'auto' ? e.rule_name || 'Auto-reply rule' : e.canned_reply_title || 'Canned reply'}
                      </span>
                      <Badge variant="outline">{e.reply_type === 'auto' ? 'Auto-reply' : 'Canned reply'}</Badge>
                      <Badge variant="secondary">{e.channel}</Badge>
                      {e.match_type && <Badge variant="outline">match: {e.match_type}</Badge>}
                      <Badge variant={e.delivered ? 'default' : 'destructive'}>
                        {e.delivered ? 'Delivered' : e.cooldown_status === 'suppressed' ? 'Not sent' : 'Failed'}
                      </Badge>
                      <span className="ml-auto text-muted-foreground">
                        {format(new Date(e.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>

                    {e.matched_keywords?.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Matched keywords: {e.matched_keywords.join(', ')}
                      </p>
                    )}

                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TimerReset className="h-3 w-3" />
                      {cooldownLabel(e)}
                    </p>

                    {e.body_preview && (
                      <p className="text-xs whitespace-pre-wrap line-clamp-3">{e.body_preview}</p>
                    )}
                    {e.error_message && (
                      <p className="text-xs text-destructive">{e.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default InboxReplyAuditPanel;
