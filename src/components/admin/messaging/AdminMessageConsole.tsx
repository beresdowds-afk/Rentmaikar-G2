import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Inbox,
  Send,
  Loader2,
  Mail,
  Phone,
  MessageSquare,
  Paperclip,
  X,
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
  Download,
  Search,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Shield,
  HelpCircle,
  Zap,
  Globe,
  Bookmark,
  Tag,
  SlidersHorizontal,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  useInboxConversations,
  useInboxMessages,
  useInboxStaff,
  type InboxConversation,
  type InboxStaff,
  type InboxMessage,
} from '@/hooks/useUnifiedInbox';
import { useCannedReplies } from '@/hooks/useCannedReplies';
import { renderPlaceholders, type PlaceholderValues } from '@/lib/reply-placeholders';
import { useReplyPlaceholderValues } from '@/hooks/useReplyPlaceholderValues';
import { logCannedReplyUsage } from '@/hooks/useInboxReplyAudit';
import {
  MAX_ATTACHMENTS,
  uploadInboxAttachments,
  validateAttachmentFile,
  formatFileSize,
  type OutboundAttachment,
  type AttachmentKind,
  ATTACHMENT_KIND_LABELS,
} from '@/lib/inbox-attachments';
import { useAuth } from '@/contexts/AuthContext';
import { MessageAttachments } from '@/components/admin/MessageAttachments';
import { exportInboxConversations } from '@/lib/inbox-export';
import { useInboxAttachmentSearch } from '@/hooks/useInboxAttachmentSearch';
import { InboxSlaBadge, useNowTick } from '@/components/admin/InboxSlaBadge';
import { getSlaInfo } from '@/lib/inbox-sla';
import { useInboxAlerts } from '@/hooks/useInboxAlerts';
import {
  WHATSAPP_TEMPLATES_CATALOG,
  getWhatsAppSenderForRecipient,
} from '@/lib/whatsapp-templates-registry';
import { calculateSmsSegments, getSmsProviderAndSender } from '@/lib/sms-templates';
import { OUTGOING_EMAIL_CONFIG } from '@/lib/email-config';
import { AiAutoResponderCard } from './AiAutoResponderCard';
import { SavedResponsesModal } from './SavedResponsesModal';

export type MessageTag = 'Urgent' | 'In Progress' | 'Resolved';

const TAG_BADGES: Record<MessageTag, { label: string; bg: string; text: string; border: string; dot: string }> = {
  Urgent: {
    label: 'Urgent',
    bg: 'bg-red-500/10 dark:bg-red-950/30',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/30',
    dot: 'bg-red-500',
  },
  'In Progress': {
    label: 'In Progress',
    bg: 'bg-blue-500/10 dark:bg-blue-950/30',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
    dot: 'bg-blue-500',
  },
  Resolved: {
    label: 'Resolved',
    bg: 'bg-emerald-500/10 dark:bg-emerald-950/30',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
};

// Channel Icons Mapping
const CHANNEL_ICONS = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageSquare,
  facebook: MessageSquare,
  instagram: MessageSquare,
  linkedin: MessageSquare,
  in_app: Mail,
};

const STATUS_ICONS = {
  open: AlertCircle,
  pending: Clock,
  resolved: CheckCircle,
  closed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  pending: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  closed: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  normal: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
  high: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
  urgent: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
};

// Smart Reply Templates for fast drafting
const SMART_REPLY_TEMPLATES = [
  {
    id: 'ack_investigate',
    label: 'Acknowledge & Investigate',
    badge: 'Standard Receipt',
    subject: 'Update regarding your inquiry - Rentmaikar Support',
    body: 'Hello {{customer_name}},\n\nThank you for reaching out to Rentmaikar Support. We have received your message and our operations team is actively looking into this for you.\n\nWe will follow up with a complete update as soon as possible. If you have any additional details or files to add, please feel free to reply directly to this message.\n\nBest regards,\nRentmaikar Customer Operations',
  },
  {
    id: 'req_documents',
    label: 'Request Driver Documents',
    badge: 'Verification',
    subject: 'Action Required: Verification Documents - Rentmaikar',
    body: "Hi {{first_name}},\n\nTo complete your profile verification and keep your vehicle rental authorized, please provide the following document(s):\n\n1. Valid Driver's License (clear front and reverse photos)\n2. Proof of Identity (NIN slip or National ID)\n3. Recent clear selfie photograph\n\nYou can attach the files in reply to this message or upload them in your driver portal.\n\nThank you,\nRentmaikar Verification Desk",
  },
  {
    id: 'payment_reminder',
    label: 'Payment & Balance Notice',
    badge: 'Billing',
    subject: 'Rental Payment Notice - Rentmaikar',
    body: 'Hello {{first_name}},\n\nThis is a friendly reminder regarding your outstanding rental payment. To ensure uninterrupted vehicle access and avoid remote immobilization, please complete your payment via your driver dashboard or authorized bank transfer.\n\nIf you have already made this payment, please reply with your bank transfer receipt or transaction reference so we can credit your balance immediately.\n\nBest regards,\nRentmaikar Billing & Accounts',
  },
  {
    id: 'roadside_breakdown',
    label: 'Roadside Assistance',
    badge: 'Safety',
    subject: 'URGENT: Roadside Assistance Protocol - Rentmaikar',
    body: 'Hi {{first_name}},\n\nWe noted your report regarding a vehicle issue. Your safety is our primary concern:\n\n1. Please safely park the vehicle away from moving traffic with hazard lights on.\n2. Turn off the ignition and stay in a safe, visible spot.\n3. Our mobile technical patrol team is preparing dispatch.\n\nPlease confirm your exact live location or nearest landmark by replying to this message.\n\nRentmaikar Fleet Operations',
  },
  {
    id: 'polite_resolution',
    label: 'Ticket Resolution',
    badge: 'Resolution',
    subject: 'Issue Resolved: Rentmaikar Support',
    body: 'Hi {{first_name}},\n\nWe are pleased to inform you that your request regarding this matter has now been resolved.\n\nIf you need any further assistance with your rental, vehicle, or dashboard, please do not hesitate to reach out. We are always here to keep you safely on the road!\n\nWarm regards,\nRentmaikar Support Team',
  },
];

// Available placeholders to quickly insert into the draft
const QUICK_PLACEHOLDERS = [
  { label: 'Customer Name', value: '{{customer_name}}' },
  { label: 'First Name', value: '{{first_name}}' },
  { label: 'Vehicle Model', value: '{{vehicle_model}}' },
  { label: 'Rental ID', value: '{{rental_id}}' },
  { label: 'Pickup Location', value: '{{pickup_location}}' },
  { label: 'Today Date', value: '{{today}}' },
  { label: 'Support Phone', value: '{{support_phone}}' },
];

function getPhoneCountryFlag(phone?: string | null): { flag: string; label: string } {
  if (!phone) return { flag: '🌐', label: 'Global' };
  const clean = phone.trim().replace(/\s+/g, '');
  if (clean.startsWith('+234')) return { flag: '🇳🇬', label: 'Nigeria' };
  if (clean.startsWith('+1')) return { flag: '🇺🇸', label: 'US/Canada' };
  if (clean.startsWith('+44')) return { flag: '🇬🇧', label: 'UK' };
  if (clean.startsWith('+233')) return { flag: '🇬🇭', label: 'Ghana' };
  if (clean.startsWith('+254')) return { flag: '🇰🇪', label: 'Kenya' };
  if (clean.startsWith('+27')) return { flag: '🇿🇦', label: 'South Africa' };
  return { flag: '🌐', label: 'Global' };
}

interface AdminMessageConsoleProps {
  initialConversationId?: string | null;
  onComposeNew?: () => void;
}

export const AdminMessageConsole = ({
  initialConversationId,
  onComposeNew,
}: AdminMessageConsoleProps) => {
  useInboxAlerts();
  const { user } = useAuth();
  const nowTick = useNowTick();

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
    fetchConversations,
  } = useInboxConversations();

  const staff = useInboxStaff();

  // Selection & UI state
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [attachmentKindFilter, setAttachmentKindFilter] = useState<AttachmentKind | 'all' | 'any'>('all');
  const [attachmentQuery, setAttachmentQuery] = useState('');
  const [allMatchingIds, setAllMatchingIds] = useState<string[] | null>(null);
  const [isResolvingAll, setIsResolvingAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // In-thread search & filter
  const [threadSearch, setThreadSearch] = useState('');

  // Replying Console State
  const [replyChannel, setReplyChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyFromAlias, setReplyFromAlias] = useState<string>(OUTGOING_EMAIL_CONFIG.support);
  const [replySmsOptOut, setReplySmsOptOut] = useState(true);
  const [replyWhatsappTemplateId, setReplyWhatsappTemplateId] = useState<string>('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [lastDraftSavedTime, setLastDraftSavedTime] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<'draft' | 'preview'>('draft');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [usedCanned, setUsedCanned] = useState<{ id: string; title: string } | null>(null);
  const [isReplyConsoleExpanded, setIsReplyConsoleExpanded] = useState(true);

  // Tagging / Labeling state ('Urgent' | 'In Progress' | 'Resolved')
  const [conversationTags, setConversationTags] = useState<Record<string, MessageTag>>(() => {
    try {
      const stored = localStorage.getItem('rentmaikar:conversation_tags');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [tagFilter, setTagFilter] = useState<'all' | MessageTag>('all');

  // Saved responses modal state
  const [isSavedResponsesModalOpen, setIsSavedResponsesModalOpen] = useState(false);
  const [savedResponseInitialDraft, setSavedResponseInitialDraft] = useState('');

  // Search by message content keyword cache
  const [conversationRecentContent, setConversationRecentContent] = useState<Record<string, string>>({});

  // Bulk action confirmation dialog
  const [pendingBulk, setPendingBulk] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<unknown>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Attachments search hook
  const {
    hits: attachmentHits,
    conversationIds: attachmentConversationIds,
    isLoading: isSearchingAttachments,
    isActive: attachmentFilterActive,
  } = useInboxAttachmentSearch({ kind: attachmentKindFilter, query: attachmentQuery });

  const attachmentCountByConversation = useMemo(() => {
    return attachmentHits.reduce<Record<string, number>>((acc, hit) => {
      acc[hit.conversationId] = (acc[hit.conversationId] || 0) + 1;
      return acc;
    }, {});
  }, [attachmentHits]);

  // Active conversation resolution
  const current = useMemo(() => {
    if (!selectedConversation) return null;
    return conversations.find((c) => c.id === selectedConversation.id) ?? selectedConversation;
  }, [conversations, selectedConversation]);

  // Populate recent message content for all conversations to support message content keyword search
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('inbox_messages')
          .select('conversation_id, content')
          .order('created_at', { ascending: false })
          .limit(300);
        if (isMounted && data) {
          const map: Record<string, string> = {};
          data.forEach((m) => {
            if (!map[m.conversation_id]) {
              map[m.conversation_id] = m.content;
            } else {
              map[m.conversation_id] += ' ' + m.content;
            }
          });
          setConversationRecentContent((prev) => ({ ...map, ...prev }));
        }
      } catch {
        // Ignore
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [conversations.length]);

  // Hook for conversation messages
  const {
    messages,
    isLoading: isLoadingMessages,
    sendMessage,
    isSendingReply: isDeliveryInProgress,
  } = useInboxMessages(current?.id ?? null);

  // Hook for canned replies & placeholder values
  const { replies: cannedReplies } = useCannedReplies();
  const { values: placeholderValues } = useReplyPlaceholderValues(current?.id ?? null);

  // Set initial selected conversation if prop provided
  useEffect(() => {
    if (initialConversationId && conversations.length > 0) {
      const found = conversations.find((c) => c.id === initialConversationId);
      if (found) setSelectedConversation(found);
    }
  }, [initialConversationId, conversations]);

  // Set initial conversation if none selected yet
  useEffect(() => {
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation]);

  // Channel sync when selecting conversation
  useEffect(() => {
    if (current) {
      const ch = current.channel.toLowerCase();
      if (ch === 'whatsapp') {
        setReplyChannel('whatsapp');
      } else if (ch === 'sms') {
        setReplyChannel('sms');
      } else {
        setReplyChannel('email');
      }

      // Default subject
      if (current.subject) {
        setReplySubject(current.subject.startsWith('Re:') ? current.subject : `Re: ${current.subject}`);
      } else {
        setReplySubject('Update regarding your Rentmaikar Inquiry');
      }

      // Restore saved draft for this conversation
      const savedKey = `rentmaikar:draft:reply:${current.id}`;
      const savedDraft = localStorage.getItem(savedKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed.body) {
            setReplyBody(parsed.body);
            if (parsed.subject) setReplySubject(parsed.subject);
            if (parsed.channel) setReplyChannel(parsed.channel);
            setLastDraftSavedTime(parsed.savedAt || 'Recently restored');
            return;
          }
        } catch {
          // Ignore parse errors
        }
      }

      // If no draft exists, clear body
      setReplyBody('');
      setLastDraftSavedTime(null);
      setPendingFiles([]);
      setUsedCanned(null);
    }
  }, [current?.id]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Extract latest inbound message content for AI Auto-Responder analysis
  const latestInboundMessage = useMemo(() => {
    const inbound = [...messages].reverse().find((m) => m.sender_type !== 'admin');
    return inbound?.content || current?.subject || '';
  }, [messages, current?.subject]);

  // Handle setting / updating conversation tags ('Urgent' | 'In Progress' | 'Resolved')
  const handleSetConversationTag = async (convId: string, tag: MessageTag | null) => {
    const updated = { ...conversationTags };
    if (tag) {
      updated[convId] = tag;
    } else {
      delete updated[convId];
    }
    setConversationTags(updated);
    try {
      localStorage.setItem('rentmaikar:conversation_tags', JSON.stringify(updated));
    } catch {
      // Ignore
    }

    if (tag === 'Urgent') {
      await updateConversation(convId, { priority: 'urgent' });
      toast.success('Conversation marked as "Urgent"');
    } else if (tag === 'Resolved') {
      await updateConversation(convId, { status: 'resolved' });
      toast.success('Conversation marked as "Resolved"');
    } else if (tag === 'In Progress') {
      await updateConversation(convId, { status: 'pending' });
      toast.success('Conversation marked as "In Progress"');
    } else {
      toast.success('Tag cleared');
    }
  };

  // Auto-save reply draft per conversation
  useEffect(() => {
    if (!current?.id) return;
    const trimmed = replyBody.trim();
    const savedKey = `rentmaikar:draft:reply:${current.id}`;

    if (!trimmed) {
      localStorage.removeItem(savedKey);
      setLastDraftSavedTime(null);
      return;
    }

    const timer = setTimeout(() => {
      const nowStr = format(new Date(), 'h:mm a');
      const payload = {
        body: replyBody,
        subject: replySubject,
        channel: replyChannel,
        savedAt: nowStr,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(savedKey, JSON.stringify(payload));
      setLastDraftSavedTime(nowStr);
    }, 600);

    return () => clearTimeout(timer);
  }, [replyBody, replySubject, replyChannel, current?.id]);

  // Computed metrics
  const channelCounters = useMemo(() => {
    return {
      all: conversations.length,
      email: conversations.filter((c) => c.channel === 'email').length,
      sms: conversations.filter((c) => c.channel === 'sms').length,
      whatsapp: conversations.filter((c) => c.channel === 'whatsapp').length,
      unreadEmail: conversations.filter((c) => c.channel === 'email' && (c.unread_count || 0) > 0).length,
      unreadSms: conversations.filter((c) => c.channel === 'sms' && (c.unread_count || 0) > 0).length,
      unreadWhatsapp: conversations.filter((c) => c.channel === 'whatsapp' && (c.unread_count || 0) > 0).length,
      overdueTotal: conversations.filter((c) => getSlaInfo(c, nowTick).state === 'overdue').length,
    };
  }, [conversations, nowTick]);

  // Filtered visible conversations
  const visibleConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (overdueOnly && getSlaInfo(c, nowTick).state !== 'overdue') return false;
      if (attachmentFilterActive && !(attachmentConversationIds || []).includes(c.id)) return false;

      // Tag filter ('all' | 'Urgent' | 'In Progress' | 'Resolved')
      const tag = conversationTags[c.id] || (c.priority === 'urgent' ? 'Urgent' : c.status === 'resolved' ? 'Resolved' : c.status === 'pending' ? 'In Progress' : null);
      if (tagFilter !== 'all') {
        if (tag !== tagFilter) return false;
      }

      // Text input filter: by sender name, contact detail (email/phone), subject, or message content keyword
      if (q) {
        const nameMatch = (c.user_name || '').toLowerCase().includes(q);
        const emailMatch = (c.user_email || '').toLowerCase().includes(q);
        const phoneMatch = (c.user_phone || '').toLowerCase().includes(q);
        const subjectMatch = (c.subject || '').toLowerCase().includes(q);
        const channelMatch = (c.channel || '').toLowerCase().includes(q);
        const contentMatch = (conversationRecentContent[c.id] || '').toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !phoneMatch && !subjectMatch && !channelMatch && !contentMatch) {
          return false;
        }
      }

      return true;
    });
  }, [conversations, overdueOnly, attachmentFilterActive, attachmentConversationIds, conversationTags, tagFilter, searchQuery, conversationRecentContent, nowTick]);

  const visibleIds = useMemo(() => visibleConversations.map((c) => c.id), [visibleConversations]);
  const checkedVisibleIds = useMemo(() => selectedIds.filter((id) => visibleIds.includes(id)), [selectedIds, visibleIds]);
  const allVisibleChecked = visibleIds.length > 0 && checkedVisibleIds.length === visibleIds.length;
  const targetIds = allMatchingIds ?? checkedVisibleIds;
  const targetCount = targetIds.length;

  // Filter messages in thread by search
  const filteredMessages = useMemo(() => {
    if (!threadSearch.trim()) return messages;
    const query = threadSearch.toLowerCase();
    return messages.filter((m) => m.content.toLowerCase().includes(query));
  }, [messages, threadSearch]);

  // Live rendered draft preview
  const renderedReplyPreview = useMemo(() => {
    return renderPlaceholders(replyBody, placeholderValues, { keepUnknown: true });
  }, [replyBody, placeholderValues]);

  // SMS segment calculator
  const smsSegmentsInfo = useMemo(() => {
    if (replyChannel !== 'sms') return null;
    return calculateSmsSegments(renderedReplyPreview, replySmsOptOut);
  }, [replyChannel, renderedReplyPreview, replySmsOptOut]);

  // SMS & WhatsApp provider routing
  const smsRouting = useMemo(() => {
    return getSmsProviderAndSender(current?.user_phone, current?.region);
  }, [current?.user_phone, current?.region]);

  const whatsappRouting = useMemo(() => {
    return getWhatsAppSenderForRecipient(current?.user_phone);
  }, [current?.user_phone]);

  // Copy helper
  const handleCopy = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Add attachments
  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const accepted: File[] = [];

    incoming.forEach((f) => {
      const error = validateAttachmentFile(f);
      if (error) {
        toast.error(error);
      } else {
        accepted.push(f);
      }
    });

    setPendingFiles((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > MAX_ATTACHMENTS) {
        toast.error(`Maximum of ${MAX_ATTACHMENTS} files allowed per reply`);
        return merged.slice(0, MAX_ATTACHMENTS);
      }
      return merged;
    });
  };

  // Discard draft
  const handleDiscardDraft = () => {
    if (!current?.id) return;
    localStorage.removeItem(`rentmaikar:draft:reply:${current.id}`);
    setReplyBody('');
    setLastDraftSavedTime(null);
    setPendingFiles([]);
    setUsedCanned(null);
    toast.info('Draft discarded');
  };

  // Apply a smart template or canned reply
  const handleApplyTemplate = (bodyText: string, subjectText?: string, cannedMeta?: { id: string; title: string }) => {
    const rendered = renderPlaceholders(bodyText, placeholderValues, { keepUnknown: false });
    setReplyBody(rendered);
    if (subjectText && replyChannel === 'email') {
      setReplySubject(subjectText);
    }
    if (cannedMeta) {
      setUsedCanned(cannedMeta);
    }
    toast.success('Template applied to draft');
  };

  // Insert placeholder tag at cursor or append
  const handleInsertPlaceholder = (token: string) => {
    setReplyBody((prev) => (prev ? `${prev} ${token}` : token));
  };

  // Send Reply Action
  const handleSendReply = async (postStatus?: string) => {
    if (!current) return;
    const bodyToSend = replyBody.trim();

    if (!bodyToSend && pendingFiles.length === 0) {
      toast.error('Please draft a message or attach a file before sending');
      return;
    }

    setIsSendingReply(true);

    let uploadedAttachments: OutboundAttachment[] = [];
    if (pendingFiles.length > 0) {
      if (!user) {
        toast.error('You must be authenticated to attach files');
        setIsSendingReply(false);
        return;
      }
      setIsUploadingFiles(true);
      const { attachments, errors } = await uploadInboxAttachments(
        pendingFiles,
        user.id,
        current.id,
      );
      setIsUploadingFiles(false);
      errors.forEach((e) => toast.error(e));
      if (attachments.length === 0 && pendingFiles.length > 0) {
        setIsSendingReply(false);
        return;
      }
      uploadedAttachments = attachments;
    }

    // Determine final body (e.g. append opt-out for SMS if enabled)
    let finalBody = bodyToSend;
    if (replyChannel === 'sms' && replySmsOptOut && !finalBody.toLowerCase().includes('stop to opt out')) {
      finalBody = `${finalBody}\n\nReply STOP to opt out.`;
    }

    const success = await sendMessage(
      finalBody,
      replyChannel,
      current.user_phone,
      current.user_email,
      uploadedAttachments,
    );

    if (success) {
      // Audit canned reply usage if applied
      if (usedCanned) {
        await logCannedReplyUsage({
          conversationId: current.id,
          channel: replyChannel,
          cannedReplyId: usedCanned.id,
          cannedReplyTitle: usedCanned.title,
          bodyPreview: finalBody,
          delivered: true,
          errorMessage: null,
        });
      }

      // Clear draft storage
      localStorage.removeItem(`rentmaikar:draft:reply:${current.id}`);
      setReplyBody('');
      setLastDraftSavedTime(null);
      setPendingFiles([]);
      setUsedCanned(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Optional status update on send
      if (postStatus && postStatus !== current.status) {
        await updateConversation(current.id, { status: postStatus });
        setSelectedConversation({ ...current, status: postStatus });
        toast.success(`Reply sent and ticket set to ${postStatus.toUpperCase()}`);
      } else {
        toast.success(`Reply sent via ${replyChannel.toUpperCase()}`);
      }
    }

    setIsSendingReply(false);
  };

  // Keyboard shortcut for quick sending (Ctrl+Enter or Cmd+Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendReply();
    }
  };

  // Bulk actions handlers
  const toggleSelectAll = (checked: boolean) => {
    setAllMatchingIds(null);
    setSelectedIds(checked ? [...new Set([...selectedIds, ...visibleIds])] : selectedIds.filter((id) => !visibleIds.includes(id)));
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setAllMatchingIds(null);
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const runBulk = async (action: () => Promise<unknown>) => {
    await action();
    setSelectedIds([]);
    setAllMatchingIds(null);
  };

  const confirmBulk = (
    title: string,
    description: string,
    confirmLabel: string,
    action: () => Promise<unknown>,
  ) => setPendingBulk({ title, description, confirmLabel, action });

  const closeBulkConfirm = () => setPendingBulk(null);

  const handleExport = async (ids: string[]) => {
    if (!ids.length) return;
    setIsExporting(true);
    try {
      const names = Object.fromEntries(staff.map((s) => [s.id, s.name]));
      const count = await exportInboxConversations(ids, names);
      toast.success(`Exported ${count} conversation(s) to CSV`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const flagInfo = getPhoneCountryFlag(current?.user_phone);

  return (
    <div className="space-y-4">
      {/* Top Banner & Omnichannel KPI Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                Message Reader & Replying Console
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-normal">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Live Console
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground">
                Read incoming emails, SMS, and WhatsApp messages, auto-draft personalized responses, and send real-time replies.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Channel stats badges */}
          <div className="flex items-center gap-1.5 text-xs">
            <Badge
              variant="secondary"
              className={`gap-1 px-2 py-1 font-medium cursor-pointer transition-colors ${
                channelFilter === 'email' ? 'bg-blue-500 text-white' : 'hover:bg-muted'
              }`}
              onClick={() => setChannelFilter(channelFilter === 'email' ? 'all' : 'email')}
            >
              <Mail className="h-3.5 w-3.5 text-blue-500 group-hover:text-white" />
              {channelCounters.email} Email
              {channelCounters.unreadEmail > 0 && (
                <span className="ml-1 rounded-full bg-blue-600 px-1 text-[10px] text-white">
                  {channelCounters.unreadEmail}
                </span>
              )}
            </Badge>

            <Badge
              variant="secondary"
              className={`gap-1 px-2 py-1 font-medium cursor-pointer transition-colors ${
                channelFilter === 'sms' ? 'bg-emerald-600 text-white' : 'hover:bg-muted'
              }`}
              onClick={() => setChannelFilter(channelFilter === 'sms' ? 'all' : 'sms')}
            >
              <Phone className="h-3.5 w-3.5 text-emerald-500" />
              {channelCounters.sms} SMS
              {channelCounters.unreadSms > 0 && (
                <span className="ml-1 rounded-full bg-emerald-600 px-1 text-[10px] text-white">
                  {channelCounters.unreadSms}
                </span>
              )}
            </Badge>

            <Badge
              variant="secondary"
              className={`gap-1 px-2 py-1 font-medium cursor-pointer transition-colors ${
                channelFilter === 'whatsapp' ? 'bg-green-600 text-white' : 'hover:bg-muted'
              }`}
              onClick={() => setChannelFilter(channelFilter === 'whatsapp' ? 'all' : 'whatsapp')}
            >
              <MessageSquare className="h-3.5 w-3.5 text-green-500" />
              {channelCounters.whatsapp} WhatsApp
              {channelCounters.unreadWhatsapp > 0 && (
                <span className="ml-1 rounded-full bg-green-600 px-1 text-[10px] text-white">
                  {channelCounters.unreadWhatsapp}
                </span>
              )}
            </Badge>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchConversations()}
            disabled={isLoading}
            className="h-8 gap-1 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {onComposeNew && (
            <Button
              size="sm"
              onClick={onComposeNew}
              className="h-8 gap-1.5 text-xs shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              New Outbound
            </Button>
          )}
        </div>
      </div>

      {/* Main Console Split Layout */}
      <Card className="overflow-hidden border shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[750px] divide-y lg:divide-y-0 lg:divide-x">
          {/* PANE 1: Conversation Browser & Filter Sidebar (4 cols on lg) */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col bg-muted/20">
            {/* Filter Header */}
            <div className="p-3 border-b space-y-2 bg-background/50">
              {/* Text Input Search & Filter Bar */}
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by sender, email/phone, or message keyword..."
                    className="pl-8 pr-7 h-8 text-xs bg-background"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Tag & Label Quick Filters: All | Urgent | In Progress | Resolved */}
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0 flex items-center gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      Tags:
                    </span>
                    <button
                      type="button"
                      onClick={() => setTagFilter('all')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 ${
                        tagFilter === 'all'
                          ? 'bg-foreground text-background font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground bg-muted/60'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setTagFilter(tagFilter === 'Urgent' ? 'all' : 'Urgent')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0 ${
                        tagFilter === 'Urgent'
                          ? 'bg-red-600 text-white font-semibold shadow-2xs'
                          : 'text-red-600 dark:text-red-400 hover:bg-red-500/10 bg-red-500/5 border border-red-500/20'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      Urgent
                    </button>
                    <button
                      type="button"
                      onClick={() => setTagFilter(tagFilter === 'In Progress' ? 'all' : 'In Progress')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0 ${
                        tagFilter === 'In Progress'
                          ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                          : 'text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 bg-blue-500/5 border border-blue-500/20'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      In Progress
                    </button>
                    <button
                      type="button"
                      onClick={() => setTagFilter(tagFilter === 'Resolved' ? 'all' : 'Resolved')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0 ${
                        tagFilter === 'Resolved'
                          ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                          : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 bg-emerald-500/5 border border-emerald-500/20'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      Resolved
                    </button>
                  </div>

                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {visibleConversations.length} items
                  </span>
                </div>
              </div>

              {/* Channel and Status Pill Selectors */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="h-7 text-xs w-[110px]">
                    <Filter className="h-3 w-3 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="email">Emails</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-7 text-xs w-[105px]">
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

                <Button
                  size="sm"
                  variant={overdueOnly ? 'destructive' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setOverdueOnly(!overdueOnly)}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  SLA Overdue
                  {channelCounters.overdueTotal > 0 && (
                    <span className="ml-1 rounded-full bg-red-600 px-1 text-[10px] text-white">
                      {channelCounters.overdueTotal}
                    </span>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant={flaggedOnly ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setFlaggedOnly(!flaggedOnly)}
                >
                  <Flag className="h-3 w-3" />
                </Button>

                <Button
                  size="sm"
                  variant={showArchived ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowArchived(!showArchived)}
                  title={showArchived ? 'Showing archived' : 'Show archived'}
                >
                  <Archive className="h-3 w-3" />
                </Button>
              </div>

              {/* Attachments filter toggle */}
              <div className="flex items-center gap-1.5 pt-1">
                <Select
                  value={attachmentKindFilter}
                  onValueChange={(v) => setAttachmentKindFilter(v as AttachmentKind | 'all' | 'any')}
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <Paperclip className="h-3 w-3 mr-1 text-muted-foreground" />
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
                {attachmentFilterActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-1.5 text-xs text-muted-foreground"
                    onClick={() => {
                      setAttachmentKindFilter('all');
                      setAttachmentQuery('');
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* Bulk Actions Header (if items selected) */}
            {checkedVisibleIds.length > 0 && (
              <div className="p-2 border-b bg-primary/5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">
                    {targetCount} selected
                  </span>
                  <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[11px]" onClick={() => setSelectedIds([])}>
                    Clear
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => runBulk(() => bulkMarkRead(targetIds, true))}>
                    <MailOpen className="h-3 w-3 mr-1" /> Read
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => runBulk(() => bulkMarkRead(targetIds, false))}>
                    <MailQuestion className="h-3 w-3 mr-1" /> Unread
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => runBulk(() => bulkSetFlag(targetIds, true))}>
                    <Flag className="h-3 w-3 mr-1" /> Flag
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" onClick={() => handleExport(targetIds)} disabled={isExporting}>
                    <Download className="h-3 w-3 mr-1" /> Export
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={() =>
                      confirmBulk(
                        showArchived ? 'Restore threads?' : 'Archive threads?',
                        `This will ${showArchived ? 'restore' : 'archive'} ${targetCount} selected conversation(s).`,
                        showArchived ? 'Restore' : 'Archive',
                        () => bulkSetArchived(targetIds, !showArchived),
                      )
                    }
                  >
                    <Archive className="h-3 w-3 mr-1" /> {showArchived ? 'Restore' : 'Archive'}
                  </Button>
                </div>
              </div>
            )}

            {/* Select All Checkbox Header */}
            <div className="px-3 py-1.5 border-b bg-muted/40 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allVisibleChecked}
                  onCheckedChange={(v) => toggleSelectAll(v === true)}
                  aria-label="Select all visible messages"
                />
                <span>Select All ({visibleConversations.length})</span>
              </div>
              <span>{visibleConversations.length} conversation{visibleConversations.length === 1 ? '' : 's'}</span>
            </div>

            {/* Message List */}
            <ScrollArea className="flex-1 max-h-[640px]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  <p className="text-xs">Loading conversations...</p>
                </div>
              ) : visibleConversations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground space-y-2">
                  <Inbox className="h-10 w-10 mx-auto opacity-40" />
                  <p className="text-sm font-medium">No conversations found</p>
                  <p className="text-xs">
                    {overdueOnly ? 'No overdue SLA tickets' : showArchived ? 'No archived messages' : 'Messages from customers will appear here'}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {visibleConversations.map((conv) => {
                    const ChannelIcon = CHANNEL_ICONS[conv.channel as keyof typeof CHANNEL_ICONS] || Mail;
                    const StatusIcon = STATUS_ICONS[conv.status as keyof typeof STATUS_ICONS] || AlertCircle;
                    const isSelected = current?.id === conv.id;
                    const unread = conv.unread_count || 0;
                    const sla = getSlaInfo(conv, nowTick);
                    const isOverdue = sla.state === 'overdue';
                    const attCount = attachmentCountByConversation[conv.id] || 0;
                    const isChecked = selectedIds.includes(conv.id);
                    const convTag = conversationTags[conv.id] || (conv.priority === 'urgent' ? 'Urgent' : conv.status === 'resolved' ? 'Resolved' : conv.status === 'pending' ? 'In Progress' : null);

                    return (
                      <div
                        key={conv.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedConversation(conv)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setSelectedConversation(conv); }}
                        className={`w-full text-left p-3.5 transition-all cursor-pointer hover:bg-muted/60 relative ${
                          isSelected
                            ? 'bg-primary/5 border-l-4 border-l-primary shadow-sm'
                            : unread > 0
                            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-l-4 border-l-blue-500'
                            : 'border-l-4 border-l-transparent'
                        } ${isOverdue ? 'bg-red-500/5' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(v) => toggleSelected(conv.id, v === true)}
                                aria-label="Select conversation"
                              />
                            </span>

                            {/* Visual Read/Unread Status Indicator */}
                            {unread > 0 ? (
                              <span className="relative flex h-2.5 w-2.5 shrink-0" title={`${unread} unread message(s)`}>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                              </span>
                            ) : (
                              <span className="h-2.5 w-2.5 rounded-full border border-muted-foreground/30 bg-muted/20 shrink-0" title="Read" />
                            )}

                            {/* Channel Badge */}
                            <div className={`p-1 rounded-md text-xs flex items-center justify-center shrink-0 ${
                              conv.channel === 'whatsapp'
                                ? 'bg-green-500/10 text-green-600'
                                : conv.channel === 'sms'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : 'bg-blue-500/10 text-blue-600'
                            }`}>
                              <ChannelIcon className="h-3.5 w-3.5" />
                            </div>

                            <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground/90'}`}>
                              {conv.user_name || conv.user_email || conv.user_phone || 'Customer'}
                            </span>

                            {unread > 0 && (
                              <Badge className="h-4 px-1.5 text-[9px] bg-blue-600 text-white font-bold tracking-tight shrink-0">
                                NEW ({unread})
                              </Badge>
                            )}

                            {conv.is_flagged && <Flag className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}

                            {attCount > 0 && (
                              <Badge variant="secondary" className="h-4 px-1 text-[10px] gap-0.5">
                                <Paperclip className="h-2.5 w-2.5" />
                                {attCount}
                              </Badge>
                            )}
                          </div>

                          {/* Formatted timestamp with clock icon */}
                          <span
                            className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium whitespace-nowrap shrink-0"
                            title={format(new Date(conv.last_message_at), 'PPP · p')}
                          >
                            <Clock className="h-3 w-3 text-muted-foreground/70" />
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                          </span>
                        </div>

                        {/* Subject preview */}
                        <p className={`text-xs truncate mb-2 pl-6 ${unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {conv.subject || 'No subject · Incoming communication'}
                        </p>

                        {/* Meta Tags Footer: Status, Tag/Label, Region, SLA, Actions */}
                        <div className="flex items-center justify-between pl-6 text-xs gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Urgent / In Progress / Resolved Tag Badge */}
                            {convTag && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] h-4 px-1.5 font-semibold gap-1 ${TAG_BADGES[convTag].bg} ${TAG_BADGES[convTag].text} ${TAG_BADGES[convTag].border}`}
                                title={`Label: ${convTag}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${TAG_BADGES[convTag].dot}`} />
                                {convTag}
                              </Badge>
                            )}

                            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${STATUS_COLORS[conv.status] || ''}`}>
                              <StatusIcon className="h-2.5 w-2.5 mr-1" />
                              {conv.status}
                            </Badge>

                            <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground uppercase">
                              {conv.region || 'GLOBAL'}
                            </Badge>

                            <InboxSlaBadge conversation={conv} now={nowTick} />
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleFlag(conv)}
                              className="p-1 text-muted-foreground hover:text-amber-500 transition-colors"
                              title={conv.is_flagged ? 'Unflag' : 'Flag'}
                            >
                              <Flag className={`h-3 w-3 ${conv.is_flagged ? 'text-amber-500 fill-amber-500' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => markConversationRead(conv.id, unread === 0)}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors"
                              title={unread > 0 ? 'Mark as read' : 'Mark as unread'}
                            >
                              {unread > 0 ? (
                                <MailOpen className="h-3 w-3 text-blue-600" />
                              ) : (
                                <Check className="h-3 w-3 text-muted-foreground/60" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* PANE 2 & 3: Message Reader & Drafting/Replying Console (8 cols on lg) */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col h-full bg-background">
            {current ? (
              <div className="flex flex-col h-full">
                {/* 1. READER HEADER CARD */}
                <div className="p-4 border-b bg-card/80 backdrop-blur-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Customer Identity */}
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                        {(current.user_name || current.user_email || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-foreground">
                            {current.user_name || 'Valued Customer'}
                          </h3>
                          <Badge variant="secondary" className="text-[11px] font-normal gap-1">
                            <span>{flagInfo.flag}</span>
                            <span>{flagInfo.label}</span>
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs capitalize font-medium ${
                              current.channel === 'whatsapp'
                                ? 'bg-green-500/10 text-green-700 border-green-500/30'
                                : current.channel === 'sms'
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                                : 'bg-blue-500/10 text-blue-700 border-blue-500/30'
                            }`}
                          >
                            {current.channel === 'whatsapp' && <MessageSquare className="h-3 w-3 mr-1" />}
                            {current.channel === 'sms' && <Phone className="h-3 w-3 mr-1" />}
                            {current.channel === 'email' && <Mail className="h-3 w-3 mr-1" />}
                            Incoming {current.channel.toUpperCase()}
                          </Badge>
                        </div>

                        {/* Customer Contact Chips */}
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {current.user_email && (
                            <span className="flex items-center gap-1 group">
                              <Mail className="h-3 w-3" />
                              <span>{current.user_email}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(current.user_email!, 'Email')}
                                className="opacity-0 group-hover:opacity-100 hover:text-foreground"
                                title="Copy email"
                              >
                                {copiedField === 'Email' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </span>
                          )}

                          {current.user_phone && (
                            <span className="flex items-center gap-1 group">
                              <Phone className="h-3 w-3" />
                              <span>{current.user_phone}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(current.user_phone!, 'Phone')}
                                className="opacity-0 group-hover:opacity-100 hover:text-foreground"
                                title="Copy phone"
                              >
                                {copiedField === 'Phone' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </span>
                          )}

                          {current.user_id && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              ID: {current.user_id.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Header Controls & Status Switcher */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant={current.is_flagged ? 'default' : 'outline'}
                        className="h-8 px-2.5 text-xs"
                        onClick={() => toggleFlag(current)}
                        title={current.is_flagged ? 'Unflag' : 'Flag'}
                      >
                        <Flag className="h-3.5 w-3.5 mr-1" />
                        {current.is_flagged ? 'Flagged' : 'Flag'}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => markConversationRead(current.id, (current.unread_count || 0) > 0)}
                        title={(current.unread_count || 0) > 0 ? 'Mark read' : 'Mark unread'}
                      >
                        {(current.unread_count || 0) > 0 ? <MailOpen className="h-3.5 w-3.5 mr-1" /> : <MailQuestion className="h-3.5 w-3.5 mr-1" />}
                        {(current.unread_count || 0) > 0 ? 'Mark Read' : 'Unread'}
                      </Button>

                      {/* Delegate to Staff */}
                      <Select
                        value={current.assigned_to ?? 'unassigned'}
                        onValueChange={(v) => assignConversation(current.id, v === 'unassigned' ? null : v)}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <UserCheck className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                          <SelectValue placeholder="Delegate" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Status Dropdown */}
                      <Select
                        value={current.status}
                        onValueChange={async (s) => {
                          await updateConversation(current.id, { status: s });
                          setSelectedConversation({ ...current, status: s });
                        }}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Tag / Label Dropdown: Urgent, In Progress, Resolved */}
                      <Select
                        value={conversationTags[current.id] || (current.priority === 'urgent' ? 'Urgent' : current.status === 'resolved' ? 'Resolved' : current.status === 'pending' ? 'In Progress' : 'none')}
                        onValueChange={(val) => handleSetConversationTag(current.id, val === 'none' ? null : (val as MessageTag))}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs font-semibold">
                          <Tag className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                          <SelectValue placeholder="Label / Tag" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-muted-foreground">No Label</SelectItem>
                          <SelectItem value="Urgent" className="text-xs">
                            <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold">
                              <span className="h-2 w-2 rounded-full bg-red-500" />
                              Urgent
                            </span>
                          </SelectItem>
                          <SelectItem value="In Progress" className="text-xs">
                            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                              In Progress
                            </span>
                          </SelectItem>
                          <SelectItem value="Resolved" className="text-xs">
                            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              Resolved
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Subject line and In-thread search */}
                  <div className="flex items-center justify-between pt-2 border-t text-xs gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-muted-foreground shrink-0">Subject:</span>
                      <span className="font-medium text-foreground truncate">{current.subject || 'Inquiry regarding vehicle rental & services'}</span>
                      <InboxSlaBadge conversation={current} now={nowTick} showElapsed />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          value={threadSearch}
                          onChange={(e) => setThreadSearch(e.target.value)}
                          placeholder="Search in thread..."
                          className="h-6 w-36 pl-6 text-[11px] bg-background"
                        />
                        {threadSearch && (
                          <button
                            type="button"
                            onClick={() => setThreadSearch('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs text-muted-foreground"
                        onClick={() => setIsReplyConsoleExpanded(!isReplyConsoleExpanded)}
                        title={isReplyConsoleExpanded ? 'Collapse reply box' : 'Expand reply box'}
                      >
                        {isReplyConsoleExpanded ? (
                          <span className="flex items-center gap-1 text-[11px]"><ChevronDown className="h-3 w-3" /> Reply Box</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px]"><ChevronUp className="h-3 w-3" /> Draft Reply</span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 2. MESSAGE STREAM / READER PANE */}
                <ScrollArea className="flex-1 p-4 bg-slate-50/50 dark:bg-slate-950/20 max-h-[380px] lg:max-h-[440px]">
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredMessages.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground space-y-2">
                      <MessageSquare className="h-8 w-8 mx-auto opacity-30" />
                      <p className="text-sm font-medium">No messages found in this conversation</p>
                      {threadSearch && <p className="text-xs">No messages matched "{threadSearch}"</p>}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredMessages.map((msg) => {
                        const isAdmin = msg.sender_type === 'admin';
                        const isSystem = msg.sender_type === 'system';
                        const ChannelIcon = CHANNEL_ICONS[msg.channel as keyof typeof CHANNEL_ICONS] || Mail;

                        if (isSystem) {
                          return (
                            <div key={msg.id} className="flex justify-center my-2">
                              <div className="bg-muted/80 text-muted-foreground text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 border">
                                <Zap className="h-3 w-3 text-amber-500" />
                                <span>{msg.content}</span>
                                <span className="text-[10px] opacity-70">
                                  {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                          >
                            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-muted-foreground px-1">
                              <ChannelIcon className="h-3 w-3" />
                              <span className="font-semibold text-foreground">
                                {isAdmin ? 'Rentmaikar Support' : current.user_name || 'Customer'}
                              </span>
                              <span>·</span>
                              <span>{format(new Date(msg.created_at), 'MMM d, h:mm a')}</span>
                            </div>

                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                                isAdmin
                                  ? 'bg-primary text-primary-foreground rounded-tr-none'
                                  : 'bg-card border text-card-foreground rounded-tl-none'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap leading-relaxed select-text">
                                {msg.content}
                              </p>

                              {/* Attachments within message */}
                              <div className="mt-2">
                                <MessageAttachments
                                  metadata={msg.metadata}
                                  messageId={msg.id}
                                  conversationId={current.id}
                                  highlightQuery={threadSearch}
                                />
                              </div>

                              <div className={`text-[10px] mt-1.5 flex items-center justify-end gap-1 ${
                                isAdmin ? 'text-primary-foreground/70' : 'text-muted-foreground'
                              }`}>
                                <span>{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                                {isAdmin && (
                                  <span title="Delivered to customer">
                                    <Check className="h-3 w-3 inline text-emerald-300" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* 2.5 AI AUTO-RESPONDER & KNOWLEDGE BASE GROUNDING CARD */}
                <div className="p-3 border-t bg-muted/25">
                  <AiAutoResponderCard
                    conversationId={current.id}
                    customerName={current.user_name || current.user_email || 'Valued Customer'}
                    channel={replyChannel}
                    latestInboundContent={latestInboundMessage}
                    conversationSubject={current.subject || ''}
                    placeholderValues={placeholderValues}
                    onApplyDraft={({ subject, body }) => {
                      if (subject && replyChannel === 'email') {
                        setReplySubject(subject);
                      }
                      setReplyBody(body);
                      setEditorTab('draft');
                    }}
                  />
                </div>

                {/* 3. DRAFTING & REPLYING CONSOLE (DOCKED AT BOTTOM) */}
                {isReplyConsoleExpanded && (
                  <div className="border-t bg-card/90 p-4 space-y-3 shadow-md">
                    {/* Console Action & Channel Selection Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {/* Channel Switcher */}
                      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg text-xs">
                        <span className="text-[11px] font-semibold text-muted-foreground px-2">Reply via:</span>
                        <Button
                          type="button"
                          size="sm"
                          variant={replyChannel === 'email' ? 'default' : 'ghost'}
                          className="h-7 text-xs px-2.5 gap-1"
                          onClick={() => setReplyChannel('email')}
                        >
                          <Mail className="h-3.5 w-3.5" /> Email
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={replyChannel === 'whatsapp' ? 'default' : 'ghost'}
                          className="h-7 text-xs px-2.5 gap-1"
                          onClick={() => setReplyChannel('whatsapp')}
                        >
                          <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={replyChannel === 'sms' ? 'default' : 'ghost'}
                          className="h-7 text-xs px-2.5 gap-1"
                          onClick={() => setReplyChannel('sms')}
                        >
                          <Phone className="h-3.5 w-3.5" /> SMS
                        </Button>
                      </div>

                      {/* Auto-save draft status indicator */}
                      <div className="flex items-center gap-2 text-xs">
                        {lastDraftSavedTime ? (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Draft auto-saved {lastDraftSavedTime}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">Drafts auto-save per thread</span>
                        )}

                        {replyBody && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={handleDiscardDraft}
                            className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                            title="Discard draft"
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Discard
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* CHANNEL SPECIFIC CONFIGURATION BARS */}
                    {replyChannel === 'email' && (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2 rounded-md bg-muted/40 border text-xs">
                        <div className="sm:col-span-8 flex items-center gap-2">
                          <span className="font-semibold text-muted-foreground whitespace-nowrap">Subject:</span>
                          <Input
                            value={replySubject}
                            onChange={(e) => setReplySubject(e.target.value)}
                            className="h-7 text-xs bg-background"
                            placeholder="Email subject..."
                          />
                        </div>
                        <div className="sm:col-span-4 flex items-center gap-2">
                          <span className="font-semibold text-muted-foreground whitespace-nowrap">From:</span>
                          <Select value={replyFromAlias} onValueChange={setReplyFromAlias}>
                            <SelectTrigger className="h-7 text-xs bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={OUTGOING_EMAIL_CONFIG.support}>support@notify.rentmaikar.com</SelectItem>
                              <SelectItem value={OUTGOING_EMAIL_CONFIG.payments}>payments@notify.rentmaikar.com</SelectItem>
                              <SelectItem value={OUTGOING_EMAIL_CONFIG.documents}>documents@notify.rentmaikar.com</SelectItem>
                              <SelectItem value={OUTGOING_EMAIL_CONFIG.admin}>admin@notify.rentmaikar.com</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {replyChannel === 'whatsapp' && (
                      <div className="p-2 rounded-md bg-green-500/10 border border-green-500/20 text-xs space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-green-800 dark:text-green-300 font-semibold flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Official WhatsApp Session ({whatsappRouting.designatedSenderNumber})
                          </span>
                          <Badge variant="outline" className="text-[10px] bg-green-500/10 border-green-500/30">
                            {whatsappRouting.provider} · {whatsappRouting.region}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={replyWhatsappTemplateId}
                            onValueChange={(val) => {
                              setReplyWhatsappTemplateId(val);
                              const tpl = WHATSAPP_TEMPLATES_CATALOG.find((t) => t.id === val);
                              if (tpl) {
                                handleApplyTemplate(tpl.body, tpl.title);
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs bg-background">
                              <SelectValue placeholder="Insert Meta-Approved WhatsApp Template..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-56">
                              {WHATSAPP_TEMPLATES_CATALOG.map((tpl) => (
                                <SelectItem key={tpl.id} value={tpl.id} className="text-xs">
                                  <span className="font-semibold">{tpl.title}</span> ({tpl.category})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {replyChannel === 'sms' && (
                      <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                            Route: {smsRouting.providerName} (Sender ID: {smsRouting.senderId})
                          </span>
                          {smsSegmentsInfo && (
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {smsSegmentsInfo.characterCount} chars · {smsSegmentsInfo.segments} segment{smsSegmentsInfo.segments === 1 ? '' : 's'} ({smsSegmentsInfo.encoding})
                            </Badge>
                          )}
                        </div>

                        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground select-none">
                          <Checkbox
                            checked={replySmsOptOut}
                            onCheckedChange={(c) => setReplySmsOptOut(c === true)}
                          />
                          <span>Append Opt-Out notice</span>
                        </label>
                      </div>
                    )}

                    {/* SMART DRAFT ASSIST & PLACEHOLDERS TOOLBAR */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs">
                      {/* Smart Prompt Templates */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-muted-foreground font-semibold flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-purple-500" />
                          Smart Draft:
                        </span>

                        <Select
                          onValueChange={(id) => {
                            const found = SMART_REPLY_TEMPLATES.find((t) => t.id === id);
                            if (found) {
                              handleApplyTemplate(found.body, found.subject);
                            }
                          }}
                        >
                          <SelectTrigger className="h-6 text-[11px] w-[170px] bg-background">
                            <SelectValue placeholder="Quick response template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {SMART_REPLY_TEMPLATES.map((tpl) => (
                              <SelectItem key={tpl.id} value={tpl.id} className="text-xs">
                                <span className="font-semibold">{tpl.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Canned replies dropdown */}
                        <Select
                          value=""
                          onValueChange={(id) => {
                            const canned = cannedReplies.find((r) => r.id === id);
                            if (canned) {
                              handleApplyTemplate(canned.body, undefined, { id: canned.id, title: canned.title });
                            }
                          }}
                        >
                          <SelectTrigger className="h-6 text-[11px] w-[140px] bg-background">
                            <SelectValue placeholder="Canned reply..." />
                          </SelectTrigger>
                          <SelectContent>
                            {cannedReplies.filter((r) => r.is_active && (!r.channel || r.channel === replyChannel)).length === 0 ? (
                              <SelectItem value="__none__" disabled>No canned replies</SelectItem>
                            ) : (
                              cannedReplies
                                .filter((r) => r.is_active && (!r.channel || r.channel === replyChannel))
                                .map((r) => (
                                  <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>

                        {/* Placeholders Quick Dropdown */}
                        <Select onValueChange={handleInsertPlaceholder}>
                          <SelectTrigger className="h-6 text-[11px] w-[130px] bg-background">
                            <SelectValue placeholder="Insert tag..." />
                          </SelectTrigger>
                          <SelectContent>
                            {QUICK_PLACEHOLDERS.map((p) => (
                              <SelectItem key={p.value} value={p.value} className="text-xs font-mono">
                                {p.label} ({p.value})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Saved Responses archives & quick insert */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSavedResponseInitialDraft(replyBody);
                            setIsSavedResponsesModalOpen(true);
                          }}
                          className="h-6 px-2 text-[11px] font-medium gap-1 bg-background hover:bg-muted shadow-2xs text-foreground"
                          title="Browse, use or archive standardized saved responses"
                        >
                          <Bookmark className="h-3 w-3 text-amber-500" />
                          Saved Responses
                        </Button>

                        {replyBody.trim().length > 10 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSavedResponseInitialDraft(replyBody);
                              setIsSavedResponsesModalOpen(true);
                            }}
                            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                            title="Save current drafted response to Saved Responses archive"
                          >
                            <Save className="h-3 w-3 text-muted-foreground" />
                            Save as Standard Reply
                          </Button>
                        )}
                      </div>

                      {/* Tab between drafting and live preview */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditorTab('draft')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            editorTab === 'draft' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Draft Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorTab('preview')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                            editorTab === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Eye className="h-3 w-3" />
                          Customer Preview
                        </button>
                      </div>
                    </div>

                    {/* DRAFT TEXTAREA OR LIVE PREVIEW */}
                    {editorTab === 'draft' ? (
                      <div className="space-y-1.5">
                        <Textarea
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={`Type your reply to ${current.user_name || 'the customer'} via ${replyChannel.toUpperCase()}... (Ctrl+Enter to send)`}
                          className="min-h-[110px] text-sm resize-y leading-relaxed font-sans"
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/40 p-3 min-h-[110px] space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-semibold">Simulated Customer View ({replyChannel.toUpperCase()})</span>
                          <span>Live placeholder resolution active</span>
                        </div>
                        <div className="bg-background rounded-md p-3 border text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                          {renderedReplyPreview || <span className="italic text-muted-foreground">Draft is currently empty</span>}
                        </div>
                      </div>
                    )}

                    {/* ATTACHMENTS LIST */}
                    {pendingFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {pendingFiles.map((file, i) => (
                          <div
                            key={`${file.name}-${i}`}
                            className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs shadow-sm"
                          >
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <span className="max-w-[160px] truncate font-medium">{file.name}</span>
                            <span className="text-muted-foreground text-[10px]">({formatFileSize(file.size)})</span>
                            <button
                              type="button"
                              onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              className="text-muted-foreground hover:text-destructive ml-1"
                              aria-label={`Remove ${file.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* SEND ACTIONS BAR */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                          onChange={(e) => handleAddFiles(e.target.files)}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={pendingFiles.length >= MAX_ATTACHMENTS}
                          className="h-8 gap-1.5 text-xs"
                          title="Attach files (images, PDFs, documents)"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Attach File
                          {pendingFiles.length > 0 && ` (${pendingFiles.length})`}
                        </Button>

                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          {isUploadingFiles
                            ? 'Uploading attachments...'
                            : isDeliveryInProgress || isSendingReply
                            ? 'Delivering message...'
                            : 'Press Ctrl+Enter to send instantly'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Send & Resolve Shortcut Button */}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSendReply('resolved')}
                          disabled={(!replyBody.trim() && pendingFiles.length === 0) || isSendingReply || isDeliveryInProgress}
                          className="h-8 text-xs gap-1 hidden sm:flex"
                        >
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          Send & Resolve
                        </Button>

                        {/* Primary Send Button */}
                        <Button
                          size="sm"
                          onClick={() => handleSendReply()}
                          disabled={(!replyBody.trim() && pendingFiles.length === 0) || isSendingReply || isDeliveryInProgress}
                          className="h-8 text-xs gap-1.5 px-4 shadow-sm"
                        >
                          {isSendingReply || isDeliveryInProgress ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Send via {replyChannel.toUpperCase()}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground space-y-3">
                <div className="p-4 rounded-full bg-muted/60 border shadow-inner">
                  <MessageSquare className="h-10 w-10 text-primary opacity-60" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-base font-semibold text-foreground">Select an incoming message</h3>
                  <p className="text-xs">
                    Choose a conversation from the sidebar to inspect full thread history, review customer context, and draft multi-channel replies.
                  </p>
                </div>
                {onComposeNew && (
                  <Button size="sm" onClick={onComposeNew} className="gap-1.5 mt-2">
                    <Plus className="h-3.5 w-3.5" />
                    Compose Outbound Message
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Confirmation Dialog for Bulk Operations */}
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

      {/* Saved Responses Management & Insertion Modal */}
      <SavedResponsesModal
        open={isSavedResponsesModalOpen}
        onOpenChange={setIsSavedResponsesModalOpen}
        currentDraftBody={savedResponseInitialDraft || replyBody}
        placeholderValues={placeholderValues}
        onSelectResponse={({ subject, body }) => {
          if (subject && replyChannel === 'email') {
            setReplySubject(subject);
          }
          setReplyBody(body);
          setEditorTab('draft');
        }}
      />
    </div>
  );
};

export default AdminMessageConsole;
