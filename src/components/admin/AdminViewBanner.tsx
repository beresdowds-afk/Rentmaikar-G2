import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useNavigate } from 'react-router-dom';

interface AdminViewBannerProps {
  dashboardType: 'driver' | 'owner';
}

export const AdminViewBanner = ({ dashboardType }: AdminViewBannerProps) => {
  const { userRole } = useAuth();
  const impersonation = useImpersonation();
  const navigate = useNavigate();

  if (userRole !== 'admin' && userRole !== 'admin_assistant' && !impersonation) return null;

  const label = impersonation
    ? impersonation.displayName || impersonation.email || impersonation.viewAsUserId.slice(0, 8)
    : null;

  return (
    <Alert className="mb-6 border-warning bg-warning/10">
      <Eye className="h-4 w-4 text-warning" />
      <AlertDescription className="text-warning-foreground flex items-center justify-between gap-4 flex-wrap">
        <span>
          <strong>Admin View — Read Only</strong>
          {label ? ` · Viewing ${dashboardType} dashboard for ${label}` : ` — Viewing ${dashboardType} dashboard as an administrator.`}
          {' '}Actions may be disabled to prevent unintended modifications.
        </span>
        {impersonation && (
          <Button size="sm" variant="outline" onClick={() => navigate('/admin')} className="gap-1">
            <LogOut className="h-3 w-3" />
            Exit
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
