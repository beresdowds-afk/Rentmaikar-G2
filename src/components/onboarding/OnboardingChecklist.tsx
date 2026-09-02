import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, ArrowRight, ListChecks } from 'lucide-react';
import { useOnboardingMachine } from '@/hooks/useOnboardingMachine';

interface Props {
  compact?: boolean;
}

/**
 * Resumable onboarding checklist driven by the server-side state machine.
 * Renders each step with completion status and a Resume CTA that deep-links
 * to the first incomplete step.
 */
export function OnboardingChecklist({ compact = false }: Props) {
  const { data, isLoading } = useOnboardingMachine();

  if (isLoading || !data) {
    return (
      <Card data-testid="onboarding-checklist-loading">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (!data.authenticated || data.percent === 100 || data.steps.length === 0) {
    return null;
  }

  const currentStep = data.next_step;

  return (
    <Card data-testid="onboarding-checklist" className="border-primary/30">
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 text-primary" />
            Onboarding checklist
          </CardTitle>
          <Badge variant="secondary">{data.percent}% complete</Badge>
        </div>
        <Progress value={data.percent} className="mt-2" aria-valuenow={data.percent} />
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5">
          {data.steps.map((step) => {
            const done = data.completed.includes(step);
            const isCurrent = step === currentStep;
            return (
              <li
                key={step}
                data-testid={`checklist-step-${step}`}
                data-done={done ? 'true' : 'false'}
                data-current={isCurrent ? 'true' : 'false'}
                className="flex items-center gap-2 text-sm"
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Circle
                    className={`h-4 w-4 shrink-0 ${
                      isCurrent ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                )}
                <span
                  className={
                    done
                      ? 'line-through text-muted-foreground'
                      : isCurrent
                        ? 'font-medium text-foreground'
                        : 'text-foreground'
                  }
                >
                  {data.labels[step] ?? step}
                </span>
                {isCurrent && (
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    Next
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>

        {data.next_step !== 'done' && (
          <Button asChild size="sm" data-testid="checklist-resume">
            <Link to={data.next_href}>
              Resume: {data.labels[data.next_step] ?? 'Continue'}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        )}
        {data.last_visited_step && data.last_visited_step !== data.next_step && (
          <p className="text-xs text-muted-foreground">
            Last visited: {data.labels[data.last_visited_step] ?? data.last_visited_step}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;
