import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { OutboundAttachment } from '@/lib/inbox-attachments';

export interface ContactSetting {
  id: string;
  region: string;
  contact_type: string;
  contact_value: string;
  is_active: boolean;
  display_name: string | null;
  updated_at: string;
}

export interface InboxConversation {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  channel: string;
  region: string;
  subject: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
  is_flagged?: boolean;
  archived_at?: string | null;
  unread_count?: number;
}

export interface InboxStaff {
  id: string;
  name: string;
}


export interface InboxMessage {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  channel: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  external_id?: string | null;
  metadata?: unknown;
}

export const useContactSettings = () => {
  const [settings, setSettings] = useState<ContactSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('contact_settings')
      .select('*')
      .order('region', { ascending: true })
      .order('contact_type', { ascending: true });

    if (error) {
      console.error('Error fetching contact settings:', error);
      toast.error('Failed to load contact settings');
    } else {
      setSettings(data || []);
    }
    setIsLoading(false);
  };

  const updateSetting = async (id: string, updates: Partial<ContactSetting>) => {
    const { error } = await supabase
      .from('contact_settings')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating contact setting:', error);
      toast.error('Failed to update contact setting');
      return false;
    }
    
    toast.success('Contact setting updated');
    await fetchSettings();
    return true;
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return { settings, isLoading, fetchSettings, updateSetting };
};

export const useInboxStaff = () => {
  const [staff, setStaff] = useState<InboxStaff[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['admin', 'admin_assistant']);
      const ids = Array.from(new Set((roles || []).map(r => r.user_id))).filter(Boolean) as string[];
      if (!ids.length) return;
      // user_roles.user_id is the auth user id — profiles must be matched on
      // profiles.user_id (not profiles.id), which is what assigned_to stores.
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', ids);
      if (cancelled) return;
      const byId = new Map((profs || []).map(p => [p.user_id as string, p]));
      setStaff(
        ids.map(id => {
          const p = byId.get(id);
          return { id, name: p?.full_name || p?.email || 'Staff member' };
        }),
      );
    })();
    return () => { cancelled = true; };
  }, []);

  return staff;
};

export const useInboxConversations = () => {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const fetchUnreadCounts = useCallback(async () => {
    const { data } = await supabase
      .from('inbox_messages')
      .select('conversation_id')
      .eq('is_read', false)
      .eq('sender_type', 'user');
    const counts: Record<string, number> = {};
    (data || []).forEach((m) => {
      counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
    });
    setUnreadCounts(counts);
  }, []);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    let query = supabase
      .from('inbox_conversations')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (channelFilter !== 'all') {
      query = query.eq('channel', channelFilter);
    }
    if (flaggedOnly) {
      query = query.eq('is_flagged', true);
    }
    query = showArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching conversations:', error);
      toast.error('Failed to load conversations');
    } else {
      setConversations((data || []) as InboxConversation[]);
    }
    await fetchUnreadCounts();
    setIsLoading(false);
  }, [statusFilter, channelFilter, showArchived, flaggedOnly, fetchUnreadCounts]);

  // Resolve every conversation id matching the current filters + search,
  // independent of what is currently loaded in the list.
  const fetchAllMatchingIds = useCallback(async (): Promise<string[] | null> => {
    let query = supabase.from('inbox_conversations').select('id');

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (channelFilter !== 'all') query = query.eq('channel', channelFilter);
    if (flaggedOnly) query = query.eq('is_flagged', true);
    query = showArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);

    const q = searchQuery.trim();
    if (q) {
      const like = `%${q.replace(/[%,]/g, '')}%`;
      query = query.or(
        `user_name.ilike.${like},user_email.ilike.${like},user_phone.ilike.${like},subject.ilike.${like},channel.ilike.${like}`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error resolving matching conversations:', error);
      toast.error('Could not select all results');
      return null;
    }
    return (data || []).map((r) => r.id as string);
  }, [statusFilter, channelFilter, showArchived, flaggedOnly, searchQuery]);



  const updateConversation = async (id: string, updates: Partial<InboxConversation>) => {
    const { error } = await supabase
      .from('inbox_conversations')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating conversation:', error);
      toast.error('Failed to update conversation');
      return false;
    }

    await fetchConversations();
    return true;
  };

  const toggleFlag = async (conv: InboxConversation) => {
    const ok = await updateConversation(conv.id, { is_flagged: !conv.is_flagged });
    if (ok) toast.success(conv.is_flagged ? 'Flag removed' : 'Conversation flagged');
    return ok;
  };

  const setArchived = async (conv: InboxConversation, archived: boolean) => {
    const ok = await updateConversation(conv.id, {
      archived_at: archived ? new Date().toISOString() : null,
    });
    if (ok) toast.success(archived ? 'Conversation archived' : 'Conversation restored');
    return ok;
  };

  const assignConversation = async (id: string, userId: string | null) => {
    const ok = await updateConversation(id, { assigned_to: userId });
    if (ok) toast.success(userId ? 'Conversation delegated' : 'Assignment cleared');
    return ok;
  };

  const markConversationRead = async (id: string, read = true) => {
    const { error } = await supabase
      .from('inbox_messages')
      .update(read
        ? { is_read: true, read_at: new Date().toISOString() }
        : { is_read: false, read_at: null })
      .eq('conversation_id', id)
      .eq('sender_type', 'user');

    if (error) {
      console.error('Error updating read state:', error);
      toast.error('Failed to update read state');
      return false;
    }
    await fetchUnreadCounts();
    toast.success(read ? 'Marked as read' : 'Marked as unread');
    return true;
  };

  const bulkUpdateConversations = async (ids: string[], updates: Partial<InboxConversation>) => {
    if (!ids.length) return false;
    const { error } = await supabase
      .from('inbox_conversations')
      .update(updates)
      .in('id', ids);

    if (error) {
      console.error('Error bulk updating conversations:', error);
      toast.error('Bulk action failed');
      return false;
    }
    await fetchConversations();
    return true;
  };

  // Snapshot a single conversation column for the given ids so a bulk change can be reverted
  const snapshotField = async (ids: string[], field: string) => {
    const { data, error } = await supabase
      .from('inbox_conversations')
      .select(`id, ${field}`)
      .in('id', ids);
    if (error) {
      console.error('Error snapshotting conversations:', error);
      return null;
    }
    return (data ?? []) as unknown as Array<Record<string, unknown>>;
  };

  const revertField = async (
    snapshot: Array<Record<string, unknown>>,
    field: string,
    successMessage: string,
  ) => {
    // Group ids by their previous value so each distinct value is one update
    const groups = new Map<string, { value: unknown; ids: string[] }>();
    for (const row of snapshot) {
      const value = row[field] ?? null;
      const key = JSON.stringify(value);
      const existing = groups.get(key);
      if (existing) existing.ids.push(row.id as string);
      else groups.set(key, { value, ids: [row.id as string] });
    }

    for (const { value, ids } of groups.values()) {
      const { error } = await supabase
        .from('inbox_conversations')
        .update({ [field]: value })
        .in('id', ids);
      if (error) {
        console.error('Error reverting bulk action:', error);
        toast.error('Undo failed');
        return false;
      }
    }
    await fetchConversations();
    toast.success(successMessage);
    return true;
  };

  const toastWithUndo = (message: string, onUndo: () => void) => {
    toast.success(message, {
      duration: 10000,
      action: { label: 'Undo', onClick: onUndo },
    });
  };

  const bulkSetFlag = async (ids: string[], flagged: boolean) => {
    const snapshot = await snapshotField(ids, 'is_flagged');
    const ok = await bulkUpdateConversations(ids, { is_flagged: flagged });
    if (ok) {
      const message = `${ids.length} conversation(s) ${flagged ? 'flagged' : 'unflagged'}`;
      if (snapshot) {
        toastWithUndo(message, () => {
          void revertField(snapshot, 'is_flagged', 'Flag change undone');
        });
      } else {
        toast.success(message);
      }
    }
    return ok;
  };

  const bulkSetArchived = async (ids: string[], archived: boolean) => {
    const snapshot = await snapshotField(ids, 'archived_at');
    const ok = await bulkUpdateConversations(ids, {
      archived_at: archived ? new Date().toISOString() : null,
    });
    if (ok) {
      const message = `${ids.length} conversation(s) ${archived ? 'archived' : 'restored'}`;
      if (snapshot) {
        toastWithUndo(message, () => {
          void revertField(snapshot, 'archived_at', archived ? 'Archive undone' : 'Restore undone');
        });
      } else {
        toast.success(message);
      }
    }
    return ok;
  };

  const bulkAssign = async (ids: string[], userId: string | null) => {
    const snapshot = await snapshotField(ids, 'assigned_to');
    const ok = await bulkUpdateConversations(ids, { assigned_to: userId });
    if (ok) {
      const message = userId ? `${ids.length} conversation(s) delegated` : 'Assignments cleared';
      if (snapshot) {
        toastWithUndo(message, () => {
          void revertField(snapshot, 'assigned_to', 'Delegation undone');
        });
      } else {
        toast.success(message);
      }
    }
    return ok;
  };

  const bulkMarkRead = async (ids: string[], read: boolean) => {
    if (!ids.length) return false;

    // Capture only the messages that will actually change so undo is precise
    const { data: affected } = await supabase
      .from('inbox_messages')
      .select('id')
      .in('conversation_id', ids)
      .eq('sender_type', 'user')
      .eq('is_read', !read);
    const affectedIds = (affected ?? []).map((m) => m.id as string);

    const { error } = await supabase
      .from('inbox_messages')
      .update(read
        ? { is_read: true, read_at: new Date().toISOString() }
        : { is_read: false, read_at: null })
      .in('conversation_id', ids)
      .eq('sender_type', 'user');

    if (error) {
      console.error('Error bulk updating read state:', error);
      toast.error('Bulk action failed');
      return false;
    }
    await fetchUnreadCounts();

    const message = `${ids.length} conversation(s) marked as ${read ? 'read' : 'unread'}`;
    if (affectedIds.length) {
      toastWithUndo(message, () => {
        void (async () => {
          const { error: undoError } = await supabase
            .from('inbox_messages')
            .update(read ? { is_read: false, read_at: null } : { is_read: true, read_at: new Date().toISOString() })
            .in('id', affectedIds);
          if (undoError) {
            console.error('Error reverting read state:', undoError);
            toast.error('Undo failed');
            return;
          }
          await fetchUnreadCounts();
          await fetchConversations();
          toast.success('Read state change undone');
        })();
      });
    } else {
      toast.success(message);
    }
    return true;
  };

  const bulkSetStatus = async (ids: string[], status: string) => {
    const snapshot = await snapshotField(ids, 'status');
    const ok = await bulkUpdateConversations(ids, { status });
    if (ok) {
      const message = `${ids.length} conversation(s) set to ${status}`;
      if (snapshot) {
        toastWithUndo(message, () => {
          void revertField(snapshot, 'status', 'Status change undone');
        });
      } else {
        toast.success(message);
      }
    }
    return ok;
  };




  // Real-time subscription for conversations
  useEffect(() => {
    fetchConversations();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('inbox_conversations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inbox_conversations',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as InboxConversation;
            setConversations(prev => [newConv, ...prev]);
            toast.info(`New ${newConv.channel} message received`, {
              description: newConv.subject || 'New conversation',
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedConv = payload.new as InboxConversation;
            setConversations(prev =>
              prev.map(c => c.id === updatedConv.id ? updatedConv : c)
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setConversations(prev => prev.filter(c => c.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = (q
    ? conversations.filter(c =>
        [c.user_name, c.user_email, c.user_phone, c.subject, c.channel]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q)))
    : conversations
  ).map(c => ({ ...c, unread_count: unreadCounts[c.id] || 0 }));

  return {
    conversations: filtered,
    isLoading,
    fetchConversations,
    fetchAllMatchingIds,

    updateConversation,
    toggleFlag,
    setArchived,
    assignConversation,
    markConversationRead,
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
  };
};


export const useInboxMessages = (conversationId: string | null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } else {
      setMessages(data || []);
      
      // Mark unread messages as read
      const unreadIds = (data || [])
        .filter(m => !m.is_read && m.sender_type === 'user')
        .map(m => m.id);
      
      if (unreadIds.length > 0) {
        await supabase
          .from('inbox_messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in('id', unreadIds);
      }
    }
    setIsLoading(false);
  }, [conversationId]);

  const sendMessage = async (
    content: string,
    channel: string,
    recipientPhone?: string | null,
    recipientEmail?: string | null,
    attachments?: OutboundAttachment[],
  ) => {
    if (!conversationId || !user) return false;

    const attachmentList = attachments && attachments.length > 0 ? attachments : null;

    // First, save the message to the database
    const { error } = await supabase
      .from('inbox_messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'admin',
        sender_id: user.id,
        sender_name: 'Rentmaikar Support',
        content,
        channel,
        is_read: true,
        ...(attachmentList
          ? { metadata: { attachments_detail: attachmentList } as unknown as Record<string, never> }
          : {}),
      });

    if (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      return false;
    }

    // Update conversation last_message_at
    await supabase
      .from('inbox_conversations')
      .update({ 
        last_message_at: new Date().toISOString(),
        status: 'pending'
      })
      .eq('id', conversationId);

    // Send via external channel (SMS/WhatsApp/Email)
    if (channel === 'sms' || channel === 'whatsapp') {
      if (recipientPhone) {
        setIsSendingReply(true);
        try {
          const { data, error: sendError } = await supabase.functions.invoke('send-inbox-reply', {
            body: {
              conversationId,
              messageContent: content,
              channel,
              recipientPhone,
              attachments: attachmentList,
            },
          });

          if (sendError) {
            console.error('Error sending reply via Twilio:', sendError);
            toast.warning('Message saved but delivery may be delayed');
          } else if (data?.success) {
            toast.success(`Reply sent via ${channel.toUpperCase()}`);
          }
        } catch (err) {
          console.error('Failed to send via Twilio:', err);
          toast.warning('Message saved but external delivery failed');
        } finally {
          setIsSendingReply(false);
        }
      }
    } else if (channel === 'email' && recipientEmail) {
      setIsSendingReply(true);
      try {
        const { data, error: sendError } = await supabase.functions.invoke('send-email-reply', {
          body: {
            conversationId,
            messageContent: content,
            recipientEmail,
            attachments: attachmentList,
          },
        });

        if (sendError) {
          console.error('Error sending reply via email:', sendError);
          toast.warning('Message saved but email delivery may be delayed');
        } else if (data?.success) {
          toast.success('Email reply sent');
        }
      } catch (err) {
        console.error('Failed to send email:', err);
        toast.warning('Message saved but email delivery failed');
      } finally {
        setIsSendingReply(false);
      }
    } else {
      toast.success('Message sent');
    }
    
    await fetchMessages();
    return true;
  };

  // Real-time subscription for messages
  useEffect(() => {
    fetchMessages();

    if (!conversationId) return;

    // Subscribe to realtime changes for this conversation
    const channel = supabase
      .channel(`inbox_messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('New message:', payload);
          const newMessage = payload.new as InboxMessage;
          setMessages(prev => [...prev, newMessage]);
          
          // Mark as read if from user
          if (newMessage.sender_type === 'user') {
            supabase
              .from('inbox_messages')
              .update({ is_read: true, read_at: new Date().toISOString() })
              .eq('id', newMessage.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages]);

  return { messages, isLoading, isSendingReply, fetchMessages, sendMessage };
};
