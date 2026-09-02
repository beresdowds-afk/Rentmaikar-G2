import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Clock,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Zap,
  DollarSign,
  Bell,
  Truck,
  FileText,
  Users,
  BarChart3,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CronJob {
  id: string;
  name: string;
  functionName: string;
  schedule: string;
  humanSchedule: string;
  description: string;
  icon: React.ReactNode;
  category: "payments" | "notifications" | "fleet" | "admin";
}

interface JobStatus {
  functionName: string;
  lastRun?: string;
  lastStatus?: "success" | "error" | "running";
  isRunning: boolean;
}

const CRON_JOBS: CronJob[] = [
  {
    id: "process-daily-debits",
    name: "Daily Debits",
    functionName: "process-daily-debits",
    schedule: "1 0 * * *",
    humanSchedule: "Every day at 12:01 AM UTC",
    description: "Processes daily rental payments and sends success/failure notifications to drivers.",
    icon: <DollarSign className="h-4 w-4" />,
    category: "payments",
  },
  {
    id: "process-predue-reminders",
    name: "Pre-Due Reminders",
    functionName: "process-predue-reminders",
    schedule: "0 7 * * *",
    humanSchedule: "Every day at 7:00 AM UTC",
    description: "Sends upcoming payment reminders to drivers before their due date.",
    icon: <Bell className="h-4 w-4" />,
    category: "payments",
  },
  {
    id: "process-payment-defaults",
    name: "Payment Default Checks",
    functionName: "process-payment-defaults",
    schedule: "0 */6 * * *",
    humanSchedule: "Every 6 hours",
    description: "Escalates overdue payments with notifications and triggers vehicle deactivation when eligible.",
    icon: <AlertCircle className="h-4 w-4" />,
    category: "payments",
  },
  {
    id: "process-owner-payouts",
    name: "Owner Payouts",
    functionName: "process-owner-payouts",
    schedule: "0 9 * * 5",
    humanSchedule: "Fridays at 9:00 AM UTC",
    description: "Processes weekly owner earnings and triggers payout notifications via email/SMS/WhatsApp.",
    icon: <BarChart3 className="h-4 w-4" />,
    category: "payments",
  },
  {
    id: "process-expiry-notifications",
    name: "Expiry Notifications",
    functionName: "process-expiry-notifications",
    schedule: "0 8 * * *",
    humanSchedule: "Every day at 8:00 AM UTC",
    description: "Sends 30-day, 15-day, 7-day, and 5-day alerts for expiring documents, insurance, and licenses.",
    icon: <Bell className="h-4 w-4" />,
    category: "notifications",
  },
  {
    id: "process-inspection-reminders",
    name: "Inspection Reminders",
    functionName: "process-inspection-reminders",
    schedule: "0 9 1 1,4,7,10 *",
    humanSchedule: "Quarterly (Jan, Apr, Jul, Oct — 1st at 9:00 AM UTC)",
    description: "Sends vehicle inspection due reminders to owners on the 1st of each quarter.",
    icon: <FileText className="h-4 w-4" />,
    category: "notifications",
  },
  {
    id: "vehicle-return-reminder",
    name: "Vehicle Return Reminders",
    functionName: "vehicle-return-reminder",
    schedule: "0 10 * * *",
    humanSchedule: "Every day at 10:00 AM UTC",
    description: "Sends 24-hour return reminders to drivers with vehicle return dates approaching.",
    icon: <Truck className="h-4 w-4" />,
    category: "fleet",
  },
  {
    id: "generate-daily-tasks",
    name: "Generate Daily Tasks",
    functionName: "generate-daily-tasks",
    schedule: "0 6 * * *",
    humanSchedule: "Every day at 6:00 AM UTC",
    description: "Auto-generates daily admin to-do items based on pending applications, defaults, and renewals.",
    icon: <Users className="h-4 w-4" />,
    category: "admin",
  },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  payments: { label: "Payments", color: "bg-success/10 text-success border border-success/20" },
  notifications: { label: "Notifications", color: "bg-primary/10 text-primary border border-primary/20" },
  fleet: { label: "Fleet", color: "bg-warning/10 text-warning border border-warning/20" },
  admin: { label: "Admin", color: "bg-secondary text-secondary-foreground border border-border" },
};

const formatRelativeTime = (dateStr?: string): string => {
  if (!dateStr) return "Never run";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export const CronJobManagement = () => {
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus & { isRunning: boolean }>>({});
  const [runHistory, setRunHistory] = useState<Record<string, { time: string; status: "success" | "error" }[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const initStatuses = useCallback(() => {
    const initial: Record<string, JobStatus> = {};
    CRON_JOBS.forEach((j) => {
      initial[j.functionName] = { functionName: j.functionName, isRunning: false };
    });
    setJobStatuses(initial);
  }, []);

  useEffect(() => {
    initStatuses();
  }, [initStatuses]);

  const triggerJob = async (job: CronJob) => {
    setJobStatuses((prev) => ({
      ...prev,
      [job.functionName]: { ...prev[job.functionName], isRunning: true, lastStatus: "running" },
    }));

    const startTime = new Date().toISOString();

    try {
      const { error } = await supabase.functions.invoke(job.functionName, {
        body: { time: "now", manual_trigger: true },
      });

      const status = error ? "error" : "success";

      setJobStatuses((prev) => ({
        ...prev,
        [job.functionName]: {
          ...prev[job.functionName],
          isRunning: false,
          lastRun: startTime,
          lastStatus: status,
        },
      }));

      setRunHistory((prev) => ({
        ...prev,
        [job.functionName]: [
          { time: startTime, status },
          ...(prev[job.functionName] || []).slice(0, 4),
        ],
      }));

      if (error) {
        toast.error(`${job.name} failed`, { description: error.message });
      } else {
        toast.success(`${job.name} triggered successfully`);
      }
    } catch (err: any) {
      setJobStatuses((prev) => ({
        ...prev,
        [job.functionName]: {
          ...prev[job.functionName],
          isRunning: false,
          lastRun: startTime,
          lastStatus: "error",
        },
      }));
      setRunHistory((prev) => ({
        ...prev,
        [job.functionName]: [
          { time: startTime, status: "error" },
          ...(prev[job.functionName] || []).slice(0, 4),
        ],
      }));
      toast.error(`${job.name} failed`, { description: err.message });
    }
  };

  const triggerAll = async () => {
    toast.info("Triggering all cron jobs…");
    for (const job of CRON_JOBS) {
      await triggerJob(job);
    }
  };

  const filteredJobs =
    selectedCategory === "all"
      ? CRON_JOBS
      : CRON_JOBS.filter((j) => j.category === selectedCategory);

  const categories = ["all", ...Array.from(new Set(CRON_JOBS.map((j) => j.category)))];

  const summary = {
    total: CRON_JOBS.length,
    running: Object.values(jobStatuses).filter((s) => s.isRunning).length,
    success: Object.values(jobStatuses).filter((s) => s.lastStatus === "success").length,
    error: Object.values(jobStatuses).filter((s) => s.lastStatus === "error").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Cron Job Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manually trigger all scheduled background jobs
          </p>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={triggerAll}>
          <Zap className="h-4 w-4" />
          Trigger All Now
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{summary.total}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Jobs</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{summary.running}</p>
          <p className="text-xs text-muted-foreground mt-1">Running</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-success">{summary.success}</p>
          <p className="text-xs text-muted-foreground mt-1">Succeeded</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{summary.error}</p>
          <p className="text-xs text-muted-foreground mt-1">Failed</p>
        </Card>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={selectedCategory === cat ? "default" : "outline"}
            onClick={() => setSelectedCategory(cat)}
            className="capitalize"
          >
            {cat === "all" ? "All Jobs" : CATEGORY_LABELS[cat]?.label ?? cat}
          </Button>
        ))}
      </div>

      {/* Job Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filteredJobs.map((job) => {
          const status: JobStatus = jobStatuses[job.functionName] ?? { functionName: job.functionName, isRunning: false };
          const history = runHistory[job.functionName] ?? [];
          const cat = CATEGORY_LABELS[job.category];

          return (
            <Card key={job.id} className="p-5 flex flex-col gap-4">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    {job.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{job.name}</p>
                    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", cat.color)}>
                      {cat.label}
                    </span>
                  </div>
                </div>

                {/* Status badge */}
                {status.isRunning ? (
                  <Badge variant="secondary" className="gap-1 shrink-0">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running
                  </Badge>
                ) : status.lastStatus === "success" ? (
                  <Badge className="gap-1 shrink-0 bg-success/10 text-success border border-success/20">
                    <CheckCircle2 className="h-3 w-3" />
                    OK
                  </Badge>
                ) : status.lastStatus === "error" ? (
                  <Badge variant="destructive" className="gap-1 shrink-0">
                    <AlertCircle className="h-3 w-3" />
                    Failed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 shrink-0 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Idle
                  </Badge>
                )}
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed">{job.description}</p>

              <Separator />

              {/* Schedule & last run */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground flex items-center gap-1 mb-1">
                    <Calendar className="h-3 w-3" /> Schedule
                  </p>
                  <p className="font-medium font-mono text-[11px]">{job.schedule}</p>
                  <p className="text-muted-foreground mt-0.5">{job.humanSchedule}</p>
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3" /> Last Run
                  </p>
                  <p className="font-medium">{formatRelativeTime(status.lastRun)}</p>

                  {/* Mini history dots */}
                  {history.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {history.map((h, i) => (
                        <div
                          key={i}
                          title={`${h.status} – ${new Date(h.time).toLocaleTimeString()}`}
                          className={cn(
                            "w-2 h-2 rounded-full",
                            h.status === "success" ? "bg-success" : "bg-destructive"
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action */}
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2 mt-auto"
                disabled={status.isRunning}
                onClick={() => triggerJob(job)}
              >
                {status.isRunning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Trigger Now
                  </>
                )}
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Reference note */}
      <Card className="p-4 bg-muted/40 border-dashed">
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          All jobs are scheduled via <strong className="text-foreground">pg_cron</strong> and run automatically.
          Use "Trigger Now" only for manual testing or recovery runs. Run history shown here tracks
          manual triggers only — pg_cron executions are logged separately in the database.
        </p>
      </Card>
    </div>
  );
};
