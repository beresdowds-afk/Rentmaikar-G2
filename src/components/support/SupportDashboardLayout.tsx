import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { MapPin, RefreshCw, HelpCircle } from 'lucide-react';
import type { SupportStaff } from '@/types/support';
import { InstallAppBanner } from '@/components/pwa/InstallAppBanner';
import { StaffSignOutButton } from '@/components/staff/StaffSignOutButton';
import { StaffOnboardingDownloads } from '@/components/staff/StaffOnboardingDownloads';

interface SupportDashboardLayoutProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  staffProfile: SupportStaff | null;
  onRefresh: () => void;
  onStartTour: () => void;
  isLoading: boolean;
  stats: {
    label: string;
    value: number;
    color: string;
    icon: ReactNode;
  }[];
  children: ReactNode;
}

export const SupportDashboardLayout = ({
  title,
  subtitle,
  icon,
  staffProfile,
  onRefresh,
  onStartTour,
  isLoading,
  stats,
  children,
}: SupportDashboardLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                {icon}
              </div>
              <div>
                <h1 className="text-3xl font-display font-bold">{title}</h1>
                <p className="text-muted-foreground flex items-center gap-2 mt-1">
                  {subtitle}
                  {staffProfile && (
                    <>
                      <Separator orientation="vertical" className="h-4" />
                      <MapPin className="h-4 w-4" />
                      <span className="font-medium">{staffProfile.assigned_city}</span>
                      <Badge variant="outline">{staffProfile.assigned_region}</Badge>
                    </>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onStartTour}
                className="gap-2"
              >
                <HelpCircle className="h-4 w-4" />
                Tour
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <StaffSignOutButton />
            </div>
          </div>

          {/* Install App Banner */}
          <div className="mb-6">
            <InstallAppBanner appName="Rentmaikar Support" />
          </div>

          {/* Onboarding downloads */}
          <div className="mb-6">
            <StaffOnboardingDownloads />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-tour="stats">
            {stats.map((stat, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                    </div>
                    <div className={`h-10 w-10 rounded-full ${stat.color} flex items-center justify-center text-white`}>
                      {stat.icon}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main Content */}
          {children}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default SupportDashboardLayout;
