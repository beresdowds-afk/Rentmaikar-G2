import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Seo from '@/components/seo/Seo';
import { MessagingPreferencesPanel } from '@/components/profile/MessagingPreferencesPanel';
import { PersonaNotificationPreference } from '@/components/profile/PersonaNotificationPreference';
import { EventNotificationPreferencesPanel } from '@/components/notifications/EventNotificationPreferencesPanel';

/**
 * Mobile-first notification preferences screen for the iOS / Android
 * (Capacitor) and installed PWA shells. Mirrors /settings/notifications.
 * Route: /m/settings/notifications
 */
export default function MobileNotificationPreferences() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24">
      <Seo
        title="Notification Preferences | Rentmaikar"
        description="Manage SMS and WhatsApp notification preferences on your phone."
        path="/m/settings/notifications"
        noindex
      />

      <header
        className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card/95 backdrop-blur px-3 py-3"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">Notifications</h1>
      </header>

      <div className="px-3 py-4 space-y-4">
        <Card>
          <CardContent className="flex items-start gap-3 pt-6 text-sm text-muted-foreground">
            <BellRing className="h-5 w-5 shrink-0 text-primary" />
            <p>
              Choose which messages reach your phone. You will be asked to confirm before any change
              is saved.
            </p>
          </CardContent>
        </Card>

        <EventNotificationPreferencesPanel />
        <MessagingPreferencesPanel />
        <PersonaNotificationPreference />
      </div>
    </div>
  );
}
