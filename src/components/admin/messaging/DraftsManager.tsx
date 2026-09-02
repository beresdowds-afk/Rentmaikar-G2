import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  FileText, 
  Trash2, 
  Edit3, 
  Send, 
  Search, 
  Mail, 
  Phone, 
  MessageSquare, 
  Clock, 
  AlertCircle,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import type { SavedDraft, MessagingChannel } from './types';

export const DRAFTS_STORAGE_KEY = 'rentmaikar:messaging:drafts:v1';

export function getStoredDrafts(): SavedDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse stored drafts:', e);
    return [];
  }
}

export function saveStoredDraft(draft: SavedDraft): SavedDraft[] {
  const current = getStoredDrafts();
  const index = current.findIndex((d) => d.id === draft.id);
  let updated: SavedDraft[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...draft, updatedAt: new Date().toISOString() };
  } else {
    updated = [{ ...draft, updatedAt: new Date().toISOString(), createdAt: draft.createdAt || new Date().toISOString() }, ...current];
  }
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save draft to storage:', e);
  }
  return updated;
}

export function deleteStoredDraft(draftId: string): SavedDraft[] {
  const current = getStoredDrafts();
  const updated = current.filter((d) => d.id !== draftId);
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete draft from storage:', e);
  }
  return updated;
}

interface DraftsManagerProps {
  onSelectDraft: (draft: SavedDraft) => void;
  onNewDraft: (channel?: MessagingChannel) => void;
}

export const DraftsManager = ({ onSelectDraft, onNewDraft }: DraftsManagerProps) => {
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | MessagingChannel>('all');

  const reloadDrafts = () => {
    setDrafts(getStoredDrafts());
  };

  useEffect(() => {
    reloadDrafts();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === DRAFTS_STORAGE_KEY) {
        reloadDrafts();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteStoredDraft(id);
    setDrafts(updated);
    toast.success('Draft removed');
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete all saved drafts?')) {
      localStorage.removeItem(DRAFTS_STORAGE_KEY);
      setDrafts([]);
      toast.success('All drafts cleared');
    }
  };

  const channelIcons = {
    email: Mail,
    sms: Phone,
    whatsapp: MessageSquare,
  };

  const channelColors = {
    email: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    sms: 'bg-green-500/10 text-green-600 border-green-500/20',
    whatsapp: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  };

  const filteredDrafts = drafts.filter((d) => {
    if (channelFilter !== 'all' && d.channel !== channelFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.recipientName.toLowerCase().includes(q) ||
      d.recipientEmail.toLowerCase().includes(q) ||
      d.recipientPhone.toLowerCase().includes(q) ||
      (d.emailSubject || '').toLowerCase().includes(q) ||
      d.content.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Saved Drafts ({drafts.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage, resume, and send pending drafts across Email, SMS, and WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onNewDraft('email')} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Draft
          </Button>
          {drafts.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleClearAll} className="text-destructive">
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search drafts by recipient, subject, or message content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Button
            size="sm"
            variant={channelFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setChannelFilter('all')}
            className="text-xs h-9 flex-1 sm:flex-none"
          >
            All Channels
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'email' ? 'default' : 'outline'}
            onClick={() => setChannelFilter('email')}
            className="text-xs h-9 gap-1 flex-1 sm:flex-none"
          >
            <Mail className="h-3.5 w-3.5" /> Email
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'sms' ? 'default' : 'outline'}
            onClick={() => setChannelFilter('sms')}
            className="text-xs h-9 gap-1 flex-1 sm:flex-none"
          >
            <Phone className="h-3.5 w-3.5" /> SMS
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'whatsapp' ? 'default' : 'outline'}
            onClick={() => setChannelFilter('whatsapp')}
            className="text-xs h-9 gap-1 flex-1 sm:flex-none"
          >
            <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
          </Button>
        </div>
      </div>

      {/* Drafts List */}
      {filteredDrafts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 stroke-[1.25] text-muted-foreground/60 mb-3" />
            <p className="text-base font-medium text-foreground">No drafts found</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {drafts.length === 0
                ? 'When you start drafting messages in the composer, auto-saves and manual drafts will appear here.'
                : 'No saved drafts match your current search or filter criteria.'}
            </p>
            <Button size="sm" onClick={() => onNewDraft()} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Create New Message
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDrafts.map((draft) => {
            const ChannelIcon = channelIcons[draft.channel] || Mail;
            const recipientDisplay =
              draft.recipientName ||
              draft.recipientEmail ||
              draft.recipientPhone ||
              'No recipient specified';

            return (
              <Card
                key={draft.id}
                className="group relative cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all flex flex-col justify-between"
                onClick={() => onSelectDraft(draft)}
              >
                <CardHeader className="p-4 pb-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={`text-xs gap-1 uppercase tracking-wider ${channelColors[draft.channel]}`}>
                      <ChannelIcon className="h-3 w-3" />
                      {draft.channel}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(draft.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm truncate text-foreground">
                      {draft.channel === 'email' && draft.emailSubject
                        ? draft.emailSubject
                        : recipientDisplay}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      To: {recipientDisplay}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-muted-foreground line-clamp-3 bg-muted/30 p-2.5 rounded-md border border-muted/50 font-mono">
                    {draft.content || <span className="italic">Empty message draft</span>}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-primary gap-1 font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDraft(draft);
                      }}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Resume Draft
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDelete(draft.id, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
