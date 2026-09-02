import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { 
  History, 
  Search, 
  RefreshCw, 
  Loader2,
  ArrowRight,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  FileText,
} from 'lucide-react';

interface TaskUpdate {
  id: string;
  task_id: string;
  user_id: string;
  update_type: string;
  previous_status?: string;
  new_status?: string;
  content: string;
  created_at: string;
  task?: {
    title: string;
    task_type: string;
    city: string;
  };
  profile?: {
    full_name: string;
    email: string;
  };
}

const UPDATE_TYPE_CONFIG: Record<string, { label: string; icon: typeof History; color: string }> = {
  status_change: { label: 'Status Change', icon: ArrowRight, color: 'bg-blue-500' },
  note: { label: 'Note', icon: MessageSquare, color: 'bg-gray-500' },
  feedback: { label: 'Feedback', icon: FileText, color: 'bg-purple-500' },
  escalation: { label: 'Escalation', icon: AlertTriangle, color: 'bg-red-500' },
  resolution: { label: 'Resolution', icon: CheckCircle, color: 'bg-green-500' },
};

export const TaskActivityLog = () => {
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUpdates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_task_updates')
        .select(`
          *,
          support_tasks!task_id (
            title,
            task_type,
            city
          ),
          profiles!user_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedUpdates = (data || []).map((update: any) => ({
        ...update,
        task: update.support_tasks,
        profile: update.profiles,
      }));

      setUpdates(formattedUpdates);
    } catch (err) {
      console.error('Error fetching activity log:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, []);

  const filteredUpdates = updates.filter(update => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      update.content?.toLowerCase().includes(query) ||
      update.task?.title?.toLowerCase().includes(query) ||
      update.profile?.full_name?.toLowerCase().includes(query) ||
      update.task?.city?.toLowerCase().includes(query)
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Task Activity Log
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchUpdates} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredUpdates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No activity found
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUpdates.map(update => {
                const config = UPDATE_TYPE_CONFIG[update.update_type] || UPDATE_TYPE_CONFIG.note;
                const Icon = config.icon;
                
                return (
                  <div
                    key={update.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${config.color} text-white`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {config.label}
                          </Badge>
                          {update.task && (
                            <span className="text-sm font-medium truncate">
                              {update.task.title}
                            </span>
                          )}
                        </div>
                        
                        {update.update_type === 'status_change' && (
                          <div className="flex items-center gap-2 mt-1 text-sm">
                            <Badge variant="secondary">{update.previous_status}</Badge>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <Badge>{update.new_status}</Badge>
                          </div>
                        )}
                        
                        {update.content && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {update.content}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>{update.profile?.full_name || update.profile?.email || 'Unknown'}</span>
                          <span>•</span>
                          <span>{format(new Date(update.created_at), 'MMM d, yyyy h:mm a')}</span>
                          {update.task?.city && (
                            <>
                              <span>•</span>
                              <span>{update.task.city}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default TaskActivityLog;
