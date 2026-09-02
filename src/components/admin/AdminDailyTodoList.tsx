import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ListTodo, RefreshCw, Calendar, Clock, CheckCircle2, 
  AlertTriangle, FileText, Users, MessageSquare, Car,
  Shield, Handshake, DollarSign, Wrench, Plus
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

interface DailyTask {
  id: string;
  task_date: string;
  category: string;
  title: string;
  description: string | null;
  priority: string;
  is_completed: boolean;
  completed_at: string | null;
  source_table: string | null;
  created_at: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  applications: <Users className="h-4 w-4" />,
  payment_defaults: <DollarSign className="h-4 w-4" />,
  expiring_documents: <FileText className="h-4 w-4" />,
  pending_negotiations: <Handshake className="h-4 w-4" />,
  support_tasks: <Wrench className="h-4 w-4" />,
  inbox: <MessageSquare className="h-4 w-4" />,
  recalls: <Car className="h-4 w-4" />,
  rent_to_own: <Handshake className="h-4 w-4" />,
  legal_agreements: <Shield className="h-4 w-4" />,
  custom: <ListTodo className="h-4 w-4" />,
};

const priorityColors: Record<string, string> = {
  urgent: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-muted text-muted-foreground',
};

export const AdminDailyTodoList = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customTask, setCustomTask] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_daily_tasks')
        .select('*')
        .eq('task_date', today)
        .order('is_completed', { ascending: true })
        .order('priority', { ascending: true });

      if (error) throw error;

      // Sort by priority weight
      const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const sorted = (data || []).sort((a: DailyTask, b: DailyTask) => {
        if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
        return (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2);
      });

      setTasks(sorted);
    } catch (err) {
      console.error('Error fetching daily tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [today]);

  const generateTasks = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-tasks');
      if (error) throw error;
      toast.success(data?.message || 'Daily tasks generated');
      await fetchTasks();
    } catch (err: any) {
      console.error('Error generating tasks:', err);
      toast.error('Failed to generate daily tasks');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTask = async (task: DailyTask) => {
    const newCompleted = !task.is_completed;
    try {
      const { error } = await supabase
        .from('admin_daily_tasks')
        .update({
          is_completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
          completed_by: newCompleted ? user?.id : null,
        })
        .eq('id', task.id);

      if (error) throw error;
      setTasks(prev =>
        prev.map(t => t.id === task.id
          ? { ...t, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : t
        ).sort((a, b) => {
          if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
          const pw: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          return (pw[a.priority] ?? 2) - (pw[b.priority] ?? 2);
        })
      );
    } catch (err) {
      console.error('Error updating task:', err);
      toast.error('Failed to update task');
    }
  };

  const addCustomTask = async () => {
    if (!customTask.trim()) return;
    try {
      const { error } = await supabase.from('admin_daily_tasks').insert({
        task_date: today,
        category: 'custom',
        title: customTask.trim(),
        description: 'Manually added by admin',
        priority: 'medium',
      });
      if (error) throw error;
      setCustomTask('');
      toast.success('Task added');
      await fetchTasks();
    } catch (err) {
      console.error('Error adding task:', err);
      toast.error('Failed to add task');
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const completedCount = tasks.filter(t => t.is_completed).length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ListTodo className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Daily To-Do List</CardTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <span className="mx-1">•</span>
                <Clock className="h-3.5 w-3.5" />
                Auto-refreshes at 7:00 AM
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generateTasks}
            disabled={isGenerating}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            {tasks.length === 0 ? 'Generate' : 'Refresh'}
          </Button>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">{completedCount}/{totalCount} completed</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">No tasks for today yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={generateTasks} disabled={isGenerating}>
              Generate Today's Tasks
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors hover:bg-muted/50 ${
                  task.is_completed ? 'opacity-60' : ''
                }`}
              >
                <Checkbox
                  checked={task.is_completed}
                  onCheckedChange={() => toggleTask(task)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">
                      {categoryIcons[task.category] || <ListTodo className="h-4 w-4" />}
                    </span>
                    <span className={`text-sm font-medium ${task.is_completed ? 'line-through' : ''}`}>
                      {task.title}
                    </span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </Badge>
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                  )}
                </div>
                {task.is_completed && task.completed_at && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    ✓ {new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <Separator className="my-3" />

        {/* Add custom task */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a custom task..."
            value={customTask}
            onChange={(e) => setCustomTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomTask()}
            className="text-sm"
          />
          <Button size="sm" variant="outline" onClick={addCustomTask} disabled={!customTask.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminDailyTodoList;
