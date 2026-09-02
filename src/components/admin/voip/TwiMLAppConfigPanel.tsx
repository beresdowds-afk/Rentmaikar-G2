import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Copy, Check, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TwiMLConfigResponse {
  expected: {
    voiceUrl: string;
    voiceMethod: string;
    statusCallbackUrl: string;
    recordingCallbackUrl: string;
    accessTokenUrl: string;
  };
  secrets: Record<string, boolean>;
  twimlApp: {
    sid: string;
    friendlyName: string;
    voiceUrl: string;
    voiceMethod: string;
    statusCallback: string | null;
    statusCallbackMethod: string | null;
  } | null;
  matches: boolean;
  error?: string;
  applied?: boolean;
}

const UrlRow = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <code className="block break-all text-xs text-muted-foreground">{value}</code>
      </div>
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span className="ml-2">{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </div>
  );
};

export const TwiMLAppConfigPanel = () => {
  const [data, setData] = useState<TwiMLConfigResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async (action: 'verify' | 'apply' = 'verify') => {
    action === 'apply' ? setIsApplying(true) : setIsLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('voice-twiml-config', {
        body: { action },
      });
      if (error) throw error;
      setData(res as TwiMLConfigResponse);
      if (action === 'apply') {
        toast({ title: 'TwiML App updated', description: 'Voice Request URL now points at voice-twiml-dial.' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load TwiML App configuration';
      toast({ title: 'Verification failed', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setIsApplying(false);
    }
  }, [toast]);

  useEffect(() => {
    load('verify');
  }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>In-app calling endpoints</CardTitle>
              <CardDescription>
                Paste these into your Twilio TwiML App. The Voice Request URL must match exactly.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => load('verify')} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Verify</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.expected ? (
            <>
              <UrlRow label="Voice Request URL (POST)" value={data.expected.voiceUrl} />
              <UrlRow label="Call status callback" value={data.expected.statusCallbackUrl} />
              <UrlRow label="Recording status callback" value={data.expected.recordingCallbackUrl} />
              <UrlRow label="Access token endpoint" value={data.expected.accessTokenUrl} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Loading endpoints…' : 'Endpoints unavailable.'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TwiML App verification</CardTitle>
          <CardDescription>Live configuration read from your Twilio account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data?.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Not configured</AlertTitle>
              <AlertDescription>{data.error}</AlertDescription>
            </Alert>
          )}

          {data?.twimlApp && (
            <>
              <Alert variant={data.matches ? 'default' : 'destructive'}>
                {data.matches ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle>
                  {data.matches ? 'Voice Request URL is correct' : 'Voice Request URL mismatch'}
                </AlertTitle>
                <AlertDescription>
                  {data.matches
                    ? 'Browser calls will reach voice-twiml-dial.'
                    : 'Outgoing in-app calls will fail until the TwiML App points at voice-twiml-dial with method POST.'}
                </AlertDescription>
              </Alert>

              <div className="space-y-2 rounded-md border p-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">App</span>
                  <span className="font-medium">{data.twimlApp.friendlyName || data.twimlApp.sid}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Current Voice URL</span>
                  <code className="break-all text-right text-xs">{data.twimlApp.voiceUrl || '— not set —'}</code>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Method</span>
                  <span>{data.twimlApp.voiceMethod || '—'}</span>
                </div>
              </div>

              {!data.matches && (
                <Button onClick={() => load('apply')} disabled={isApplying}>
                  {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                  Fix TwiML App automatically
                </Button>
              )}
            </>
          )}

          {data?.secrets && (
            <div className="flex flex-wrap gap-2 pt-2">
              {Object.entries(data.secrets).map(([key, present]) => (
                <Badge key={key} variant={present ? 'secondary' : 'destructive'}>
                  {key}: {present ? 'set' : 'missing'}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TwiMLAppConfigPanel;
