import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Scale, FileText, PenTool, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import { SupportDashboardLayout } from '@/components/support/SupportDashboardLayout';
import { SupportTaskCard } from '@/components/support/SupportTaskCard';
import { LegalSupportOnboardingTour } from '@/components/onboarding/LegalSupportOnboardingTour';
import { useLegalSupportOnboarding } from '@/hooks/useLegalSupportOnboarding';
import { useSupportTasks } from '@/hooks/useSupportTasks';
import { LEGAL_STATUS_CONFIG } from '@/types/support';
import { IncomingCallAlerts } from '@/components/voice/IncomingCallAlerts';
import { useVoiceCall } from '@/hooks/useVoiceCall';

const LEGAL_STATUSES = Object.keys(LEGAL_STATUS_CONFIG) as (keyof typeof LEGAL_STATUS_CONFIG)[];

export default function LegalSupportDashboard() {
  const { isOpen, startTour, completeTour } = useLegalSupportOnboarding();
  const { tasks, staffProfile, isLoading, fetchTasks, updateTaskStatus, addTaskUpdate } = useSupportTasks({
    taskTypes: ['legal'],
  });
  const { incomingRequests, acceptCallRequest, rejectCallRequest, escalateCallRequest } = useVoiceCall('legal_support');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = !searchQuery || 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || task.legal_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tasks, searchQuery, statusFilter]);

  const stats = useMemo(() => [
    { label: 'Open', value: tasks.filter(t => t.legal_status === 'open').length, color: 'bg-blue-500', icon: <FileText className="h-5 w-5" /> },
    { label: 'Document Review', value: tasks.filter(t => t.legal_status === 'document_review').length, color: 'bg-yellow-500', icon: <Search className="h-5 w-5" /> },
    { label: 'Pending Signature', value: tasks.filter(t => t.legal_status === 'pending_signature').length, color: 'bg-orange-500', icon: <PenTool className="h-5 w-5" /> },
    { label: 'Escalated', value: tasks.filter(t => t.legal_status === 'escalated').length, color: 'bg-red-500', icon: <AlertTriangle className="h-5 w-5" /> },
  ], [tasks]);

  const handleStatusChange = async (taskId: string, newStatus: string, notes?: string) => {
    await updateTaskStatus(taskId, 'legal', newStatus, notes);
  };

  const handleAddFeedback = async (taskId: string, content: string) => {
    await addTaskUpdate(taskId, 'feedback', content);
  };

  return (
    <>
      <SupportDashboardLayout
        title="Legal Support Dashboard"
        subtitle="Manage legal documents, agreements, and dispute resolutions"
        icon={<Scale className="h-6 w-6 text-primary" />}
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
            userRole="legal_support"
          />
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4" data-tour="filters">
            <div className="relative flex-1" data-tour="search">
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
                {LEGAL_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>
                    {LEGAL_STATUS_CONFIG[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task List */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-tour="task-list">
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
                  statusOptions={LEGAL_STATUSES}
                  statusConfig={LEGAL_STATUS_CONFIG}
                />
              ))
            )}
          </div>
        </div>
      </SupportDashboardLayout>

      <LegalSupportOnboardingTour isOpen={isOpen} onComplete={completeTour} />
    </>
  );
}
