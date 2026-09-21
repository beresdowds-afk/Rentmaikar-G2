import { useState, useEffect } from 'react';
import { MessageSquare, Layers, AlertTriangle, RotateCcw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '@/components/seo/Seo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessagingCenter } from '@/components/admin/MessagingCenter';

/** Standalone route for the central messaging center. */
export default function MessagingCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'console';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [failedCount, setFailedCount] = useState(0);

  // Synchronize search params with active tab
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // Monitor failed bulk messages for notification banner
  useEffect(() => {
    const checkFailed = () => {
      try {
        const raw = localStorage.getItem('rentmaikar_bulk_tracker_items');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            setFailedCount(list.filter((i: any) => i.status === 'failed').length);
          }
        }
      } catch {
        /* storage unavailable */
      }
    };

    checkFailed();
    window.addEventListener('comms_activity_update', checkFailed);
    return () => window.removeEventListener('comms_activity_update', checkFailed);
  }, []);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', newTab);
      return next;
    });
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <Seo
        title="Messaging Center | Rentmaikar Admin"
        description="Draft, send, respond to and review email, SMS and WhatsApp messages from one place."
        path="/admin/messaging"
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquare className="h-6 w-6 text-primary" /> Messaging Center
          </h1>
          <p className="text-sm text-muted-foreground">
            One place for every conversation — email, SMS, WhatsApp, and in-app notifications.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant={activeTab === 'bulk-tracker' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTabChange(activeTab === 'bulk-tracker' ? 'console' : 'bulk-tracker')}
            className="gap-1.5"
          >
            <Layers className="h-4 w-4" />
            Bulk Status Tracker
            {failedCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {failedCount} failed
              </Badge>
            )}
          </Button>

          <Button asChild variant="outline" size="sm">
            <Link to="/admin/sms-delivery">SMS delivery monitoring</Link>
          </Button>
        </div>
      </header>

      {/* Failed Messages Action Banner */}
      {failedCount > 0 && activeTab !== 'bulk-tracker' && (
        <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>{failedCount} bulk message(s)</strong> encountered delivery rejections across provider channels.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTabChange('bulk-tracker')}
            className="h-7 text-xs bg-background text-foreground hover:bg-background/80 gap-1 border-destructive/30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Review & Retry in Tracker
          </Button>
        </div>
      )}

      <MessagingCenter initialTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
