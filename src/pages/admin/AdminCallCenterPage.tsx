import { Phone, ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Seo from '@/components/seo/Seo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CallCenterPage } from '@/components/admin/voip/CallCenterPage';
import { SectionErrorBoundary } from '@/components/admin/SectionErrorBoundary';

/**
 * Dedicated first-class route for the VoIP & Telephony Command Center (/admin/call-center).
 * Guarantees zero sibling interference while maintaining global call session survivability.
 */
export default function AdminCallCenterPage() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-8 max-w-7xl">
      <Seo
        title="Call Center | Rentmaikar Admin"
        description="VoIP, WebRTC softphone, Visual IVR, agent extensions, and real-time telephony command center."
        path="/admin/call-center"
      />

      {/* Navigation Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            to="/admin?portal=support&tab=call-center"
            className="hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Support Portal
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Telephony</span>
          <span>/</span>
          <span className="text-primary font-medium">Call Center Command Desk</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <Link to="/admin?portal=support&tab=call-center">
              <Phone className="h-3.5 w-3.5 text-primary" /> View in Unified Portal <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <Link to="/admin/inbound-forwarding">
              Inbound Forwarding
            </Link>
          </Button>
        </div>
      </div>

      <SectionErrorBoundary section="CALL CENTER">
        <CallCenterPage />
      </SectionErrorBoundary>
    </div>
  );
}
