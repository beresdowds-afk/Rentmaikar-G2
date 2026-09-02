import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, PhoneIncoming, PhoneOff, ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';

interface VoiceCallRequest {
  id: string;
  requester_id: string;
  requester_role: string;
  target_role: string;
  target_id: string | null;
  reason: string | null;
  status: string;
  assigned_to: string | null;
  region: string;
  created_at: string;
}

interface IncomingCallAlertsProps {
  requests: VoiceCallRequest[];
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onEscalate: (requestId: string) => void;
  userRole: string;
}

export const IncomingCallAlerts = ({
  requests,
  onAccept,
  onReject,
  onEscalate,
  userRole,
}: IncomingCallAlertsProps) => {
  if (requests.length === 0) return null;

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <PhoneIncoming className="h-5 w-5 text-yellow-600 animate-pulse" />
          Incoming Call Requests
          <Badge variant="destructive">{requests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-background"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                    <Phone className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm capitalize">
                        {request.requester_role} requesting call
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {request.region}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(request.created_at), 'h:mm a')}
                      {request.reason && ` • ${request.reason}`}
                    </p>
                    {request.status === 'escalated' && (
                      <Badge variant="destructive" className="text-[10px] mt-1">
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                        Escalated
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onAccept(request.id)}
                    className="gap-1"
                  >
                    <Phone className="h-3 w-3" />
                    Accept
                  </Button>
                  {userRole !== 'admin' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEscalate(request.id)}
                      className="gap-1"
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      Escalate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onReject(request.id)}
                  >
                    <PhoneOff className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
