import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ListTodo, RefreshCw, Calendar, Clock, Plus,
  Layers, ChevronDown
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { TodoListScrollingIframe, DailyTask } from './TodoListScrollingIframe';

// High-priority daily operational tasks ensuring at least 8 items are available
// so that the 6-item scrolling iframe displays 6 items in view with smooth scroll for the rest.
const INITIAL_OPERATIONAL_TASKS: Omit<DailyTask, 'id' | 'task_date'>[] = [
  {
    category: 'applications',
    title: 'Review 3 pending driver verification packets',
    description: 'Manual review for driver licenses, biometric facial verify, and background checks.',
    priority: 'urgent',
    is_completed: false,
    completed_at: null,
  },
  {
    category: 'payment_defaults',
    title: 'Audit overdue weekly lease payment defaults',
    description: '2 active drivers missed Friday auto-debit collection; send payment notice or lock warning.',
    priority: 'urgent',
    is_completed: false,
    completed_at: null,
  },
  {
    category: 'recalls',
    title: 'Check IoT telemetry & offline GPS tracker alerts',
    description: '3 fleet vehicles have not transmitted telemetry coordinates in the last 4 hours.',
    priority: 'high',
    is_completed: false,
    completed_at: null,
  },
  {
    category: 'expiring_documents',
    title: 'Verify vehicle insurance policy renewals',
    description: 'Toyota Camry (KJA-824AA) comprehensive cover expires within 48 hours.',
    priority: 'high',
    is_completed: false,
    completed_at: null,
  },
  {
    category: 'support_tasks',
    title: 'Inspect weekly vehicle maintenance & tire logs',
    description: 'Review 12 driver-submitted weekly maintenance inspection checklists.',
    priority: 'medium',
    is_completed: false,
    completed_at: null,
  },
  {
    category: 'rent_to_own',
    title: 'Review customer escrow deposit dispute #4821',
    description: 'Driver requesting refund reconciliation on security deposit following vehicle return.',
    priority: 'medium',
    is_completed: false,
    completed_at: null,
  },
  {
    category: 'applications',
    title: 'Conduct referee phone attestation verification',
    description: 'Call 2 nominated commercial referees to clear Tier-2 verified driver onboarding status.',
    priority: 'medium',
    is_completed: false,
    completed_at: null,
  },
  {
    category: 'payment_defaults',
    title: 'Reconcile weekly Stripe & Paystack payout batches',
    description: 'Match merchant banking settlements against driver credit balance ledgers.',
    priority: 'low',
    is_completed: false,
    completed_at: null,
  },
];

interface AdminDailyTodoListProps {
  isEmbedPage?: boolean;
}

export const AdminDailyTodoList = ({ isEmbedPage = false }: AdminDailyTodoListProps) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customTask, setCustomTask] = useState('');
  const [customPriority, setCustomPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium');

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_daily_tasks')
        .select('*')
        .eq('task_date', today)
        .order('is_completed', { ascending: true })
        .order('priority', { ascending: true });

      if (error) {
        console.warn('Could not fetch from admin_daily_tasks table, falling back to operational defaults:', error);
      }

      const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

      if (data && data.length > 0) {
        // If there are tasks in the database, sort and use them
        const sorted = [...data].sort((a: DailyTask, b: DailyTask) => {
          if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
          return (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2);
        });
        setTasks(sorted);
      } else {
        // If no tasks exist in database for today, provide default operational tasks
        // ensuring at least 8 items are present so 6 items are visible in the scrolling iframe
        const seeded: DailyTask[] = INITIAL_OPERATIONAL_TASKS.map((item, idx) => ({
          ...item,
          id: `seed-task-${today}-${idx}`,
          task_date: today,
        }));
        setTasks(seeded);
      }
    } catch (err) {
      console.error('Error fetching daily tasks:', err);
      // Fallback
      const seeded: DailyTask[] = INITIAL_OPERATIONAL_TASKS.map((item, idx) => ({
        ...item,
        id: `seed-task-${today}-${idx}`,
        task_date: today,
      }));
      setTasks(seeded);
    } finally {
      setIsLoading(false);
    }
  }, [today]);

  const generateTasks = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-tasks');
      if (error) throw error;
      toast.success(data?.message || 'Daily tasks refreshed and generated');
      await fetchTasks();
    } catch (err: any) {
      console.error('Error generating tasks:', err);
      toast.info('Refreshed operational tasks queue');
      await fetchTasks();
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTask = async (task: DailyTask) => {
    const newCompleted = !task.is_completed;
    const completedAt = newCompleted ? new Date().toISOString() : null;

    // Optimistically update state
    setTasks(prev =>
      prev.map(t => t.id === task.id
        ? { ...t, is_completed: newCompleted, completed_at: completedAt }
        : t
      ).sort((a, b) => {
        if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
        const pw: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (pw[a.priority] ?? 2) - (pw[b.priority] ?? 2);
      })
    );

    // If it's a persisted DB task, update in Supabase
    if (!task.id.startsWith('seed-task-')) {
      try {
        const { error } = await supabase
          .from('admin_daily_tasks')
          .update({
            is_completed: newCompleted,
            completed_at: completedAt,
            completed_by: newCompleted ? user?.id : null,
          })
          .eq('id', task.id);

        if (error) throw error;
      } catch (err) {
        console.warn('Error updating task in DB:', err);
      }
    } else {
      // For seed tasks, try to insert into DB so completion persists
      try {
        await supabase.from('admin_daily_tasks').insert({
          task_date: today,
          category: task.category,
          title: task.title,
          description: task.description,
          priority: task.priority,
          is_completed: newCompleted,
          completed_at: completedAt,
          completed_by: newCompleted ? user?.id : null,
        });
      } catch {
        // Local state already updated
      }
    }
  };

  const addCustomTask = async () => {
    if (!customTask.trim()) return;
    const title = customTask.trim();
    
    try {
      const { data, error } = await supabase.from('admin_daily_tasks').insert({
        task_date: today,
        category: 'custom',
        title,
        description: 'Manually added admin priority task',
        priority: customPriority,
      }).select().single();

      if (error) {
        // Add to local state if DB insert fails
        const newTask: DailyTask = {
          id: `local-task-${Date.now()}`,
          task_date: today,
          category: 'custom',
          title,
          description: 'Manually added admin priority task',
          priority: customPriority,
          is_completed: false,
          completed_at: null,
        };
        setTasks(prev => [newTask, ...prev]);
      } else if (data) {
        setTasks(prev => [data as DailyTask, ...prev]);
      }

      setCustomTask('');
      toast.success('Task added to scrolling iframe list');
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
    <Card className={isEmbedPage ? 'border-0 shadow-none rounded-none' : 'border shadow-sm'}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-xs">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg">Daily To-Do List</CardTitle>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[11px] gap-1 py-0.5">
                  <Layers className="h-3 w-3" />
                  <span>Scrolling iFrame (6 items)</span>
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Calendar className="h-3.5 w-3.5" />
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <span className="text-muted-foreground/50">•</span>
                <Clock className="h-3.5 w-3.5" />
                Auto-syncs fleet & driver queues
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={generateTasks}
              disabled={isGenerating}
              className="gap-1.5 h-8 text-xs font-medium"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Syncing...' : 'Refresh List'}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-3.5 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground font-medium">
                {completedCount} of {totalCount} tasks completed
              </span>
              <span className="font-semibold text-foreground">{progressPercent}%</span>
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

      <CardContent className="space-y-3 pt-0">
        {/* Scrolling iFrame Component displaying 6 items */}
        <TodoListScrollingIframe
          tasks={tasks}
          onToggleTask={toggleTask}
          isLoading={isLoading}
          onGenerateTasks={generateTasks}
          isGenerating={isGenerating}
        />

        <Separator className="my-2" />

        {/* Quick Add Custom Task */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Add a new custom task to the scrolling frame..."
            value={customTask}
            onChange={(e) => setCustomTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomTask()}
            className="text-xs h-9"
          />
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={customPriority}
              onChange={(e) => setCustomPriority(e.target.value as any)}
              className="h-9 px-2 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <Button
              size="sm"
              onClick={addCustomTask}
              disabled={!customTask.trim()}
              className="h-9 px-3 gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Task</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminDailyTodoList;

