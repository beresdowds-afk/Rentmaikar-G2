import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { 
  SupportTask, 
  SupportTaskUpdate, 
  SupportStaff, 
  SupportTaskType,
} from '@/types/support';

interface UseSupportTasksOptions {
  taskTypes: SupportTaskType[];
  autoFetch?: boolean;
}

export const useSupportTasks = ({ taskTypes, autoFetch = true }: UseSupportTasksOptions) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<SupportTask[]>([]);
  const [staffProfile, setStaffProfile] = useState<SupportStaff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch staff profile
  const fetchStaffProfile = useCallback(async () => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('support_staff')
        .select('*')
        .eq('user_id', user.id)
        .in('support_type', taskTypes)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      
      // Cast the data to SupportStaff type
      if (data) {
        setStaffProfile(data as unknown as SupportStaff);
        return data as unknown as SupportStaff;
      }
      return null;
    } catch (err) {
      console.error('Error fetching staff profile:', err);
      return null;
    }
  }, [user, taskTypes]);

  // Fetch tasks based on staff city assignment
  const fetchTasks = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const staff = await fetchStaffProfile();
      
      let query = supabase
        .from('support_tasks')
        .select(`
          *,
          vehicles:vehicle_id (make, model, year, license_plate),
          iot_devices:device_id (serial_number, device_model, status)
        `)
        .in('task_type', taskTypes)
        .order('created_at', { ascending: false });
      
      // If staff has city restriction, apply it
      if (staff?.assigned_city) {
        query = query.eq('city', staff.assigned_city);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Transform the data to match our types
      const transformedTasks = (data || []).map(task => ({
        ...task,
        vehicle: task.vehicles,
        device: task.iot_devices,
      })) as SupportTask[];
      
      setTasks(transformedTasks);
    } catch (err: unknown) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [user, taskTypes, fetchStaffProfile]);

  // Update task status
  const updateTaskStatus = useCallback(async (
    taskId: string,
    taskType: SupportTaskType,
    newStatus: string,
    notes?: string
  ) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    
    try {
      // Determine which status field to update
      const statusField = taskType === 'legal' ? 'legal_status'
        : taskType === 'insurance' ? 'insurance_status'
        : taskType.startsWith('iot_') ? 'iot_status'
        : 'vehicle_status';
      
      // Get current task to record previous status
      const currentTask = tasks.find(t => t.id === taskId);
      const previousStatus = currentTask?.[statusField as keyof SupportTask] as string;
      
      // Update task status
      const { error: updateError } = await supabase
        .from('support_tasks')
        .update({ 
          [statusField]: newStatus,
          ...(newStatus === 'completed' || newStatus === 'closed' || newStatus === 'resolved' 
            ? { resolved_at: new Date().toISOString(), resolved_by: user.id } 
            : {})
        })
        .eq('id', taskId);
      
      if (updateError) throw updateError;
      
      // Create update record
      const { error: logError } = await supabase
        .from('support_task_updates')
        .insert({
          task_id: taskId,
          user_id: user.id,
          update_type: 'status_change',
          previous_status: previousStatus,
          new_status: newStatus,
          content: notes || `Status changed from ${previousStatus} to ${newStatus}`,
        });
      
      if (logError) console.error('Error logging update:', logError);
      
      // Refresh tasks
      await fetchTasks();
      
      toast.success('Task status updated');
      return { success: true };
    } catch (err: unknown) {
      console.error('Error updating task status:', err);
      toast.error('Failed to update task status');
      return { success: false, error: err instanceof Error ? err.message : 'An error occurred' };
    }
  }, [user, tasks, fetchTasks]);

  // Add feedback/note to task
  const addTaskUpdate = useCallback(async (
    taskId: string,
    updateType: 'note' | 'feedback' | 'escalation',
    content: string
  ) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    
    try {
      const { error } = await supabase
        .from('support_task_updates')
        .insert([{
          task_id: taskId,
          user_id: user.id,
          update_type: updateType,
          content,
        }]);
      
      if (error) throw error;

      // Submitting feedback auto-resolves the task and queues it for admin verification
      await fetchTasks();

      toast.success(
        updateType === 'feedback'
          ? 'Feedback submitted — task marked resolved, awaiting admin verification'
          : 'Update added successfully'
      );
      return { success: true };
    } catch (err: unknown) {
      console.error('Error adding update:', err);
      toast.error('Failed to add update');
      return { success: false, error: err instanceof Error ? err.message : 'An error occurred' };
    }
  }, [user, fetchTasks]);

  // Fetch task updates/history
  const fetchTaskUpdates = useCallback(async (taskId: string): Promise<SupportTaskUpdate[]> => {
    try {
      const { data, error } = await supabase
        .from('support_task_updates')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return (data || []) as SupportTaskUpdate[];
    } catch (err) {
      console.error('Error fetching task updates:', err);
      return [];
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && user) {
      fetchTasks();
    }
  }, [autoFetch, user, fetchTasks]);

  return {
    tasks,
    staffProfile,
    isLoading,
    error,
    fetchTasks,
    updateTaskStatus,
    addTaskUpdate,
    fetchTaskUpdates,
  };
};

export default useSupportTasks;
