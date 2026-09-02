import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Seo from '@/components/seo/Seo';
import { MessagingPreferencesPanel } from '@/components/profile/MessagingPreferencesPanel';
import { PersonaNotificationPreference } from '@/components/profile/PersonaNotificationPreference';
import { EventNotificationPreferencesPanel } from '@/components/notifications/EventNotificationPreferencesPanel';
import { AgreementReminderPreferencesPanel } from '@/components/notifications/AgreementReminderPreferencesPanel';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function NotificationPreferencesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Seo
        title="Notification Preferences | Rentmaikar"
        description="Choose email and SMS reminder frequency for agreement renewals, and manage your Rentmaikar payment, rental and support notification preferences."
        path="/settings/notifications"
        noindex
      />
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto max-w-3xl px-4 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl md:text-3xl font-display font-bold">
              Notification Preferences
            </h1>
            <Button asChild variant="ghost" size="sm">
              <Link to="/settings/profile">
                <ArrowLeft className="h-4 w-4 mr-1" /> Profile
              </Link>
            </Button>
          </div>

          <EventNotificationPreferencesPanel />
          <AgreementReminderPreferencesPanel />
          <MessagingPreferencesPanel />
          <PersonaNotificationPreference />
        </div>
      </main>
      <Footer />
    </div>
  );
}
