-- =============================================================================
-- BEFORE UPDATE trigger guard regression tests
-- =============================================================================
-- Verifies that the column-scope guards on the seven protected tables:
--   - revert forbidden field changes made by non-admins
--   - allow legitimate field changes for the role that owns the field
--   - never restrict admins
--   - write a row into public.permission_denied_log for every blocked attempt
--
-- Actual assertions live inside public._testkit_run_trigger_guard_tests(text),
-- a SECURITY DEFINER function created by migration. That function seeds its
-- own fixtures under a database owner context (so it works regardless of the
-- current session's grants) and cleans them up on exit.
--
-- Run with:
--   psql -f supabase/tests/trigger-guards-tests.sql
--   scripts/test-trigger-guards.sh   (convenience wrapper)
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

SELECT public._testkit_run_trigger_guard_tests('YES_RUN_TESTS') AS result;
