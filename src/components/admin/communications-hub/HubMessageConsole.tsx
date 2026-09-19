import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  Send,
  Search,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Filter,
  ExternalLink,
  ChevronLeft,
  Sparkles,
  User,
  Loader2,
  PhoneCall,
  PenSquare,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useCommunicationsHub } from './CommunicationsHubContext';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { renderPlaceholders } from '@/lib/reply-placeholders';
import { useNavigate } from 'react-router-dom';

interface ConversationItem {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  channel: string;
  subject: string | null;
  status: string;
  priority: string;
  unread_count?: number;
  last_message_at: string;
  created_at: string;
}

interface MessageItem {
  id: string;
  conversation_id: string;
  sender_type: 'admin' | 'user' | 'system';
  sender_name: string | null;
  content: string;
  channel: string;
  created_at: string;
  is_read: boolean;
}

const QUICK_TEMPLATES = [
  {
    id: 'ack',
    label: 'Acknowledge',
    text: 'Hello {{customer_name}}, thank you for reaching out. We have received your message and an operations agent is currently reviewing your request. We will follow up shortly.',
  },
  {
    id: 'docs',
    label: 'Request Docs',
    text: "Hi {{first_name}}, please upload your updated driver's license or insurance documentation via your portal to maintain authorized status.",
  },
  {
    id: 'resolved',
    label: 'Resolved',
    text: 'Hi {{first_name}}, your request has been resolved. If you need any further assistance, feel free to reply directly to this thread.',
  },
];

export const HubMessageConsole: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedConversationId,
    setSelectedConversationId,
    openWithRecipient,
    openMessageEditor,
    setUnreadCount,
  } = useCommunicationsHub();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'sms' | 'whatsapp'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'open' | 'resolved'>('all');

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('inbox_conversations')
        .select('*')
        .is('archived_at', null)
        .order('last_message_at', { ascending: false })
        .limit(30);

      if (channelFilter !== 'all') {
        query = query.eq('channel', channelFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const items = (data || []) as ConversationItem[];
      setConversations(items);

      // Calculate total unread
      const unreadTotal = items.reduce((acc, c) => acc + (c.unread_count || 0), 0);
      setUnreadCount(unreadTotal);
    } catch (err) {
      console.error('Failed to load inbox conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [channelFilter, statusFilter, setUnreadCount]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages when a conversation is selected
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    const loadThread = async () => {
      setIsLoadingMessages(true);
      try {
        const { data, error } = await supabase
          .from('inbox_messages')
          .select('*')
          .eq('conversation_id', selectedConversationId)
          .order('created_at', { ascending: true })
          .limit(50);

        if (error) throw error;
        if (isMounted) {
          setMessages((data || []) as MessageItem[]);
          // Mark conversation messages read
          await supabase
            .from('inbox_messages')
            .update({ is_read: true })
            .eq('conversation_id', selectedConversationId)
            .eq('is_read', false);

          await supabase
            .from('inbox_conversations')
            .update({ unread_count: 0 })
            .eq('id', selectedConversationId);
        }
      } catch (err) {
        console.error('Failed to load thread messages:', err);
      } finally {
        if (isMounted) setIsLoadingMessages(false);
      }
    };

    loadThread();

    return () => {
      isMounted = false;
    };
  }, [selectedConversationId]);

  // Scroll to bottom of message thread
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === selectedConversationId) || null;
  }, [conversations, selectedConversationId]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (c.user_name || '').toLowerCase().includes(q) ||
        (c.user_phone || '').toLowerCase().includes(q) ||
        (c.user_email || '').toLowerCase().includes(q) ||
        (c.subject || '').toLowerCase().includes(q)
      );
    });
  }, [conversations, searchQuery]);

  const handleSendReply = async () => {
    if (!activeConversation || !replyText.trim()) return;
    setIsSendingReply(true);

    try {
      const recipientName = activeConversation.user_name || 'Customer';
      const firstName = recipientName.split(' ')[0] || 'Customer';
      const renderedBody = renderPlaceholders(
        replyText.trim(),
        {
          customer_name: recipientName,
          first_name: firstName,
          customer_email: activeConversation.user_email || undefined,
          customer_phone: activeConversation.user_phone || undefined,
          today: format(new Date(), 'dd MMM yyyy'),
        },
        { keepUnknown: true }
      );

      // Record message in DB
      const { data: insertedMsg, error: insertError } = await supabase
        .from('inbox_messages')
        .insert({
          conversation_id: activeConversation.id,
          sender_type: 'admin',
          sender_name: 'Rentmaikar Admin',
          content: renderedBody,
          channel: activeConversation.channel,
          is_read: true,
        })
        .select('*')
        .single();

      if (insertError) throw insertError;

      // Update conversation timestamp
      await supabase
        .from('inbox_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          status: 'pending',
        })
        .eq('id', activeConversation.id);

      // Append to active message view
      if (insertedMsg) {
        setMessages((prev) => [...prev, insertedMsg as MessageItem]);
      }

      // Dispatch through wire
      if (activeConversation.channel === 'email' && activeConversation.user_email) {
        await supabase.functions.invoke('send-email-reply', {
          body: {
            conversationId: activeConversation.id,
            recipientEmail: activeConversation.user_email,
            subject: activeConversation.subject || 'Rentmaikar Support Update',
            messageContent: renderedBody,
          },
        });
      } else if (activeConversation.user_phone) {
        await supabase.functions.invoke('send-inbox-reply', {
          body: {
            conversationId: activeConversation.id,
            recipientPhone: activeConversation.user_phone,
            channel: activeConversation.channel,
            messageContent: renderedBody,
          },
        });
      }

      toast.success('Reply dispatched to contact');
      setReplyText('');
    } catch (err: any) {
      console.error('Reply dispatch failed:', err);
      toast.error(err.message || 'Failed to dispatch reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'open' | 'pending' | 'resolved') => {
    if (!activeConversation) return;
    try {
      const { error } = await supabase
        .from('inbox_conversations')
        .update({ status: newStatus })
        .eq('id', activeConversation.id);

      if (error) throw error;
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation.id ? { ...c, status: newStatus } : c))
      );
      toast.success(`Conversation marked as ${newStatus}`);
    } catch (err: any) {
      toast.error(`Status update failed: ${err.message}`);
    }
  };

  const handleLaunchCall = () => {
    if (!activeConversation?.user_phone) {
      toast.error('No phone number recorded for this contact');
      return;
    }
    openWithRecipient({
      name: activeConversation.user_name || 'Customer',
      phone: activeConversation.user_phone,
      email: activeConversation.user_email,
      userId: activeConversation.user_id,
      defaultAction: 'call',
    });
  };

  const handleLaunchEditor = () => {
    if (!activeConversation) return;
    openMessageEditor({
      name: activeConversation.user_name || 'Customer',
      phone: activeConversation.user_phone,
      email: activeConversation.user_email,
      userId: activeConversation.user_id,
      defaultChannel: (activeConversation.channel as any) || 'email',
      subject: `Re: ${activeConversation.subject || 'Rentmaikar Support'}`,
    });
  };

  const handleOpenFullConsole = () => {
    navigate('/admin?tab=inbox');
  };

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* If a conversation is selected: show active thread */}
      {selectedConversationId && activeConversation ? (
        <div className="flex flex-col h-full space-y-2">
          {/* Thread Header */}
          <div className="p-2.5 rounded-lg border bg-muted/40 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedConversationId(null)}
                className="h-7 w-7 p-0 shrink-0"
                title="Back to conversation list"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground truncate">
                    {activeConversation.user_name || 'Customer'}
                  </span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono capitalize">
                    {activeConversation.channel}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={`text-[9px] py-0 px-1 ${
                      activeConversation.status === 'resolved'
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-blue-500/10 text-blue-600'
                    }`}
                  >
                    {activeConversation.status}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground truncate font-mono">
                  {activeConversation.user_phone || activeConversation.user_email || 'No direct contact'}
                </p>
              </div>
            </div>

            {/* Header Action Tools */}
            <div className="flex items-center gap-1 shrink-0">
              {activeConversation.user_phone && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleLaunchCall}
                  className="h-7 px-2 text-[10px] gap-1 text-emerald-600 hover:text-emerald-700"
                  title="Dial phone in Softphone"
                >
                  <PhoneCall className="h-3 w-3" />
                  <span className="hidden sm:inline">Call</span>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleLaunchEditor}
                className="h-7 px-2 text-[10px] gap-1"
                title="Compose in Message Editor"
              >
                <PenSquare className="h-3 w-3 text-primary" />
                <span className="hidden sm:inline">Editor</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleOpenFullConsole}
                className="h-7 w-7 p-0"
                title="Open full page Message Console"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 min-h-[200px] max-h-[290px] overflow-y-auto p-2.5 rounded-lg border bg-background space-y-2 text-xs">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading thread messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                No message exchanges recorded in this thread yet.
              </div>
            ) : (
              messages.map((m) => {
                const isAdmin = m.sender_type === 'admin';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col max-w-[85%] ${
                      isAdmin ? 'ml-auto items-end' : 'mr-auto items-start'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5 px-1">
                      <span>{isAdmin ? 'Rentmaikar Admin' : activeConversation.user_name || 'Customer'}</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                    </div>
                    <div
                      className={`p-2.5 rounded-xl text-xs whitespace-pre-wrap ${
                        isAdmin
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-muted border border-border text-foreground rounded-tl-none'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Reply & Controls */}
          <div className="space-y-1.5 pt-1 border-t shrink-0">
            {/* Template Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setReplyText(t.text)}
                  className="px-2 py-0.5 rounded border bg-muted/60 hover:bg-muted text-foreground transition shrink-0"
                >
                  {t.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1 shrink-0">
                {activeConversation.status !== 'resolved' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdateStatus('resolved')}
                    className="h-6 px-1.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Mark Resolved
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdateStatus('pending')}
                    className="h-6 px-1.5 text-[10px] text-blue-600 hover:bg-blue-500/10"
                  >
                    <Clock className="h-3 w-3 mr-1" /> Reopen
                  </Button>
                )}
              </div>
            </div>

            {/* Input & Send */}
            <div className="relative">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${activeConversation.user_name || 'customer'} via ${activeConversation.channel.toUpperCase()}...`}
                rows={2}
                className="text-xs bg-background pr-12 resize-none"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleSendReply}
                disabled={isSendingReply || !replyText.trim()}
                className="absolute right-2 bottom-2 h-7 w-7 p-0 bg-primary text-primary-foreground"
                title="Send reply"
              >
                {isSendingReply ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Conversation Inbox Stream */
        <div className="flex flex-col h-full space-y-2">
          {/* Filters and Search Bar */}
          <div className="space-y-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="h-8 pl-8 text-xs bg-background"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchConversations}
                disabled={isLoading}
                className="h-8 w-8 p-0 shrink-0"
                title="Refresh inbox"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenFullConsole}
                className="h-8 px-2 text-xs gap-1 shrink-0"
                title="Open full page Message Console"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Full Console</span>
              </Button>
            </div>

            {/* Quick Channel & Status Filter Tabs */}
            <div className="flex items-center justify-between text-[10px] gap-1 overflow-x-auto pb-0.5">
              <div className="flex items-center gap-1">
                {(['all', 'sms', 'whatsapp', 'email'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannelFilter(ch)}
                    className={`px-2 py-0.5 rounded-full capitalize font-medium transition ${
                      channelFilter === ch
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {(['all', 'pending', 'resolved'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-0.5 rounded-full capitalize font-medium transition ${
                      statusFilter === st
                        ? 'bg-muted-foreground/20 text-foreground font-bold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 min-h-[280px] max-h-[380px] overflow-y-auto divide-y divide-border/60 rounded-xl border bg-card">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading conversations...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No active conversations matching filters.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                const hasUnread = Boolean(conv.unread_count && conv.unread_count > 0);

                return (
                  <div
                    key={conv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedConversationId(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedConversationId(conv.id);
                      }
                    }}
                    className={`p-3 text-left transition cursor-pointer hover:bg-muted/60 space-y-1 block w-full focus:outline-hidden ${
                      isSelected ? 'bg-muted/80' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                        {conv.channel === 'email' ? (
                          <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        ) : conv.channel === 'whatsapp' ? (
                          <MessageSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <Phone className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        <span className={`text-xs truncate ${hasUnread ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                          {conv.user_name || 'Customer'}
                        </span>
                        {conv.user_phone && (
                          <span className="text-[10px] text-muted-foreground font-mono truncate">
                            {conv.user_phone}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasUnread && (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1 py-0 rounded-full font-mono">
                            {conv.unread_count}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.last_message_at || conv.created_at), { addSuffix: false })}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-1 truncate">
                      {conv.subject || 'Direct message inquiry'}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
