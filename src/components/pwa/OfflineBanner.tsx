import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [showReconnectedToast, setShowReconnectedToast] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setDismissed(false);
      setShowReconnectedToast(true);
      toast.success('Back online. Synchronizing data...', {
        id: 'reconnection-toast',
      });
      const timer = setTimeout(() => setShowReconnectedToast(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showReconnectedToast) {
    return null;
  }

  if (dismissed && !showReconnectedToast) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 transition-all duration-300 transform translate-y-0 shadow-xl rounded-xl border p-4 backdrop-blur-md flex items-start gap-3",
        !isOnline
          ? "bg-amber-50/95 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100"
          : "bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
      )}
    >
      <div className={cn(
        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
        !isOnline ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300" : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
      )}>
        {!isOnline ? <WifiOff className="h-5 w-5 animate-pulse" /> : <Wifi className="h-5 w-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm">
          {!isOnline ? "You are currently offline" : "Connection restored"}
        </h4>
        <p className="text-xs mt-0.5 opacity-90">
          {!isOnline
            ? "Cached content and offline features remain available. Your changes will sync automatically when reconnected."
            : "Successfully reconnected to the network. Synchronizing your data..."}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isOnline && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-amber-900 hover:bg-amber-200/50 dark:text-amber-100 dark:hover:bg-amber-900/50"
            onClick={() => {
              const onlineNow = navigator.onLine;
              setIsOnline(onlineNow);
              if (onlineNow) {
                toast.success('Connection confirmed active.');
              } else {
                toast.error('Still offline. Please check your network.');
              }
            }}
            title="Check connection"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            !isOnline
              ? "text-amber-900 hover:bg-amber-200/50 dark:text-amber-100 dark:hover:bg-amber-900/50"
              : "text-emerald-900 hover:bg-emerald-200/50 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
          )}
          onClick={() => setDismissed(true)}
          title="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
