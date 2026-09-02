import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  LayoutGrid, 
  Users, 
  BarChart3, 
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { TaskCategoryCard } from './TaskCategoryCard';
import { SupportUserManagement } from './SupportUserManagement';
import { TASK_CATEGORIES, type TaskCategory, type TaskExecutionMode, type CategoryTaskStats } from '@/types/task-categories';

interface TaskRow {
  id: string;
  task_type: string;
  legal_status?: string;
  iot_status?: string;
  vehicle_status?: string;
  created_at: string;
  scheduled_date?: string;
}

interface StaffRow {
  id: string;
  support_type: string;
  is_active: boolean;
}

export const AdminTaskPortal = () => {
  const [activeTab, setActiveTab] = useState<'categories' | 'users' | 'analytics'>('categories');
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [executionModes, setExecutionModes] = useState<Record<TaskCategory, TaskExecutionMode>>({
    legal_operations: 'delegation',
    iot_operations: 'delegation',
    vehicle_operations: 'delegation',
    user_management: 'direct',
    payment_operations: 'direct',
    incident_management: 'direct',
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [tasksResponse, staffResponse] = await Promise.all([
        supabase
          .from('support_tasks')
          .select('id, task_type, legal_status, iot_status, vehicle_status, created_at, scheduled_date')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('support_staff')
          .select('id, support_type, is_active'),
      ]);

      if (tasksResponse.error) throw tasksResponse.error;
      if (staffResponse.error) throw staffResponse.error;

      setTasks((tasksResponse.data || []) as TaskRow[]);
      setStaff((staffResponse.data || []) as StaffRow[]);
    } catch (err) {
      console.error('Error fetching portal data:', err);
      toast.error('Failed to load portal data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getCategoryStats = (category: typeof TASK_CATEGORIES[0]): CategoryTaskStats => {
    const categoryTasks = tasks.filter(t => category.supportTypes.includes(t.task_type as any));
    
    const getStatus = (task: TaskRow) => {
      return task.legal_status || task.iot_status || task.vehicle_status || 'unknown';
    };

    const completedStatuses = ['resolved', 'closed', 'completed'];
    const inProgressStatuses = ['document_review', 'pending_signature', 'scheduled', 'in_transit', 'on_site', 'installation_complete', 'testing', 'dispatched', 'inspection', 'repair_in_progress', 'pending_parts', 'quality_check'];
    const pendingStatuses = ['open', 'assigned', 'reported'];

    const now = new Date();
    const overdue = categoryTasks.filter(t => {
      if (!t.scheduled_date) return false;
      const scheduledDate = new Date(t.scheduled_date);
      const status = getStatus(t);
      return scheduledDate < now && !completedStatuses.includes(status);
    }).length;

    return {
      total: categoryTasks.length,
      pending: categoryTasks.filter(t => pendingStatuses.includes(getStatus(t))).length,
      inProgress: categoryTasks.filter(t => inProgressStatuses.includes(getStatus(t))).length,
      completed: categoryTasks.filter(t => completedStatuses.includes(getStatus(t))).length,
      overdue,
    };
  };

  const getStaffCount = (category: typeof TASK_CATEGORIES[0]): number => {
    return staff.filter(s => 
      category.supportTypes.includes(s.support_type as any) && s.is_active
    ).length;
  };

  const handleModeChange = (categoryId: TaskCategory, mode: TaskExecutionMode) => {
    setExecutionModes(prev => ({ ...prev, [categoryId]: mode }));
    toast.success(`${categoryId.replace('_', ' ')} set to ${mode} mode`);
  };

  const handleViewTasks = (category: typeof TASK_CATEGORIES[0]) => {
    toast.info(`View tasks for ${category.label}`, {
      description: 'Navigate to Support Tasks tab for detailed view',
    });
  };

  const handleCreateTask = (category: typeof TASK_CATEGORIES[0]) => {
    toast.info(`Create task for ${category.label}`, {
      description: 'Navigate to Support Tasks tab to create',
    });
  };

  const handleManageStaff = (_category: typeof TASK_CATEGORIES[0]) => {
    setActiveTab('users');
  };

  // Summary stats
  const totalTasks = tasks.length;
  const totalActiveStaff = staff.filter(s => s.is_active).length;
  const totalPending = TASK_CATEGORIES.reduce((sum, cat) => sum + getCategoryStats(cat).pending, 0);
  const totalOverdue = TASK_CATEGORIES.reduce((sum, cat) => sum + getCategoryStats(cat).overdue, 0);

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2">
              <LayoutGrid className="h-6 w-6" />
              Task Management Portal
            </CardTitle>
            <CardDescription className="mt-1">
              Centralized hub for task delegation, monitoring, and support user management
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="p-4 rounded-xl bg-muted">
            <p className="text-sm text-muted-foreground">Total Tasks</p>
            <p className="text-3xl font-bold">{totalTasks}</p>
          </div>
          <div className="p-4 rounded-xl bg-warning/10">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-3xl font-bold text-warning">{totalPending}</p>
          </div>
          <div className="p-4 rounded-xl bg-destructive/10">
            <p className="text-sm text-muted-foreground">Overdue</p>
            <p className="text-3xl font-bold text-destructive">{totalOverdue}</p>
          </div>
          <div className="p-4 rounded-xl bg-success/10">
            <p className="text-sm text-muted-foreground">Active Staff</p>
            <p className="text-3xl font-bold text-success">{totalActiveStaff}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="categories" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Task Categories
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Support Users
              <Badge variant="secondary" className="ml-1">{totalActiveStaff}</Badge>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {TASK_CATEGORIES.map(category => (
                  <TaskCategoryCard
                    key={category.id}
                    category={category}
                    stats={getCategoryStats(category)}
                    executionMode={executionModes[category.id]}
                    onModeChange={(mode) => handleModeChange(category.id, mode)}
                    onViewTasks={() => handleViewTasks(category)}
                    onCreateTask={() => handleCreateTask(category)}
                    onManageStaff={() => handleManageStaff(category)}
                    staffCount={getStaffCount(category)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="users">
            <SupportUserManagement />
          </TabsContent>

          <TabsContent value="analytics">
            <Card className="p-8 text-center">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Task Analytics</h3>
              <p className="text-muted-foreground mb-4">
                Detailed analytics and performance metrics for all task categories.
              </p>
              <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto mt-8">
                {TASK_CATEGORIES.filter(c => c.supportTypes.length > 0).map(category => {
                  const stats = getCategoryStats(category);
                  const completionRate = stats.total > 0 
                    ? Math.round((stats.completed / stats.total) * 100) 
                    : 0;
                  return (
                    <div key={category.id} className="p-4 rounded-lg border">
                      <p className="text-sm text-muted-foreground mb-1">{category.label}</p>
                      <p className="text-2xl font-bold">{completionRate}%</p>
                      <p className="text-xs text-muted-foreground">completion rate</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
