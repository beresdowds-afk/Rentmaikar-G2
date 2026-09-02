import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Battery, 
  Signal, 
  Thermometer, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';

interface DeviceHealth {
  id: string;
  serial_number: string;
  device_model: string;
  vehicle_plate: string | null;
  battery_level: number;
  signal_strength: number;
  temperature: number;
  last_ping: string | null;
  uptime_hours: number;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  issues: string[];
}

const OFFLINE_AFTER_MS = 24 * 60 * 60 * 1000;

const deriveHealth = (row: any): DeviceHealth => {
  const battery = row.battery_level ?? 0;
  const signal = row.signal_strength ?? 0;
  const details = (row.health_details ?? {}) as Record<string, unknown>;
  const temperature = Number(details.temperature ?? 0);
  const lastPing = row.last_ping as string | null;
  const stale = !lastPing || Date.now() - new Date(lastPing).getTime() > OFFLINE_AFTER_MS;

  const issues: string[] = [];
  if (stale) issues.push('No telemetry in 24+ hours');
  if (!stale && battery > 0 && battery < 15) issues.push('Critical battery');
  else if (!stale && battery > 0 && battery < 30) issues.push('Low battery');
  if (!stale && signal > 0 && signal < 40) issues.push('Weak signal');
  if (temperature > 55) issues.push('High temperature');

  let status: DeviceHealth['status'] = 'healthy';
  if (stale || row.status === 'offline') status = 'offline';
  else if (row.health_status === 'critical' || issues.some((i) => i.startsWith('Critical') || i === 'High temperature')) status = 'critical';
  else if (row.health_status === 'warning' || issues.length > 0) status = 'warning';

  const uptimeHours = row.activated_at && !stale
    ? Math.max(0, Math.floor((Date.now() - new Date(row.activated_at).getTime()) / 3_600_000))
    : 0;

  return {
    id: row.id,
    serial_number: row.serial_number ?? row.imei ?? '—',
    device_model: row.device_model ?? 'Unknown model',
    vehicle_plate: row.vehicles?.license_plate ?? null,
    battery_level: battery,
    signal_strength: signal,
    temperature,
    last_ping: lastPing,
    uptime_hours: uptimeHours,
    status,
    issues,
  };
};

export const DeviceHealth = () => {
  const [devices, setDevices] = useState<DeviceHealth[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadDevices = useCallback(async () => {
    const { data, error } = await supabase
      .from('iot_devices')
      .select('id, serial_number, imei, device_model, battery_level, signal_strength, last_ping, activated_at, status, health_status, health_details, vehicles(license_plate)')
      .order('last_ping', { ascending: false, nullsFirst: false });

    if (!error) {
      setDevices((data ?? []).map(deriveHealth));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const healthyCount = devices.filter((d) => d.status === 'healthy').length;
  const warningCount = devices.filter((d) => d.status === 'warning').length;
  const criticalCount = devices.filter((d) => d.status === 'critical').length;
  const offlineCount = devices.filter((d) => d.status === 'offline').length;

  const filteredDevices = statusFilter === 'all' 
    ? devices 
    : devices.filter((d) => d.status === statusFilter);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDevices();
    setIsRefreshing(false);
  };


  const getBatteryColor = (level: number) => {
    if (level >= 60) return 'text-green-500';
    if (level >= 30) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getSignalColor = (strength: number) => {
    if (strength >= 70) return 'text-green-500';
    if (strength >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getTempColor = (temp: number) => {
    if (temp <= 45) return 'text-green-500';
    if (temp <= 55) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusBadge = (status: DeviceHealth['status']) => {
    const config = {
      healthy: { variant: 'default' as const, icon: CheckCircle, color: 'text-green-500' },
      warning: { variant: 'secondary' as const, icon: AlertTriangle, color: 'text-yellow-500' },
      critical: { variant: 'destructive' as const, icon: AlertTriangle, color: 'text-red-500' },
      offline: { variant: 'outline' as const, icon: WifiOff, color: 'text-gray-500' },
    };
    const { variant, icon: Icon, color } = config[status];
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${color}`} />
        {status}
      </Badge>
    );
  };

  const formatLastPing = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 5) return 'Just now';
    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  const formatUptime = (hours: number) => {
    if (hours === 0) return '-';
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };

  return (
    <div className="space-y-6">
      {/* Health Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Healthy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{healthyCount}</div>
            <p className="text-xs text-muted-foreground">Operating normally</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Warning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
            <p className="text-xs text-muted-foreground">Attention needed</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <p className="text-xs text-muted-foreground">Immediate action required</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-gray-500" />
              Offline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{offlineCount}</div>
            <p className="text-xs text-muted-foreground">No connection</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Monitor Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Device Health Monitor
              </CardTitle>
              <CardDescription>
                Real-time health metrics for all IoT devices
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  <SelectItem value="healthy">Healthy</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Temp</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Last Ping</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                      {isLoading ? 'Loading device health…' : 'No IoT devices registered yet.'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredDevices.map((device) => (

                  <TableRow key={device.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{device.serial_number}</div>
                        <div className="text-sm text-muted-foreground">
                          {device.device_model}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {device.vehicle_plate ? (
                        <Badge variant="outline">{device.vehicle_plate}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(device.status)}</TableCell>
                    <TableCell>
                      {device.status !== 'offline' ? (
                        <div className="flex items-center gap-2">
                          <Battery className={`h-4 w-4 ${getBatteryColor(device.battery_level)}`} />
                          <div className="w-16">
                            <Progress value={device.battery_level} className="h-2" />
                          </div>
                          <span className="text-sm">{device.battery_level}%</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {device.status !== 'offline' ? (
                        <div className="flex items-center gap-2">
                          <Wifi className={`h-4 w-4 ${getSignalColor(device.signal_strength)}`} />
                          <span className="text-sm">{device.signal_strength}%</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {device.status !== 'offline' ? (
                        <div className="flex items-center gap-2">
                          <Thermometer className={`h-4 w-4 ${getTempColor(device.temperature)}`} />
                          <span className="text-sm">{device.temperature}°C</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatUptime(device.uptime_hours)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatLastPing(device.last_ping)}
                    </TableCell>
                    <TableCell>
                      {device.issues.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {device.issues.map((issue, i) => (
                            <Badge key={i} variant="destructive" className="text-xs">
                              {issue}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Health Thresholds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Battery className="h-4 w-4" />
                Battery Level
              </div>
              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  ≥60% Healthy
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  30-59% Warning
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  &lt;30% Critical
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Signal className="h-4 w-4" />
                Signal Strength
              </div>
              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  ≥70% Strong
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  40-69% Moderate
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  &lt;40% Weak
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Thermometer className="h-4 w-4" />
                Temperature
              </div>
              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  ≤45°C Normal
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  46-55°C Elevated
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  &gt;55°C Overheating
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
