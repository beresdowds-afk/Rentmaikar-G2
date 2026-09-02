import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmailVerification } from '@/components/auth/EmailVerification';
import { PhoneVerification } from '@/components/phone/PhoneVerification';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import UserAgreementsList from '@/components/legal/UserAgreementsList';
import { SubscriptionPlansPanel } from '@/components/subscriptions/SubscriptionPlansPanel';
import { ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import {
  advanceRegistrationStage,
  type RegistrationProgress,
  type RegistrationStage,
} from '@/hooks/useRegistrationProgress';

const STAGE_ORDER: RegistrationStage[] = [
  'auth',
  'account_opened',
  'documents_submitted',
  'verification_pending',
  'approved',
];

const stageIdx = (s: RegistrationStage) => Math.max(0, STAGE_ORDER.indexOf(s));

/**
 * Every setup stage is actionable here, so a driver/owner awaiting approval can
 * complete email, phone, documents, identity, agreements and subscriptions
 * without leaving their dashboard.
 */
export function SetupStagesPanel({
  role,
  progress,
}: {
  role: 'driver' | 'owner';
  progress: RegistrationProgress;
}) {
  const queryClient = useQueryClient();
  const [advancing, setAdvancing] = useState<RegistrationStage | null>(null);

  const idx = stageIdx(progress.stage);
  const docsDone = idx >= stageIdx('documents_submitted');
  const verificationSubmitted = idx >= stageIdx('verification_pending');

  const advance = async (target: RegistrationStage) => {
    setAdvancing(target);
    try {
      await advanceRegistrationStage(target);
      await queryClient.invalidateQueries({ queryKey: ['registration-progress'] });
      toast.success(
        target === 'documents_submitted'
          ? 'Documents marked as submitted'
          : 'Sent for identity verification',
      );
    } catch (err) {
      toast.error('Could not update your stage', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setAdvancing(null);
    }
  };

  const done = (ok: boolean) =>
    ok ? (
      <Badge variant="secondary" className="ml-2">Done</Badge>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete your setup</CardTitle>
        <CardDescription>
          All setup stages are open — finish them in any order to speed up approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={progress.email_verified ? 'documents' : 'email'}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="email">Email {done(progress.email_verified)}</TabsTrigger>
            <TabsTrigger value="phone">Phone</TabsTrigger>
            <TabsTrigger value="documents">Documents {done(docsDone)}</TabsTrigger>
            <TabsTrigger value="identity">Identity {done(verificationSubmitted)}</TabsTrigger>
            <TabsTrigger value="agreements">Agreements</TabsTrigger>
            <TabsTrigger value="subscriptions">
              {role === 'driver' ? 'Training & plans' : 'Insurance & plans'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="pt-4">
            <EmailVerification />
          </TabsContent>

          <TabsContent value="phone" className="pt-4">
            <PhoneVerification />
          </TabsContent>

          <TabsContent value="documents" className="pt-4 space-y-4">
            <DocumentUpload userType={role} />
            {!docsDone && (
              <Button onClick={() => advance('documents_submitted')} disabled={advancing !== null}>
                {advancing === 'documents_submitted' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                I've uploaded my documents
              </Button>
            )}
          </TabsContent>

          <TabsContent value="identity" className="pt-4 space-y-4">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Government ID, selfie and liveness checks are handled on the verification screen.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/onboarding/verification-status">Open identity verification</Link>
              </Button>
              {docsDone && !verificationSubmitted && (
                <Button
                  onClick={() => advance('verification_pending')}
                  disabled={advancing !== null}
                >
                  {advancing === 'verification_pending' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Submit for verification
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="agreements" className="pt-4">
            <UserAgreementsList userType={role} />
          </TabsContent>

          <TabsContent value="subscriptions" className="pt-4">
            <SubscriptionPlansPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
