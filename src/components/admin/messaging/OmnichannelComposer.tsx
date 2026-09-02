import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Send, 
  Mail, 
  Phone, 
  MessageSquare, 
  Paperclip, 
  X, 
  User, 
  Users,
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Save, 
  FileText, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  CornerDownRight, 
  Eye, 
  Layers,
  HelpCircle,
  Smartphone,
  Globe,
  ChevronLeft,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCannedReplies } from '@/hooks/useCannedReplies';
import { renderPlaceholders } from '@/lib/reply-placeholders';
import { EMAIL_CONFIG, EMAIL_SENDER_NAMES } from '@/lib/email-config';
import { sent } from '@/integrations/sent/client';
import {
  MAX_ATTACHMENTS,
  uploadInboxAttachments,
  validateAttachmentFile,
  formatFileSize,
  type OutboundAttachment,
} from '@/lib/inbox-attachments';
import { saveStoredDraft, deleteStoredDraft } from './DraftsManager';
import { BulkContactSelector } from './BulkContactSelector';
import { BulkDispatchProgressModal } from './BulkDispatchProgressModal';
import type { MessagingChannel, UserContact, SavedDraft, BulkSendResult } from './types';

const COUNTRY_PREFIXES = [
  { code: '+1', country: 'United States & Canada', flag: '🇺🇸' },
  { code: '+234', country: 'Nigeria', flag: '🇳🇬' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+233', country: 'Ghana', flag: '🇬🇭' },
  { code: '+254', country: 'Kenya', flag: '🇰🇪' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

const WHATSAPP_TEMPLATES = [
  {
    id: 'rentmaikar_welcome',
    title: 'Welcome to Rentmaikar',
    body: 'Hello {{user_name}}, welcome to Rentmaikar! Your driver application has been received and is being verified by our operations team. We will notify you once approved.',
  },
  {
    id: 'rentmaikar_payment_reminder',
    title: 'Rental Payment Due Reminder',
    body: 'Hi {{user_name}}, this is a friendly reminder that your weekly rental fee is scheduled for processing. Please ensure your payment method has sufficient funds.',
  },
  {
    id: 'rentmaikar_vehicle_assigned',
    title: 'Vehicle Pickup Ready',
    body: 'Hello {{user_name}}, your vehicle is ready for pickup at the designated hub! Please bring your driver license and agreement confirmation.',
  },
  {
    id: 'rentmaikar_inspection_alert',
    title: 'Weekly Inspection Reminder',
    body: 'Hi {{user_name}}, please complete your weekly vehicle safety check and photo upload via the driver portal today.',
  },
];

interface OmnichannelComposerProps {
  initialDraft?: SavedDraft | null;
  onMessageDispatched?: (conversationId: string) => void;
  onDraftSaved?: () => void;
}

export const OmnichannelComposer = ({
  initialDraft,
  onMessageDispatched,
  onDraftSaved,
}: OmnichannelComposerProps) => {
  const { user } = useAuth();
  const { replies: cannedReplies } = useCannedReplies();

  // Channel & Target mode
  const [channel, setChannel] = useState<MessagingChannel>('email');
  const [recipientMode, setRecipientMode] = useState<'search' | 'manual' | 'bulk'>('search');

  // Single Recipient Info
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserContact[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserContact | null>(null);

  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+1');

  // Bulk Recipients State
  const [bulkRecipients, setBulkRecipients] = useState<UserContact[]>([]);
  const [previewRecipientIndex, setPreviewRecipientIndex] = useState(0);

  // Email specific fields
  const [emailSubject, setEmailSubject] = useState('');
  const [emailSenderAlias, setEmailSenderAlias] = useState<string>('support');
  const [emailPriority, setEmailPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');

  // SMS specific fields
  const [smsOptOut, setSmsOptOut] = useState(true);

  // WhatsApp specific fields
  const [selectedWhatsAppTemplate, setSelectedWhatsAppTemplate] = useState<string>('custom');

  // Core content & attachments
  const [messageContent, setMessageContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null);
  const [previewTab, setPreviewTab] = useState<'edit' | 'preview'>('edit');

  // Bulk dispatch progress modal states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({
    current: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
    activeName: '',
  });
  const [bulkResults, setBulkResults] = useState<BulkSendResult | null>(null);
  const isAbortedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize draft if provided
  useEffect(() => {
    if (initialDraft) {
      setActiveDraftId(initialDraft.id);
      setChannel(initialDraft.channel);
      setRecipientMode(initialDraft.recipientMode || 'search');
      setManualName(initialDraft.recipientName || '');
      setManualEmail(initialDraft.recipientEmail || '');
      setManualPhone(initialDraft.recipientPhone || '');
      setEmailSubject(initialDraft.emailSubject || '');
      setEmailSenderAlias(initialDraft.emailFromAlias || 'support');
      setEmailPriority(initialDraft.emailPriority || 'normal');
      setMessageContent(initialDraft.content || '');
      setSmsOptOut(initialDraft.smsOptOut ?? true);
      setSelectedWhatsAppTemplate(initialDraft.whatsappTemplateId || 'custom');
      if (initialDraft.smsCountry) setPhonePrefix(initialDraft.smsCountry);

      // Restore bulk recipients if present
      if (initialDraft.bulkRecipients && Array.isArray(initialDraft.bulkRecipients)) {
        setBulkRecipients(initialDraft.bulkRecipients);
      }

      if (initialDraft.recipientUserId) {
        // Query user details
        supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .eq('user_id', initialDraft.recipientUserId)
          .single()
          .then(({ data }) => {
            if (data) {
              setSelectedUser({
                user_id: data.user_id,
                full_name: data.full_name,
                email: data.email,
                phone: data.phone,
                role: 'user',
              });
            }
          });
      }
    }
  }, [initialDraft]);

  // Search users with debounce for single mode
  useEffect(() => {
    if (recipientMode !== 'search' || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
          .limit(10);

        if (error) throw error;

        const userIds = (profiles || []).map((p) => p.user_id);
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);

        const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role]));

        const results: UserContact[] = (profiles || []).map((p) => ({
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          role: roleMap.get(p.user_id) || 'driver',
        }));

        setSearchResults(results);
      } catch (err) {
        console.error('User search error:', err);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, recipientMode]);

  // Keep preview index bounded when bulkRecipients changes
  useEffect(() => {
    if (previewRecipientIndex >= bulkRecipients.length) {
      setPreviewRecipientIndex(Math.max(0, bulkRecipients.length - 1));
    }
  }, [bulkRecipients.length, previewRecipientIndex]);

  // Derived effective recipient details for single & preview
  const effectiveRecipient = useMemo(() => {
    if (recipientMode === 'bulk' && bulkRecipients.length > 0) {
      const activeContact = bulkRecipients[previewRecipientIndex] || bulkRecipients[0];
      return {
        id: activeContact.user_id,
        name: activeContact.full_name || 'Driver / Customer',
        email: activeContact.email || '',
        phone: activeContact.phone || '',
      };
    }

    if (recipientMode === 'search' && selectedUser) {
      return {
        id: selectedUser.user_id,
        name: selectedUser.full_name || 'Driver / Customer',
        email: selectedUser.email || '',
        phone: selectedUser.phone || '',
      };
    }

    return {
      id: null,
      name: manualName || 'Recipient',
      email: manualEmail,
      phone: manualPhone.startsWith('+') ? manualPhone : `${phonePrefix}${manualPhone.replace(/^\+/, '')}`,
    };
  }, [recipientMode, bulkRecipients, previewRecipientIndex, selectedUser, manualName, manualEmail, manualPhone, phonePrefix]);

  // Auto-fill template dynamic placeholders
  const placeholderMap = useMemo(() => {
    return {
      user_name: effectiveRecipient.name || 'Valued Customer',
      user_first_name: (effectiveRecipient.name || '').split(' ')[0] || 'there',
      user_email: effectiveRecipient.email || 'customer@rentmaikar.com',
      user_phone: effectiveRecipient.phone || '+15550199000',
      support_email: EMAIL_CONFIG[emailSenderAlias as keyof typeof EMAIL_CONFIG] || EMAIL_CONFIG.support,
      support_phone: '+1 (608) 384-3932',
      company_name: 'Rentmaikar',
      current_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  }, [effectiveRecipient, emailSenderAlias]);

  // Compute final body including template placeholders and SMS opt-out
  const computedBody = useMemo(() => {
    let text = renderPlaceholders(messageContent, placeholderMap, { keepUnknown: false });
    if (channel === 'sms' && smsOptOut && !text.toLowerCase().includes('stop to opt out')) {
      text = `${text.trim()}\n\nReply STOP to opt out.`;
    }
    return text;
  }, [messageContent, placeholderMap, channel, smsOptOut]);

  // Character & SMS Segment calculations
  const charCount = computedBody.length;
  const isGsm7 = /^[\u0000-\u007F\u20AC]*$/.test(computedBody);
  const segmentLimit = isGsm7 ? 160 : 70;
  const multiSegmentLimit = isGsm7 ? 153 : 67;
  const smsSegments = charCount <= segmentLimit ? 1 : Math.ceil(charCount / multiSegmentLimit);

  // Attachment handling
  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const valid: File[] = [];
    incoming.forEach((f) => {
      const err = validateAttachmentFile(f);
      if (err) toast.error(err);
      else valid.push(f);
    });

    setPendingFiles((prev) => {
      const merged = [...prev, ...valid];
      if (merged.length > MAX_ATTACHMENTS) {
        toast.error(`You can attach up to ${MAX_ATTACHMENTS} files`);
        return merged.slice(0, MAX_ATTACHMENTS);
      }
      return merged;
    });
  };

  // Save Draft logic
  const handleSaveDraft = (manual = true) => {
    const draftId = activeDraftId || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const draft: SavedDraft = {
      id: draftId,
      channel,
      recipientMode,
      recipientUserId: selectedUser?.user_id || null,
      recipientName: effectiveRecipient.name,
      recipientEmail: effectiveRecipient.email,
      recipientPhone: effectiveRecipient.phone,
      bulkRecipients: recipientMode === 'bulk' ? bulkRecipients : undefined,
      emailSubject,
      emailFromAlias: emailSenderAlias,
      emailPriority,
      content: messageContent,
      smsCountry: phonePrefix,
      smsOptOut,
      whatsappTemplateId: selectedWhatsAppTemplate,
      updatedAt: new Date().toISOString(),
      createdAt: initialDraft?.createdAt || new Date().toISOString(),
    };

    saveStoredDraft(draft);
    setActiveDraftId(draftId);
    setLastAutoSavedAt(new Date());
    if (manual) {
      toast.success('Draft saved successfully');
      onDraftSaved?.();
    }
  };

  // Auto-save debounce
  useEffect(() => {
    if (!messageContent && !emailSubject && !manualName && !selectedUser && bulkRecipients.length === 0) return;
    const timer = setTimeout(() => {
      handleSaveDraft(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [messageContent, emailSubject, manualName, manualEmail, manualPhone, channel, selectedUser, bulkRecipients, recipientMode]);

  // Insert Canned Reply
  const handleInsertCanned = (replyId: string) => {
    const canned = cannedReplies.find((r) => r.id === replyId);
    if (canned) {
      const rendered = renderPlaceholders(canned.body, placeholderMap, { keepUnknown: false });
      setMessageContent((prev) => (prev ? `${prev}\n\n${rendered}` : rendered));
      if (canned.subject && !emailSubject) {
        setEmailSubject(renderPlaceholders(canned.subject, placeholderMap, { keepUnknown: false }));
      }
      toast.success(`Inserted "${canned.title}" template`);
    }
  };

  // Select WhatsApp Template
  const handleWhatsAppTemplateChange = (templateId: string) => {
    setSelectedWhatsAppTemplate(templateId);
    if (templateId === 'custom') return;
    const tpl = WHATSAPP_TEMPLATES.find((t) => t.id === templateId);
    if (tpl) {
      const rendered = renderPlaceholders(tpl.body, placeholderMap, { keepUnknown: false });
      setMessageContent(rendered);
      toast.success(`Applied template: ${tpl.title}`);
    }
  };

  // Single recipient helper for dispatch
  const dispatchSingleContact = async (
    contact: UserContact,
    uploadedAttachments: OutboundAttachment[],
  ): Promise<{ success: boolean; error?: string; conversationId?: string }> => {
    try {
      const contactPlaceholders = {
        user_name: contact.full_name || 'Valued Customer',
        user_first_name: (contact.full_name || '').split(' ')[0] || 'there',
        user_email: contact.email || 'customer@rentmaikar.com',
        user_phone: contact.phone || '+15550199000',
        support_email: EMAIL_CONFIG[emailSenderAlias as keyof typeof EMAIL_CONFIG] || EMAIL_CONFIG.support,
        support_phone: '+1 (608) 384-3932',
        company_name: 'Rentmaikar',
        current_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };

      let body = renderPlaceholders(messageContent, contactPlaceholders, { keepUnknown: false });
      if (channel === 'sms' && smsOptOut && !body.toLowerCase().includes('stop to opt out')) {
        body = `${body.trim()}\n\nReply STOP to opt out.`;
      }
      const subject = channel === 'email' ? renderPlaceholders(emailSubject, contactPlaceholders, { keepUnknown: false }) : `${channel.toUpperCase()} Outbound Message`;

      // 1. Find or create conversation in `inbox_conversations`
      let conversationId: string | null = null;
      let findQuery = supabase.from('inbox_conversations').select('id').eq('channel', channel);

      if (contact.user_id && !contact.user_id.startsWith('custom_')) {
        findQuery = findQuery.eq('user_id', contact.user_id);
      } else if (channel === 'email' && contact.email) {
        findQuery = findQuery.eq('user_email', contact.email);
      } else if (contact.phone) {
        findQuery = findQuery.eq('user_phone', contact.phone);
      }

      const { data: existingConvs } = await findQuery.limit(1);

      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
        await supabase
          .from('inbox_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            status: 'pending',
            subject: subject || existingConvs[0].subject || `${channel.toUpperCase()} Outbound Message`,
          })
          .eq('id', conversationId);
      } else {
        const isNg = (contact.phone && contact.phone.startsWith('+234')) || contact.country === 'NG';
        const { data: newConv, error: createConvError } = await supabase
          .from('inbox_conversations')
          .insert({
            channel,
            user_id: contact.user_id && !contact.user_id.startsWith('custom_') ? contact.user_id : null,
            user_name: contact.full_name || 'Recipient',
            user_email: contact.email || null,
            user_phone: contact.phone || null,
            subject: subject || `${channel.toUpperCase()} Outbound Message`,
            status: 'pending',
            priority: emailPriority,
            region: isNg ? 'NG' : 'US',
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (createConvError || !newConv) {
          throw new Error(createConvError?.message || 'Failed to create conversation record');
        }
        conversationId = newConv.id;
      }

      // 2. Insert outbound message to `inbox_messages`
      const senderDisplayName = EMAIL_SENDER_NAMES[emailSenderAlias as keyof typeof EMAIL_SENDER_NAMES] || 'Rentmaikar Staff';

      const { error: msgError } = await supabase
        .from('inbox_messages')
        .insert({
          conversation_id: conversationId,
          sender_type: 'admin',
          sender_id: user?.id || null,
          sender_name: senderDisplayName,
          content: body,
          channel,
          is_read: true,
          read_at: new Date().toISOString(),
          ...(uploadedAttachments.length > 0
            ? { metadata: { attachments_detail: uploadedAttachments, from_alias: emailSenderAlias } as unknown as Record<string, never> }
            : { metadata: { from_alias: emailSenderAlias } as unknown as Record<string, never> }),
        });

      if (msgError) throw msgError;

      // 3. Trigger external delivery
      if (channel === 'email' && contact.email) {
        try {
          await supabase.functions.invoke('send-email-reply', {
            body: {
              conversationId,
              messageContent: body,
              recipientEmail: contact.email,
              subject,
              fromAlias: emailSenderAlias,
              attachments: uploadedAttachments,
            },
          });
        } catch (e) {
          console.warn('Edge email delivery warning for contact:', contact.email, e);
        }
      } else if ((channel === 'sms' || channel === 'whatsapp') && contact.phone) {
        try {
          const { error: twilioErr } = await supabase.functions.invoke('send-inbox-reply', {
            body: {
              conversationId,
              messageContent: body,
              channel,
              recipientPhone: contact.phone,
              attachments: uploadedAttachments,
            },
          });

          if (twilioErr) {
            // Backup bridge via Sent.dm client
            await sent.sendMessage({
              to: contact.phone,
              channel: channel === 'whatsapp' ? 'whatsapp' : 'sms',
              text: body,
            });
          }
        } catch (e) {
          console.warn('SMS/WhatsApp delivery warning for contact:', contact.phone, e);
        }
      }

      return { success: true, conversationId };
    } catch (err: any) {
      console.error(`Error sending message to ${contact.full_name}:`, err);
      return { success: false, error: err.message || 'Dispatch error' };
    }
  };

  // Main Dispatch Handler (handles Single, Manual, and Bulk)
  const handleDispatch = async () => {
    // Validations
    if (!messageContent.trim() && pendingFiles.length === 0) {
      toast.error('Please enter a message or attach a file');
      return;
    }

    if (channel === 'email' && !emailSubject.trim()) {
      toast.error('Please specify an email subject');
      return;
    }

    // Single / Manual Mode Validation
    if (recipientMode !== 'bulk') {
      if (channel === 'email') {
        if (!effectiveRecipient.email || !effectiveRecipient.email.includes('@')) {
          toast.error('A valid recipient email address is required for Email dispatch');
          return;
        }
      } else {
        if (!effectiveRecipient.phone || effectiveRecipient.phone.length < 7) {
          toast.error(`A valid recipient phone number is required for ${channel.toUpperCase()} dispatch`);
          return;
        }
      }
    }

    // Bulk Mode Validation
    let targetBulkContacts: UserContact[] = [];
    if (recipientMode === 'bulk') {
      if (bulkRecipients.length === 0) {
        toast.error('Please select at least one recipient for bulk broadcast');
        return;
      }

      // Filter compatible recipients for active channel
      targetBulkContacts = bulkRecipients.filter((r) => {
        if (channel === 'email') return r.email && r.email.includes('@');
        return r.phone && r.phone.length >= 7;
      });

      if (targetBulkContacts.length === 0) {
        toast.error(
          `None of the ${bulkRecipients.length} selected recipients have a valid ${
            channel === 'email' ? 'email address' : 'phone number'
          } for ${channel.toUpperCase()} broadcast`,
        );
        return;
      }

      if (targetBulkContacts.length < bulkRecipients.length) {
        const skipped = bulkRecipients.length - targetBulkContacts.length;
        toast.warning(`Note: ${skipped} contact(s) missing required ${channel === 'email' ? 'email' : 'phone'} will be skipped.`);
      }
    }

    // Begin Dispatch
    setIsDispatching(true);

    try {
      // 1. Upload attachments once up-front
      let uploadedAttachments: OutboundAttachment[] = [];
      if (pendingFiles.length > 0) {
        if (!user) {
          toast.error('You must be signed in to upload attachments');
          setIsDispatching(false);
          return;
        }
        setIsUploading(true);
        const { attachments, errors } = await uploadInboxAttachments(
          pendingFiles,
          user.id,
          activeDraftId || 'outbound_composer',
        );
        setIsUploading(false);
        if (errors.length > 0) {
          errors.forEach((e) => toast.error(e));
        }
        uploadedAttachments = attachments;
      }

      // ==========================================
      // BULK BROADCAST DISPATCH FLOW
      // ==========================================
      if (recipientMode === 'bulk') {
        isAbortedRef.current = false;
        setIsBulkSending(true);
        setIsBulkModalOpen(true);
        setBulkProgress({
          current: 0,
          total: targetBulkContacts.length,
          succeeded: 0,
          failed: 0,
          activeName: 'Starting broadcast...',
        });

        const resultsDetail: BulkSendResult['details'] = [];
        let succeeded = 0;
        let failed = 0;

        // Process in manageable chunks of 3 with slight pacing
        const chunkSize = 3;
        for (let i = 0; i < targetBulkContacts.length; i += chunkSize) {
          if (isAbortedRef.current) {
            toast.info('Bulk broadcast aborted by user');
            break;
          }

          const chunk = targetBulkContacts.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map(async (contact, indexInChunk) => {
              const overallIndex = i + indexInChunk + 1;
              setBulkProgress((prev) => ({
                ...prev,
                activeName: contact.full_name || contact.email || contact.phone || `Recipient ${overallIndex}`,
              }));

              const res = await dispatchSingleContact(contact, uploadedAttachments);
              if (res.success) {
                succeeded++;
              } else {
                failed++;
              }

              resultsDetail.push({
                recipient: contact,
                success: res.success,
                error: res.error,
                conversationId: res.conversationId,
              });

              setBulkProgress({
                current: overallIndex,
                total: targetBulkContacts.length,
                succeeded,
                failed,
                activeName: contact.full_name || 'Processing...',
              });
            }),
          );

          // Brief delay between batches
          if (i + chunkSize < targetBulkContacts.length) {
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }

        const finalResult: BulkSendResult = {
          total: targetBulkContacts.length,
          succeeded,
          failed,
          details: resultsDetail,
        };

        setBulkResults(finalResult);
        setIsBulkSending(false);

        if (activeDraftId) {
          deleteStoredDraft(activeDraftId);
        }

        if (succeeded > 0) {
          toast.success(`Broadcast successfully sent to ${succeeded} recipient(s)!`);
        }
        return;
      }

      // ==========================================
      // SINGLE / MANUAL DISPATCH FLOW
      // ==========================================
      const singleContact: UserContact = {
        user_id: effectiveRecipient.id || `manual_${Date.now()}`,
        full_name: effectiveRecipient.name,
        email: effectiveRecipient.email || null,
        phone: effectiveRecipient.phone || null,
        role: 'user',
      };

      const result = await dispatchSingleContact(singleContact, uploadedAttachments);

      if (!result.success) {
        toast.error(result.error || 'Failed to dispatch message');
        return;
      }

      if (activeDraftId) {
        deleteStoredDraft(activeDraftId);
      }

      toast.success(
        channel === 'email'
          ? `Email dispatched to ${effectiveRecipient.email}`
          : `${channel.toUpperCase()} message sent to ${effectiveRecipient.phone}`,
      );

      // Reset form
      setMessageContent('');
      setEmailSubject('');
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (result.conversationId) {
        onMessageDispatched?.(result.conversationId);
      }
    } catch (err: any) {
      console.error('Fatal dispatch error:', err);
      toast.error(err.message || 'Failed to dispatch message');
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Channel Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Compose & Draft New Message
          </h3>
          <p className="text-sm text-muted-foreground">
            Send omnichannel communications directly via Email, SMS, or WhatsApp to single contacts or bulk audiences.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lastAutoSavedAt && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              Auto-saved {lastAutoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSaveDraft(true)}
            className="gap-1.5 h-8 text-xs"
          >
            <Save className="h-3.5 w-3.5" />
            Save Draft
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Channel Selector */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  1. Select Delivery Channel
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={channel === 'email' ? 'default' : 'outline'}
                    className="h-14 flex flex-col items-center justify-center gap-1"
                    onClick={() => setChannel('email')}
                  >
                    <Mail className="h-4 w-4" />
                    <span className="text-xs font-medium">Email</span>
                  </Button>
                  <Button
                    type="button"
                    variant={channel === 'sms' ? 'default' : 'outline'}
                    className="h-14 flex flex-col items-center justify-center gap-1"
                    onClick={() => setChannel('sms')}
                  >
                    <Phone className="h-4 w-4" />
                    <span className="text-xs font-medium">SMS Text</span>
                  </Button>
                  <Button
                    type="button"
                    variant={channel === 'whatsapp' ? 'default' : 'outline'}
                    className="h-14 flex flex-col items-center justify-center gap-1"
                    onClick={() => setChannel('whatsapp')}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs font-medium">WhatsApp</span>
                  </Button>
                </div>
              </div>

              {/* Recipient Mode Selector */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    2. Recipient Selection
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={recipientMode === 'search' ? 'secondary' : 'ghost'}
                      className="h-7 text-xs px-2.5"
                      onClick={() => setRecipientMode('search')}
                    >
                      Single Contact
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={recipientMode === 'bulk' ? 'secondary' : 'ghost'}
                      className={`h-7 text-xs px-2.5 gap-1 font-semibold ${
                        recipientMode === 'bulk' ? 'text-primary' : 'text-primary/80'
                      }`}
                      onClick={() => setRecipientMode('bulk')}
                    >
                      <Users className="h-3.5 w-3.5 text-primary" />
                      Bulk Database ({bulkRecipients.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={recipientMode === 'manual' ? 'secondary' : 'ghost'}
                      className="h-7 text-xs px-2.5"
                      onClick={() => setRecipientMode('manual')}
                    >
                      Custom Recipient
                    </Button>
                  </div>
                </div>

                {/* Bulk Recipient Selector Mode */}
                {recipientMode === 'bulk' && (
                  <BulkContactSelector
                    channel={channel}
                    selectedRecipients={bulkRecipients}
                    onSelectedChange={setBulkRecipients}
                  />
                )}

                {/* Single Registered User Mode */}
                {recipientMode === 'search' && (
                  <div className="space-y-2">
                    {selectedUser ? (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-primary/10 text-primary">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{selectedUser.full_name || 'Driver / User'}</span>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {selectedUser.role}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                              {selectedUser.email && <span>{selectedUser.email}</span>}
                              {selectedUser.phone && <span>{selectedUser.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setSelectedUser(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search drivers, owners, or applicants by name, email, or phone..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 h-9"
                        />
                        {isSearchingUsers && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}

                        {searchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover rounded-md border shadow-lg max-h-48 overflow-y-auto">
                            {searchResults.map((userContact) => (
                              <div
                                key={userContact.user_id}
                                className="p-2.5 hover:bg-accent cursor-pointer border-b last:border-0 flex items-center justify-between text-xs"
                                onClick={() => {
                                  setSelectedUser(userContact);
                                  setSearchQuery('');
                                  setSearchResults([]);
                                }}
                              >
                                <div>
                                  <span className="font-medium text-foreground">
                                    {userContact.full_name || 'Unnamed Driver'}
                                  </span>
                                  <div className="text-muted-foreground text-[11px] flex items-center gap-2">
                                    {userContact.email && <span>{userContact.email}</span>}
                                    {userContact.phone && <span>• {userContact.phone}</span>}
                                  </div>
                                </div>
                                <Badge variant="secondary" className="text-[10px] uppercase">
                                  {userContact.role}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Custom Manual Recipient Mode */}
                {recipientMode === 'manual' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Recipient Name</Label>
                      <Input
                        placeholder="John Doe"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        className="h-8 mt-1"
                      />
                    </div>
                    {channel === 'email' ? (
                      <div>
                        <Label className="text-xs">Email Address *</Label>
                        <Input
                          type="email"
                          placeholder="driver@example.com"
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          className="h-8 mt-1"
                        />
                      </div>
                    ) : (
                      <div>
                        <Label className="text-xs">Phone Number *</Label>
                        <div className="flex gap-1.5 mt-1">
                          <Select value={phonePrefix} onValueChange={setPhonePrefix}>
                            <SelectTrigger className="h-8 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COUNTRY_PREFIXES.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.flag} {c.code}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="8012345678"
                            value={manualPhone}
                            onChange={(e) => setManualPhone(e.target.value)}
                            className="h-8 flex-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Email Options */}
              {channel === 'email' && (
                <div className="space-y-3 pt-2 border-t">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    3. Email Headers & Configuration
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">From Alias / Department</Label>
                      <Select value={emailSenderAlias} onValueChange={setEmailSenderAlias}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(EMAIL_CONFIG).map(([aliasKey, emailAddr]) => (
                            <SelectItem key={aliasKey} value={aliasKey}>
                              {EMAIL_SENDER_NAMES[aliasKey as keyof typeof EMAIL_SENDER_NAMES]} ({emailAddr})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Delivery Priority</Label>
                      <Select value={emailPriority} onValueChange={(v) => setEmailPriority(v as any)}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low Priority</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">🚨 Urgent / Immediate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Subject Line *</Label>
                    <Input
                      placeholder="e.g., Update regarding your vehicle inspection #{{user_name}}"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="h-8 mt-1 font-medium"
                    />
                  </div>
                </div>
              )}

              {/* WhatsApp Template Selector */}
              {channel === 'whatsapp' && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      3. Official Meta-Approved WhatsApp Templates
                    </Label>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-500/10">
                      HSM Pre-approved
                    </Badge>
                  </div>

                  <Select value={selectedWhatsAppTemplate} onValueChange={handleWhatsAppTemplateChange}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select a pre-approved template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom WhatsApp Message</SelectItem>
                      {WHATSAPP_TEMPLATES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* SMS Opt-Out Disclaimer */}
              {channel === 'sms' && (
                <div className="pt-2 border-t">
                  <div className="flex items-center space-x-2 bg-muted/40 p-2.5 rounded-lg border">
                    <Checkbox
                      id="smsOptOut"
                      checked={smsOptOut}
                      onCheckedChange={(checked) => setSmsOptOut(!!checked)}
                    />
                    <label
                      htmlFor="smsOptOut"
                      className="text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer font-medium"
                    >
                      Append TCPA/Carrier Compliance footer (<code className="text-[11px] bg-muted px-1 py-0.5 rounded">Reply STOP to opt out</code>)
                    </label>
                  </div>
                </div>
              )}

              {/* Message Content Body */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {channel === 'email' ? '4. Email Body' : '3. Message Body'}
                  </Label>
                  <div className="flex items-center gap-2">
                    {/* Canned Reply Selector */}
                    {cannedReplies && cannedReplies.length > 0 && (
                      <Select onValueChange={handleInsertCanned}>
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue placeholder="Quick Responses" />
                        </SelectTrigger>
                        <SelectContent>
                          {cannedReplies.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <Textarea
                  placeholder={`Type your ${channel.toUpperCase()} message here...\nSupports dynamic variables like {{user_name}}, {{user_first_name}}, {{company_name}}`}
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  className="min-h-[140px] text-xs font-sans"
                />

                {/* Variable Help / Segments Info */}
                <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">Tags:</span>
                    <button
                      type="button"
                      onClick={() => setMessageContent((p) => `${p} {{user_name}}`)}
                      className="text-primary hover:underline"
                    >
                      {`{{user_name}}`}
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setMessageContent((p) => `${p} {{user_first_name}}`)}
                      className="text-primary hover:underline"
                    >
                      {`{{user_first_name}}`}
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setMessageContent((p) => `${p} {{company_name}}`)}
                      className="text-primary hover:underline"
                    >
                      {`{{company_name}}`}
                    </button>
                  </div>

                  {channel === 'sms' && (
                    <div className="font-mono">
                      <span>{charCount} chars</span> • <span>{smsSegments} SMS segment{smsSegments > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Attachments Section */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments ({pendingFiles.length}/{MAX_ATTACHMENTS})
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pendingFiles.length >= MAX_ATTACHMENTS}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach Files
                  </Button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleAddFiles(e.target.files)}
                />

                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {pendingFiles.map((file, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="gap-2 py-1 pl-2.5 pr-1.5 text-xs font-normal"
                      >
                        <span className="truncate max-w-[140px]">{file.name}</span>
                        <span className="text-[10px] text-muted-foreground">({formatFileSize(file.size)})</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((p) => p.filter((_, i) => i !== idx))}
                          className="rounded-full hover:bg-muted p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="p-4 bg-muted/20 border-t flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMessageContent('');
                  setEmailSubject('');
                  setPendingFiles([]);
                  setSelectedUser(null);
                  setBulkRecipients([]);
                }}
              >
                Clear
              </Button>

              <Button
                onClick={handleDispatch}
                disabled={isDispatching || isUploading}
                className="gap-2 px-6"
              >
                {isDispatching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {recipientMode === 'bulk'
                      ? `Broadcasting via ${channel.toUpperCase()}...`
                      : `Sending via ${channel.toUpperCase()}...`}
                  </>
                ) : recipientMode === 'bulk' ? (
                  <>
                    <Users className="h-4 w-4" />
                    Send Broadcast to {bulkRecipients.length} Recipient{bulkRecipients.length === 1 ? '' : 's'} via {channel.toUpperCase()}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send via {channel.toUpperCase()}
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Column: Live Channel Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="p-4 pb-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  Live Channel Preview ({channel.toUpperCase()})
                </CardTitle>
                <Badge variant="outline" className="text-xs uppercase">
                  {channel}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Real-time simulated preview of how recipients receive this message.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 flex-1 flex flex-col justify-start space-y-3">
              {/* Bulk Recipient Switcher in Preview */}
              {recipientMode === 'bulk' && bulkRecipients.length > 0 && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-primary truncate max-w-[200px]">
                    <Users className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">
                      Previewing #{previewRecipientIndex + 1}: {effectiveRecipient.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      disabled={previewRecipientIndex === 0}
                      onClick={() => setPreviewRecipientIndex((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {previewRecipientIndex + 1}/{bulkRecipients.length}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      disabled={previewRecipientIndex >= bulkRecipients.length - 1}
                      onClick={() => setPreviewRecipientIndex((p) => Math.min(bulkRecipients.length - 1, p + 1))}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* WhatsApp Live Simulator */}
              {channel === 'whatsapp' && (
                <div className="w-full max-w-sm mx-auto rounded-2xl border bg-slate-900 text-slate-100 p-3 shadow-md">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
                      RM
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs font-semibold text-white">
                        Rentmaikar
                        <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-500 text-slate-900" />
                      </div>
                      <div className="text-[10px] text-slate-400">Official Business Account</div>
                    </div>
                  </div>

                  <div className="py-4 space-y-3">
                    <div className="bg-emerald-950/80 border border-emerald-800/60 rounded-xl p-3 text-xs text-emerald-100 shadow-sm relative ml-4">
                      <p className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                        {computedBody || 'Your message preview will appear here...'}
                      </p>
                      {pendingFiles.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-emerald-800/50 flex items-center gap-1.5 text-[11px] text-emerald-300">
                          <Paperclip className="h-3 w-3" />
                          <span>{pendingFiles.length} file(s) attached</span>
                        </div>
                      )}
                      <div className="text-[10px] text-emerald-400 text-right mt-1.5 flex items-center justify-end gap-1">
                        <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>✓✓</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SMS Live Simulator */}
              {channel === 'sms' && (
                <div className="w-full max-w-sm mx-auto rounded-2xl border bg-background p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Smartphone className="h-3.5 w-3.5" /> SMS to {effectiveRecipient.phone || 'Recipient'}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      Rentmaikar
                    </Badge>
                  </div>
                  <div className="bg-muted/60 rounded-xl p-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono">
                    {computedBody || 'Your SMS text preview will appear here...'}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                    <span>Sender: Rentmaikar</span>
                    <span>{smsSegments} segment(s)</span>
                  </div>
                </div>
              )}

              {/* Email Live Simulator */}
              {channel === 'email' && (
                <div className="w-full rounded-xl border bg-card p-4 shadow-sm space-y-3">
                  <div className="space-y-1.5 pb-3 border-b text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">From:</span>
                      <span className="font-medium text-foreground">
                        {EMAIL_SENDER_NAMES[emailSenderAlias as keyof typeof EMAIL_SENDER_NAMES]} &lt;{EMAIL_CONFIG[emailSenderAlias as keyof typeof EMAIL_CONFIG]}&gt;
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">To:</span>
                      <span className="font-medium text-foreground truncate max-w-[220px]">
                        {effectiveRecipient.name} &lt;{effectiveRecipient.email || 'customer@rentmaikar.com'}&gt;
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Subject:</span>
                      <span className="font-semibold text-foreground truncate max-w-[220px]">
                        {emailSubject || '(No subject provided)'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 text-xs text-foreground leading-relaxed whitespace-pre-wrap min-h-[120px]">
                    {computedBody || 'Your email body preview will appear here...'}
                  </div>

                  {pendingFiles.length > 0 && (
                    <div className="pt-3 border-t">
                      <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Attachments ({pendingFiles.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {pendingFiles.map((f, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] gap-1">
                            <Paperclip className="h-3 w-3" />
                            {f.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Rentmaikar Platform Notification</span>
                    <span className="capitalize">Priority: {emailPriority}</span>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-4 border-t bg-muted/10 text-xs text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                TLS Encrypted & SLA Monitored
              </span>
              <span>Gateway: Active</span>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Bulk Dispatch Progress Modal */}
      <BulkDispatchProgressModal
        isOpen={isBulkModalOpen}
        isSending={isBulkSending}
        channel={channel}
        progress={bulkProgress}
        results={bulkResults}
        onClose={() => {
          setIsBulkModalOpen(false);
          setBulkResults(null);
          // Reset form on complete
          setMessageContent('');
          setEmailSubject('');
          setPendingFiles([]);
          setBulkRecipients([]);
        }}
        onCancel={() => {
          isAbortedRef.current = true;
          setIsBulkSending(false);
        }}
        onViewInbox={() => {
          setIsBulkModalOpen(false);
          setBulkResults(null);
          setMessageContent('');
          setEmailSubject('');
          setPendingFiles([]);
          setBulkRecipients([]);
          onMessageDispatched?.('');
        }}
      />
    </div>
  );
};
