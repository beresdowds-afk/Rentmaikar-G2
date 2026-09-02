import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Play, Eye, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskCategoryConfig, CategoryTaskStats, TaskExecutionMode } from '@/types/task-categories';

interface TaskCategoryCardProps {
  category: TaskCategoryConfig;
  stats: CategoryTaskStats;
  executionMode: TaskExecutionMode;
  onModeChange: (mode: TaskExecutionMode) => void;
  onViewTasks: () => void;
  onCreateTask: () => void;
  onManageStaff: () => void;
  staffCount: number;
}

export const TaskCategoryCard = ({
  category,
  stats,
  executionMode,
  onModeChange,
  onViewTasks,
  onCreateTask,
  onManageStaff,
  staffCount,
}: TaskCategoryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const IconComponent = category.icon;
  const isDelegation = executionMode === 'delegation';
  const canDelegate = category.supportTypes.length > 0;

  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', category.color)}>
              <IconComponent className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{category.label}</CardTitle>
              <CardDescription className="text-sm mt-1">{category.description}</CardDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="p-2 rounded-lg bg-yellow-500/10">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="p-2 rounded-lg bg-blue-500/10">
            <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </div>
          <div className="p-2 rounded-lg bg-green-500/10">
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
        </div>

        {/* Execution Mode Toggle */}
        {canDelegate && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {isDelegation ? 'Delegation Mode' : 'Direct Implementation'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isDelegation ? category.delegationDescription : category.directDescription}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('text-xs', !isDelegation && 'font-medium')}>Direct</span>
              <Switch
                checked={isDelegation}
                onCheckedChange={(checked) => onModeChange(checked ? 'delegation' : 'direct')}
              />
              <span className={cn('text-xs', isDelegation && 'font-medium')}>Delegate</span>
            </div>
          </div>
        )}

        {/* Staff Info (for delegation mode) */}
        {isDelegation && canDelegate && (
          <div className="flex items-center justify-between p-2 rounded-lg border border-dashed">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <strong>{staffCount}</strong> support staff assigned
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={onManageStaff}>
              Manage <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}

        {/* Overdue Alert */}
        {stats.overdue > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
            <Badge variant="destructive" className="text-xs">{stats.overdue} Overdue</Badge>
            <span>tasks require immediate attention</span>
          </div>
        )}

        {/* Expanded Actions */}
        {isExpanded && (
          <div className="pt-2 border-t space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="w-full" onClick={onViewTasks}>
                <Eye className="h-4 w-4 mr-2" />
                View All Tasks
              </Button>
              <Button variant="default" className="w-full" onClick={onCreateTask}>
                <Play className="h-4 w-4 mr-2" />
                {isDelegation ? 'Create & Assign' : 'Start Task'}
              </Button>
            </div>
          </div>
        )}

        {/* Quick Actions (when collapsed) */}
        {!isExpanded && (
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1" onClick={onViewTasks}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Tasks</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="default" size="sm" className="flex-1" onClick={onCreateTask}>
                  <Play className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isDelegation ? 'Create & Assign Task' : 'Start Direct Task'}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
