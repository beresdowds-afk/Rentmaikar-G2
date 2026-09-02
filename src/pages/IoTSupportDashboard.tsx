import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cpu, Wrench, Truck, MapPin, CheckCircle, Search, Wifi } from 'lucide-react';
import { SupportDashboardLayout } from '@/components/support/SupportDashboardLayout';
import { SupportTaskCard } from '@/components/support/SupportTaskCard';
import { IoTSupportOnboardingTour } from '@/components/onboarding/IoTSupportOnboardingTour';
import { useIoTSupportOnboarding } from '@/hooks/useIoTSupportOnboarding';
import { useSupportTasks } from '@/hooks/useSupportTasks';
import { IOT_STATUS_CONFIG } from '@/types/support';
import { IncomingCallAlerts } from '@/components/voice/IncomingCallAlerts';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { VehicleMqttCredentials } from '@/components/admin/VehicleMqttCredentials';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const IOT_STATUSES = Object.keys(IOT_STATUS_CONFIG) as (keyof typeof IOT_STATUS_CONFIG)[];

export default function IoTSupportDashboard() {
  const { isOpen, startTour, completeTour } = useIoTSupportOnboarding();
  const { tasks, staffProfile, isLoading, fetchTasks, updateTaskStatus, addTaskUpdate } = useSupportTasks({
    taskTypes: ['iot_installation', 'iot_maintenance'],
  });
  const { incomingRequests, acceptCallRequest, rejectCallRequest, escalateCallRequest } = useVoiceCall('iot_support');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = !searchQuery || 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.device?.serial_number?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || task.iot_status === statusFilter;
      const matchesType = typeFilter === 'all' || task.task_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [tasks, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(() => [
    { label: 'Assigned', value: tasks.filter(t => t.iot_status === 'assigned').length, color: 'bg-blue-500', icon: <Cpu className="h-5 w-5" /> },
    { label: 'In Transit', value: tasks.filter(t => t.iot_status === 'in_transit').length, color: 'bg-yellow-500', icon: <Truck className="h-5 w-5" /> },
    { label: 'On Site', value: tasks.filter(t => t.iot_status === 'on_site').length, color: 'bg-orange-500', icon: <MapPin className="h-5 w-5" /> },
    { label: 'Completed', value: tasks.filter(t => t.iot_status === 'completed').length, color: 'bg-green-500', icon: <CheckCircle className="h-5 w-5" /> },
  ], [tasks]);

  const handleStatusChange = async (taskId: string, newStatus: string, notes?: string) => {
    const task = tasks.find(t => t.id === taskId);
    await updateTaskStatus(taskId, task?.task_type || 'iot_installation', newStatus, notes);
  };

  const handleAddFeedback = async (taskId: string, content: string) => {
    await addTaskUpdate(taskId, 'feedback', content);
  };

  return (
    <>
      <SupportDashboardLayout
        title="IoT Support Dashboard"
        subtitle="Manage device installations, maintenance, and MQTT credentials"
        icon={<Cpu className="h-6 w-6 text-primary" />}
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
            userRole="iot_support"
          />

          <Tabs defaultValue="tasks" className="space-y-4">
            <TabsList>
              <TabsTrigger value="tasks" className="gap-2">
                <Wrench className="h-4 w-4" />
                Installation Tasks
              </TabsTrigger>
              <TabsTrigger value="credentials" className="gap-2">
                <Wifi className="h-4 w-4" />
                MQTT Credentials
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tasks">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4" data-tour="filters">
                  <div className="relative flex-1" data-tour="search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by device or location..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Task type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="iot_installation">Installation</SelectItem>
                      <SelectItem value="iot_maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {IOT_STATUSES.map(status => (
                        <SelectItem key={status} value={status}>{IOT_STATUS_CONFIG[status].label}</SelectItem>
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
                      <SupportTaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onAddFeedback={handleAddFeedback} statusOptions={IOT_STATUSES} statusConfig={IOT_STATUS_CONFIG} />
                    ))
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="credentials">
              {/* IoT support staff: view + insert only (readOnly=false still lets them insert, 
                  but edit/delete buttons are hidden since readOnly=true for non-admin) */}
              <VehicleMqttCredentials readOnly={true} />
            </TabsContent>
          </Tabs>
        </div>
      </SupportDashboardLayout>

      <IoTSupportOnboardingTour isOpen={isOpen} onComplete={completeTour} />
    </>
  );
}
