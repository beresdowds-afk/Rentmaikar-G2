import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_HOME, type AppRole } from "@/lib/role-home";
import { rememberReturnTo } from "@/lib/return-to";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export const ProtectedRoute = ({
  children,
  allowedRoles,
}: ProtectedRouteProps) => {
  const {
    user,
    session,
    userRole,
    isLoading,
    isRoleLoading,
    twoFactorStatus,
    twoFactorVerified,
  } = useAuth();

  const location = useLocation();

  const loading = isLoading || isRoleLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  const fullPath = `${location.pathname}${location.search}${location.hash}`;

  if (!user || !session) {
    rememberReturnTo(fullPath);
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (twoFactorStatus?.requires_2fa && !twoFactorVerified) {
    rememberReturnTo(fullPath);
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }


  // Admins bypass role restrictions everywhere (matches DashboardAuthGate).
  const effectiveAllowed =
    allowedRoles && !allowedRoles.includes("admin")
      ? ([...allowedRoles, "admin"] as AppRole[])
      : allowedRoles;

  if (effectiveAllowed && (!userRole || !effectiveAllowed.includes(userRole))) {
    return <Navigate to={(userRole && ROLE_HOME[userRole]) ?? "/"} replace />;
  }


  return <>{children}</>;
};
