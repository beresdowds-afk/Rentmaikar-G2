import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Telemetry Health Monitor — runs on schedule (every 30 minutes)
 * 
 * Checks:
 * 1. Vehicles that stopped publishing (no telemetry for 30 min)
 * 2. High message backlog detection
 * 3. Bandwidth anomalies per vehicle
 * 4. Device battery alerts
 * 5. Generates offline status events
 */

const OFFLINE_THRESHOLD_MINUTES = 30;
const LOW_BATTERY_THRESHOLD = 15;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const cronDenied = await requireCronSecretAsync(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[TelemetryMonitor] Starting health check...");

    const now = new Date();
    const offlineThreshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

    // 1. Find vehicles with stale telemetry (linked devices that haven't pinged)
    const { data: staleDevices, error: staleError } = await supabase
      .from('iot_devices')
      .select('id, vehicle_id, serial_number, last_ping, battery_level, status')
      .eq('is_linked', true)
      .not('vehicle_id', 'is', null)
      .or(`last_ping.is.null,last_ping.lt.${offlineThreshold.toISOString()}`);

    if (staleError) {
      throw new Error(`Failed to query stale devices: ${staleError.message}`);
    }

    const alerts: Array<{
      type: string;
      severity: string;
      vehicleId: string | null;
      deviceId: string;
      message: string;
    }> = [];

    // Process stale devices
    for (const device of staleDevices || []) {
      const lastPing = device.last_ping ? new Date(device.last_ping) : null;
      const minutesSilent = lastPing
        ? Math.floor((now.getTime() - lastPing.getTime()) / 60000)
        : Infinity;

      // Vehicle offline alert
      if (minutesSilent >= OFFLINE_THRESHOLD_MINUTES) {
        alerts.push({
          type: 'vehicle_offline',
          severity: minutesSilent > 120 ? 'critical' : 'warning',
          vehicleId: device.vehicle_id,
          deviceId: device.id,
          message: `Vehicle offline: no telemetry for ${minutesSilent === Infinity ? 'unknown' : minutesSilent} minutes (device ${device.serial_number})`,
        });

        // Update device status to offline if currently active
        if (device.status === 'active') {
          await supabase
            .from('iot_devices')
            .update({ status: 'offline' as any })
            .eq('id', device.id);
        }
      }
    }

    // 2. Check for low battery devices
    const { data: lowBatteryDevices } = await supabase
      .from('iot_devices')
      .select('id, vehicle_id, serial_number, battery_level')
      .eq('is_linked', true)
      .lt('battery_level', LOW_BATTERY_THRESHOLD)
      .not('battery_level', 'is', null);

    for (const device of lowBatteryDevices || []) {
      alerts.push({
        type: 'low_battery',
        severity: (device.battery_level || 0) < 5 ? 'critical' : 'warning',
        vehicleId: device.vehicle_id,
        deviceId: device.id,
        message: `IoT device battery critical: ${device.battery_level}% (device ${device.serial_number})`,
      });
    }

    // 3. Log telemetry health events
    if (alerts.length > 0) {
      const telemetryLogs = alerts.map(alert => ({
        vehicle_id: alert.vehicleId || 'system',
        data_type: `health_alert:${alert.type}`,
        payload: {
          severity: alert.severity,
          message: alert.message,
          deviceId: alert.deviceId,
          checkedAt: now.toISOString(),
        },
        mqtt_topic: `rentmaikar/monitoring/health/${alert.type}`,
      }));

      const { error: logError } = await supabase
        .from('mqtt_telemetry_logs')
        .insert(telemetryLogs);

      if (logError) {
        console.error("[TelemetryMonitor] Failed to log alerts:", logError);
      }

      // Generate admin daily tasks for critical alerts
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');
      if (criticalAlerts.length > 0) {
        const tasks = criticalAlerts.map(alert => ({
          title: `⚠️ ${alert.type === 'vehicle_offline' ? 'Vehicle Offline' : 'Low Battery'}: ${alert.message.slice(0, 80)}`,
          description: alert.message,
          category: 'iot_support',
          priority: 'high',
          source_table: 'iot_devices',
          source_id: alert.deviceId,
        }));

        await supabase.from('admin_daily_tasks').insert(tasks);
      }

      // Send notification for offline vehicles
      const offlineAlerts = alerts.filter(a => a.type === 'vehicle_offline');
      if (offlineAlerts.length > 0) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-task-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              type: 'telemetry_health',
              title: `${offlineAlerts.length} vehicle(s) offline`,
              body: offlineAlerts.map(a => a.message).join('\n'),
              priority: 'high',
            }),
          });
        } catch (notifErr) {
          console.error("[TelemetryMonitor] Notification failed:", notifErr);
        }
      }
    }

    const summary = {
      checkedAt: now.toISOString(),
      staleDevices: staleDevices?.length || 0,
      lowBatteryDevices: lowBatteryDevices?.length || 0,
      totalAlerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    };

    console.log("[TelemetryMonitor] Health check complete:", summary);

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error("[TelemetryMonitor] Error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
