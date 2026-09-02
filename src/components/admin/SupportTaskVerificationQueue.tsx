import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';

interface PendingTask {
  id: string;
  title: string;
  task_type: string;
  city: string;
  region: string;
  staff_feedback: string | null;
  staff_resolved_at: string | null;
  staff_resolved_by: string | null;
}

/**
 * Admin / admin-assistant queue of support tasks that staff have marked resolved
 * via feedback and that are waiting to be verified and approved.
 */
export const SupportTaskVerificationQueue = () => {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('support_tasks')
      .select('id, title, task_type, city, region, staff_feedback, staff_resolved_at, staff_resolved_by')
      .eq('verification_state', 'pending_verification')
      .order('staff_resolved_at', { ascending: false });

    if (error) {
      console.error('Error loading verification queue:', error);
    } else {
      setTasks((data || []) as PendingTask[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const decide = async (taskId: string, approve: boolean) => {
    setBusyId(taskId);
    const { error } = await supabase.rpc('admin_verify_support_task', {
      _task_id: taskId,
      _approve: approve,
      _notes: notes[taskId]?.trim() || null,
    });
    setBusyId(null);

    if (error) {
      toast.error(error.message || 'Could not record decision');
      return;
    }
    toast.success(approve ? 'Task verified and approved' : 'Task sent back to staff');
    setNotes(prev => ({ ...prev, [taskId]: '' }));
    fetchPending();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Pending Verification
            {tasks.length > 0 && <Badge variant="secondary">{tasks.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Tasks support staff marked resolved through feedback, awaiting your approval.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPending} disabled={isLoading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nothing awaiting verification.</p>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.task_type} · {task.city}, {task.region}
                    {task.staff_resolved_at &&
                      ` · resolved ${format(new Date(task.staff_resolved_at), 'MMM d, yyyy h:mm a')}`}
                  </p>
                </div>
                <Badge className="bg-amber-500 text-white">Pending verification</Badge>
              </div>

              {task.staff_feedback && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <span className="font-medium">Staff feedback: </span>
                  {task.staff_feedback}
                </div>
              )}

              <Textarea
                rows={2}
                placeholder="Verification notes (optional)"
                value={notes[task.id] || ''}
                onChange={e => setNotes(prev => ({ ...prev, [task.id]: e.target.value }))}
              />

              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(task.id, true)} disabled={busyId === task.id}>
                  {busyId === task.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Verify &amp; approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide(task.id, false)}
                  disabled={busyId === task.id}
                >
                  Send back
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default SupportTaskVerificationQueue;
