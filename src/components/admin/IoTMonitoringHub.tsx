import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Activity, AlertTriangle, Battery,
  Flame, Gauge, MapPin, Radio, RefreshCw, Satellite, Shield,
  Signal, Thermometer, Wifi, WifiOff, Zap, Siren, Eye,
  TrendingUp, BarChart3, CircleAlert, BellRing, Timer, Cpu,
  Server, Database, HardDrive, Router
} from 'lucide-react';
import { TelemetryProviderSwitch } from './TelemetryProviderSwitch';
import { EmqxSecretRotationPanel } from './EmqxSecretRotationPanel';
import { EmqxEndpointSettings } from './EmqxEndpointSettings';
import { EmqxBrokerStatusCard } from './EmqxBrokerStatusCard';
import { EmqxLiveMetricsPanel } from './EmqxLiveMetricsPanel';
import { ServerOrchestratorStatusCard } from './ServerOrchestratorStatusCard';

import TraccarLiveMap from './TraccarLiveMap';
import { IoTSimCardsPanel } from './IoTSimCardsPanel';
import { supabase } from '@/integrations/supabase/client';
import {
  TELEMETRY_SCHEDULES,
  ALERT_RULES,
  MONITORING_THRESHOLDS,
} from '@/lib/telemetry-scheduler';
import {
  EMQX_PROFILES,
  EMQX_SHARED_SUBSCRIPTIONS,
  EMQX_ACL_RULES,
  EMQX_RULES,
  EMQX_AUTH_CONFIG,
  EMQX_POSTGRES_BRIDGE,
  EMQX_MONITORED_TOPICS,
  EMQX_RECOMMENDED_PORTS,
  DATA_RETENTION_TIERS,
  RETENTION_CLEANUP_RULES,
} from '@/lib/emqx-config';

// ── Types ──────────────────────────────────────────────────

interface TelemetryEvent {
  id: string;
  vehicle_id: string;
  data_type: string;
  payload: Record<string, any>;
  mqtt_topic: string | null;
  received_at: string;
}

interface DeviceSummary {
  id: string;
  serial_number: string;
  vehicle_id: string | null;
  status: string;
  battery_level: number | null;
  signal_strength: number | null;
  last_ping: string | null;
  is_linked: boolean;
  device_model: string | null;
}

interface AccidentRecord {
  id: string;
  vehicle_id: string;
  event_type: string;
  severity: string;
  speed_at_event: number | null;
  total_g: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────

const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return 'destructive';
    case 'warning': return 'secondary';
    case 'info': return 'outline';
    default: return 'default';
  }
};

const severityIcon = (s: string) => {
  switch (s) {
    case 'critical': return <Flame className="h-3.5 w-3.5" />;
    case 'warning': return <AlertTriangle className="h-3.5 w-3.5" />;
    default: return <CircleAlert className="h-3.5 w-3.5" />;
  }
};

// ── Component ──────────────────────────────────────────────

export const IoTMonitoringHub = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryEvent[]>([]);
  const [accidents, setAccidents] = useState<AccidentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [telemetryFilter, setTelemetryFilter] = useState<string>('all');

  // ── Data Fetching ──────────────────────────────────────

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const [devicesRes, telemetryRes, accidentsRes] = await Promise.all([
        supabase.from('iot_devices').select('id, serial_number, vehicle_id, status, battery_level, signal_strength, last_ping, is_linked, device_model').order('last_ping', { ascending: false, nullsFirst: false }),
        supabase.from('mqtt_telemetry_logs').select('*').order('received_at', { ascending: false }).limit(100),
        supabase.from('driver_behavior_logs').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      if (devicesRes.data) setDevices(devicesRes.data as DeviceSummary[]);
      if (telemetryRes.data) setTelemetryLogs(telemetryRes.data as TelemetryEvent[]);
      if (accidentsRes.data) setAccidents(accidentsRes.data as AccidentRecord[]);
    } catch (err) {
      console.error('Failed to fetch IoT data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Computed Stats ─────────────────────────────────────

  const stats = useMemo(() => {
    const linked = devices.filter(d => d.is_linked);
    const online = linked.filter(d => d.status === 'active');
    const offline = linked.filter(d => {
      if (!d.last_ping) return true;
      return Date.now() - new Date(d.last_ping).getTime() > MONITORING_THRESHOLDS.vehicleOfflineTimeoutMs;
    });
    const lowBattery = linked.filter(d => d.battery_level !== null && d.battery_level < 15);
    const criticalAccidents = accidents.filter(a => a.severity === 'critical' || a.event_type === 'sudden_deceleration');

    return {
      totalDevices: devices.length,
      linkedDevices: linked.length,
      onlineDevices: online.length,
      offlineDevices: offline.length,
      lowBatteryDevices: lowBattery.length,
      totalTelemetryEvents: telemetryLogs.length,
      accidentEvents: accidents.length,
      criticalAccidents: criticalAccidents.length,
    };
  }, [devices, telemetryLogs, accidents]);

  const filteredTelemetry = useMemo(() => {
    if (telemetryFilter === 'all') return telemetryLogs;
    return telemetryLogs.filter(t => t.data_type.includes(telemetryFilter));
  }, [telemetryLogs, telemetryFilter]);

  // ── Render ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" />
            IoT Monitoring Hub
          </h2>
          <p className="text-muted-foreground">
            Real-time telemetry, fleet health, accident alerts & rules engine
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={isRefreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Linked Devices</p>
                <p className="text-2xl font-bold">{stats.linkedDevices}</p>
              </div>
              <Cpu className="h-8 w-8 text-primary/60" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.totalDevices} total registered</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Online Now</p>
                <p className="text-2xl font-bold text-green-600">{stats.onlineDevices}</p>
              </div>
              <Wifi className="h-8 w-8 text-green-500/60" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.offlineDevices} offline</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Low Battery</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.lowBatteryDevices}</p>
              </div>
              <Battery className="h-8 w-8 text-yellow-500/60" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Below 15% threshold</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Accident Alerts</p>
                <p className="text-2xl font-bold text-red-600">{stats.criticalAccidents}</p>
              </div>
              <Siren className="h-8 w-8 text-red-500/60" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.accidentEvents} total events</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Fleet Overview
          </TabsTrigger>
          <TabsTrigger value="telemetry" className="gap-1.5">
            <Satellite className="h-3.5 w-3.5" />
            Telemetry Feed
          </TabsTrigger>
          <TabsTrigger value="accidents" className="gap-1.5">
            <Siren className="h-3.5 w-3.5" />
            Accident Alerts
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Alert Rules
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5">
            <Timer className="h-3.5 w-3.5" />
            Schedules & QoS
          </TabsTrigger>
          <TabsTrigger value="emqx" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />
            EMQX Broker
          </TabsTrigger>
          <TabsTrigger value="retention" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Data Retention
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5">
            <Router className="h-3.5 w-3.5" />
            Providers &amp; SIMs
          </TabsTrigger>
          <TabsTrigger value="livemap" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Live Map (Traccar)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <TelemetryProviderSwitch />
          <EmqxSecretRotationPanel />
          <IoTSimCardsPanel />

        </TabsContent>

        <TabsContent value="livemap" className="space-y-4">
          <TraccarLiveMap />
        </TabsContent>

        {/* ── FLEET OVERVIEW ────────────────────────────── */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Fleet Device Status
              </CardTitle>
              <CardDescription>All linked IoT devices with real-time health metrics</CardDescription>
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
                      <TableHead>Last Ping</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.filter(d => d.is_linked).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No linked devices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      devices.filter(d => d.is_linked).map(device => {
                        const isOffline = !device.last_ping || Date.now() - new Date(device.last_ping).getTime() > MONITORING_THRESHOLDS.vehicleOfflineTimeoutMs;
                        return (
                          <TableRow key={device.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium text-sm">{device.serial_number}</div>
                                <div className="text-xs text-muted-foreground">{device.device_model || 'Unknown'}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {device.vehicle_id ? (
                                <Badge variant="outline" className="text-xs">{device.vehicle_id.slice(0, 8)}...</Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isOffline ? 'outline' : 'default'} className="gap-1">
                                {isOffline ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                                {isOffline ? 'Offline' : 'Online'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {device.battery_level !== null ? (
                                <div className="flex items-center gap-2">
                                  <Battery className={`h-4 w-4 ${device.battery_level < 15 ? 'text-red-500' : device.battery_level < 30 ? 'text-yellow-500' : 'text-green-500'}`} />
                                  <Progress value={device.battery_level} className="h-2 w-14" />
                                  <span className="text-xs">{device.battery_level}%</span>
                                </div>
                              ) : <span className="text-muted-foreground text-sm">—</span>}
                            </TableCell>
                            <TableCell>
                              {device.signal_strength !== null ? (
                                <div className="flex items-center gap-1.5">
                                  <Signal className={`h-4 w-4 ${device.signal_strength < 40 ? 'text-red-500' : device.signal_strength < 70 ? 'text-yellow-500' : 'text-green-500'}`} />
                                  <span className="text-xs">{device.signal_strength}%</span>
                                </div>
                              ) : <span className="text-muted-foreground text-sm">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {timeAgo(device.last_ping)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TELEMETRY FEED ────────────────────────────── */}
        <TabsContent value="telemetry">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Satellite className="h-5 w-5" />
                    Live Telemetry Feed
                  </CardTitle>
                  <CardDescription>Recent MQTT telemetry messages from fleet</CardDescription>
                </div>
                <Select value={telemetryFilter} onValueChange={setTelemetryFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filter type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="gps">GPS</SelectItem>
                    <SelectItem value="engine">Engine</SelectItem>
                    <SelectItem value="diagnostics">Diagnostics</SelectItem>
                    <SelectItem value="health_alert">Health Alerts</SelectItem>
                    <SelectItem value="accident">Accidents</SelectItem>
                    <SelectItem value="batch">Batch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {filteredTelemetry.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Satellite className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No telemetry events found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTelemetry.map(event => {
                      const isAlert = event.data_type.includes('health_alert') || event.data_type.includes('accident');
                      return (
                        <div key={event.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isAlert ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/30'}`}>
                          <div className="mt-0.5">
                            {event.data_type.includes('gps') && <MapPin className="h-4 w-4 text-blue-500" />}
                            {event.data_type.includes('engine') && <Gauge className="h-4 w-4 text-orange-500" />}
                            {event.data_type.includes('diagnostics') && <Thermometer className="h-4 w-4 text-purple-500" />}
                            {event.data_type.includes('health_alert') && <AlertTriangle className="h-4 w-4 text-red-500" />}
                            {event.data_type.includes('accident') && <Siren className="h-4 w-4 text-red-600" />}
                            {event.data_type.includes('batch') && <BarChart3 className="h-4 w-4 text-muted-foreground" />}
                            {!['gps', 'engine', 'diagnostics', 'health_alert', 'accident', 'batch'].some(t => event.data_type.includes(t)) && <Radio className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{event.data_type}</Badge>
                              <span className="text-[10px] text-muted-foreground">{event.vehicle_id.slice(0, 12)}...</span>
                            </div>
                            {event.mqtt_topic && (
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{event.mqtt_topic}</p>
                            )}
                            <pre className="text-[11px] text-foreground/80 mt-1 whitespace-pre-wrap break-all max-h-20 overflow-hidden">
                              {JSON.stringify(event.payload, null, 1).slice(0, 200)}
                            </pre>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {timeAgo(event.received_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ACCIDENT ALERTS ───────────────────────────── */}
        <TabsContent value="accidents">
          <div className="space-y-4">
            {/* Accident Pipeline Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-red-600">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-red-600" />
                    <span className="text-xs font-medium">Raw Impact ({'>'} 5G)</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{accidents.filter(a => a.event_type === 'sudden_deceleration' || a.event_type === 'impact').length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="text-xs font-medium">Rollover / Fire</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{accidents.filter(a => a.event_type === 'rollover' || a.event_type === 'fire').length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-500" />
                    <span className="text-xs font-medium">Airbag Deploy</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{accidents.filter(a => a.event_type === 'airbag').length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <Siren className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium">Emergency Dispatched</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{accidents.filter(a => a.severity === 'critical').length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Accident Notification Topics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BellRing className="h-4 w-4" />
                  MQTT Accident Topic Hierarchy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="space-y-1.5">
                    <p className="font-sans text-sm font-medium text-foreground mb-2">Raw Sensor Data</p>
                    <p className="text-muted-foreground">.../accident/raw/impact</p>
                    <p className="text-muted-foreground">.../accident/raw/airbag</p>
                    <p className="text-muted-foreground">.../accident/raw/rollover</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-sans text-sm font-medium text-foreground mb-2">Verified Events</p>
                    <p className="text-muted-foreground">.../accident/verified/severe</p>
                    <p className="text-muted-foreground">.../accident/verified/minor</p>
                    <p className="text-muted-foreground">.../accident/verified/fire</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-sans text-sm font-medium text-foreground mb-2">Alert Routing</p>
                    <p className="text-red-500">.../alerts/emergency/{'{vehicle_id}'}</p>
                    <p className="text-orange-500">.../alerts/fleet/{'{vehicle_id}'}</p>
                    <p className="text-blue-500">.../alerts/insurance/{'{vehicle_id}'}</p>
                    <p className="text-purple-500">.../alerts/emergency_contact/{'{vehicle_id}'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Accident Events Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Recent Accident & Behavior Events
                </CardTitle>
                <CardDescription>Driver behavior logs including impact, harsh braking, and accident events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>G-Force</TableHead>
                        <TableHead>Speed</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Vehicle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accidents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No accident or behavior events recorded
                          </TableCell>
                        </TableRow>
                      ) : (
                        accidents.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="text-xs">{timeAgo(a.created_at)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize gap-1">
                                {a.event_type === 'sudden_deceleration' && <Zap className="h-3 w-3" />}
                                {a.event_type === 'rollover' && <RefreshCw className="h-3 w-3" />}
                                {a.event_type.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={severityColor(a.severity) as any} className="gap-1 text-xs">
                                {severityIcon(a.severity)}
                                {a.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {a.total_g ? `${a.total_g.toFixed(1)}G` : '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {a.speed_at_event !== null ? `${a.speed_at_event} mph` : '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {a.latitude && a.longitude ? (
                                <span className="text-muted-foreground">{a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {a.vehicle_id.slice(0, 8)}...
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── ALERT RULES ───────────────────────────────── */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Alert Rules Engine
              </CardTitle>
              <CardDescription>
                Configured rules that evaluate incoming telemetry and trigger alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ALERT_RULES.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rule.source === 'gps' ? 'bg-blue-500/10 text-blue-500' : rule.source === 'engine' ? 'bg-orange-500/10 text-orange-500' : rule.source === 'diagnostics' ? 'bg-purple-500/10 text-purple-500' : 'bg-red-500/10 text-red-500'}`}>
                        {rule.source === 'gps' && <MapPin className="h-5 w-5" />}
                        {rule.source === 'engine' && <Gauge className="h-5 w-5" />}
                        {rule.source === 'diagnostics' && <Thermometer className="h-5 w-5" />}
                        {rule.source === 'accident' && <Siren className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{rule.name}</p>
                          <Badge variant="outline" className="text-[10px] capitalize">{rule.source}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{rule.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={rule.enabled ? 'default' : 'secondary'} className="text-xs">
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                      <Switch
                        checked={rule.enabled}
                        disabled
                        aria-label={`${rule.name} — engine-configured, read-only`}
                        title="Alert rules are engine-configured and read-only in this view"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SCHEDULES & QoS ──────────────────────────── */}
        <TabsContent value="schedules">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Telemetry Schedules */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Timer className="h-5 w-5" />
                  Telemetry Schedules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">GPS Location</span>
                    </div>
                    <Badge>QoS {TELEMETRY_SCHEDULES.GPS.qos}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Parked: Every {TELEMETRY_SCHEDULES.GPS.parkedIntervalMs / 60000} min</p>
                    <p>Moving: Every {TELEMETRY_SCHEDULES.GPS.movingIntervalMs / 1000}s</p>
                    <p>Motion threshold: {TELEMETRY_SCHEDULES.GPS.movingThresholdMph} mph</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-sm">Engine Telemetry</span>
                    </div>
                    <Badge>QoS {TELEMETRY_SCHEDULES.ENGINE.qos}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Every {TELEMETRY_SCHEDULES.ENGINE.intervalMs / 60000} min</p>
                </div>

                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-sm">Diagnostics</span>
                    </div>
                    <Badge>QoS {TELEMETRY_SCHEDULES.DIAGNOSTICS.qos}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">On occurrence (immediate)</p>
                </div>

                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Siren className="h-4 w-4 text-red-500" />
                      <span className="font-medium text-sm">Accident Events</span>
                    </div>
                    <Badge variant="destructive">QoS {TELEMETRY_SCHEDULES.ACCIDENT.qos}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Exactly-once delivery (critical)</p>
                </div>

                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Batch Upload</span>
                    </div>
                    <Badge>QoS {TELEMETRY_SCHEDULES.BATCH.qos}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Max {TELEMETRY_SCHEDULES.BATCH.maxRecordsPerBatch} records per batch</p>
                </div>
              </CardContent>
            </Card>

            {/* Monitoring Thresholds & Session Config */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Eye className="h-5 w-5" />
                    Monitoring Thresholds
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <WifiOff className="h-4 w-4 text-red-500" />
                      <span className="text-sm">Offline Timeout</span>
                    </div>
                    <Badge variant="secondary">{MONITORING_THRESHOLDS.vehicleOfflineTimeoutMs / 60000} min</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Message Backlog Alert</span>
                    </div>
                    <Badge variant="secondary">{MONITORING_THRESHOLDS.messageBacklogThreshold.toLocaleString()} msgs</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">Max Bandwidth/Vehicle/Hour</span>
                    </div>
                    <Badge variant="secondary">{MONITORING_THRESHOLDS.maxBandwidthPerVehiclePerHour / 1024 / 1024} MB</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" />
                      <span className="text-sm">Rate Limit</span>
                    </div>
                    <Badge variant="secondary">{MONITORING_THRESHOLDS.maxMessagesPerVehiclePerMinute} msgs/min</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wifi className="h-5 w-5" />
                    Session & LWT Config
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clean Session</span>
                    <Badge variant="outline">false (persistent)</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Session Expiry</span>
                    <span className="font-medium">24 hours</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receive Maximum</span>
                    <span className="font-medium">1,000 msgs</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Will Topic</span>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">.../status</code>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Will QoS</span>
                    <Badge>QoS 1</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Will Retain</span>
                    <Badge variant="outline">true</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── EMQX BROKER ──────────────────────────────── */}
        <TabsContent value="emqx">
          <div className="space-y-4">
            <EmqxLiveMetricsPanel />
            <ServerOrchestratorStatusCard />
            <EmqxBrokerStatusCard />
            <EmqxEndpointSettings />
            {/* Broker Profiles */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  EMQX Broker Configuration
                </CardTitle>
                <CardDescription>Connection profiles, authentication, and cluster settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Profiles */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Connection Profiles</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(EMQX_PROFILES).map(([key, profile]) => (
                      <div key={key} className={`p-4 rounded-lg border ${key === 'production' ? 'border-primary/50 bg-primary/5' : 'bg-muted/30'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{profile.name}</span>
                          {key === 'production' && <Badge>Active</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">{profile.description}</p>
                        <div className="space-y-1.5 text-[11px] font-mono">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">WSS:</span>
                            <span className="truncate ml-2">{profile.wssUrl}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">TCP:</span>
                            <span className="truncate ml-2">{profile.tcpUrl}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">API:</span>
                            <span className="truncate ml-2">{profile.apiUrl}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Authentication */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Authentication</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">JWT Authentication (Devices)</span>
                      </div>
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <p>From: <code className="bg-muted px-1 rounded">{EMQX_AUTH_CONFIG.jwt.from}</code></p>
                        <p>Algorithm: <code className="bg-muted px-1 rounded">{EMQX_AUTH_CONFIG.jwt.algorithm}</code></p>
                        <p>Verify claims: <code className="bg-muted px-1 rounded">username = %u</code></p>
                        <p>Disconnect after expire: <Badge variant="outline" className="text-[10px]">{EMQX_AUTH_CONFIG.jwt.disconnect_after_expire ? 'Yes' : 'No'}</Badge></p>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Password Auth (Dashboard)</span>
                      </div>
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <p>Backend: <code className="bg-muted px-1 rounded">{EMQX_AUTH_CONFIG.password.backend}</code></p>
                        <p>Hash: <code className="bg-muted px-1 rounded">{EMQX_AUTH_CONFIG.password.password_hash_algorithm.name}</code></p>
                        <p>Salt rounds: <Badge variant="outline" className="text-[10px]">{EMQX_AUTH_CONFIG.password.password_hash_algorithm.salt_rounds}</Badge></p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shared Subscriptions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Radio className="h-5 w-5" />
                  EMQX Shared Subscriptions
                </CardTitle>
                <CardDescription>Load-balanced topic groups using $share/&#123;group&#125;/&#123;topic&#125;</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(EMQX_SHARED_SUBSCRIPTIONS).map(([key, group]) => (
                  <div key={key} className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">{group.group}</Badge>
                        <span className="font-medium text-sm capitalize">{key.replace(/_/g, ' ').toLowerCase()}</span>
                      </div>
                      <Badge className="text-[10px]">{group.topics.length} topics</Badge>
                    </div>
                    <div className="space-y-1 mt-2">
                      {group.topics.map((topic, i) => (
                        <p key={i} className="text-[11px] font-mono text-muted-foreground">{topic}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* ACL Rules */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-5 w-5" />
                  ACL Rules
                </CardTitle>
                <CardDescription>EMQX authorization rules with %u (username) and %c (clientid) placeholders</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Permission</TableHead>
                        <TableHead>Topic Pattern</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {EMQX_ACL_RULES.map((rule, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{rule.action}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={rule.permission === 'allow' ? 'default' : 'destructive'} className="text-xs">
                              {rule.permission}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{rule.topic}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rule.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Rule Engine & Data Bridges */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="h-5 w-5" />
                    Rule Engine Rules
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {EMQX_RULES.map(rule => (
                    <div key={rule.id} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{rule.name}</span>
                        <Badge variant={rule.enabled ? 'default' : 'secondary'} className="text-[10px]">
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                      <div className="flex gap-1 flex-wrap">
                        {rule.actions.map((action, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] capitalize">{action.type}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-5 w-5" />
                    Data Bridge (PostgreSQL)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bridge Name</span>
                    <span className="font-medium">{EMQX_POSTGRES_BRIDGE.name}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Size</span>
                    <Badge variant="outline">{EMQX_POSTGRES_BRIDGE.pool_size}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Batch Size</span>
                    <Badge variant="outline">{EMQX_POSTGRES_BRIDGE.resource_opts.batch_size}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Batch Time</span>
                    <span className="font-medium">{EMQX_POSTGRES_BRIDGE.resource_opts.batch_time}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buffer Mode</span>
                    <Badge variant="outline">{EMQX_POSTGRES_BRIDGE.resource_opts.buffer_mode}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Health Check</span>
                    <span className="font-medium">{EMQX_POSTGRES_BRIDGE.resource_opts.health_check_interval}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TLS</span>
                    <Badge variant={EMQX_POSTGRES_BRIDGE.ssl.enable ? 'default' : 'secondary'} className="text-[10px]">
                      {EMQX_POSTGRES_BRIDGE.ssl.enable ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>

                  <Separator className="my-4" />

                  <h4 className="font-medium text-sm">Monitored Topics</h4>
                  <div className="space-y-1">
                    {EMQX_MONITORED_TOPICS.map((topic, i) => (
                      <p key={i} className="text-[11px] font-mono text-muted-foreground">{topic}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── DATA RETENTION & PORTS ─────────────────────── */}
        <TabsContent value="retention">
          <div className="space-y-4">
            {/* Tiered Retention Strategy */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Tiered Data Retention Strategy
                </CardTitle>
                <CardDescription>
                  Real-time → 7-day recent → 30-day historical → permanent archive
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {DATA_RETENTION_TIERS.map((tier, idx) => {
                    const tierColors = [
                      'border-l-green-500 bg-green-500/5',
                      'border-l-blue-500 bg-blue-500/5',
                      'border-l-orange-500 bg-orange-500/5',
                      'border-l-red-500 bg-red-500/5',
                    ];
                    const tierIcons = [
                      <Activity key="rt" className="h-5 w-5 text-green-500" />,
                      <HardDrive key="rc" className="h-5 w-5 text-blue-500" />,
                      <BarChart3 key="hs" className="h-5 w-5 text-orange-500" />,
                      <Shield key="pm" className="h-5 w-5 text-red-500" />,
                    ];
                    return (
                      <div key={tier.name} className={`p-4 rounded-lg border-l-4 border ${tierColors[idx]}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {tierIcons[idx]}
                          <span className="font-semibold text-sm">{tier.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">{tier.description}</p>
                        <Separator className="my-2" />
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Resolution</span>
                          </div>
                          <p className="text-foreground/80 font-medium">{tier.resolution}</p>
                          <div className="flex justify-between mt-2">
                            <span className="text-muted-foreground">Storage Est.</span>
                            <span className="font-medium">{tier.storageEstimate}</span>
                          </div>
                          {tier.tables.length > 0 && (
                            <div className="mt-2">
                              <span className="text-muted-foreground">Tables:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tier.tables.map(t => (
                                  <Badge key={t} variant="outline" className="text-[10px] font-mono">{t}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex justify-between mt-2">
                            <span className="text-muted-foreground">Auto-cleanup</span>
                            <Badge variant={tier.autoCleanup ? 'default' : 'secondary'} className="text-[10px]">
                              {tier.autoCleanup ? 'Enabled' : 'Manual'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Cleanup Rules */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Timer className="h-5 w-5" />
                  Retention Cleanup Rules
                </CardTitle>
                <CardDescription>Automated data lifecycle management</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Telemetry Purge</p>
                      <p className="text-xs text-muted-foreground">mqtt_telemetry_logs older than threshold</p>
                    </div>
                    <Badge>{RETENTION_CLEANUP_RULES.telemetryPurgeDays} days</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">GPS Down-sampling</p>
                      <p className="text-xs text-muted-foreground">Aggregate to hourly averages after</p>
                    </div>
                    <Badge>{RETENTION_CLEANUP_RULES.gpsSampleAfterDays} days</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Behavior (info) Purge</p>
                      <p className="text-xs text-muted-foreground">Low-severity behavior events</p>
                    </div>
                    <Badge>{RETENTION_CLEANUP_RULES.behaviorInfoPurgeDays} days</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Behavior (warning) Purge</p>
                      <p className="text-xs text-muted-foreground">Warning-level behavior events</p>
                    </div>
                    <Badge>{RETENTION_CLEANUP_RULES.behaviorWarningPurgeDays} days</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Critical Events</p>
                      <p className="text-xs text-muted-foreground">Accidents & critical incidents</p>
                    </div>
                    <Badge variant="destructive">Never deleted</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Cleanup Schedule</p>
                      <p className="text-xs text-muted-foreground">Cron expression</p>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">{RETENTION_CLEANUP_RULES.cleanupCronSchedule}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recommended MQTT Ports */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wifi className="h-5 w-5" />
                  Recommended MQTT Ports
                </CardTitle>
                <CardDescription>Standard port assignments for EMQX broker</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Port</TableHead>
                        <TableHead>Protocol</TableHead>
                        <TableHead>TLS</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {EMQX_RECOMMENDED_PORTS.map(p => (
                        <TableRow key={p.port}>
                          <TableCell className="font-mono font-bold">{p.port}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{p.protocol}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.tls ? 'default' : 'secondary'} className="text-xs">
                              {p.tls ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
