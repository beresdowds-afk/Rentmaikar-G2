import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  AccessDenied,
  enforceFunctionAccess,
  getFunctionAccessLevel,
  isResourceParticipant,
  isResourceOwner,
} from "../functionAccessPolicy";
import type { AuthContext } from "../fileUploadService";
import { validateSupabaseJwtClaims } from "../fileUploadService";
import {
  assertProviderAllowed,
  PaymentAuthorityError,
} from "../paymentAuthority";
import { limitJsonPayload, rateLimit } from "../requestGuards";
import { isValidKey, SupabaseBackendService } from "../supabaseService";

const user: AuthContext = {
  userId: "driver-1",
  email: "driver@example.test",
  role: "driver",
  roles: ["driver"],
  isAdmin: false,
};
const admin: AuthContext = {
  userId: "admin-1",
  email: "admin@example.test",
  role: "admin",
  roles: ["admin"],
  isAdmin: true,
};
const originalEnv = {
  internalSecret: process.env.RENTMAIKAR_INTERNAL_SERVICE_SECRET,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  anonKey: process.env.SUPABASE_ANON_KEY,
};

const authenticate = async (authorization: string): Promise<AuthContext> => {
  if (authorization === "Bearer valid-user") return user;
  if (authorization === "Bearer valid-admin") return admin;
  const error = new Error("Invalid authentication session") as Error & {
    statusCode: number;
  };
  error.statusCode = 401;
  throw error;
};

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

afterEach(() => {
  for (const [key, value] of [
    ["RENTMAIKAR_INTERNAL_SERVICE_SECRET", originalEnv.internalSecret],
    ["SUPABASE_SERVICE_ROLE_KEY", originalEnv.serviceRoleKey],
    ["SUPABASE_ANON_KEY", originalEnv.anonKey],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("JWT claim validation requires issuer, audience, expiry, and subject", () => {
  const now = 1_800_000_000;
  const valid = makeJwt({
    iss: "https://project.supabase.co/auth/v1",
    aud: "authenticated",
    sub: "driver-1",
    exp: now + 60,
  });
  assert.equal(
    validateSupabaseJwtClaims(valid, "https://project.supabase.co/auth/v1", now)
      .subject,
    "driver-1",
  );
  for (const claims of [
    {
      iss: "https://attacker.invalid/auth/v1",
      aud: "authenticated",
      sub: "driver-1",
      exp: now + 60,
    },
    {
      iss: "https://project.supabase.co/auth/v1",
      aud: "anon",
      sub: "driver-1",
      exp: now + 60,
    },
    {
      iss: "https://project.supabase.co/auth/v1",
      aud: "authenticated",
      sub: "driver-1",
      exp: now - 1,
    },
    {
      iss: "https://project.supabase.co/auth/v1",
      aud: "authenticated",
      exp: now + 60,
    },
  ]) {
    assert.throws(() =>
      validateSupabaseJwtClaims(
        makeJwt(claims),
        "https://project.supabase.co/auth/v1",
        now,
      ),
    );
  }
});

test("missing, invalid, and expired sessions are rejected before function access", async () => {
  for (const authorization of ["", "Bearer invalid", "Bearer expired"]) {
    await assert.rejects(
      enforceFunctionAccess(
        "create-paypal-order",
        { authorization },
        authenticate,
      ),
      (error: unknown) =>
        error instanceof AccessDenied && error.statusCode === 401,
    );
  }
});

test("identity is resolved from the verified session, not a caller-supplied user id", async () => {
  const decision = await enforceFunctionAccess(
    "create-paypal-order",
    { authorization: "Bearer valid-user", "x-user-id": "attacker-1" },
    authenticate,
  );
  assert.equal(decision.caller?.userId, "driver-1");
});

test("role policy denies ordinary users from administration and permits authorized roles", async () => {
  await assert.rejects(
    enforceFunctionAccess(
      "sarekon-admin",
      { authorization: "Bearer valid-user" },
      authenticate,
    ),
    (error: unknown) =>
      error instanceof AccessDenied && error.statusCode === 403,
  );
  assert.equal(
    (
      await enforceFunctionAccess(
        "sarekon-admin",
        { authorization: "Bearer valid-admin" },
        authenticate,
      )
    ).caller?.userId,
    "admin-1",
  );
  assert.equal(
    (
      await enforceFunctionAccess(
        "create-paypal-order",
        { authorization: "Bearer valid-user" },
        authenticate,
      )
    ).caller?.userId,
    "driver-1",
  );
});

test("resource ownership denies cross-user access", () => {
  assert.equal(isResourceOwner(user, "driver-1"), true);
  assert.equal(isResourceOwner(user, "driver-2"), false);
  assert.equal(isResourceOwner(admin, "driver-2"), true);
});

test("inspection access is limited to the recorded driver or vehicle owner", async () => {
  const decision = await enforceFunctionAccess(
    "get-inspection-findings",
    { authorization: "Bearer valid-user" },
    authenticate,
  );
  assert.equal(decision.caller?.userId, "driver-1");
  assert.equal(isResourceParticipant(user, "driver-1", "owner-1"), true);
  assert.equal(isResourceParticipant(user, "driver-2", "owner-2"), false);
  assert.equal(
    isResourceParticipant(
      { ...user, userId: "owner-1", role: "owner", roles: ["owner"] },
      "driver-2",
      "owner-1",
    ),
    true,
  );
});

test("unknown function names are denied and function policies are exact", async () => {
  assert.equal(getFunctionAccessLevel("not-a-real-function"), undefined);
  await assert.rejects(
    enforceFunctionAccess("not-a-real-function", {}, authenticate),
    (error: unknown) =>
      error instanceof AccessDenied && error.statusCode === 404,
  );
});

test("internal functions require the dedicated service identity", async () => {
  process.env.RENTMAIKAR_INTERNAL_SERVICE_SECRET = "internal-secret";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  await assert.rejects(
    enforceFunctionAccess(
      "telemetry-ingest",
      { authorization: "Bearer valid-admin" },
      authenticate,
    ),
    (error: unknown) =>
      error instanceof AccessDenied && error.statusCode === 401,
  );
  assert.equal(
    (
      await enforceFunctionAccess(
        "telemetry-ingest",
        { "x-rentmaikar-internal-secret": "internal-secret" },
        authenticate,
      )
    ).via,
    "service",
  );
  assert.equal(
    (
      await enforceFunctionAccess(
        "telemetry-ingest",
        { authorization: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" },
        authenticate,
      )
    ).via,
    "service",
  );
});

test("regional payment policy rejects a provider from another region", () => {
  assert.throws(
    () => assertProviderAllowed("USA", "opay"),
    (error: unknown) =>
      error instanceof PaymentAuthorityError && error.status === 422,
  );
  assert.throws(
    () => assertProviderAllowed("NIGERIA", "paypal"),
    (error: unknown) =>
      error instanceof PaymentAuthorityError && error.status === 422,
  );
});

test("bridge guards cap request payloads and rate-limit repeated calls", () => {
  const createRequest = () => ({
    ip: "192.0.2.1",
    socket: { remoteAddress: "192.0.2.1" },
    baseUrl: "/api/functions",
    path: "/test",
    headers: {},
    body: {},
  });
  const createResponse = () => ({
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  });

  const payloadReq = createRequest();
  payloadReq.body = { data: "x".repeat(20) };
  const payloadRes = createResponse();
  let payloadPassed = false;
  limitJsonPayload(10)(payloadReq as never, payloadRes as never, () => {
    payloadPassed = true;
  });
  assert.equal(payloadRes.statusCode, 413);
  assert.equal(payloadPassed, false);

  const limiter = rateLimit(1, 60_000);
  const rateReq = createRequest();
  let firstCallPassed = false;
  limiter(rateReq as never, createResponse() as never, () => {
    firstCallPassed = true;
  });
  assert.equal(firstCallPassed, true);
  const rateRes = createResponse();
  let secondCallPassed = false;
  limiter(rateReq as never, rateRes as never, () => {
    secondCallPassed = true;
  });
  assert.equal(rateRes.statusCode, 429);
  assert.equal(secondCallPassed, false);
});

test("Edge Function dispatch does not fall back to service-role authorization", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-service-role-key";
  const service = new SupabaseBackendService();
  assert.notEqual(service.getApiKey(), process.env.SUPABASE_SERVICE_ROLE_KEY);
  const serviceRoleJwt = makeJwt({ role: "service_role", ref: "project" });
  assert.equal(isValidKey(serviceRoleJwt), false);
  process.env.SUPABASE_ANON_KEY = serviceRoleJwt;
  assert.notEqual(new SupabaseBackendService().getApiKey(), serviceRoleJwt);

  const missingCaller = await service.invokeEdgeFunction(
    "reconcile-settlements",
    {},
  );
  assert.equal(missingCaller.status, 401);
  const unauthorizedInternal = await service.invokeEdgeFunction(
    "reconcile-settlements",
    {},
    {
      internalService: true,
    },
  );
  assert.equal(unauthorizedInternal.status, 403);
  const unknown = await service.invokeEdgeFunction(
    "unknown-edge-name",
    {},
    {
      userToken: "Bearer valid-user",
    },
  );
  assert.equal(unknown.status, 404);

  const originalFetch = globalThis.fetch;
  let authorizationHeader: string | null = null;
  globalThis.fetch = async (_input, init) => {
    authorizationHeader = new Headers(init?.headers).get("Authorization");
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const internalCall = await service.invokeEdgeFunction(
      "telemetry-ingest",
      {},
      {
        internalService: true,
        userToken: "Bearer ordinary-user-token",
      },
    );
    assert.equal(internalCall.status, 200);
    assert.equal(authorizationHeader, "Bearer server-service-role-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
