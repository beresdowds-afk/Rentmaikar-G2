import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRegion, type Country } from '@/contexts/RegionContext';
import { useTourAnalytics } from '@/hooks/useTourAnalytics';


import { createPortal } from 'react-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Scale, 
  FileText, 
  PenTool, 
  Users, 
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  X
} from 'lucide-react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string;
  icon: React.ElementType;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export const buildTourSteps = (input: Country | string): TourStep[] => {
  const country: Country = input === 'Nigeria' ? 'Nigeria' : 'USA';
  const isNG = country === 'Nigeria';

  const jurisdiction = isNG ? 'Nigerian' : 'US state';
  const complianceNote = isNG
    ? 'Nigeria: verify NIN/BVN, ensure stamp duty and Lagos State Consumer Protection compliance.'
    : 'USA: verify SSN/VIN, ensure state-level DMV compliance and consumer protection rules.';

  return [
    {
      id: 'welcome',
      title: isNG ? 'Welcome to Legal Support — Nigeria' : 'Welcome to Legal Support — USA',
      description: `You're viewing the ${country} legal support dashboard. It helps you manage legal tasks for vehicle rentals — document reviews, tri-party agreement signatures, dispute resolutions, and ${jurisdiction} compliance tracking.`,
      icon: Scale,
      position: 'center',
    },
    {
      id: 'stats',
      title: 'Task Overview',
      description: 'View your task statistics at a glance — open tasks, documents pending review, items awaiting signatures, and escalated cases.',
      target: '[data-tour="stats"]',
      icon: FileText,
      position: 'bottom',
    },
    {
      id: 'filters',
      title: 'Filter Tasks',
      description: 'Use filters to sort tasks by status, priority, or date. Focus on what matters most — pending signatures, escalated cases, or new reviews.',
      target: '[data-tour="filters"]',
      icon: Filter,
      position: 'bottom',
    },
    {
      id: 'search',
      title: 'Search Tasks',
      description: 'Quickly find tasks by searching for driver names, vehicle details, agreement numbers, or owner information.',
      target: '[data-tour="search"]',
      icon: Search,
      position: 'bottom',
    },
    {
      id: 'task-list',
      title: 'Your Task List',
      description: `View all legal tasks assigned to your ${country} city. Click any task to update its status, add feedback, or view agreement details.`,
      target: '[data-tour="task-list"]',
      icon: Users,
      position: 'top',
    },
    {
      id: 'status-update',
      title: 'Update Task Status',
      description: 'Move tasks through the legal workflow: Open → Document Review → Pending Signature → Resolved → Closed. Add notes at each stage for a complete audit trail.',
      icon: PenTool,
      position: 'center',
    },
    {
      id: 'agreements',
      title: 'Tri-Party Agreements',
      description: `Legal agreements involve three parties — driver, owner, and admin witness — under ${jurisdiction} jurisdiction. Each party signs digitally, and completed agreements can be exported as PDFs and emailed.`,
      icon: FileText,
      position: 'center',
    },
    {
      id: 'escalation',
      title: 'Escalate Issues',
      description: 'If a case requires admin attention, use the escalation feature. Escalated cases are flagged for priority handling and trigger notifications.',
      icon: AlertTriangle,
      position: 'center',
    },
    {
      id: 'feedback',
      title: 'Add Feedback',
      description: 'Add notes and feedback to tasks to keep all stakeholders informed. All updates are logged for transparency and compliance.',
      icon: MessageSquare,
      position: 'center',
    },
    {
      id: 'compliance',
      title: 'Regional Compliance',
      description: complianceNote,
      icon: Scale,
      position: 'center',
    },
    {
      id: 'complete',
      title: "You're Ready! ⚖️",
      description: `You now know the basics of the ${country} Legal Support Dashboard. Your tasks are city-restricted, so you'll only see tasks in your assigned location. All activity is audited.`,
      icon: CheckCircle,
      position: 'center',
    },
  ];
};


interface LegalSupportOnboardingTourProps {
  onComplete: () => void;
  isOpen: boolean;
}

export const LegalSupportOnboardingTour = ({ onComplete, isOpen }: LegalSupportOnboardingTourProps) => {
  const { country } = useRegion();
  const tourSteps = useMemo(() => buildTourSteps(country), [country]);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => { setCurrentStep(0); }, [country]);

  const step = tourSteps[currentStep];
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  useTourAnalytics('legal-support', country, isOpen, currentStep, step?.id, tourSteps.length);




  const updateTargetRect = useCallback(() => {
    if (step.target) {
      const element = document.querySelector(step.target);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
    }
  }, [step.target]);

  useEffect(() => {
    if (isOpen) {
      updateTargetRect();
      window.addEventListener('resize', updateTargetRect);
      window.addEventListener('scroll', updateTargetRect);
      return () => {
        window.removeEventListener('resize', updateTargetRect);
        window.removeEventListener('scroll', updateTargetRect);
      };
    }
  }, [isOpen, currentStep, updateTargetRect]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isOpen) return null;

  const Icon = step.icon;

  const getCardPosition = (): React.CSSProperties => {
    if (!targetRect || step.position === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const cardWidth = 400;
    const cardHeight = 300;
    const padding = 20;

    switch (step.position) {
      case 'bottom':
        return {
          position: 'fixed',
          top: `${targetRect.bottom + padding}px`,
          left: `${Math.max(padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)}px`,
        };
      case 'top':
        return {
          position: 'fixed',
          top: `${targetRect.top - cardHeight - padding}px`,
          left: `${Math.max(padding, targetRect.left + targetRect.width / 2 - cardWidth / 2)}px`,
        };
      default:
        return {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSkip} />
      
      {/* Highlight */}
      {targetRect && (
        <div
          className="absolute border-2 border-primary rounded-lg shadow-lg pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Tour Card */}
      <Card className="w-[400px] shadow-2xl" style={getCardPosition()}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">{step.title}</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSkip}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Progress value={progress} className="mt-3" />
          <p className="text-xs text-muted-foreground mt-1">
            Step {currentStep + 1} of {tourSteps.length}
          </p>
        </CardHeader>

        <CardContent>
          <p className="text-muted-foreground">{step.description}</p>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleNext}>
            {currentStep === tourSteps.length - 1 ? 'Get Started' : 'Next'}
            {currentStep < tourSteps.length - 1 && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </CardFooter>
      </Card>
    </div>,
    document.body
  );
};

export default LegalSupportOnboardingTour;
