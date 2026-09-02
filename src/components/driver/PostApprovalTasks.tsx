import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Phone, FileText, PartyPopper } from 'lucide-react';
import { PhoneVerification } from '@/components/phone/PhoneVerification';

interface Props {
  /** Switches the dashboard to the documents tab. */
  onOpenDocuments: () => void;
}

/**
 * Shown to approved drivers who signed up during registration. It never asks
 * for a fresh sign-up — the account created at registration stays intact.
 * It only prompts for the two post-approval tasks: confirming/updating the
 * phone number and uploading required documents.
 */
export function PostApprovalTasks({ onOpenDocuments }: Props) {
  const { user } = useAuth();
  const [phoneOpen, setPhoneOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['post-approval-tasks', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: profile }, { count }] = await Promise.all([
        supabase
          .from('profiles')
          .select('phone, phone_verified')
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('user_documents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
      ]);
      return {
        phone: profile?.phone ?? null,
        phoneVerified: !!profile?.phone_verified,
        documents: count ?? 0,
      };
    },
  });

  if (!data) return null;
  const phoneDone = data.phoneVerified;
  const docsDone = data.documents > 0;
  if (phoneDone && docsDone) return null;

  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">You're approved — finish these two steps</CardTitle>
          </div>
          <CardDescription>
            Your account from registration is already active. No new sign-up needed —
            just confirm your phone number and upload your documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
            <Phone className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">Phone number</p>
                {phoneDone ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="outline">Action needed</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.phone ? `On file: ${data.phone}` : 'No phone number on file yet.'}
              </p>
              {!phoneDone && (
                <Button size="sm" className="mt-1" onClick={() => setPhoneOpen(true)}>
                  Update &amp; verify phone
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">Required documents</p>
                {docsDone ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Uploaded
                  </Badge>
                ) : (
                  <Badge variant="outline">Action needed</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Upload your driver license and identification to unlock rentals.
              </p>
              {!docsDone && (
                <Button size="sm" variant="outline" className="mt-1" onClick={onOpenDocuments}>
                  Upload documents
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={phoneOpen} onOpenChange={setPhoneOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update &amp; verify your phone number</DialogTitle>
          </DialogHeader>
          <PhoneVerification
            showAsCard={false}
            onVerified={() => {
              setPhoneOpen(false);
              refetch();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
