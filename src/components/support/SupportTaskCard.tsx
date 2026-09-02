import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Car, 
  MapPin, 
  Calendar, 
  Cpu, 
  MessageSquare,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import type { SupportTask } from '@/types/support';
import { PRIORITY_CONFIG, VERIFICATION_STATE_CONFIG } from '@/types/support';

interface StatusConfigItem {
  label: string;
  color: string;
  icon?: string;
}

interface SupportTaskCardProps {
  task: SupportTask;
  onStatusChange: (taskId: string, newStatus: string, notes?: string) => Promise<void>;
  onAddFeedback: (taskId: string, content: string) => Promise<void>;
  statusOptions: string[];
  statusConfig: Record<string, StatusConfigItem>;
}

export const SupportTaskCard = ({
  task,
  onStatusChange,
  onAddFeedback,
  statusOptions,
  statusConfig,
}: SupportTaskCardProps) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const currentStatus = task.legal_status || task.iot_status || task.vehicle_status || task.insurance_status || 'unknown';
  const verification = VERIFICATION_STATE_CONFIG[task.verification_state || 'not_submitted'];
  const statusInfo = statusConfig[currentStatus] || { label: currentStatus, color: 'bg-muted' };
  const priorityInfo = PRIORITY_CONFIG[task.priority];

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    setIsUpdating(true);
    await onStatusChange(task.id, newStatus, statusNotes);
    setIsUpdating(false);
    setNewStatus('');
    setStatusNotes('');
    setIsDetailsOpen(false);
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackContent.trim()) return;
    setIsUpdating(true);
    await onAddFeedback(task.id, feedbackContent);
    setIsUpdating(false);
    setFeedbackContent('');
    setIsFeedbackOpen(false);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold line-clamp-1">
              {task.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {task.description || 'No description provided'}
            </p>
          </div>
          <div className="flex flex-col gap-1 items-end shrink-0">
            <Badge className={`${statusInfo.color} text-white`}>
              {statusInfo.label}
            </Badge>
            <Badge variant="outline" className={priorityInfo.color === 'bg-red-500' ? 'border-destructive text-destructive' : ''}>
              {priorityInfo.label}
            </Badge>
            {task.verification_state && task.verification_state !== 'not_submitted' && (
              <Badge className={verification.color}>{verification.label}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        {/* Key Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{task.city}, {task.region}</span>
          </div>
          
          {task.scheduled_date && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{format(new Date(task.scheduled_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          
          {task.vehicle && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Car className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {task.vehicle.make} {task.vehicle.model} ({task.vehicle.license_plate})
              </span>
            </div>
          )}
          
          {task.device && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cpu className="h-4 w-4 shrink-0" />
              <span className="truncate">{task.device.serial_number}</span>
            </div>
          )}
          
          {task.location_address && (
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{task.location_address}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" className="flex-1">
                Update Status
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update Task Status</DialogTitle>
                <DialogDescription>
                  Change the status and add any relevant notes
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">New Status</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select new status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => {
                        const info = statusConfig[status];
                        return (
                          <SelectItem key={status} value={status}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${info?.color || 'bg-muted'}`} />
                              {info?.label || status}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Notes (optional)</label>
                  <Textarea
                    placeholder="Add any notes about this status change..."
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                
                <Button 
                  onClick={handleStatusUpdate} 
                  disabled={!newStatus || isUpdating}
                  className="w-full"
                >
                  {isUpdating ? 'Updating...' : 'Update Status'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Feedback</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Feedback &amp; Resolve</DialogTitle>
                <DialogDescription>
                  Describe the work you completed. Submitting feedback marks this task
                  resolved and sends it to an admin for verification and approval.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 pt-4">
                <Textarea
                  placeholder="What did you do to resolve this task?"
                  value={feedbackContent}
                  onChange={(e) => setFeedbackContent(e.target.value)}
                  rows={4}
                />
                
                <Button 
                  onClick={handleFeedbackSubmit} 
                  disabled={!feedbackContent.trim() || isUpdating}
                  className="w-full"
                >
                  {isUpdating ? 'Submitting...' : 'Submit feedback & mark resolved'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span>Created {format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}</span>
          {task.priority === 'urgent' && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              <span>Urgent</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SupportTaskCard;
