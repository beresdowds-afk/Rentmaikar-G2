import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, FileText, Search, Send, CheckCircle } from 'lucide-react';
import { SupportDashboardLayout } from '@/components/support/SupportDashboardLayout';
import { SupportTaskCard } from '@/components/support/SupportTaskCard';
import { useSupportTasks } from '@/hooks/useSupportTasks';
import { INSURANCE_STATUS_CONFIG } from '@/types/support';

const INSURANCE_STATUSES = Object.keys(INSURANCE_STATUS_CONFIG) as (keyof typeof INSURANCE_STATUS_CONFIG)[];

export default function InsuranceSupportDashboard() {
  const { tasks, staffProfile, isLoading, fetchTasks, updateTaskStatus, addTaskUpdate } = useSupportTasks({
    taskTypes: ['insurance'],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = !searchQuery ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || task.insurance_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tasks, searchQuery, statusFilter]);

  const stats = useMemo(() => [
    { label: 'Open', value: tasks.filter(t => t.insurance_status === 'open').length, color: 'bg-blue-500', icon: <FileText className="h-5 w-5" /> },
    { label: 'Reviewing', value: tasks.filter(t => t.insurance_status === 'reviewing').length, color: 'bg-yellow-500', icon: <Search className="h-5 w-5" /> },
    { label: 'Quote Sent', value: tasks.filter(t => t.insurance_status === 'quote_sent').length, color: 'bg-indigo-500', icon: <Send className="h-5 w-5" /> },
    { label: 'Pending Verification', value: tasks.filter(t => t.verification_state === 'pending_verification').length, color: 'bg-amber-500', icon: <CheckCircle className="h-5 w-5" /> },
  ], [tasks]);

  const handleStatusChange = async (taskId: string, newStatus: string, notes?: string) => {
    await updateTaskStatus(taskId, 'insurance', newStatus, notes);
  };

  const handleAddFeedback = async (taskId: string, content: string) => {
    await addTaskUpdate(taskId, 'feedback', content);
  };

  return (
    <SupportDashboardLayout
      title="Insurance Support Dashboard"
      subtitle="Handle insurance requests, quotes, and claim documentation"
      icon={<Shield className="h-6 w-6 text-primary" />}
      staffProfile={staffProfile}
      onRefresh={fetchTasks}
      onStartTour={() => undefined}
      isLoading={isLoading}
      stats={stats}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {INSURANCE_STATUSES.map(status => (
                <SelectItem key={status} value={status}>{INSURANCE_STATUS_CONFIG[status].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p className="text-muted-foreground col-span-full text-center py-8">Loading tasks...</p>
          ) : filteredTasks.length === 0 ? (
            <p className="text-muted-foreground col-span-full text-center py-8">
              {searchQuery || statusFilter !== 'all' ? 'No tasks match your filters' : 'No tasks assigned to your city'}
            </p>
          ) : (
            filteredTasks.map(task => (
              <SupportTaskCard
                key={task.id}
                task={task}
                onStatusChange={handleStatusChange}
                onAddFeedback={handleAddFeedback}
                statusOptions={INSURANCE_STATUSES}
                statusConfig={INSURANCE_STATUS_CONFIG}
              />
            ))
          )}
        </div>
      </div>
    </SupportDashboardLayout>
  );
}
