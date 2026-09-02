import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { toast } from 'sonner';

export interface MessageAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface SupportMessage {
  id: string;
  content: string;
  sender_type: 'user' | 'admin';
  created_at: string;
  read_at: string | null;
  metadata?: {
    attachments?: MessageAttachment[];
  };
}

export interface SupportConversation {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const useSupportChat = () => {
  const { user } = useAuth();
  const { country } = useRegion();
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchOrCreateConversation = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // First, try to find an existing open conversation for this user
      const { data: existingConversation, error: fetchError } = await supabase
        .from('inbox_conversations')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['open', 'pending'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingConversation) {
        setConversation({
          id: existingConversation.id,
          subject: existingConversation.subject || 'Support Chat',
          status: existingConversation.status || 'open',
          created_at: existingConversation.created_at,
          updated_at: existingConversation.updated_at,
        });
        await fetchMessages(existingConversation.id);
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    const formattedMessages: SupportMessage[] = (data || []).map(msg => ({
      id: msg.id,
      content: msg.content,
      sender_type: msg.sender_type as 'user' | 'admin',
      created_at: msg.created_at,
      read_at: msg.read_at,
      metadata: msg.metadata as SupportMessage['metadata'],
    }));

    setMessages(formattedMessages);

    // Count unread admin messages
    const unread = formattedMessages.filter(
      m => m.sender_type === 'admin' && !m.read_at
    ).length;
    setUnreadCount(unread);

    // Mark admin messages as read
    const unreadAdminIds = formattedMessages
      .filter(m => m.sender_type === 'admin' && !m.read_at)
      .map(m => m.id);

    if (unreadAdminIds.length > 0) {
      await supabase
        .from('inbox_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadAdminIds);
      setUnreadCount(0);
    }
  };

  const uploadAttachment = async (file: File): Promise<MessageAttachment | null> => {
    if (!user) return null;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get a signed URL for private bucket access
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 day expiry

      if (urlError) throw urlError;

      return {
        name: file.name,
        url: signedUrlData.signedUrl,
        type: file.type,
        size: file.size,
      };
    } catch (error) {
      console.error('Error uploading attachment:', error);
      toast.error('Failed to upload file');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const sendMessage = async (content: string, attachments?: MessageAttachment[]) => {
    if (!user || (!content.trim() && (!attachments || attachments.length === 0))) return;

    setIsSending(true);
    try {
      let conversationId = conversation?.id;

      // Create conversation if it doesn't exist
      if (!conversationId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email, phone')
          .eq('user_id', user.id)
          .single();

        const { data: newConversation, error: createError } = await supabase
          .from('inbox_conversations')
          .insert({
            user_id: user.id,
            user_name: profile?.full_name || 'User',
            user_email: profile?.email || user.email,
            user_phone: profile?.phone,
            channel: 'in_app',
            subject: 'Support Request',
            status: 'open',
            priority: 'normal',
            region: country === 'USA' ? 'USA' : 'NGN',
          })
          .select()
          .single();

        if (createError) throw createError;

        conversationId = newConversation.id;
        setConversation({
          id: newConversation.id,
          subject: newConversation.subject || 'Support Request',
          status: newConversation.status || 'open',
          created_at: newConversation.created_at,
          updated_at: newConversation.updated_at,
        });
      }

      // Build message content
      const messageContent = content.trim() || (attachments && attachments.length > 0 
        ? `Shared ${attachments.length} file${attachments.length > 1 ? 's' : ''}`
        : '');

      // Create the message with metadata for attachments
      const messageData: any = {
        conversation_id: conversationId,
        content: messageContent,
        sender_type: 'user',
        channel: 'in_app',
      };

      if (attachments && attachments.length > 0) {
        messageData.metadata = { attachments };
      }

      const { data: newMessage, error: messageError } = await supabase
        .from('inbox_messages')
        .insert(messageData)
        .select()
        .single();

      if (messageError) throw messageError;

      // Update conversation timestamp
      await supabase
        .from('inbox_conversations')
        .update({ 
          updated_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      setMessages(prev => [...prev, {
        id: newMessage.id,
        content: newMessage.content,
        sender_type: newMessage.sender_type as 'user' | 'admin',
        created_at: newMessage.created_at,
        read_at: newMessage.read_at,
        metadata: newMessage.metadata as SupportMessage['metadata'],
      }]);

      toast.success('Message sent!');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Set up realtime subscription for new messages
  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel(`support-chat-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          // Only add if it's an admin message (user messages are added optimistically)
          if (newMsg.sender_type === 'admin') {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, {
                id: newMsg.id,
                content: newMsg.content,
                sender_type: newMsg.sender_type,
                created_at: newMsg.created_at,
                read_at: newMsg.read_at,
                metadata: newMsg.metadata,
              }];
            });
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Initial fetch
  useEffect(() => {
    fetchOrCreateConversation();
  }, [fetchOrCreateConversation]);

  return {
    conversation,
    messages,
    isLoading,
    isSending,
    isUploading,
    unreadCount,
    sendMessage,
    uploadAttachment,
    refreshMessages: () => conversation?.id && fetchMessages(conversation.id),
  };
};
