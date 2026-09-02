import { Helmet } from 'react-helmet-async';
import PortalSignInForm from '@/components/auth/PortalSignInForm';

/**
 * Owner-only sign-in entrance. Lands owners on their dashboard Activity tab
 * where their messages, withdrawals and payments live.
 */
export default function OwnerSignIn() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Helmet>
        <title>Owner Sign In | Rentmaikar</title>
        <meta
          name="description"
          content="Vehicle owners sign in to view messages, withdrawal requests and rental payments on Rentmaikar."
        />
      </Helmet>
      <div className="w-full max-w-md space-y-6">
        <h1 className="sr-only">Owner sign in</h1>
        <PortalSignInForm
          allowedRoles={['owner']}
          title="Owner portal"
          description="Sign in to see your messages, withdrawal requests and vehicle payments."
          destination="/owner/dashboard?tab=activity"
          signUpHref="/owner/register"
          signUpLabel="Register as a vehicle owner"
        />
      </div>
    </div>
  );
}
