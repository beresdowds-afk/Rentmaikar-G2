import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Smartphone, CheckCircle } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';

interface InstallAppBannerProps {
  appName?: string;
  variant?: 'banner' | 'compact';
}

export const InstallAppBanner = ({ appName = 'Rentmaikar', variant = 'banner' }: InstallAppBannerProps) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      toast.success('App installed successfully!');
    }
  };

  if (isInstalled) {
    if (variant === 'compact') {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span>App installed</span>
        </div>
      );
    }
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
        <CardContent className="flex items-center gap-3 py-3">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400">
            {appName} is installed on your device
          </p>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'compact') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={isInstallable ? handleInstall : undefined}
        className="gap-2"
        disabled={!isInstallable}
      >
        <Download className="h-4 w-4" />
        {isInstallable ? 'Install App' : 'Install via browser menu'}
      </Button>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Install {appName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isInstallable
              ? 'Install for quick access, offline support, and a native app experience.'
              : 'Use your browser menu (Share → Add to Home Screen) to install this app.'}
          </p>
        </div>
        {isInstallable && (
          <Button onClick={handleInstall} size="sm" className="gap-2 shrink-0">
            <Download className="h-4 w-4" />
            Install
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
