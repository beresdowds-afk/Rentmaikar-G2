import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Repeat, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

type SwitchableRole = 'driver' | 'owner';

interface RoleChangeStatus {
  current_role: SwitchableRole | null;
  role_change_used: boolean;
  role_changed_at: string | null;
}

export function RoleSwitchCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<RoleChangeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc('get_my_role_change_status' as never);
    if (!error && data) setStatus(data as unknown as RoleChangeStatus);
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) load();
    else setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading account type…
        </CardContent>
      </Card>
    );
  }

  if (!status?.current_role) return null;

  const current = status.current_role;
  const target: SwitchableRole = current === 'driver' ? 'owner' : 'driver';
  const used = status.role_change_used;

  const handleSwitch = async () => {
    setIsSaving(true);
    const { error } = await supabase.rpc('switch_primary_role' as never, { _new_role: target } as never);
    setIsSaving(false);
    setConfirmOpen(false);

    if (error) {
      toast({
        title: 'Could not change account type',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: `You are now registered as ${target === 'owner' ? 'a vehicle owner' : 'a driver'}`,
      description: 'Sign out and back in to refresh your dashboard.',
    });
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="h-5 w-5" /> Account type
        </CardTitle>
        <CardDescription>
          You can hold only one account type at a time — driver or vehicle owner. Changing it is a
          one-time action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Current type:</span>
          <Badge variant="secondary" className="capitalize">
            {current === 'owner' ? 'Vehicle owner' : 'Driver'}
          </Badge>
        </div>

        {used ? (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Your one-time account type change has already been used
              {status.role_changed_at
                ? ` on ${new Date(status.role_changed_at).toLocaleDateString()}`
                : ''}
              . Contact support if you need further changes.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Alert>
              <AlertDescription>
                Switching to <strong>{target === 'owner' ? 'vehicle owner' : 'driver'}</strong> will
                replace your current role. You get only one change, and it cannot be undone.
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Switch to {target === 'owner' ? 'vehicle owner' : 'driver'}
            </Button>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change your account type?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to move from {current === 'owner' ? 'vehicle owner' : 'driver'} to{' '}
              {target === 'owner' ? 'vehicle owner' : 'driver'}. This is your only opportunity to
              change roles, and your current role access will be removed immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSwitch} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, change once
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default RoleSwitchCard;
