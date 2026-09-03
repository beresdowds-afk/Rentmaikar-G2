ALTER TABLE public.telemetry_ingest_runs
  ADD COLUMN IF NOT EXISTS passes integer,
  ADD COLUMN IF NOT EXISTS deduped integer,
  ADD COLUMN IF NOT EXISTS unmapped integer,
  ADD COLUMN IF NOT EXISTS gps_disabled integer;