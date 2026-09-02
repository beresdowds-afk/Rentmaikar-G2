import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Inbox, 
  Mail, 
  MessageSquare, 
  Phone, 
  Send, 
  Loader2, 
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Filter,
  Flag,
  Archive,
  MailOpen,
  MailQuestion,
  UserCheck,
  Facebook,
  Instagram,
  Linkedin,
  MessageCircle,
  Music,
  AlarmClock,
  Download,
  Paperclip,
  X
} from 'lucide-react';
import { useInboxConversations, useInboxMessages, useInboxStaff, InboxConversation, InboxStaff } from '@/hooks/useUnifiedInbox';
import { renderPlaceholders } from '@/lib/reply-placeholders';
import { useReplyPlaceholderValues } from '@/hooks/useReplyPlaceholderValues';
import { useCannedReplies } from '@/hooks/useCannedReplies';
import { logCannedReplyUsage } from '@/hooks/useInboxReplyAudit';
import { InboxReplyAuditPanel } from '@/components/admin/InboxReplyAuditPanel';
import { CannedRepliesManager } from '@/components/admin/CannedRepliesManager';
import { InboxSlaBadge, useNowTick } from '@/components/admin/InboxSlaBadge';
import { getSlaInfo } from '@/lib/inbox-sla';
import { exportInboxConversations } from '@/lib/inbox-export';
import { MessageAttachments } from '@/components/admin/MessageAttachments';
import { AttachmentAccessLogPanel } from '@/components/admin/AttachmentAccessLogPanel';
import { useAuth } from '@/contexts/AuthContext';
import {
  MAX_ATTACHMENTS,
  uploadInboxAttachments,
  validateAttachmentFile,
  formatFileSize,
  ATTACHMENT_KIND_LABELS,
  type AttachmentKind,
  type OutboundAttachment,
} from '@/lib/inbox-attachments';
import { useInboxAttachmentSearch } from '@/hooks/useInboxAttachmentSearch';


import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InboxNotificationSettings } from '@/components/admin/InboxNotificationSettings';
import { useInboxAlerts } from '@/hooks/useInboxAlerts';

import { format, formatDistanceToNow } from 'date-fns';

const channelIcons = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageSquare,
  facebook: Facebook,
  facebook_messenger: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  google: MessageCircle,
  google_chat: MessageCircle,
  tiktok: Music,
};

const statusIcons = {
  open: AlertCircle,
  pending: Clock,
  resolved: CheckCircle,
  closed: XCircle,
};

const statusColors = {
  open: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  pending: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  resolved: 'bg-green-500/10 text-green-600 border-green-500/20',
  closed: 'bg-muted text-muted-foreground border-muted',
};

const priorityColors = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-primary/10 text-primary',
  high: 'bg-orange-500/10 text-orange-600',
  urgent: 'bg-destructive/10 text-destructive',
};

const ConversationItem = ({
  conversation,
  isSelected,
  onClick,
  onToggleFlag,
  onArchive,
  onMarkRead,
  isChecked,
  onCheckedChange,
  attachmentCount = 0,
}: {
  conversation: InboxConversation;
  isSelected: boolean;
  onClick: () => void;
  onToggleFlag: () => void;
  onArchive: () => void;
  onMarkRead: (read: boolean) => void;
  isChecked: boolean;
  onCheckedChange: (checked: boolean) => void;
  attachmentCount?: number;
}) => {
  const ChannelIcon = channelIcons[conversation.channel as keyof typeof channelIcons] || Mail;
  const StatusIcon = statusIcons[conversation.status as keyof typeof statusIcons] || AlertCircle;
  const unread = conversation.unread_count || 0;
  const now = useNowTick();
  const overdue = getSlaInfo(conversation, now).state === 'overdue';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className={`w-full text-left p-4 border-b transition-colors hover:bg-muted/50 cursor-pointer ${
        overdue ? 'border-l-2 border-l-destructive bg-destructive/5' : ''
      } ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span onClick={(e) => e.stopPropagation()} className="flex items-center">
            <Checkbox
              checked={isChecked}
              onCheckedChange={(v) => onCheckedChange(v === true)}
              aria-label="Select conversation"
            />
          </span>

          <ChannelIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className={`truncate ${unread > 0 ? 'font-semibold' : 'font-medium'}`}>
            {conversation.user_name || conversation.user_email || 'Unknown User'}
          </span>
          {unread > 0 && (
            <Badge className="h-5 px-1.5 text-[10px]">{unread}</Badge>
          )}
          {conversation.is_flagged && <Flag className="h-3.5 w-3.5 text-orange-500" />}
          {attachmentCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-0.5">
              <Paperclip className="h-3 w-3" />
              {attachmentCount}
            </Badge>
          )}
        </div>
        <Badge variant="outline" className={priorityColors[conversation.priority as keyof typeof priorityColors]}>
          {conversation.priority}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground mt-1 truncate">
        {conversation.subject || 'No subject'}
      </p>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${statusColors[conversation.status as keyof typeof statusColors]}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {conversation.status}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {conversation.region}
          </Badge>
          <InboxSlaBadge conversation={conversation} now={now} />
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
        </span>
      </div>

      <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onToggleFlag}>
          <Flag className="h-3.5 w-3.5 mr-1" />
          {conversation.is_flagged ? 'Unflag' : 'Flag'}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onMarkRead(unread > 0)}>
          {unread > 0 ? <MailOpen className="h-3.5 w-3.5 mr-1" /> : <MailQuestion className="h-3.5 w-3.5 mr-1" />}
          {unread > 0 ? 'Mark read' : 'Mark unread'}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onArchive}>
          <Archive className="h-3.5 w-3.5 mr-1" />
          {conversation.archived_at ? 'Restore' : 'Archive'}
        </Button>
      </div>
    </div>
  );
};


const MessageThread = ({ 
  conversation,
  onUpdateStatus,
  staff,
  onAssign,
  onToggleFlag,
  onArchive,
  onMarkRead,
  highlightQuery = '',
}: { 
  conversation: InboxConversation;
  highlightQuery?: string;
  onUpdateStatus: (status: string) => void;
  staff: InboxStaff[];
  onAssign: (userId: string | null) => void;
  onToggleFlag: () => void;
  onArchive: () => void;
  onMarkRead: (read: boolean) => void;
}) => {
  const { messages, isLoading, isSendingReply, sendMessage } = useInboxMessages(conversation.id);
  const { replies: cannedReplies } = useCannedReplies();
  const { values: placeholderValues } = useReplyPlaceholderValues(conversation.id);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [usedCanned, setUsedCanned] = useState<{ id: string; title: string } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const accepted: File[] = [];
    incoming.forEach((f) => {
      const invalid = validateAttachmentFile(f);
      if (invalid) toast.error(invalid);
      else accepted.push(f);
    });
    setPendingFiles((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > MAX_ATTACHMENTS) {
        toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per reply`);
        return merged.slice(0, MAX_ATTACHMENTS);
      }
      return merged;
    });
  };

  const handleSend = async () => {
    if (!newMessage.trim() && pendingFiles.length === 0) return;
    setIsSending(true);
    const body = newMessage;

    let uploaded: OutboundAttachment[] = [];
    if (pendingFiles.length > 0) {
      if (!user) {
        toast.error('You must be signed in to attach files');
        setIsSending(false);
        return;
      }
      setIsUploading(true);
      const { attachments, errors } = await uploadInboxAttachments(
        pendingFiles,
        user.id,
        conversation.id,
      );
      setIsUploading(false);
      errors.forEach((e) => toast.error(e));
      if (attachments.length === 0) {
        setIsSending(false);
        return;
      }
      uploaded = attachments;
    }

    const success = await sendMessage(
      body,
      conversation.channel,
      conversation.user_phone,
      conversation.user_email,
      uploaded,
    );
    if (usedCanned) {
      await logCannedReplyUsage({
        conversationId: conversation.id,
        channel: conversation.channel,
        cannedReplyId: usedCanned.id,
        cannedReplyTitle: usedCanned.title,
        bodyPreview: body,
        delivered: !!success,
        errorMessage: success ? null : 'Send failed',
      });
      setUsedCanned(null);
    }
    if (success) {
      setNewMessage('');
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setIsSending(false);
  };

  const ChannelIcon = channelIcons[conversation.channel as keyof typeof channelIcons] || Mail;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-muted">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-medium">
                {conversation.user_name || conversation.user_email || 'Unknown User'}
              </h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ChannelIcon className="h-3 w-3" />
                {conversation.channel === 'email' ? conversation.user_email : conversation.user_phone}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={conversation.is_flagged ? 'default' : 'outline'} onClick={onToggleFlag}>
              <Flag className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMarkRead((conversation.unread_count || 0) > 0)}>
              {(conversation.unread_count || 0) > 0 ? <MailOpen className="h-4 w-4" /> : <MailQuestion className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={onArchive}>
              <Archive className="h-4 w-4" />
            </Button>
            <Select
              value={conversation.assigned_to ?? 'unassigned'}
              onValueChange={(v) => onAssign(v === 'unassigned' ? null : v)}
            >
              <SelectTrigger className="w-40">
                <UserCheck className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Delegate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={conversation.status} onValueChange={onUpdateStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>



        <div className="mt-2 flex flex-wrap items-center gap-2">
          <InboxSlaBadge conversation={conversation} showElapsed />
          <InboxReplyAuditPanel conversationId={conversation.id} />
        </div>

        {conversation.subject && (
          <p className="mt-2 text-sm font-medium">{conversation.subject}</p>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No messages in this conversation
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.sender_type === 'admin'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <MessageAttachments
                    metadata={message.metadata}
                    messageId={message.id}
                    conversationId={conversation.id}
                    highlightQuery={highlightQuery}
                  />
                  <div className={`text-xs mt-1 ${
                    message.sender_type === 'admin' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}>
                    {format(new Date(message.created_at), 'MMM d, h:mm a')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Reply Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Reply via ${conversation.channel}...`}
            className="min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSend();
              }
            }}
          />
        </div>

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {pendingFiles.map((file, i) => (
              <div key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[160px] truncate">{file.name}</span>
                <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={(e) => addFiles(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => fileInputRef.current?.click()}
              disabled={pendingFiles.length >= MAX_ATTACHMENTS}
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Select
              value=""
              onValueChange={(id) => {
                const canned = cannedReplies.find((r) => r.id === id);
                if (canned) {
                  const body = renderPlaceholders(canned.body, placeholderValues, {
                    keepUnknown: false,
                  });
                  setNewMessage((prev) => (prev ? `${prev}\n${body}` : body));
                  setUsedCanned({ id: canned.id, title: canned.title });
                }
              }}
            >
              <SelectTrigger className="h-8 w-[190px]">
                <SelectValue placeholder="Insert canned reply" />
              </SelectTrigger>
              <SelectContent>
                {cannedReplies.filter((r) => r.is_active && (!r.channel || r.channel === conversation.channel)).length === 0 ? (
                  <SelectItem value="__none__" disabled>No canned replies</SelectItem>
                ) : (
                  cannedReplies
                    .filter((r) => r.is_active && (!r.channel || r.channel === conversation.channel))
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground truncate">
              {isUploading
                ? 'Uploading attachments...'
                : isSendingReply
                  ? 'Delivering message...'
                  : 'Ctrl+Enter to send'}
            </span>
          </div>

          <Button
            onClick={handleSend}
            disabled={(!newMessage.trim() && pendingFiles.length === 0) || isSending || isSendingReply}
          >
            {(isSending || isSendingReply) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send via {conversation.channel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const AdminUnifiedInbox = () => {
  useInboxAlerts();
  const { 
    conversations, 
    isLoading, 
    updateConversation,
    toggleFlag,
    setArchived,
    assignConversation,
    markConversationRead,
    fetchAllMatchingIds,
    bulkSetFlag,
    bulkSetArchived,
    bulkAssign,
    bulkMarkRead,
    bulkSetStatus,
    statusFilter,
    setStatusFilter,
    channelFilter,
    setChannelFilter,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    flaggedOnly,
    setFlaggedOnly,
  } = useInboxConversations();
  const staff = useInboxStaff();

  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [attachmentKindFilter, setAttachmentKindFilter] = useState<AttachmentKind | 'all' | 'any'>('all');
  const [attachmentQuery, setAttachmentQuery] = useState('');
  const [allMatchingIds, setAllMatchingIds] = useState<string[] | null>(null);
  const [isResolvingAll, setIsResolvingAll] = useState(false);
  const nowTick = useNowTick();

  const {
    hits: attachmentHits,
    conversationIds: attachmentConversationIds,
    isLoading: isSearchingAttachments,
    isActive: attachmentFilterActive,
  } = useInboxAttachmentSearch({ kind: attachmentKindFilter, query: attachmentQuery });

  const attachmentCountByConversation = attachmentHits.reduce<Record<string, number>>((acc, hit) => {
    acc[hit.conversationId] = (acc[hit.conversationId] || 0) + 1;
    return acc;
  }, {});

  const overdueCount = conversations.filter(
    (c) => getSlaInfo(c, nowTick).state === 'overdue',
  ).length;
  const visibleConversations = conversations.filter((c) => {
    if (overdueOnly && getSlaInfo(c, nowTick).state !== 'overdue') return false;
    if (attachmentFilterActive && !(attachmentConversationIds || []).includes(c.id)) return false;
    return true;
  });

  const current = selectedConversation
    ? conversations.find((c) => c.id === selectedConversation.id) ?? selectedConversation
    : null;

  const visibleIds = visibleConversations.map((c) => c.id);
  const checkedVisibleIds = selectedIds.filter((id) => visibleIds.includes(id));
  const allVisibleChecked = visibleIds.length > 0 && checkedVisibleIds.length === visibleIds.length;

  // When "select all results" is active, bulk actions target every matching thread
  const targetIds = allMatchingIds ?? checkedVisibleIds;
  const targetCount = targetIds.length;

  // Any change to filters/search invalidates a whole-result selection
  useEffect(() => {
    setAllMatchingIds(null);
  }, [
    statusFilter,
    channelFilter,
    searchQuery,
    showArchived,
    flaggedOnly,
    overdueOnly,
    attachmentKindFilter,
    attachmentQuery,
  ]);

  const selectAllResults = async () => {
    setIsResolvingAll(true);
    const ids = await fetchAllMatchingIds();
    setIsResolvingAll(false);
    if (!ids) return;
    const scoped = attachmentFilterActive
      ? ids.filter((id) => (attachmentConversationIds || []).includes(id))
      : ids;
    setAllMatchingIds(scoped);
    setSelectedIds((prev) => [...new Set([...prev, ...scoped])]);
  };


  const clearSelection = () => {
    setSelectedIds([]);
    setAllMatchingIds(null);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (ids: string[]) => {
    if (!ids.length) return;
    setIsExporting(true);
    try {
      const names = Object.fromEntries(staff.map((s) => [s.id, s.name]));
      const count = await exportInboxConversations(ids, names);
      toast.success(`Exported ${count} thread${count === 1 ? '' : 's'} to CSV`);
    } catch (error) {
      console.error('Error exporting conversations:', error);
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };


  const toggleSelected = (id: string, checked: boolean) => {
    setAllMatchingIds(null);
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const toggleSelectAll = (checked: boolean) => {
    setAllMatchingIds(null);
    setSelectedIds(checked ? [...new Set([...selectedIds, ...visibleIds])] : selectedIds.filter((id) => !visibleIds.includes(id)));
  };

  const runBulk = async (action: () => Promise<unknown>) => {
    await action();
    clearSelection();
  };


  const [pendingBulk, setPendingBulk] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const [selectResetKey, setSelectResetKey] = useState(0);

  const confirmBulk = (
    title: string,
    description: string,
    confirmLabel: string,
    action: () => Promise<unknown>,
  ) => setPendingBulk({ title, description, confirmLabel, action });

  const closeBulkConfirm = () => {
    setPendingBulk(null);
    setSelectResetKey((k) => k + 1);
  };


  const handleUpdateStatus = async (status: string) => {
    if (!current) return;
    await updateConversation(current.id, { status });
    setSelectedConversation({ ...current, status });
  };



  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Unified Inbox
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage customer conversations from all channels in one place
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 h-[600px] xl:h-[min(760px,72dvh)]">
          {/* Conversation List */}
          <div className="border-r xl:col-span-2">
            <div className="p-3 border-b bg-muted/30 space-y-2">
              <Input
                placeholder="Search conversations..."
                className="h-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allVisibleChecked}
                  onCheckedChange={(v) => toggleSelectAll(v === true)}
                  aria-label="Select all conversations"
                />
                <Button
                  size="sm"
                  variant={flaggedOnly ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setFlaggedOnly(!flaggedOnly)}
                >
                  <Flag className="h-3.5 w-3.5 mr-1" /> Flagged
                </Button>
                <Button
                  size="sm"
                  variant={showArchived ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive className="h-3.5 w-3.5 mr-1" /> Archived
                </Button>
                <Button
                  size="sm"
                  variant={overdueOnly ? 'destructive' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setOverdueOnly(!overdueOnly)}
                >
                  <AlarmClock className="h-3.5 w-3.5 mr-1" /> Overdue
                  {overdueCount > 0 && (
                    <Badge className="ml-1 h-4 px-1 text-[10px]" variant="secondary">{overdueCount}</Badge>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={attachmentKindFilter}
                  onValueChange={(v) => setAttachmentKindFilter(v as AttachmentKind | 'all' | 'any')}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <Paperclip className="h-3.5 w-3.5 mr-1 shrink-0" />
                    <SelectValue placeholder="Attachments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any thread</SelectItem>
                    <SelectItem value="any">Has attachment</SelectItem>
                    {(Object.keys(ATTACHMENT_KIND_LABELS) as AttachmentKind[]).map((k) => (
                      <SelectItem key={k} value={k}>{ATTACHMENT_KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search file names..."
                  className="h-8 text-xs"
                  value={attachmentQuery}
                  onChange={(e) => setAttachmentQuery(e.target.value)}
                />
                {(attachmentFilterActive) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => {
                      setAttachmentKindFilter('all');
                      setAttachmentQuery('');
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {attachmentFilterActive && (
                <div className="rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                  {isSearchingAttachments ? (
                    <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Searching attachments…</span>
                  ) : (
                    <>
                      {attachmentHits.length} matching file{attachmentHits.length === 1 ? '' : 's'} in{' '}
                      {visibleConversations.length} thread{visibleConversations.length === 1 ? '' : 's'}
                    </>
                  )}
                </div>
              )}



              {checkedVisibleIds.length > 0 && (
                <div className="rounded-md border bg-background p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {allMatchingIds
                        ? `All ${targetCount} matching thread${targetCount === 1 ? '' : 's'} selected`
                        : `${checkedVisibleIds.length} selected`}
                    </span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={clearSelection}>
                      Clear
                    </Button>
                  </div>

                  {allVisibleChecked && !overdueOnly && (
                    <div className="rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                      {allMatchingIds ? (
                        <>
                          Bulk actions apply to all {targetCount} thread{targetCount === 1 ? '' : 's'} matching the current filters.{' '}
                          <button
                            type="button"
                            className="font-medium text-primary underline underline-offset-2"
                            onClick={() => setAllMatchingIds(null)}
                          >
                            Select only these {checkedVisibleIds.length}
                          </button>
                        </>
                      ) : (
                        <>
                          All {checkedVisibleIds.length} thread{checkedVisibleIds.length === 1 ? '' : 's'} on this list selected.{' '}
                          <button
                            type="button"
                            className="font-medium text-primary underline underline-offset-2 disabled:opacity-60"
                            disabled={isResolvingAll}
                            onClick={selectAllResults}
                          >
                            {isResolvingAll ? 'Selecting…' : 'Select all results matching filters'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => runBulk(() => bulkMarkRead(targetIds, true))}>
                      <MailOpen className="h-3.5 w-3.5 mr-1" /> Read
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => runBulk(() => bulkMarkRead(targetIds, false))}>
                      <MailQuestion className="h-3.5 w-3.5 mr-1" /> Unread
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => runBulk(() => bulkSetFlag(targetIds, true))}>
                      <Flag className="h-3.5 w-3.5 mr-1" /> Flag
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => runBulk(() => bulkSetFlag(targetIds, false))}>
                      <Flag className="h-3.5 w-3.5 mr-1" /> Unflag
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={isExporting}
                      onClick={() => handleExport(targetIds)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> {isExporting ? 'Exporting…' : 'Export CSV'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        confirmBulk(
                          showArchived ? 'Restore conversations?' : 'Archive conversations?',
                          `This will ${showArchived ? 'restore' : 'archive'} ${targetCount} selected conversation${targetCount === 1 ? '' : 's'}.`,
                          showArchived ? 'Restore' : 'Archive',
                          () => bulkSetArchived(targetIds, !showArchived),
                        )
                      }
                    >
                      <Archive className="h-3.5 w-3.5 mr-1" /> {showArchived ? 'Restore' : 'Archive'}
                    </Button>
                    <Select onValueChange={(v) => runBulk(() => bulkAssign(targetIds, v === 'unassigned' ? null : v))}>
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <UserCheck className="h-3.5 w-3.5 mr-1" />
                        <SelectValue placeholder="Delegate" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      key={selectResetKey}
                      onValueChange={(v) =>
                        confirmBulk(
                          'Change status?',
                          `This will set ${targetCount} selected conversation${targetCount === 1 ? '' : 's'} to "${v}".`,
                          'Change status',
                          () => bulkSetStatus(targetIds, v),
                        )
                      }
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>

                  </div>
                </div>
              )}

            </div>
            <ScrollArea className="h-[calc(600px-160px)] xl:h-[calc(min(760px,72dvh)-160px)]">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : visibleConversations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Inbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{overdueOnly ? 'No overdue conversations' : showArchived ? 'No archived conversations' : 'No conversations yet'}</p>
                  <p className="text-xs mt-1">Messages from customers will appear here</p>
                </div>
              ) : (
                visibleConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={current?.id === conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    onToggleFlag={() => toggleFlag(conv)}
                    onArchive={() => setArchived(conv, !conv.archived_at)}
                    onMarkRead={(read) => markConversationRead(conv.id, read)}
                    isChecked={selectedIds.includes(conv.id)}
                    onCheckedChange={(checked) => toggleSelected(conv.id, checked)}
                    attachmentCount={attachmentCountByConversation[conv.id] || 0}
                  />
                ))
              )}
            </ScrollArea>

          </div>

          {/* Message Thread */}
          <div className="col-span-2 xl:col-span-3">

            {current ? (
              <MessageThread 
                conversation={current}
                onUpdateStatus={handleUpdateStatus}
                staff={staff}
                onAssign={(userId) => assignConversation(current.id, userId)}
                onToggleFlag={() => toggleFlag(current)}
                onArchive={() => setArchived(current, !current.archived_at)}
                onMarkRead={(read) => markConversationRead(current.id, read)}
                highlightQuery={attachmentQuery}
              />
            ) : (

              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a conversation to view messages</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <AttachmentAccessLogPanel />

      <InboxNotificationSettings />

      <CannedRepliesManager />

      <AlertDialog open={!!pendingBulk} onOpenChange={(open) => !open && closeBulkConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingBulk?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingBulk?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeBulkConfirm}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const action = pendingBulk?.action;
                closeBulkConfirm();
                if (action) await runBulk(action);
              }}
            >
              {pendingBulk?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUnifiedInbox;
