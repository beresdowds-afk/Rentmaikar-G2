# User Lifecycle Audit — Registration & Onboarding
Date: 2026-08-05
Scope (locked with user): existing roles only (`admin`, `admin_assistant`, `owner`, `driver`, `legal_support`, `iot_support`, `vehicle_support`); breakages only, no new capability.

---

## 1. Inventory of account-creation paths

| ID | Path | Entry point | Records created |
|----|------|-------------|-----------------|
| A | Generic signup tab | `src/pages/Auth.tsx:221-245` → `AuthContext.signUp` (`src/contexts/AuthContext.tsx:197-232`) | `auth.users`, `user_roles` (client-side insert), `profiles` via trigger. **No `applications`** |
| B | Owner marketing registration | `src/pages/OwnerRegistration.tsx:184-260` | `auth.users`, `applications`, `advance_registration_stage`. **No client-side `user_roles`** |
| C | Driver marketing registration | `src/pages/DriverRegistration.tsx:157-240` | same shape as B |
| D | Google OAuth | `src/components/auth/AlternativeAuthOptions.tsx`, errors handled in `Auth.tsx:90-113` | `auth.users` + trigger `profiles`/default role only. **No `applications`** |
| E | Admin "Create New User" | `src/components/admin/RoleManagement.tsx:244-266` → `admin-create-user` edge fn | server-side; does not create `applications` |
| F | Support-staff registration | `SupportUserManagement.tsx:149-221` | `auth.users`, `support_staff`, `user_roles` (plain insert) |
| G | Onboard existing user as support | `SupportUserManagement.tsx:224-304` | `support_staff`, `user_roles` (upsert) |

Backend chain: `on_auth_user_created` → `handle_new_user()` (upsert `profiles`, seed default role, insert `two_factor_settings`), plus redundant `create_2fa_settings_on_profile` → `auto_create_2fa_settings()`.

---

## 2. Confirmed defects, with exact failing conditions

### P0-1 — `handle_new_user()` swallows every error
`handle_new_user` wraps its whole body in `EXCEPTION WHEN OTHERS THEN RAISE WARNING; RETURN NEW`.
**Fails when:** any insert inside the trigger errors (RLS, constraint, enum mismatch, name-immutability guard). Signup returns HTTP 200, but the user has no `profiles`/`user_roles` row. The user then lands on a dashboard gate with "complete registration" and no way forward.
**Evidence:** 9 profiles currently exist with zero `user_roles` rows.

### P0-2 — `approve_application` role grant is not landing
`approve_application` inserts into `user_roles` with `ON CONFLICT DO NOTHING` and raises if `v_app.user_id IS NULL`.
**Fails when:** the application was created by a path that never linked `user_id` (paths B/C sign the user up separately; if `signUp` returns an existing/unconfirmed user the id can be missing), or when a role row was later revoked without re-grant.
**Evidence:** 6 approved applications whose applicant holds no role. Those users are approved but locked out of `/driver/dashboard` and `/owner/dashboard` by `DashboardAuthGate`.

### P0-3 — Path A produces a structurally different driver/owner
`Auth.tsx` signup writes `user_roles` directly and never creates an `applications` row.
**Fails when:** a user picks "driver" or "owner" on the generic `/auth` signup tab. `useRegistrationProgress` / `get_onboarding_next_step` derive stage from `applications`, so `PortalGate` shows a permanently 2/5-complete checklist whose "Continue onboarding" CTA points at a step the user can never satisfy.

### P0-4 — Google OAuth users get the seeded default role, no application
`handle_new_user` seeds `driver` when no role exists.
**Fails when:** an owner (or any staff member) signs in with Google first. They silently become a `driver`, are routed to `/driver/dashboard` by `ROLE_HOME`, and the real role later stacks on top rather than replacing it.
**Evidence:** 2 users currently hold stacked roles (`admin`+`driver`, `driver`+`admin_assistant`). There is no de-duplication anywhere.

### P1-5 — No wallet provisioning in the lifecycle
`wallet_accounts` is created only by the manual `ensure_wallet_account` RPC; neither `handle_new_user` nor `approve_application` calls it.
**Fails when:** an approved driver/owner reaches a payment or withdrawal surface. Ledger reads (`get_ledger_balance`, `get_owner_available_balance`) have no account row to resolve.
**Evidence:** 25/25 profiles have no wallet row.

### P1-6 — Two contradictory definitions of "fully onboarded"
`MarketplaceGate.tsx:32-34` requires `identity.is_verified`. `PortalGate.tsx:130` accepts `access_level === 'full' || stage === 'approved'` with no identity check.
**Fails when:** an admin sets `access_level = 'full'` via `grant_full_access` before Persona approval — portals unlock, marketplace stays blocked, with no explanation to the user.

### P1-7 — Opposite anonymous-user behaviour between gates
`MarketplaceGate.tsx:24` returns children for unauthenticated visitors; `PortalGate.tsx:122-123` fails every requirement for them.
**Fails when:** a signed-out visitor opens a marketplace route — content renders, then every data query 401s.

### P1-8 — Admin bypass differs per gate
`DashboardAuthGate.tsx:39` silently appends `admin` to `allowedRoles`; `ProtectedRoute.tsx:48-50` does not.
**Fails when:** an admin opens a route wrapped only in `ProtectedRoute` without `admin` in `allowedRoles` — they are bounced to `/admin` with no message.

### P1-9 — Support roles have no onboarding route
`ROLE_ONBOARDING` (`src/lib/role-home.ts:26-29`) defines only `driver` and `owner`. `PortalGate.nextStepPath()` (`PortalGate.tsx:83-84`) branches only on `owner` vs `driver`.
**Fails when:** any support role or `admin_assistant` hits a `PortalGate` — the CTA sends them to `/driver/onboarding`.

### P2-10 — Role-assignment logic duplicated four ways
`AuthContext.tsx:221-224` (plain insert, error only console-logged), `SupportUserManagement.tsx:193-201` (plain insert), `:278-285` (upsert), `:402-419` (delete + upsert).
**Fails when:** a user already holds a role and a plain-insert path runs — duplicate-key error, swallowed in path A.

### P2-11 — Duplicated "ensure auth user exists" blocks
`OwnerRegistration.tsx:187-216` and `DriverRegistration.tsx:160-189` are verbatim copies, as are four `roleMap` constants in `SupportUserManagement.tsx`. Drift risk only, no live break.

### P2-12 — No `auth.users` UPDATE trigger
Only `on_auth_user_created` (INSERT) exists.
**Fails when:** email or phone changes at the auth layer — `profiles` never syncs, so re-verification banners and messaging use the stale value.

### P2-13 — Dead-end "no role" screen
`DashboardAuthGate.tsx:102-107` tells the user to complete registration but renders no link. `ProtectedRoute` handles the same condition with a silent redirect.

---

## 3. Prioritized fix plan

**P0 — data integrity, users currently locked out**
1. Remove the blanket `EXCEPTION WHEN OTHERS` from `handle_new_user`; keep targeted handlers only for genuinely idempotent conflicts, and log failures to `auth_event_log` so signup surfaces a real error. (P0-1)
2. Add a single `SECURITY DEFINER` `provision_user_account(_user_id, _role)` RPC that idempotently ensures `profiles` + `user_roles` + `wallet_accounts`, and call it from `handle_new_user`, `approve_application`, `admin_create_staff_role`, and the `admin-create-user` edge function. (P0-1, P0-2, P1-5, P2-10)
3. Backfill: repair the 9 role-less profiles and the 6 approved-but-role-less applicants via the new RPC. (P0-1, P0-2)
4. Make path A create an `applications` row when the chosen role is `driver`/`owner`, or remove the role selector from the generic signup tab and route those users into `/driver/registration` / `/owner/registration`. (P0-3)
5. Stop seeding `driver` unconditionally in `handle_new_user`; seed only when signup metadata declares it, otherwise leave role-less and route to a role-selection step. Add a de-duplication rule so a privileged role supersedes a seeded `driver`. (P0-4)

**P1 — gating correctness**
6. Extract one `useOnboardingComplete()` predicate consumed by both `MarketplaceGate` and `PortalGate`, and make identity verification part of the shared definition. (P1-6)
7. Make `MarketplaceGate` redirect anonymous visitors to `/auth` like `PortalGate` does. (P1-7)
8. Move the admin bypass into `ProtectedRoute` so both gates behave identically. (P1-8)
9. Add `ROLE_ONBOARDING` entries plus a `nextStepPath` branch for the five non-driver/owner roles (their dashboard home is an acceptable target). (P1-9)

**P2 — hygiene**
10. Collapse the four role-assignment sites onto the new provisioning RPC; delete the duplicated `ensure auth user` blocks and `roleMap` constants. (P2-10, P2-11)
11. Add an `auth.users` UPDATE-side sync path for email/phone into `profiles` (via an edge function on the auth hook — direct triggers on the `auth` schema are not permitted). (P2-12)
12. Give the "no role" state in `DashboardAuthGate` a working CTA to the registration entry point. (P2-13)

---

## 4. Out of scope
Organizations, organization staff, fleet owners, designers, and customers do not exist in the `app_role` enum or schema; no repair work applies to them.
