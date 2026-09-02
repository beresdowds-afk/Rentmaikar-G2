-- Fix: anonymous visitors get 42501 "permission denied for function is_any_support_staff"
-- (and is_admin / has_admin_privilege / owns_vehicle_text / ...) on tables whose
-- RLS policies reference those helpers.
--
-- Root cause: 101 policies across 79 tables were created WITHOUT a TO clause, so
-- they apply to PUBLIC (all roles). Their USING / WITH CHECK expressions call
-- SECURITY DEFINER helper functions whose EXECUTE privilege was revoked from
-- PUBLIC/anon (migration 20260715123825). When an anonymous session queries such
-- a table, Postgres evaluates every permissive policy, hits the helper call, and
-- aborts the whole query with 42501 instead of returning no rows.
--
-- These helpers only answer questions about auth.uid(), which is NULL for anon,
-- so an anonymous role can never satisfy them. Re-scoping the policies to
-- `authenticated` is therefore behavior-preserving: signed-in users see identical
-- results (ALTER POLICY keeps USING/WITH CHECK), service_role bypasses RLS
-- entirely, and anon gets normal RLS default-deny (empty SELECT / standard RLS
-- violation on writes) instead of an unexpected permission error.

do $$
declare
  pol record;
  altered int := 0;
begin
  for pol in
    select distinct p.polname, p.polrelid
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and p.polroles::text = '{0}'            -- PUBLIC policies only
      and exists (
        select 1
        from pg_proc pr
        join pg_namespace pn on pn.oid = pr.pronamespace
        where pn.nspname = 'public'
          and not has_function_privilege('anon', pr.oid, 'EXECUTE')
          and (
               coalesce(pg_get_expr(p.polqual, p.polrelid), '')      ~ ('\m' || pr.proname || '\M')
            or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ ('\m' || pr.proname || '\M')
          )
      )
  loop
    execute format('alter policy %I on %s to authenticated', pol.polname, pol.polrelid::regclass);
    altered := altered + 1;
  end loop;
  raise notice 'Re-scoped % PUBLIC policies to authenticated', altered;
end $$;