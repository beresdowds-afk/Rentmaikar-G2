import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRegion, type Country } from '@/contexts/RegionContext';
import { useTourAnalytics } from '@/hooks/useTourAnalytics';


import { createPortal } from 'react-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Cpu, 
  Truck, 
  MapPin, 
  Wrench, 
  Activity,
  CheckCircle,
  MessageSquare,
  Search,
  Filter,
  Calendar,
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

  const simCarriers = isNG ? 'MTN, Airtel, Glo (Nigeria)' : 'AT&T, T-Mobile, Verizon (USA)';
  const idField = isNG ? 'IMEI, plate number, or address' : 'device serial number, IMEI, vehicle plate, or VIN';

  return [
    {
      id: 'welcome',
      title: isNG ? 'Welcome to IoT Support — Nigeria' : 'Welcome to IoT Support — USA',
      description: `You're viewing the ${country} IoT support dashboard. It helps you manage device installations and maintenance tasks across your assigned city.`,
      icon: Cpu,
      position: 'center',
    },
    {
      id: 'stats',
      title: 'Task Overview',
      description: 'Monitor your workload — see assigned tasks, scheduled visits, on-site work, and completed installations at a glance.',
      target: '[data-tour="stats"]',
      icon: Activity,
      position: 'bottom',
    },
    {
      id: 'filters',
      title: 'Filter by Task Type',
      description: 'Switch between installation and maintenance tasks. Each type has its own workflow and status progression.',
      target: '[data-tour="filters"]',
      icon: Filter,
      position: 'bottom',
    },
    {
      id: 'search',
      title: 'Find Tasks Quickly',
      description: `Search by ${idField} to find specific tasks.`,
      target: '[data-tour="search"]',
      icon: Search,
      position: 'bottom',
    },
    {
      id: 'task-list',
      title: 'Your Installation Queue',
      description: `View all IoT tasks in your assigned ${country} city. Tasks include device details, SIM provisioning info (${simCarriers}), vehicle data, and installation addresses.`,
      target: '[data-tour="task-list"]',
      icon: Wrench,
      position: 'top',
    },
    {
      id: 'workflow',
      title: 'Task Workflow',
      description: 'Move tasks through: Assigned → Scheduled → In Transit → On Site → Installation Complete → Testing → Completed. Each status update is logged for audit.',
      icon: Truck,
      position: 'center',
    },
    {
      id: 'device-health',
      title: 'Device Health Monitoring',
      description: 'After installation, monitor device health including battery level, signal strength, GPS accuracy, and last ping time. Flag devices needing attention.',
      icon: Activity,
      position: 'center',
    },
    {
      id: 'location',
      title: 'Location & Routing',
      description: `Each task includes the installation address. Use this to plan your route efficiently across ${isNG ? 'Nigerian city zones' : 'US metro areas'}.`,
      icon: MapPin,
      position: 'center',
    },
    {
      id: 'scheduling',
      title: 'Scheduled Appointments',
      description: `Tasks can have scheduled dates and times (${isNG ? 'WAT' : 'ET'}). Check these to ensure you arrive on time and coordinate with vehicle owners.`,
      icon: Calendar,
      position: 'center',
    },
    {
      id: 'feedback',
      title: 'Report Issues',
      description: `Use the feedback feature to report problems, note SIM activation issues with ${simCarriers}, flag equipment defects, or document special circumstances.`,
      icon: MessageSquare,
      position: 'center',
    },
    {
      id: 'complete',
      title: 'Ready to Install! 🔧',
      description: `You're all set to manage ${country} IoT installations. You'll only see tasks in your assigned city. All activity is logged for audit and tracking.`,
      icon: CheckCircle,
      position: 'center',
    },
  ];
};


interface IoTSupportOnboardingTourProps {
  onComplete: () => void;
  isOpen: boolean;
}

export const IoTSupportOnboardingTour = ({ onComplete, isOpen }: IoTSupportOnboardingTourProps) => {
  const { country } = useRegion();
  const tourSteps = useMemo(() => buildTourSteps(country), [country]);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => { setCurrentStep(0); }, [country]);

  const step = tourSteps[currentStep];
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  useTourAnalytics('iot-support', country, isOpen, currentStep, step?.id, tourSteps.length);




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

export default IoTSupportOnboardingTour;
