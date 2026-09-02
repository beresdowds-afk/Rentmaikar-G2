import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, MessageSquare, Paperclip, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  channel: string;
  last_message_at: string;
}

interface Message {
  id: string;
  content: string;
  sender_type: string;
  sender_name: string | null;
  created_at: string;
  read_at: string | null;
  metadata: any;
}

/**
 * Full message reader for drivers and owners — lists their conversations with
 * admin and shows the actual message contents (the "Open messages" target).
 */
export function UserMessagesPanel() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('inbox_conversations')
      .select('id, subject, status, channel, last_message_at')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error(error);
      toast.error('Could not load your messages');
    }
    const rows = (data ?? []) as Conversation[];
    setConversations(rows);
    setActiveId((prev) => prev ?? rows[0]?.id ?? null);
    setLoading(false);
  }, [user?.id]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('id, content, sender_type, sender_name, created_at, read_at, metadata')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    const rows = (data ?? []) as Message[];
    setMessages(rows);

    const unread = rows.filter((m) => m.sender_type !== 'user' && !m.read_at).map((m) => m.id);
    if (unread.length) {
      await supabase
        .from('inbox_messages')
        .update({ read_at: new Date().toISOString(), is_read: true })
        .in('id', unread);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`user-messages-${activeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
          filter: `conversation_id=eq.${activeId}`,
        },
        () => loadMessages(activeId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const send = async () => {
    if (!draft.trim() || !activeId) return;
    setSending(true);
    const { error } = await supabase.from('inbox_messages').insert({
      conversation_id: activeId,
      content: draft.trim(),
      sender_type: 'user',
      channel: activeConversation?.channel ?? 'in_app',
    });
    setSending(false);
    if (error) {
      toast.error('Could not send your reply');
      return;
    }
    setDraft('');
    await supabase
      .from('inbox_conversations')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', activeId);
    loadMessages(activeId);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5 text-primary" />
          Messages
        </CardTitle>
        <CardDescription>
          Conversations with the Rentmaikar admin team. Opening a conversation marks it as read.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading messages…
          </div>
        ) : conversations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You have no messages yet.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <ScrollArea className="h-[420px] rounded-lg border">
              <div className="divide-y">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      'w-full px-3 py-2 text-left transition-colors hover:bg-muted/60',
                      c.id === activeId && 'bg-muted',
                    )}
                  >
                    <div className="truncate text-sm font-medium">
                      {c.subject || 'Support conversation'}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        {c.channel}
                      </Badge>
                      {format(new Date(c.last_message_at), 'MMM d, HH:mm')}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>

            <div className="flex h-[420px] flex-col rounded-lg border">
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-3">
                  {messages.map((m) => {
                    const mine = m.sender_type === 'user';
                    const attachments = (m.metadata?.attachments ?? []) as {
                      name: string;
                      url: string;
                    }[];
                    return (
                      <div
                        key={m.id}
                        className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                            mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                          )}
                        >
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                          {attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {attachments.map((a, i) => (
                                <a
                                  key={i}
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs underline"
                                >
                                  <Paperclip className="h-3 w-3" /> {a.name}
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="mt-1 text-[10px] opacity-70">
                            {m.sender_name || (mine ? 'You' : 'Rentmaikar')} ·{' '}
                            {format(new Date(m.created_at), 'MMM d, HH:mm')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <div className="flex items-end gap-2 border-t p-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a reply…"
                  className="min-h-[44px] resize-none"
                />
                <Button onClick={send} disabled={sending || !draft.trim()} size="icon">
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UserMessagesPanel;
