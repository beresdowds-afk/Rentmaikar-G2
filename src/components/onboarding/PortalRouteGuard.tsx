import { Navigate, useParams } from 'react-router-dom';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { PortalGate } from '@/components/onboarding/PortalGate';
import { getPortal } from '@/lib/portal-registry';
import { useRegistrationProgress } from '@/hooks/useRegistrationProgress';

interface Props {
  role: 'driver' | 'owner';
}

/**
 * Route-level PortalGate. Renders as `/{role}/portal/:portalKey`. When the
 * gate requirement is met we redirect to the dashboard with the matching
 * tab activated; otherwise we show the blocker with progress + Continue.
 * Reloading or navigating here directly always re-evaluates the gate.
 */
export function PortalRouteGuard({ role }: Props) {
  const { portalKey = '' } = useParams();
  const portal = getPortal(role, portalKey);
  const { data } = useRegistrationProgress();

  if (!portal) return <Navigate to={`/${role}/dashboard`} replace />;

  const meets = (() => {
    if (!data) return false;
    if (portal.require === 'authenticated') return !!data.authenticated;
    if (portal.require === 'email_verified') return !!data.email_verified;
    if (portal.require === 'documents')
      return ['documents_submitted', 'verification_pending', 'approved'].includes(data.stage);
    if (portal.require === 'verification')
      return ['verification_pending', 'approved'].includes(data.stage);
    return data.access_level === 'full' || data.stage === 'approved';
  })();

  if (meets) {
    return (
      <Navigate to={`/${role}/dashboard?tab=${encodeURIComponent(portal.tab)}`} replace />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4 max-w-3xl">
        <PortalGate portal={portal.title} require={portal.require}>
          {/* Meets branch never renders because we Navigate above. */}
          <div />
        </PortalGate>
      </main>
      <Footer />
    </div>
  );
}

export default PortalRouteGuard;
