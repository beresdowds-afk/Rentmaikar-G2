#!/usr/bin/env bash
# Runs the BEFORE UPDATE trigger-guard integration tests against the
# managed Postgres this dev environment already has PG* env vars for.
# Fails fast on any ASSERT.

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${PGHOST:-}" ]]; then
  echo "PGHOST is not set — cannot run trigger-guard tests here." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -f supabase/tests/trigger-guards-tests.sql
