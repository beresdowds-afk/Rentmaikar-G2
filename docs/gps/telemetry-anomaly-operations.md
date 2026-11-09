# Telemetry anomaly and fleet SLA operations

## Source-level behavior

`backend/src/services/telemetryAnomalyDetection.ts` detects device/vehicle
mismatch, invalid GPS, impossible speed, critical battery, overheating,
invalid/future/skewed/stale/replayed timestamps, implausible position jumps,
sudden fuel decreases, disconnections, and abnormal event frequency.
`iotService.ingest` persists each detection to `telemetry_anomalies` with a
stable active deduplication key. If persistence fails, the affected telemetry
record is rejected and the ingestion response reports a failure; audit logging
is not treated as a substitute for the anomaly row.

Anomalies move through `open`, `acknowledged`, and `resolved`. The database
history trigger records detection and lifecycle changes, including the
authenticated actor for acknowledgement or resolution. Critical unresolved
records are marked as escalated by `telemetry-health-monitor`. Fleet summaries
classify vehicles as compliant, delayed, degraded, or breached using
`fleet_telemetry_sla_config`.

## Threshold configuration

`telemetry_anomaly_threshold_config` stores JSON threshold overrides by
`region` and `vehicle_class`. `fleet_telemetry_sla_config` stores active and
idle freshness thresholds by the same keys. Exact region/class entries take
precedence over wildcard entries; unresolved regions use the wildcard and are
not assigned a default country. New installations receive a wildcard/default
row. The existing detector defaults are used for anomaly fields omitted from
an override.

Both configuration tables are protected by RLS: authenticated administrators
may manage them through the admin policy, and service-role operations may
manage them for ingestion/monitoring. Ordinary authenticated users and anon
clients receive no configuration access.

## Migration and verification status

The additive migration
`supabase/migrations/20261109120000_durable_message_outbox_and_telemetry_lifecycle.sql`
adds lifecycle, history, threshold configuration, and database RPC support.
It preserves existing anomaly rows and is repeatable for the objects it
creates. Apply it through the normal migration release process before
deploying code that queries its new columns or tables. This change has not
validated or applied the migration against a live Supabase project; inspect
the target schema and RLS state first. If deployment is interrupted, prefer
forward repair and rerun after resolving the reported SQL error; do not drop
the anomaly history or outbox tables as a rollback.

Backend unit tests cover each detector category, configurable thresholds,
freshness classification, stable anomaly deduplication, and explicit failure
when anomaly persistence fails. They do not prove live Postgres behavior,
RLS enforcement, cron execution, notification delivery, or provider callback
configuration.
