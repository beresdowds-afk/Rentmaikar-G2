# Database Architecture Audit & Repair — August 2026

Scope: full `public` schema (168 tables, 18 enum types, ~200 routines) covering auth,
user management, roles, onboarding, subscriptions, payments/billing/invoicing/accounting,
marketplace, GPS + IoT, messaging, notifications, analytics, AI services, CMS, audit
logging and integrations.

Method: live introspection of `pg_catalog` / `pg_stat_*` against the production database
rather than reading migration files, so the findings reflect the actual deployed state.

---

## 1. Baseline — what was already sound

| Check | Result |
| --- | --- |
| Tables without a primary key | **0** |
| Tables with RLS disabled | **0** |
| Tables with RLS enabled but no policy (silently locked) | **0** |
| Orphaned rows across every candidate relationship tested (18 joins) | **0** |
| Duplicate / conflicting index definitions | **0** |
| Slowest statement (`pg_stat_statements`) | 43 ms mean, 145 ms max — no pathological query |

The role model (`user_roles` + `has_role()` security-definer indirection), the append-only
`wallet_ledger_entries` ledger, and the `permission_denied_log` guard trail were all
verified intact and are not modified by this repair.

---

## 2. Defects found

### 2.1 Missing referential integrity (22 relationships)

22 intra-schema `*_id` columns carried real relationships in application code but had **no
foreign key**, so nothing prevented a payment, agreement, geofence or tax line from pointing
at a deleted parent. Affected modules: vehicles/marketplace, rentals, applications,
payments & tax, legal agreements, IoT SIM inventory, telemetry, document expiry.

References to `auth.users` were deliberately **left unconstrained** — Supabase manages that
table and FKs into it are not supported on this platform.

### 2.2 Unindexed foreign keys (93)

93 of 148 foreign keys had no supporting index. Two consequences:

- Every child lookup (`payments` for a vehicle, `support_task_updates` for a task,
  `voip_call_participants` for a call) was a sequential scan.
- Postgres must scan the **whole** child table on every parent `DELETE`/`UPDATE` to validate
  the constraint — the classic source of lock escalation and deadlocks under load.

### 2.3 Stale `updated_at` on settings tables (4)

`elevenlabs_retention_settings`, `persona_template_config`, `platform_kv_settings` and
`weekly_report_settings` all expose an `updated_at` column with no `BEFORE UPDATE` trigger,
so the column silently reported the creation time forever. This corrupts admin
"last changed" displays and any cache-invalidation keyed on it.

### 2.4 Missing wallet uniqueness

`wallet_accounts` had no uniqueness guard, allowing duplicate wallets for the same
owner/currency and therefore split balances.

### 2.5 Dead indexes (informational, not removed)

Five zero-scan indexes on `auth_event_log` and `verification_event_log` (~350 kB total).
Retained: they back admin forensic queries that run rarely but must not table-scan.

---

## 3. Repairs applied

Migration: *Platform database architecture repair*.

1. **22 foreign keys added** with deliberate delete semantics:
   - `CASCADE` where the child is meaningless without the parent — `vehicle_geofences`,
     `telemetry_shadow_log`, `expiry_notifications`, `referee_verifications`,
     `application_pipeline_events`, `agreement_signature_audit`, `tour_step_config_audit`,
     `tax_line_items.payment_id`.
   - `SET NULL` where the child is an independent financial or audit record that must
     survive its parent — `payments.vehicle_id`, `owner_earnings.vehicle_id`,
     `legal_agreements.vehicle_id`, `paypal_transactions.vehicle_id`,
     `payment_defaults.vehicle_id`, `document_export_audit.vehicle_id`, IoT SIM links,
     rental links on call-ins and behaviour logs.
   Financial history is never destroyed by a vehicle deletion.
2. **113 indexes created** — every previously unindexed FK plus the newly constrained
   columns. Post-repair: **170 foreign keys, 0 unindexed**.
3. **4 `updated_at` triggers** wired to the shared `update_updated_at_column()` function.
4. **Composite unique index** `uniq_wallet_accounts_user_type_currency`. Note: the initial
   attempt at a plain `UNIQUE(user_id)` was **rejected by the database** because the
   platform treasury legitimately holds several sentinel wallets under
   `00000000-0000-0000-0000-000000000000`, one per account type/currency. The constraint was
   corrected to the composite key rather than forcing the data to fit.

All statements are idempotent (`IF NOT EXISTS` / existence-checked `DO` blocks) and were
applied only after proving zero orphaned rows, so **no application code required changes**
and no existing row was rewritten.

---

## 4. Verification

```
foreign keys ............ 148 -> 170
unindexed foreign keys ... 93 -> 0
indexes .................. 582 total
tables without PK ........ 0
tables without RLS ....... 0
orphan rows created ...... 0 (constraints validated on existing data)
```

The security linter reports 94 warnings, unchanged by this migration — they are the
pre-existing, reviewed `SECURITY DEFINER` and public-extension advisories tracked in the
August security audit, not new findings.

---

## 5. Remaining recommendations (not implemented — require product decisions)

| Area | Recommendation | Why deferred |
| --- | --- | --- |
| Partitioning | Range-partition `mqtt_telemetry_logs`, `telemetry_shadow_log`, `messaging_events`, `unified_message_log` by month | Only worthwhile past ~10M rows; requires a maintenance window and a partition-creation cron |
| Retention | Define TTLs for telemetry, `rate_limit_log`, `auth_event_log`, `email_*` analytics | Retention periods are a legal/compliance decision per region |
| Soft delete | No consistent `deleted_at` convention; deletes are hard across the schema | Introducing it changes RLS semantics on every table — needs a deliberate rollout |
| Views | Zero views/materialized views exist; admin dashboards re-derive KPIs client-side | Candidate: materialized owner-earnings and treasury rollups refreshed on settlement |
| Full-text search | Admin user/vehicle search uses `ILIKE` | A `tsvector` column + GIN index on `profiles`/`vehicles` would scale better |
| `auth.users` FKs | ~80 `user_id` columns cannot be constrained | Platform limitation; integrity is enforced by triggers and RLS instead |

---

## 6. Residual risk

- Deleting a vehicle now nulls the vehicle reference on historical payments rather than
  blocking; downstream reporting that groups by `vehicle_id` should treat `NULL` as
  "vehicle removed".
- No partitioning means telemetry tables will eventually dominate disk and vacuum time.
- Hard deletes remain irreversible outside of point-in-time recovery.
