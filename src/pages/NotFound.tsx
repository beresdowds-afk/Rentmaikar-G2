import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { homeForRole, type AppRole } from "@/lib/role-home";

const NotFound = () => {
  const location = useLocation();
  const { user, userRole } = useAuth();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const home = user ? homeForRole(userRole as AppRole | null, "/") : "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-xl text-muted-foreground">Oops! Page not found</p>
        <p className="text-sm text-muted-foreground break-all">{location.pathname}</p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild>
            <Link to={home}>{user ? "Go to my dashboard" : "Return to Home"}</Link>
          </Button>
          {!user && (
            <Button asChild variant="outline">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </main>
  );
};

export default NotFound;
