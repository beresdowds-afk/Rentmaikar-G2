import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ImpersonationProvider, ImpersonatedRole } from '@/contexts/ImpersonationContext';
import DriverDashboard from '@/pages/DriverDashboard';
import OwnerDashboard from '@/pages/OwnerDashboard';

export default function AdminImpersonateDashboardPage() {
  const { role, userId } = useParams<{ role: ImpersonatedRole; userId: string }>();
  const { userRole, isRoleLoading } = useAuth();
  const [profile, setProfile] = useState<{ full_name?: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', userId)
        .maybeSingle();
      setProfile(data ?? {});
      setLoading(false);
    })();
  }, [userId]);

  if (isRoleLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (userRole !== 'admin' && userRole !== 'admin_assistant') {
    return <Navigate to="/" replace />;
  }
  if (!userId || (role !== 'driver' && role !== 'owner')) {
    return <Navigate to="/admin" replace />;
  }

  const Dash = role === 'driver' ? DriverDashboard : OwnerDashboard;

  return (
    <ImpersonationProvider
      value={{
        viewAsUserId: userId,
        role,
        displayName: profile?.full_name,
        email: profile?.email,
      }}
    >
      <Dash />
    </ImpersonationProvider>
  );
}
