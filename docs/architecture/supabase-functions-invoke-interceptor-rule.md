# Rentmaikar Rule — "supabase.functions.invoke(...)" Catch-All Interceptor Verification

## Mandatory Rule

Whenever an audit, migration, refactor, production-readiness review, or code inspection finds:

```typescript
supabase.functions.invoke(...)
```

**DO NOT** automatically migrate, remove, or classify the call as a production blocker.

First, verify whether the call is already handled by the catch-all interceptor / backend adapter.

---

## Required Inspection Sequence

For every `supabase.functions.invoke(...)` occurrence:

1. **Identify the exact function being invoked.**
   - Function name
   - Arguments/body
   - HTTP method, if applicable
   - Relevant headers/authentication

2. **Locate the catch-all interceptor / adapter.**

3. **Trace the invocation through the adapter.**
   Determine whether the specific function is:
   - explicitly mapped;
   - covered by a catch-all rule;
   - transformed/adapted;
   - forwarded to the authoritative backend; or
   - bypassing the adapter entirely.

4. **Determine the actual runtime destination.**
   Establish whether the request ultimately reaches:
   - `rentmaikar-g2` public operational gateway;
   - `rentmaikar-backend`;
   - `staging.rentmaikar.com`;
   - Supabase Edge Functions directly; or
   - another unintended/legacy endpoint.

5. **Verify request preservation.**
   Confirm that the adapter correctly preserves or reconstructs:
   - authentication;
   - Authorization headers;
   - API keys where required;
   - request body;
   - HTTP method;
   - content type;
   - query parameters;
   - response body;
   - HTTP status;
   - error information;
   - timeout/retry behavior.

6. **Check for bypass paths.**
   Search for equivalent direct routes such as:
   ```text
   fetch(...)
   https://*.supabase.co/functions/v1/...
   /functions/v1/...
   /api/functions/...
   ```
   Also inspect legacy fallback logic that may bypass the authoritative gateway.

7. **Classify the result.**
   Use one of these classifications:
   - **ADAPTER COVERED** — the existing catch-all correctly intercepts and routes the call.
   - **ADAPTER COVERED — HARDEN** — interception exists, but routing/error/auth/transport handling needs improvement.
   - **NOT COVERED — MIGRATE** — the call bypasses the adapter and must be moved to the authoritative backend path.
   - **INTENTIONALLY DIRECT** — direct Supabase invocation is deliberately required and documented.
   - **UNRESOLVED** — source inspection is insufficient; do not guess.

---

## Production-Audit Principle

> «The presence of `supabase.functions.invoke(...)` alone is NOT evidence that a frontend call is bypassing the backend architecture.»

The actual runtime path must be established before recommending a migration.

---

## Required Audit Output

Every occurrence should be reported using this structure:

| File | Function | Adapter Match | Runtime Destination | Auth Preserved | Request/Response Preserved | Classification | Required Action |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- | :--- |
| `"path/to/file.tsx"` | `"function-name"` | ✅/❌ | Verified destination | ✅/❌ | ✅/❌ | Classification | Action |

---

## No Unnecessary Migration

If the catch-all interceptor already handles the invocation correctly:

**Do not rewrite the frontend merely to replace `supabase.functions.invoke(...)` with another syntax.**

Instead, strengthen the interceptor/adapter if necessary.

---

## Security Requirement

Never weaken:
- Supabase Auth;
- JWT validation;
- role checks;
- RLS;
- function authorization;
- verification flows;
- backend authentication;
- audit logging.

The objective is to establish a single authoritative operational backend path, not to remove security controls or merely eliminate a particular API syntax.

---

## Rentmaikar Architectural Target

The preferred operational path is:

```text
Public Frontend
      ↓
rentmaikar-g2
      ↓
rentmaikar-backend
      ↓
Supabase / Resend / SENT.dm / Twilio / Other Services
```

Therefore, the audit question is not:

> «"Does this file contain `supabase.functions.invoke()`?"»

The audit question is:

> «"Where does this invocation actually go at runtime, and is that route correctly controlled by the authoritative backend adapter?"»
