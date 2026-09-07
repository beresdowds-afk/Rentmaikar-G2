import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, FileText, PhoneCall, RefreshCw, Users } from 'lucide-react';
import { useAssignedWorkload } from '@/hooks/useAssignedWorkload';
import { useCallQueue } from '@/hooks/useCallQueue';

interface AssignedWorkloadPanelProps {
  /** Full admins see the whole active book of work; assistants see assignments only. */
  isFullAdmin: boolean;
  /** Opens the Call Center tab in the parent dashboard. */
  onOpenCallCenter: () => void;
}

const fmtDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

/** Renders a queue wait duration (ms) as m:ss. */
const fmtWait = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
};



/**
 * Dashboard home for admins and admin assistants: assigned drivers, owners,
 * vehicles and active agreements, plus a live portal into the Call Center queue.
 */
export const AssignedWorkloadPanel = ({ isFullAdmin, onOpenCallCenter }: AssignedWorkloadPanelProps) => {
  const { data, isLoading, refetch, isFetching } = useAssignedWorkload(isFullAdmin);
  const { queue, metrics, nextInLine, isLoading: queueLoading } = useCallQueue();

  const drivers = data?.drivers ?? [];
  const owners = data?.owners ?? [];
  const vehicles = data?.vehicles ?? [];
  const agreements = data?.agreements ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {isFullAdmin ? 'Active workload' : 'My assignments'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isFullAdmin
              ? 'Every active driver, owner, vehicle and agreement across the platform.'
              : 'Drivers, owners, vehicles and agreements assigned to you by an administrator.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Drivers', value: drivers.length, icon: Users },
          { label: 'Vehicle owners', value: owners.length, icon: Users },
          { label: 'Vehicles', value: vehicles.length, icon: Car },
          { label: 'Active agreements', value: agreements.length, icon: FileText },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" /> {label}
              </CardDescription>
              <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-7 w-10" /> : value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Call Center portal */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <PhoneCall className="h-4 w-4 text-primary" /> Call Center queue
              </CardTitle>
              <CardDescription>
                {queueLoading
                  ? 'Loading live queue…'
                  : `${metrics.waiting} waiting · longest wait ${fmtWait(metrics.longestWaitMs)} · ${metrics.usa} 🇺🇸 / ${metrics.nigeria} 🇳🇬`}
              </CardDescription>
            </div>
            <Button onClick={onOpenCallCenter} className="gap-2">
              <PhoneCall className="h-4 w-4" /> Open Call Center
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No callers waiting right now.</p>
          ) : (
            queue.slice(0, 5).map((call) => (
              <div
                key={call.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {call.displayName}
                    {nextInLine?.id === call.id && (
                      <Badge variant="secondary" className="ml-2">Next in line</Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {call.phoneNumber || 'No number'} · {call.region} · {call.reason || 'Inbound call'}
                  </p>
                </div>
                {call.isUrgent && <Badge variant="destructive">Urgent</Badge>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="people" className="space-y-4">
        <TabsList>
          <TabsTrigger value="people">Drivers & owners ({drivers.length + owners.length})</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="agreements">Agreements ({agreements.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <Card>
            <CardContent className="space-y-2 p-4">
              {isLoading && <Skeleton className="h-20 w-full" />}
              {!isLoading && drivers.length + owners.length === 0 && (
                <p className="text-sm text-muted-foreground">No people assigned yet.</p>
              )}
              {[...drivers, ...owners].map((person) => (
                <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.email || 'No email'} · {person.phone || 'No phone'}
                      {person.city ? ` · ${person.city}` : ''}
                    </p>
                  </div>
                  <Badge variant={person.role === 'driver' ? 'secondary' : 'outline'} className="capitalize">
                    {person.role}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehicles">
          <Card>
            <CardContent className="space-y-2 p-4">
              {isLoading && <Skeleton className="h-20 w-full" />}
              {!isLoading && vehicles.length === 0 && (
                <p className="text-sm text-muted-foreground">No vehicles assigned yet.</p>
              )}
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{vehicle.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {vehicle.licensePlate || 'No plate'}
                      {vehicle.pickupCity ? ` · ${vehicle.pickupCity}` : ''}
                    </p>
                  </div>
                  {vehicle.status && <Badge variant="outline" className="capitalize">{vehicle.status}</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agreements">
          <Card>
            <CardContent className="space-y-2 p-4">
              {isLoading && <Skeleton className="h-20 w-full" />}
              {!isLoading && agreements.length === 0 && (
                <p className="text-sm text-muted-foreground">No active agreements for your assignments.</p>
              )}
              {agreements.map((agreement) => (
                <div key={agreement.id} className="space-y-1 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium capitalize">
                      {agreement.agreementType.replace(/_/g, ' ')}
                    </p>
                    <Badge variant="outline" className="capitalize">{agreement.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Driver: {data?.names[agreement.driverId] ?? 'Unknown'} · Owner:{' '}
                    {data?.names[agreement.ownerId] ?? 'Unknown'}
                    {agreement.vehicleId ? ` · ${data?.vehicleLabels[agreement.vehicleId] ?? 'Vehicle'}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Driver signed {fmtDate(agreement.driverSignedAt)} · Owner signed{' '}
                    {fmtDate(agreement.ownerSignedAt)} · Expires {fmtDate(agreement.expiresAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AssignedWorkloadPanel;
