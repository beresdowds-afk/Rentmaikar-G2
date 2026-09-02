import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema with proper range checks
const iotAccidentSchema = z.object({
  vehicleId: z.string().uuid("Invalid vehicle ID"),
  driverId: z.string().uuid("Invalid driver ID"),
  ownerId: z.string().uuid("Invalid owner ID").optional(),
  triggerType: z.enum(['sudden_deceleration', 'impact', 'rollover', 'airbag', 'fire']),
  severity: z.enum(['minor', 'severe', 'critical']).optional(),
  decelerationG: z.number().min(0, "Deceleration cannot be negative").max(100, "Unrealistic deceleration value"),
  speedAtImpact: z.number().min(0, "Speed cannot be negative").max(300, "Unrealistic speed value"),
  latitude: z.number().min(-90).max(90, "Invalid latitude"),
  longitude: z.number().min(-180).max(180, "Invalid longitude"),
  timestamp: z.string().datetime("Invalid timestamp format"),
  deviceId: z.string().min(1).max(100, "Invalid device ID"),
  additionalData: z.object({
    heading: z.number().min(0).max(360).optional(),
    altitude: z.number().min(-1000).max(50000).optional(),
    batteryLevel: z.number().min(0).max(100).optional(),
  }).optional(),
});

// Thresholds for accident detection
const ACCIDENT_THRESHOLDS = {
  SUDDEN_DECELERATION_G: 5.0, // 5G deceleration threshold (P0)
  CRITICAL_DECELERATION_G: 8.0, // 8G+ is severe impact
  HIGH_SPEED_THRESHOLD: 30, // mph - impacts above this are more serious
  IMPACT_SEVERITY: {
    low: { minG: 2, maxG: 4 },
    medium: { minG: 4, maxG: 6 },
    high: { minG: 6, maxG: 8 },
    critical: { minG: 8, maxG: Infinity },
  },
};

const getImpactSeverity = (decelerationG: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (decelerationG >= ACCIDENT_THRESHOLDS.IMPACT_SEVERITY.critical.minG) return 'critical';
  if (decelerationG >= ACCIDENT_THRESHOLDS.IMPACT_SEVERITY.high.minG) return 'high';
  if (decelerationG >= ACCIDENT_THRESHOLDS.IMPACT_SEVERITY.medium.minG) return 'medium';
  return 'low';
};

const getTriggerDescription = (type: string): string => {
  const descriptions: Record<string, string> = {
    sudden_deceleration: 'Sudden deceleration detected by accelerometer',
    impact: 'Impact detected by collision sensors',
    rollover: 'Rollover event detected by gyroscope',
    airbag: 'Airbag deployment signal received',
    fire: 'Post-crash fire detected by thermal sensors',
  };
  return descriptions[type] || 'Unknown trigger event';
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = iotAccidentSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error("[IoTAccident] Validation failed:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid request data",
          details: parseResult.error.errors.map(e => e.message)
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = parseResult.data;

    console.log("[IoTAccident] Processing accident data:", {
      vehicleId: body.vehicleId,
      triggerType: body.triggerType,
      decelerationG: body.decelerationG,
    });

    // Verify device exists in iot_devices table
    const { data: device, error: deviceError } = await supabase
      .from('iot_devices')
      .select('id, vehicle_id, status')
      .eq('id', body.deviceId)
      .maybeSingle();

    if (deviceError || !device) {
      console.error("[IoTAccident] Device not found:", body.deviceId);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Unknown device ID" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify vehicle ID matches device's linked vehicle
    if (device.vehicle_id && device.vehicle_id !== body.vehicleId) {
      console.error("[IoTAccident] Vehicle ID mismatch:", {
        expected: device.vehicle_id,
        received: body.vehicleId,
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Device not linked to this vehicle" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate minimum threshold
    if (body.decelerationG < ACCIDENT_THRESHOLDS.SUDDEN_DECELERATION_G) {
      console.log("[IoTAccident] Below threshold, ignoring:", body.decelerationG);
      return new Response(
        JSON.stringify({ 
          success: true, 
          ignored: true, 
          reason: 'Below detection threshold' 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const severity = body.severity || getImpactSeverity(body.decelerationG);
    const title = `IoT Detected: ${body.triggerType.replace('_', ' ').toUpperCase()}`;
    const description = `${getTriggerDescription(body.triggerType)}

**Sensor Data:**
- Deceleration: ${body.decelerationG.toFixed(2)}G
- Speed at impact: ${body.speedAtImpact} mph
- Impact severity: ${severity.toUpperCase()}
- Device ID: ${body.deviceId}
- Timestamp: ${body.timestamp}

**Location:**
- Coordinates: ${body.latitude}, ${body.longitude}

This incident was automatically detected by the vehicle's IoT system. Emergency services may need to be contacted for high/critical severity events.`;

    // Create the incident record
    const { data: incident, error: insertError } = await supabase
      .from('vehicle_incidents')
      .insert({
        vehicle_id: body.vehicleId,
        driver_id: body.driverId,
        owner_id: body.ownerId || null,
        incident_type: 'accident',
        severity: severity,
        status: 'reported',
        title,
        description,
        location_lat: body.latitude,
        location_lng: body.longitude,
        is_iot_detected: true,
        iot_data: body.additionalData || {},
        iot_trigger_type: body.triggerType,
        iot_deceleration_g: body.decelerationG,
        iot_impact_severity: severity,
        iot_speed_at_impact: body.speedAtImpact,
        iot_triggered_at: body.timestamp,
        occurred_at: body.timestamp,
        reported_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create incident: ${insertError.message}`);
    }

    console.log("[IoTAccident] Incident created:", incident.id);

    // Send notification to admin and owner
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-incident-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          incidentId: incident.id,
          incidentType: 'accident',
          severity,
          vehicleId: body.vehicleId,
          driverId: body.driverId,
          ownerId: body.ownerId,
          title,
          description,
          isIotDetected: true,
          isLateReport: false,
          location: `${body.latitude}, ${body.longitude}`,
        }),
      });
      console.log("[IoTAccident] Notification sent");
    } catch (notifError) {
      console.error("[IoTAccident] Notification failed:", notifError);
    }

    // P0: Dispatch emergency services for severe/critical
    if (severity === 'high' || severity === 'critical' || body.triggerType === 'airbag' || body.triggerType === 'fire') {
      try {
        await fetch(`${supabaseUrl}/functions/v1/accident-emergency-dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            incidentId: incident.id,
            vehicleId: body.vehicleId,
            driverId: body.driverId,
            ownerId: body.ownerId,
            severity: severity === 'high' ? 'severe' : severity === 'critical' ? 'critical' : 'severe',
            triggerType: body.triggerType,
            decelerationG: body.decelerationG,
            speedAtImpact: body.speedAtImpact,
            latitude: body.latitude,
            longitude: body.longitude,
            timestamp: body.timestamp,
          }),
        });
        console.log("[IoTAccident] Emergency dispatch triggered");
      } catch (dispatchError) {
        console.error("[IoTAccident] Emergency dispatch failed:", dispatchError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        incidentId: incident.id,
        severity,
        message: `Accident incident created with ${severity} severity`,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[IoTAccident] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);