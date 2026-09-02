import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, ExternalLink, Loader2, MessageSquare } from 'lucide-react';
import Seo from '@/components/seo/Seo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EnablePushButton } from '@/components/notifications/EnablePushButton';
import { useInAppMessages } from '@/hooks/useInAppMessages';

/** The user-facing in-app message inbox (web + PWA). */
export default function MessagesPage() {
  const { messages, unreadCount, isLoading, markRead, markAllRead } = useInAppMessages();

  // Opening the inbox clears the badge for what is on screen.
  useEffect(() => {
    const unread = messages.filter((m) => !m.read_at).map((m) => m.id);
    if (unread.length > 0) {
      const t = setTimeout(() => void markRead(unread), 1200);
      return () => clearTimeout(t);
    }
  }, [messages, markRead]);

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Seo
        title="Messages | Rentmaikar"
        description="Read messages from the Rentmaikar team inside the app, with optional push notifications."
        path="/messages"
      />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquare className="h-6 w-6 text-primary" /> Messages
          </h1>
          <p className="text-sm text-muted-foreground">
            Updates from the Rentmaikar team, delivered inside the app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EnablePushButton />
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
              <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Inbox
            {unreadCount > 0 && <Badge variant="secondary">{unreadCount} new</Badge>}
          </CardTitle>
          <CardDescription>
            In-app messages complement the SMS, WhatsApp and email you already receive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ScrollArea className="h-[60vh] pr-3">
              <ul className="space-y-3">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-4 ${m.read_at ? 'bg-background' : 'border-primary/40 bg-primary/5'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        {m.subject && <p className="font-medium">{m.subject}</p>}
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.body}</p>
                      </div>
                      {!m.read_at && <Badge variant="secondary">New</Badge>}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {m.sender_name} ·{' '}
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </span>
                      {m.link_url && (
                        <Link to={m.link_url} className="inline-flex items-center gap-1 text-primary">
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
