// Deno tests for the generate-daily-tasks auth surface.
// Covers three code paths of the entry check:
//   1) valid CRON_SECRET header -> allowed
//   2) service-role Bearer token -> allowed
//   3) authenticated admin JWT (Bearer) -> allowed via isCallerAdmin
// and their negative counterparts.
//
// Run with: deno test --allow-env supabase/functions/generate-daily-tasks/index.test.ts
import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { isCallerAdmin } from "../_shared/admin-auth.ts";

const CRON_SECRET = "test-cron-secret";
const SERVICE_KEY = "test-service-role-key";

function setEnv() {
  Deno.env.set("CRON_SECRET", CRON_SECRET);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
}

Deno.test("requireCronSecret: allows valid x-cron-secret header", () => {
  setEnv();
  const req = new Request("http://x", {
    headers: { "x-cron-secret": CRON_SECRET },
  });
  assertEquals(requireCronSecret(req), null);
});

Deno.test("requireCronSecret: allows service-role Bearer token", () => {
  setEnv();
  const req = new Request("http://x", {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
  });
  assertEquals(requireCronSecret(req), null);
});

Deno.test("requireCronSecret: rejects missing/invalid secret", async () => {
  setEnv();
  const req = new Request("http://x", {
    headers: { Authorization: "Bearer some-user-jwt" },
  });
  const res = requireCronSecret(req);
  assert(res !== null, "expected 401 Response");
  assertEquals(res!.status, 401);
  await res!.text();
});

Deno.test("isCallerAdmin: allows authenticated admin JWT", async () => {
  const req = new Request("http://x", {
    headers: { Authorization: "Bearer valid-admin-jwt" },
  });
  const ok = await isCallerAdmin(req, {
    getUser: async (token) => {
      assertEquals(token, "valid-admin-jwt");
      return { userId: "admin-user-id" };
    },
    hasAdminRole: async (userId) => userId === "admin-user-id",
  });
  assertEquals(ok, true);
});

Deno.test("isCallerAdmin: rejects non-admin JWT", async () => {
  const req = new Request("http://x", {
    headers: { Authorization: "Bearer driver-jwt" },
  });
  const ok = await isCallerAdmin(req, {
    getUser: async () => ({ userId: "driver-user-id" }),
    hasAdminRole: async () => false,
  });
  assertEquals(ok, false);
});

Deno.test("isCallerAdmin: rejects missing Bearer token", async () => {
  const req = new Request("http://x");
  const ok = await isCallerAdmin(req, {
    getUser: async () => ({ userId: "should-not-be-called" }),
    hasAdminRole: async () => true,
  });
  assertEquals(ok, false);
});

Deno.test("isCallerAdmin: rejects when token fails to resolve to a user", async () => {
  const req = new Request("http://x", {
    headers: { Authorization: "Bearer expired-jwt" },
  });
  const ok = await isCallerAdmin(req, {
    getUser: async () => ({ userId: null }),
    hasAdminRole: async () => true,
  });
  assertEquals(ok, false);
});

// End-to-end auth gate: mirrors the entry logic in
// generate-daily-tasks/index.ts. Either cron OR admin should pass; neither
// should be rejected.
async function isAuthorized(req: Request, deps: {
  getUser: (t: string) => Promise<{ userId: string | null }>;
  hasAdminRole: (id: string) => Promise<boolean>;
}) {
  const cronDenied = requireCronSecret(req);
  if (!cronDenied) return true;
  await cronDenied.text();
  return await isCallerAdmin(req, deps);
}

Deno.test("entry gate: cron secret allowed", async () => {
  setEnv();
  const req = new Request("http://x", {
    headers: { "x-cron-secret": CRON_SECRET },
  });
  assertEquals(
    await isAuthorized(req, {
      getUser: async () => ({ userId: null }),
      hasAdminRole: async () => false,
    }),
    true,
  );
});

Deno.test("entry gate: admin JWT allowed", async () => {
  setEnv();
  const req = new Request("http://x", {
    headers: { Authorization: "Bearer admin-jwt" },
  });
  assertEquals(
    await isAuthorized(req, {
      getUser: async () => ({ userId: "admin" }),
      hasAdminRole: async () => true,
    }),
    true,
  );
});

Deno.test("entry gate: random Bearer rejected", async () => {
  setEnv();
  const req = new Request("http://x", {
    headers: { Authorization: "Bearer someone-else" },
  });
  assertEquals(
    await isAuthorized(req, {
      getUser: async () => ({ userId: "driver" }),
      hasAdminRole: async () => false,
    }),
    false,
  );
});
