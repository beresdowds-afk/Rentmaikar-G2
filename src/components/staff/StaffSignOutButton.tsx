import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Sign-out control for staff dashboards (admin, admin assistant, support).
 * Works inside the installed PWA where no browser chrome is available.
 */
export const StaffSignOutButton = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out');
    } catch {
      toast.error('Could not sign out. Please try again.');
      return;
    }
    navigate('/auth', { replace: true });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
};
