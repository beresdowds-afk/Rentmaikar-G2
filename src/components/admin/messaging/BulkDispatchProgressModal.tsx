import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Send,
  Users,
  Mail,
  Phone,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import type { BulkSendResult, MessagingChannel } from './types';

interface BulkDispatchProgressModalProps {
  isOpen: boolean;
  isSending: boolean;
  channel: MessagingChannel;
  progress: {
    current: number;
    total: number;
    succeeded: number;
    failed: number;
    activeName: string;
  };
  results: BulkSendResult | null;
  onClose: () => void;
  onCancel: () => void;
  onViewInbox?: () => void;
}

export const BulkDispatchProgressModal = ({
  isOpen,
  isSending,
  channel,
  progress,
  results,
  onClose,
  onCancel,
  onViewInbox,
}: BulkDispatchProgressModalProps) => {
  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const ChannelIcon = channel === 'email' ? Mail : channel === 'sms' ? Phone : MessageSquare;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSending && !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" />
            {isSending ? 'Dispatching Bulk Broadcast...' : 'Broadcast Dispatch Completed'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isSending
              ? `Sending messages across ${channel.toUpperCase()} to ${progress.total} selected recipient(s).`
              : `Bulk broadcast finished: ${results?.succeeded || 0} succeeded, ${results?.failed || 0} failed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Progress Bar & Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium flex items-center gap-1.5 text-foreground">
                <ChannelIcon className="h-3.5 w-3.5 text-primary" />
                {isSending ? (
                  <>
                    Processing: <span className="text-primary truncate max-w-[180px]">{progress.activeName || 'Connecting...'}</span>
                  </>
                ) : (
                  'All recipients processed'
                )}
              </span>
              <span className="font-mono text-muted-foreground">
                {progress.current} / {progress.total} ({percentage}%)
              </span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-lg border bg-muted/30 text-center">
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Total</span>
              <span className="text-lg font-bold text-foreground">{progress.total}</span>
            </div>
            <div className="p-2.5 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-center">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider">
                Delivered
              </span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {progress.succeeded}
              </span>
            </div>
            <div className="p-2.5 rounded-lg border bg-destructive/10 border-destructive/20 text-center">
              <span className="text-[10px] text-destructive block uppercase tracking-wider">Failed</span>
              <span className="text-lg font-bold text-destructive">{progress.failed}</span>
            </div>
          </div>

          {/* Detailed Recipient Delivery List */}
          {results && results.details.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground block">
                Dispatch Summary Log:
              </span>
              <div className="rounded-lg border bg-card overflow-hidden">
                <ScrollArea className="max-h-48">
                  <div className="divide-y text-xs">
                    {results.details.map((detail, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between gap-2 hover:bg-muted/40">
                        <div className="min-w-0 flex items-center gap-2">
                          {detail.success ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="font-medium text-foreground truncate block">
                              {detail.recipient.full_name || 'Contact'}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate block">
                              {channel === 'email' ? detail.recipient.email : detail.recipient.phone}
                            </span>
                          </div>
                        </div>

                        <div>
                          {detail.success ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                              Dispatched
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                              {detail.error || 'Failed'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isSending ? (
            <Button type="button" variant="outline" size="sm" onClick={onCancel} className="text-destructive">
              Cancel Remaining
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Done
              </Button>
              {onViewInbox && (
                <Button type="button" size="sm" onClick={onViewInbox} className="gap-1.5">
                  View in Unified Inbox
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
