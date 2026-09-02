import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileEditor } from '@/components/profile/ProfileEditor';
import { NotificationPreferences } from '@/components/phone/NotificationPreferences';
import { RegistrationProgressPanel } from './RegistrationProgressPanel';
import { UnlockBubbles } from './UnlockBubbles';
import { SetupStagesPanel } from './SetupStagesPanel';

import { useAuth } from '@/contexts/AuthContext';
import type { RegistrationProgress } from '@/hooks/useRegistrationProgress';

export function ViewOnlyDashboardShell({
  role,
  progress,
}: {
  role: 'driver' | 'owner';
  progress: RegistrationProgress;
}) {
  const label = role === 'driver' ? 'Driver' : 'Owner';
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold">Welcome to your {label} dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Preview mode — full functionality unlocks after verification & approval.
            </p>
          </div>

          <RegistrationProgressPanel progress={progress} role={role} />

          <SetupStagesPanel role={role} progress={progress} />

          <UnlockBubbles role={role} stage={progress.stage} userId={user?.id} />



          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>You can update this any time.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProfileEditor subjectRole={role} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Choose how we reach you.</CardDescription>
              </CardHeader>
              <CardContent>
                <NotificationPreferences />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
