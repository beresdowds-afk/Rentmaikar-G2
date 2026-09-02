import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Activity, AlertTriangle, TrendingDown, TrendingUp, RotateCcw, Search, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface BehaviorLog {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  event_type: string;
  severity: string;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  total_g: number | null;
  threshold_g: number | null;
  speed_at_event: number | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  created_at: string;
}

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  harsh_braking: { label: 'Harsh Braking', icon: <TrendingDown className="h-4 w-4" />, color: 'text-red-600 bg-red-100' },
  harsh_acceleration: { label: 'Harsh Acceleration', icon: <TrendingUp className="h-4 w-4" />, color: 'text-orange-600 bg-orange-100' },
  harsh_cornering: { label: 'Harsh Cornering', icon: <RotateCcw className="h-4 w-4" />, color: 'text-yellow-600 bg-yellow-100' },
  speeding: { label: 'Speeding', icon: <Activity className="h-4 w-4" />, color: 'text-purple-600 bg-purple-100' },
  impact: { label: 'Impact Detected', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-700 bg-red-200' },
  rollover: { label: 'Rollover', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-800 bg-red-300' },
  airbag_deploy: { label: 'Airbag Deployed', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-900 bg-red-400' },
};

const SEVERITY_BADGE: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

interface Props {
  vehicleIdFilter?: string; // when set, only show logs for this vehicle
  driverIdFilter?: string;  // when set, only show logs for this driver (driver self-view)
}

export const DriverBehaviorLogs = ({ vehicleIdFilter, driverIdFilter }: Props) => {
  const [logs, setLogs] = useState<BehaviorLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const fetchLogs = async () => {
    setIsLoading(true);
    let query = supabase
      .from('driver_behavior_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (vehicleIdFilter) query = query.eq('vehicle_id', vehicleIdFilter);
    if (driverIdFilter) query = query.eq('driver_id', driverIdFilter);

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load behavior logs');
    } else {
      setLogs((data as BehaviorLog[]) || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [vehicleIdFilter, driverIdFilter]);

  const filtered = logs.filter(log => {
    const matchesSearch = !search || log.vehicle_id.toLowerCase().includes(search.toLowerCase()) || (log.driver_id || '').includes(search);
    const matchesType = typeFilter === 'all' || log.event_type === typeFilter;
    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
    return matchesSearch && matchesType && matchesSeverity;
  });

  const totalEvents = logs.length;
  const criticalEvents = logs.filter(l => l.severity === 'critical').length;
  const highEvents = logs.filter(l => l.severity === 'high').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Driver Behavior Logs
          </h3>
          <p className="text-sm text-muted-foreground">Accelerometer & driving events from IoT sensors</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Events</p>
          <p className="text-2xl font-bold">{totalEvents}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">High Severity</p>
          <p className="text-2xl font-bold text-orange-600">{highEvents}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Critical</p>
          <p className="text-2xl font-bold text-red-600">{criticalEvents}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by vehicle or driver ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {Object.entries(EVENT_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading behavior logs...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No behavior events found</p>
          <p className="text-sm mt-1">Events are logged automatically when accelerometer thresholds are exceeded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => {
            const config = EVENT_CONFIG[log.event_type] || { label: log.event_type, icon: <Activity className="h-4 w-4" />, color: 'text-muted-foreground bg-muted' };
            return (
              <Card key={log.id} className="border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${config.color}`}>
                        {config.icon}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{config.label}</span>
                          <Badge className={`text-xs ${SEVERITY_BADGE[log.severity] || ''}`}>
                            {log.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">Vehicle: {log.vehicle_id}</span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          {log.total_g != null && (
                            <span>⚡ {log.total_g.toFixed(2)}G (threshold: {log.threshold_g?.toFixed(1)}G)</span>
                          )}
                          {log.speed_at_event != null && (
                            <span>🚗 {log.speed_at_event.toFixed(1)} km/h</span>
                          )}
                          {log.latitude != null && log.longitude != null && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                            </span>
                          )}
                          {log.accel_x != null && (
                            <span>Accel: X={log.accel_x?.toFixed(2)} Y={log.accel_y?.toFixed(2)} Z={log.accel_z?.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
