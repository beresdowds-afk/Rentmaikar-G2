import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRegion, type Country } from '@/contexts/RegionContext';
import { useTourAnalytics } from '@/hooks/useTourAnalytics';


import { createPortal } from 'react-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Car, 
  Wrench, 
  AlertTriangle, 
  Truck, 
  Search as SearchIcon,
  CheckCircle,
  MessageSquare,
  Package,
  ClipboardCheck,
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

  const idLabel = isNG ? 'plate number, make/model, driver name, or chassis' : 'license plate, make/model, driver name, or VIN';
  const partsNote = isNG
    ? 'Nigerian parts sourcing may involve local dealers or import — record supplier and lead time.'
    : 'US parts sourcing goes through approved OEM/aftermarket suppliers — record supplier and warranty.';
  const roadsideNote = isNG
    ? 'Roadside assistance is coordinated with regional partners across Lagos, Abuja, and Port Harcourt.'
    : 'Roadside assistance is available to $12/month subscribers across DC, Maryland, and Virginia.';

  return [
    {
      id: 'welcome',
      title: isNG ? 'Welcome to Vehicle Support — Nigeria' : 'Welcome to Vehicle Support — USA',
      description: `You're viewing the ${country} vehicle support dashboard. It helps you manage vehicle recalls, maintenance tasks, and roadside assistance. ${roadsideNote}`,
      icon: Car,
      position: 'center',
    },
    {
      id: 'stats',
      title: 'Work Summary',
      description: 'Track your workload — see reported issues, dispatched tasks, active repairs, and completed jobs at a glance.',
      target: '[data-tour="stats"]',
      icon: Wrench,
      position: 'bottom',
    },
    {
      id: 'filters',
      title: 'Filter by Task Type',
      description: 'Switch between recall tasks and maintenance requests. Each type follows a different workflow and priority level.',
      target: '[data-tour="filters"]',
      icon: Filter,
      position: 'bottom',
    },
    {
      id: 'search',
      title: 'Find Vehicles',
      description: `Search by ${idLabel} to quickly locate specific tasks.`,
      target: '[data-tour="search"]',
      icon: SearchIcon,
      position: 'bottom',
    },
    {
      id: 'task-list',
      title: 'Your Task Queue',
      description: `View all vehicle tasks in your assigned ${country} city. Each card shows vehicle details, IoT device status, location, and current repair status.`,
      target: '[data-tour="task-list"]',
      icon: Car,
      position: 'top',
    },
    {
      id: 'workflow',
      title: 'Repair Workflow',
      description: 'Move tasks through: Reported → Dispatched → Inspection → Repair in Progress → Pending Parts → Quality Check → Completed. Each step is logged.',
      icon: Truck,
      position: 'center',
    },
    {
      id: 'parts',
      title: 'Pending Parts',
      description: `If a repair needs parts, mark the task as "Pending Parts" and update when parts arrive. ${partsNote}`,
      icon: Package,
      position: 'center',
    },
    {
      id: 'escalation',
      title: 'Escalate Critical Issues',
      description: 'Use the escalation status for safety-critical issues needing immediate admin attention. Notifications are sent to admins via all channels.',
      icon: AlertTriangle,
      position: 'center',
    },
    {
      id: 'quality',
      title: 'Quality Check',
      description: 'Always perform a quality check before marking repairs as complete. This ensures vehicle safety and compliance with platform standards.',
      icon: ClipboardCheck,
      position: 'center',
    },
    {
      id: 'feedback',
      title: 'Document Your Work',
      description: `Add notes about repairs, parts used, costs (${isNG ? 'Naira ₦' : 'USD $'}), and any issues encountered. This creates a maintenance history for future reference and audit.`,
      icon: MessageSquare,
      position: 'center',
    },
    {
      id: 'complete',
      title: 'Ready for Service! 🔧',
      description: `You're all set to manage ${country} vehicle recalls and maintenance. Remember, safety is the top priority. All activity is logged for audit and tracking.`,
      icon: CheckCircle,
      position: 'center',
    },
  ];
};


interface VehicleSupportOnboardingTourProps {
  onComplete: () => void;
  isOpen: boolean;
}

export const VehicleSupportOnboardingTour = ({ onComplete, isOpen }: VehicleSupportOnboardingTourProps) => {
  const { country } = useRegion();
  const tourSteps = useMemo(() => buildTourSteps(country), [country]);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => { setCurrentStep(0); }, [country]);

  const step = tourSteps[currentStep];
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  useTourAnalytics('vehicle-support', country, isOpen, currentStep, step?.id, tourSteps.length);




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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSkip} />
      
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

export default VehicleSupportOnboardingTour;
