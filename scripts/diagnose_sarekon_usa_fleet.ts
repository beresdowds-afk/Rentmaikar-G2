/**
 * Comprehensive Diagnostic Script: SareKon / GPSANDTRACK Fleet Reconciliation
 * 
 * Verifies the complete end-to-end chain:
 * Physical Hardware Tracker (IMEI / Serial)
 *   ↔ SareKon API device_id & Asset VIN
 *   ↔ Supabase `iot_devices` (provider = 'sarekon')
 *   ↔ Canonical `device_identities` (identity_key / DID-*)
 *   ↔ USA-region Vehicles (`vehicles` in MD, VA, DC)
 *   ↔ Operational Telemetry (`vehicle_telemetry_state` & `mqtt_telemetry_logs`)
 * 
 * Run with:
 * npx tsx scripts/diagnose_sarekon_usa_fleet.ts
 */

import pg from "pg";
import { sarekonService } from "../backend/src/services/sarekonService";

async function runDiagnostic() {
  console.log("================================================================================");
  console.log("       RENTMAIKAR USA/DMV FLEET: SAREKON / GPSANDTRACK DIAGNOSTIC AUDIT         ");
  console.log("================================================================================\n");

  const pool = new pg.Pool({
    host: "db.jrsydiofzceoeddjogov.supabase.co",
    port: 5432,
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    // 1. Check SareKon API Connectivity & Authentication
    console.log("[1/5] Probing SareKon / GPSANDTRACK API...");
    const connTest = await sarekonService.testConnection();
    if (!connTest.ok) {
      console.error("[-] FAILED to authenticate to SareKon API:", connTest.probe?.detail || connTest.message);
      process.exit(1);
    }
    console.log(`[+] SareKon API Authenticated successfully! Latency: ${connTest.probe?.latencyMs}ms`);
    console.log(`[+] Dealer Account: ${connTest.user_info}`);
    console.log(`[+] Total Trackers in SareKon Account: ${connTest.probe?.devices_in_account}\n`);

    // 2. Query SareKon Device Inventory
    console.log("[2/5] Fetching live SareKon tracker details from API...");
    const listRes = await sarekonService.listDevices();
    const liveDvds: any[] = listRes.devices || [];
    const dvdMap = new Map<string, any>();
    for (const dvd of liveDvds) {
      dvdMap.set(String(dvd.device_id), dvd);
    }

    // 3. Query Database: iot_devices, device_identities, vehicles, telemetry_state
    console.log("[3/5] Querying Supabase PostgreSQL tables...");

    const iotDevicesRes = await pool.query(`
      SELECT d.id, d.provider, d.provider_device_id, d.serial_number, d.imei, d.status,
             d.is_linked, d.telemetry_enabled, d.last_ping, d.vehicle_id, d.notes,
             d.latitude, d.longitude
      FROM public.iot_devices d
      WHERE d.provider = 'sarekon'
      ORDER BY d.created_at DESC
    `);
    const dbIotDevices = iotDevicesRes.rows;

    const deviceIdentitiesRes = await pool.query(`
      SELECT di.id, di.identity_key, di.device_id, di.vehicle_id, di.serial_number, di.imei,
             di.telemetry_provider, di.status, di.bundle_level, di.created_at, di.updated_at
      FROM public.device_identities di
      WHERE di.telemetry_provider = 'sarekon'
    `);
    const dbIdentities = deviceIdentitiesRes.rows;
    const identityByDeviceId = new Map<string, any>();
    for (const id of dbIdentities) {
      if (id.device_id) identityByDeviceId.set(String(id.device_id), id);
    }

    const usaVehiclesRes = await pool.query(`
      SELECT v.id, v.make, v.model, v.year, v.license_plate, v.vin, v.pickup_location,
             v.gps_tracking_enabled, v.status as vehicle_status
      FROM public.vehicles v
      WHERE (
        v.pickup_location ILIKE '%Maryland%' OR
        v.pickup_location ILIKE '%Virginia%' OR
        v.pickup_location ILIKE '%DC%' OR
        v.pickup_location ILIKE '%Washington%' OR
        v.pickup_location ILIKE '%Baltimore%' OR
        v.pickup_location ILIKE '%USA%'
      )
      ORDER BY v.make, v.model
    `);
    const usaVehicles = usaVehiclesRes.rows;

    const telemRes = await pool.query(`
      SELECT t.vehicle_id, t.latitude, t.longitude, t.speed, t.heading, t.address,
             t.last_source, t.last_event_type, t.last_event_at, t.gps_timestamp
      FROM public.vehicle_telemetry_state t
      WHERE t.last_source = 'sarekon'
    `);
    const telemByVehicle = new Map<string, any>();
    for (const t of telemRes.rows) {
      telemByVehicle.set(String(t.vehicle_id), t);
    }

    const syncStateRes = await pool.query(`
      SELECT provider, state, last_sync_at, last_success_at, last_error_at,
             devices_synced, positions_imported
      FROM public.iot_sync_state
      WHERE provider LIKE 'sarekon%'
    `);

    // 4. Build Reconciliation Matrix & Identify Anomalies
    console.log("[4/5] Cross-referencing physical hardware, API, DB, and vehicle fleet...\n");

    const anomalies: Array<{ type: string; severity: "HIGH" | "MEDIUM" | "LOW"; identifier: string; detail: string; action: string }> = [];

    // Check 1: Live SareKon devices vs iot_devices
    const dbIotByProviderDeviceId = new Map<string, any>();
    for (const d of dbIotDevices) {
      if (d.provider_device_id) dbIotByProviderDeviceId.set(String(d.provider_device_id), d);
    }

    for (const dvd of liveDvds) {
      const devId = String(dvd.device_id);
      if (!dbIotByProviderDeviceId.has(devId)) {
        anomalies.push({
          type: "MISSING_IN_IOT_DEVICES",
          severity: "MEDIUM",
          identifier: `SareKon device_id: ${devId}`,
          detail: `Tracker exists in SareKon account (${dvd.description || "no desc"}) but has no row in public.iot_devices.`,
          action: "Run sarekonService.syncSarekonFleet() to upsert missing tracker records.",
        });
      }
    }

    // Check 2: iot_devices vs device_identities
    for (const d of dbIotDevices) {
      const identity = identityByDeviceId.get(String(d.id));
      if (!identity) {
        anomalies.push({
          type: "MISSING_CANONICAL_IDENTITY",
          severity: "HIGH",
          identifier: `iot_devices.id: ${d.id} (${d.provider_device_id})`,
          detail: `Tracker exists in iot_devices but lacks a corresponding row in public.device_identities.`,
          action: "Execute `SELECT public.sync_device_identity('${d.id}')` to mint DID-* canonical identity.",
        });
      }
    }

    // Check 3: USA Vehicles without assigned trackers
    const linkedVehiclesSet = new Set(dbIotDevices.filter(d => d.vehicle_id).map(d => String(d.vehicle_id)));
    for (const v of usaVehicles) {
      if (!linkedVehiclesSet.has(String(v.id))) {
        anomalies.push({
          type: "UNLINKED_USA_VEHICLE",
          severity: "MEDIUM",
          identifier: `Vehicle: ${v.make} ${v.model} (${v.license_plate || v.id})`,
          detail: `Vehicle is located in ${v.pickup_location || "USA"} but has no hardware tracker linked in iot_devices.`,
          action: "Assign an available SareKon tracker using sarekonService.autoLinkUsaFleet() or manual pairing.",
        });
      }
    }

    // Check 4: Stale telemetry check (> 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000;
    for (const d of dbIotDevices) {
      if (d.vehicle_id && d.is_linked) {
        const lastPing = d.last_ping ? new Date(d.last_ping).getTime() : 0;
        const telem = telemByVehicle.get(String(d.vehicle_id));
        const gpsTime = telem?.gps_timestamp ? new Date(telem.gps_timestamp).getTime() : 0;
        const mostRecent = Math.max(lastPing, gpsTime);

        if (mostRecent === 0) {
          anomalies.push({
            type: "NO_TELEMETRY_RECORDED",
            severity: "HIGH",
            identifier: `Device ${d.provider_device_id} (Vehicle ${d.vehicle_id})`,
            detail: "Tracker is linked to active vehicle but has zero telemetry pings in vehicle_telemetry_state.",
            action: "Verify physical OBD-II / power connection or trigger on-demand /location/list.json query.",
          });
        } else if (mostRecent < thirtyDaysAgo) {
          const daysStale = Math.round((Date.now() - mostRecent) / 86400000);
          anomalies.push({
            type: "STALE_TELEMETRY",
            severity: "LOW",
            identifier: `Device ${d.provider_device_id} (Vehicle ${d.vehicle_id})`,
            detail: `Last GPS fix was ${daysStale} days ago (${new Date(mostRecent).toISOString().slice(0, 10)}). Tracker may be powered down or in storage.`,
            action: "Queue locate command or confirm vehicle operational status.",
          });
        }
      }
    }

    // 5. Output Diagnostic Tables
    console.log("--------------------------------------------------------------------------------");
    console.log("TABLE 1: USA FLEET VEHICLES & TRACKER MAPPINGS");
    console.log("--------------------------------------------------------------------------------");
    const usaCoverageRows = usaVehicles.map(v => {
      const tracker = dbIotDevices.find(d => String(d.vehicle_id) === String(v.id));
      const identity = tracker ? identityByDeviceId.get(String(tracker.id)) : null;
      const telem = telemByVehicle.get(String(v.id));
      return {
        "Vehicle ID": v.id.slice(0, 8) + "...",
        "Make / Model": `${v.make} ${v.model} (${v.year || ""})`,
        "Plate / VIN": v.license_plate || v.vin || "N/A",
        "Region": v.pickup_location || "USA",
        "SareKon Dev ID": tracker?.provider_device_id || "[UNLINKED]",
        "DID Identity": identity?.identity_key || "N/A",
        "Status": tracker?.status || "unpaired",
        "Last Event": telem?.last_event_type || "N/A",
        "Location / Address": telem?.address ? (telem.address.slice(0, 32) + "...") : "No fix",
      };
    });
    console.table(usaCoverageRows);

    console.log("\n--------------------------------------------------------------------------------");
    console.log("TABLE 2: SAREKON HARDWARE INVENTORY & CANONICAL IDENTITY STATUS (Sample 10/33)");
    console.log("--------------------------------------------------------------------------------");
    const hardwareRows = dbIotDevices.slice(0, 10).map(d => {
      const identity = identityByDeviceId.get(String(d.id));
      const dvd = dvdMap.get(String(d.provider_device_id));
      return {
        "SareKon Dev ID": d.provider_device_id,
        "Serial / Description": d.serial_number || dvd?.device_description || "N/A",
        "Asset / VIN Ref": dvd?.description || "N/A",
        "Canonical Key": identity?.identity_key || "[MISSING]",
        "DID Status": identity?.status || "incomplete",
        "Linked Vehicle": d.vehicle_id ? (d.vehicle_id.slice(0, 8) + "...") : "[None]",
        "Status": d.status,
        "Last Ping": d.last_ping ? new Date(d.last_ping).toISOString().slice(0, 19).replace("T", " ") : "Never",
      };
    });
    console.table(hardwareRows);

    console.log("\n--------------------------------------------------------------------------------");
    console.log("TABLE 3: IOT SYNC SCHEDULE & PROVIDER HEALTH");
    console.log("--------------------------------------------------------------------------------");
    console.table(syncStateRes.rows);

    console.log("\n--------------------------------------------------------------------------------");
    console.log(`TABLE 4: IDENTIFIED ANOMALIES & INTEGRATION ISSUES (${anomalies.length} found)`);
    console.log("--------------------------------------------------------------------------------");
    if (anomalies.length === 0) {
      console.log("[+] PERFECT HEALTH: No broken linkages, missing identities, or unlinked vehicles detected!\n");
    } else {
      console.table(anomalies);
    }

    // 6. Final Scorecard
    console.log("================================================================================");
    console.log("                          AUDIT SCORECARD & SUMMARY                             ");
    console.log("================================================================================");
    console.log(`- SareKon API Active Devices:          ${liveDvds.length}`);
    console.log(`- Database Registered Devices:         ${dbIotDevices.length}`);
    console.log(`- Canonical Device Identities:         ${dbIdentities.length} / ${dbIotDevices.length} (${Math.round((dbIdentities.length / dbIotDevices.length) * 100)}%)`);
    console.log(`- USA Fleet Vehicles:                  ${usaVehicles.length}`);
    console.log(`- USA Vehicles with Active GPS:        ${usaVehicles.filter(v => linkedVehiclesSet.has(String(v.id))).length} / ${usaVehicles.length}`);
    console.log(`- Vehicles with Telemetry Fixes:       ${telemRes.rows.length}`);
    console.log(`- Identified Anomalies / Gaps:         ${anomalies.length}`);
    console.log("================================================================================\n");

  } finally {
    await pool.end();
  }
}

runDiagnostic().catch(err => {
  console.error("Diagnostic execution failed:", err);
  process.exit(1);
});
