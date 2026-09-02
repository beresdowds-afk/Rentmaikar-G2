import { MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import Seo from '@/components/seo/Seo';
import { Button } from '@/components/ui/button';
import { MessagingCenter } from '@/components/admin/MessagingCenter';

/** Standalone route for the central messaging center. */
export default function MessagingCenterPage() {
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
            One place for every conversation — email, SMS, WhatsApp and in-app.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/sms-delivery">SMS delivery monitoring</Link>
        </Button>
      </header>
      <MessagingCenter />
    </div>
  );
}
