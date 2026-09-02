import { Helmet } from 'react-helmet-async';
import PortalSignInForm from '@/components/auth/PortalSignInForm';

/**
 * Staff-only sign-in entrance for the admin console.
 */
export default function AdminSignIn() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Helmet>
        <title>Admin Sign In | Rentmaikar</title>
        <meta name="description" content="Rentmaikar staff sign-in for the admin operations console." />
      </Helmet>
      <div className="w-full max-w-md space-y-6">
        <h1 className="sr-only">Admin sign in</h1>
        <PortalSignInForm
          allowedRoles={['admin', 'admin_assistant']}
          title="Admin console"
          description="Staff sign-in for operations, communications and delivery monitoring."
          destination="/admin"
        />
      </div>
    </div>
  );
}
