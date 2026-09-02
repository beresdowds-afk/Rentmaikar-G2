import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Clock, ArrowRight, ShieldCheck, FileUp, UserCheck, MailCheck, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RegistrationProgress, RegistrationStage } from '@/hooks/useRegistrationProgress';

const STAGE_ORDER: RegistrationStage[] = [
  'auth',
  'account_opened',
  'documents_submitted',
  'verification_pending',
  'approved',
];

interface StepDef {
  key: RegistrationStage;
  title: string;
  desc: string;
  icon: typeof CheckCircle2;
  ctaLabel?: string;
  ctaTo?: string;
}

export function RegistrationProgressPanel({
  progress,
  role,
}: {
  progress: RegistrationProgress;
  role: 'driver' | 'owner';
}) {
  const onboardingRoute = role === 'driver' ? '/driver/onboarding' : '/owner/onboarding';
  const currentIndex = STAGE_ORDER.indexOf(progress.stage);

  const steps: StepDef[] = [
    {
      key: 'auth',
      title: 'Create your account',
      desc: 'Sign up and verify your email.',
      icon: MailCheck,
    },
    {
      key: 'account_opened',
      title: 'Account opened (view-only)',
      desc: 'Explore your dashboard while we prepare the next steps.',
      icon: LockKeyhole,
    },
    {
      key: 'documents_submitted',
      title: role === 'driver' ? 'Upload documents & referees' : 'Upload vehicle documents',
      desc:
        role === 'driver'
          ? "Driver's license, proof of address, and 3 referees."
          : 'Vehicle registration, insurance and ownership proof.',
      icon: FileUp,
      ctaLabel: 'Upload now',
      ctaTo: onboardingRoute,
    },
    {
      key: 'verification_pending',
      title: 'Identity verification',
      desc: 'Complete Persona ID verification. Referees & proxy (if any) must sign consent.',
      icon: ShieldCheck,
      ctaLabel: 'Verify identity',
      ctaTo: onboardingRoute,
    },
    {
      key: 'approved',
      title: 'Admin approval',
      desc: 'Our team does a final review and unlocks full access.',
      icon: UserCheck,
    },
  ];

  return (
    <Card className="border-primary/30">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> View-only access
          </Badge>
          <Badge variant="outline">Stage {Math.max(0, currentIndex) + 1} of {STAGE_ORDER.length}</Badge>
        </div>
        <CardTitle className="text-2xl">Finish setting up your account</CardTitle>
        <CardDescription>
          Your dashboard unlocks fully after identity verification and admin approval. You can
          browse and preview features while you complete each step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((s, i) => {
          const done = i < currentIndex || (i === currentIndex && progress.stage === 'approved');
          const active = i === currentIndex;
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                active ? 'bg-primary/5 border-primary/40' : done ? 'bg-muted/40' : ''
              }`}
            >
              <div className="mt-0.5">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : active ? (
                  <Circle className="h-5 w-5 text-primary animate-pulse" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{s.title}</p>
                </div>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
              {active && s.ctaTo && (
                <Button asChild size="sm">
                  <Link to={s.ctaTo}>
                    {s.ctaLabel} <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
