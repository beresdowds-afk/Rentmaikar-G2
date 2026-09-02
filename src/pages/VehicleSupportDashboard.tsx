import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Wrench, Truck, AlertTriangle, CheckCircle, Search } from 'lucide-react';
import { SupportDashboardLayout } from '@/components/support/SupportDashboardLayout';
import { SupportTaskCard } from '@/components/support/SupportTaskCard';
import { VehicleSupportOnboardingTour } from '@/components/onboarding/VehicleSupportOnboardingTour';
import { useVehicleSupportOnboarding } from '@/hooks/useVehicleSupportOnboarding';
import { useSupportTasks } from '@/hooks/useSupportTasks';
import { VEHICLE_STATUS_CONFIG } from '@/types/support';
import { IncomingCallAlerts } from '@/components/voice/IncomingCallAlerts';
import { useVoiceCall } from '@/hooks/useVoiceCall';

const VEHICLE_STATUSES = Object.keys(VEHICLE_STATUS_CONFIG) as (keyof typeof VEHICLE_STATUS_CONFIG)[];

export default function VehicleSupportDashboard() {
  const { isOpen, startTour, completeTour } = useVehicleSupportOnboarding();
  const { tasks, staffProfile, isLoading, fetchTasks, updateTaskStatus, addTaskUpdate } = useSupportTasks({
    taskTypes: ['vehicle_recall', 'vehicle_maintenance'],
  });
  const { incomingRequests, acceptCallRequest, rejectCallRequest, escalateCallRequest } = useVoiceCall('vehicle_support');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = !searchQuery || 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.vehicle?.license_plate?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || task.vehicle_status === statusFilter;
      const matchesType = typeFilter === 'all' || task.task_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [tasks, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(() => [
    { label: 'Reported', value: tasks.filter(t => t.vehicle_status === 'reported').length, color: 'bg-blue-500', icon: <Car className="h-5 w-5" /> },
    { label: 'In Progress', value: tasks.filter(t => t.vehicle_status === 'repair_in_progress').length, color: 'bg-orange-500', icon: <Wrench className="h-5 w-5" /> },
    { label: 'Escalated', value: tasks.filter(t => t.vehicle_status === 'escalated').length, color: 'bg-red-500', icon: <AlertTriangle className="h-5 w-5" /> },
    { label: 'Completed', value: tasks.filter(t => t.vehicle_status === 'completed').length, color: 'bg-green-500', icon: <CheckCircle className="h-5 w-5" /> },
  ], [tasks]);

  const handleStatusChange = async (taskId: string, newStatus: string, notes?: string) => {
    const task = tasks.find(t => t.id === taskId);
    await updateTaskStatus(taskId, task?.task_type || 'vehicle_recall', newStatus, notes);
  };

  const handleAddFeedback = async (taskId: string, content: string) => {
    await addTaskUpdate(taskId, 'feedback', content);
  };

  return (
    <>
      <SupportDashboardLayout
        title="Vehicle Support Dashboard"
        subtitle="Manage recalls and maintenance tasks"
        icon={<Car className="h-6 w-6 text-primary" />}
        staffProfile={staffProfile}
        onRefresh={fetchTasks}
        onStartTour={startTour}
        isLoading={isLoading}
        stats={stats}
      >
        <div className="space-y-6">
          <IncomingCallAlerts
            requests={incomingRequests}
            onAccept={acceptCallRequest}
            onReject={rejectCallRequest}
            onEscalate={escalateCallRequest}
            userRole="vehicle_support"
          />
          <div className="flex flex-col sm:flex-row gap-4" data-tour="filters">
            <div className="relative flex-1" data-tour="search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by vehicle..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Task type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="vehicle_recall">Recall</SelectItem>
                <SelectItem value="vehicle_maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {VEHICLE_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>{VEHICLE_STATUS_CONFIG[status].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-tour="task-list">
            {isLoading ? (
              <p className="text-muted-foreground col-span-full text-center py-8">Loading tasks...</p>
            ) : filteredTasks.length === 0 ? (
              <p className="text-muted-foreground col-span-full text-center py-8">No tasks found</p>
            ) : (
              filteredTasks.map(task => (
                <SupportTaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onAddFeedback={handleAddFeedback} statusOptions={VEHICLE_STATUSES} statusConfig={VEHICLE_STATUS_CONFIG} />
              ))
            )}
          </div>
        </div>
      </SupportDashboardLayout>

      <VehicleSupportOnboardingTour isOpen={isOpen} onComplete={completeTour} />
    </>
  );
}
