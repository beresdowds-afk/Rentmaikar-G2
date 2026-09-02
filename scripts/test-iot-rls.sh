#!/usr/bin/env bash
# Runs the IoT RLS + SECURITY DEFINER helper regression tests.
# Requires PG* env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
# pointing at a database with the current schema.
set -euo pipefail

if [ -z "${PGHOST:-}" ]; then
  echo "PGHOST not set — configure managed Supabase DB env vars first." >&2
  exit 2
fi

exec psql -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../supabase/tests/iot-rls-tests.sql"
