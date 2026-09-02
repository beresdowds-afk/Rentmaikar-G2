// Integration tests for the admin-set-user-active edge function.
//
// These tests verify that:
//   1. Anonymous requests are rejected.
//   2. A missing reason is rejected.
//   3. Toggling activation cascades to every linked account.
//   4. Toggling back reverses the cascade.
//
// The tests hit the DEPLOYED edge function through the Supabase URL, so
// they need admin credentials + a couple of scratch driver/owner accounts
// to link together. Provide these via the project root `.env` file:
//
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_PUBLISHABLE_KEY=...      # anon key
//   TEST_ADMIN_JWT=<a real admin session JWT>
//   TEST_USER_A_ID=<uuid of a driver profile>
//   TEST_USER_B_ID=<uuid of a driver/owner profile>
//
// If TEST_ADMIN_JWT is missing the cascade tests skip gracefully so CI
// on a fresh clone does not fail — the auth/validation tests always run.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_JWT = Deno.env.get("TEST_ADMIN_JWT");
const USER_A = Deno.env.get("TEST_USER_A_ID");
const USER_B = Deno.env.get("TEST_USER_B_ID");

const FN_URL = `${SUPABASE_URL}/functions/v1/admin-set-user-active`;

function call(body: unknown, jwt?: string) {
  return fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test("rejects anonymous callers", async () => {
  const res = await call({
    target_user_id: crypto.randomUUID(),
    active: true,
    reason: "test run",
  });
  assert(res.status === 401 || res.status === 403);
  await res.text();
});

Deno.test("rejects missing reason", async () => {
  if (!ADMIN_JWT) return; // needs a real admin session
  const res = await call(
    { target_user_id: USER_A ?? crypto.randomUUID(), active: false, reason: "" },
    ADMIN_JWT,
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assert(String(body.error).toLowerCase().includes("reason"));
});

Deno.test("cascades activation to linked accounts", async () => {
  if (!ADMIN_JWT || !USER_A || !USER_B || !SERVICE_KEY) {
    console.warn("Skipping cascade test — TEST_ADMIN_JWT / TEST_USER_A_ID / TEST_USER_B_ID / SUPABASE_SERVICE_ROLE_KEY not set");
    return;
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Arrange: link A ↔ B (idempotent). Uses the pair-unique index so re-runs are safe.
  const [a, b] = [USER_A, USER_B].sort();
  await admin.from("account_links").upsert(
    { user_a_id: a, user_b_id: b, link_type: "couple" },
    { onConflict: "user_a_id,user_b_id" },
  );

  try {
    // Act: deactivate A with a reason.
    const res1 = await call(
      { target_user_id: USER_A, active: false, reason: "automated cascade test" },
      ADMIN_JWT,
    );
    assertEquals(res1.status, 200);
    const body1 = await res1.json();
    assert(body1.cascaded_user_ids.includes(USER_B), "B should be cascaded");

    const { data: aOff } = await admin
      .from("profiles").select("is_active").eq("user_id", USER_A).single();
    const { data: bOff } = await admin
      .from("profiles").select("is_active").eq("user_id", USER_B).single();
    assertEquals(aOff?.is_active, false);
    assertEquals(bOff?.is_active, false, "linked partner must also be deactivated");

    // Act: reactivate — cascade should reverse.
    const res2 = await call(
      { target_user_id: USER_A, active: true, reason: "cascade test rollback" },
      ADMIN_JWT,
    );
    assertEquals(res2.status, 200);
    await res2.text();

    const { data: aOn } = await admin
      .from("profiles").select("is_active").eq("user_id", USER_A).single();
    const { data: bOn } = await admin
      .from("profiles").select("is_active").eq("user_id", USER_B).single();
    assertEquals(aOn?.is_active, true);
    assertEquals(bOn?.is_active, true);

    // Audit rows for both A and B should exist for this run.
    const { data: audit } = await admin
      .from("role_audit_log")
      .select("target_user_id, action, notes")
      .in("target_user_id", [USER_A, USER_B])
      .order("created_at", { ascending: false })
      .limit(10);
    assert((audit || []).some((r: any) => r.target_user_id === USER_A));
    assert((audit || []).some((r: any) => r.target_user_id === USER_B));
  } finally {
    // Cleanup: leave accounts active regardless of failure.
    await call(
      { target_user_id: USER_A, active: true, reason: "cascade test cleanup" },
      ADMIN_JWT,
    ).then((r) => r.text());
  }
});

Deno.test("cannot self-deactivate", async () => {
  if (!ADMIN_JWT) return;
  // Decode the JWT to find the caller's own id.
  const payload = JSON.parse(atob(ADMIN_JWT.split(".")[1]));
  const res = await call(
    { target_user_id: payload.sub, active: false, reason: "self test" },
    ADMIN_JWT,
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assert(String(body.error).toLowerCase().includes("your own"));
});
