import assert from "node:assert/strict";
import test from "node:test";
import { hasFullAdministratorRole } from "../../../../supabase/functions/_shared/sarekon-auth";
import { isTrustedInternalRequest } from "../../../../supabase/functions/_shared/internal-auth";
import {
  AccessDenied,
  enforceFunctionAccess,
  getFunctionAccessLevel,
} from "../functionAccessPolicy";
import type { AuthContext } from "../fileUploadService";

const callers: Record<string, AuthContext> = {
  "driver-user": {
    userId: "driver-1",
    email: "driver@example.test",
    role: "driver",
    roles: ["driver"],
    isAdmin: false,
    assuranceLevel: "aal1",
  },
  "vehicle-owner": {
    userId: "owner-1",
    email: "owner@example.test",
    role: "owner",
    roles: ["owner"],
    isAdmin: false,
    assuranceLevel: "aal2",
  },
  "fleet-admin": {
    userId: "admin-1",
    email: "admin@example.test",
    role: "admin",
    roles: ["admin"],
    isAdmin: true,
    assuranceLevel: "aal2",
  },
};

const authenticate = async (authorization: string): Promise<AuthContext> => {
  const caller = callers[authorization];
  if (caller) return caller;
  const error = new Error("Invalid test session") as Error & { statusCode: number };
  error.statusCode = 401;
  throw error;
};

test("Sarekon administrator role excludes support and ordinary users", () => {
  assert.equal(hasFullAdministratorRole([{ role: "admin" }]), true);
  assert.equal(hasFullAdministratorRole([{ role: "iot_support" }]), false);
  assert.equal(hasFullAdministratorRole([{ role: "owner" }]), false);
  assert.equal(hasFullAdministratorRole(null), false);
});

test("gateway blocks unauthenticated, driver, owner, and forged-vehicle Sarekon access", async () => {
  assert.equal(getFunctionAccessLevel("sarekon-admin"), "admin");
  await assert.rejects(
    enforceFunctionAccess("sarekon-admin", {}, authenticate),
    (error: unknown) => error instanceof AccessDenied && error.statusCode === 401,
  );
  for (const authorization of ["driver-user", "vehicle-owner"]) {
    await assert.rejects(
      enforceFunctionAccess(
        "sarekon-admin",
        { authorization, "x-vehicle-id": "vehicle-owned-by-someone-else" },
        authenticate,
      ),
      (error: unknown) => error instanceof AccessDenied && error.statusCode === 403,
    );
  }
  assert.equal(
    (await enforceFunctionAccess("sarekon-admin", { authorization: "fleet-admin" }, authenticate))
      .caller?.userId,
    "admin-1",
  );
});

test("all Sarekon resynchronization aliases require an administrator", async () => {
  const aliases = [
    "sarekon-resync-device",
    "sarekon-sync-device-imei",
    "resync-device-imei",
    "force-resync-sarekon-device",
  ];
  for (const name of aliases) {
    assert.equal(getFunctionAccessLevel(name), "admin");
    await assert.rejects(
      enforceFunctionAccess(name, { authorization: "vehicle-owner" }, authenticate),
      (error: unknown) => error instanceof AccessDenied && error.statusCode === 403,
    );
    assert.equal(
      (await enforceFunctionAccess(name, { authorization: "fleet-admin" }, authenticate))
        .caller?.userId,
      "admin-1",
    );
  }
});

test("Sarekon and telemetry internal operations accept only configured service identities", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  assert.equal(
    isTrustedInternalRequest(headers({ authorization: "Bearer service-key" }), "service-key", "cron-key"),
    true,
  );
  assert.equal(
    isTrustedInternalRequest(headers({ "x-cron-secret": "cron-key" }), "service-key", "cron-key"),
    true,
  );
  assert.equal(
    isTrustedInternalRequest(headers({ authorization: "Bearer user-jwt" }), "service-key", "cron-key"),
    false,
  );
  assert.equal(
    isTrustedInternalRequest(headers({ "x-cron-secret": "wrong" }), "service-key", "cron-key"),
    false,
  );
  assert.equal(isTrustedInternalRequest(headers({}), "", ""), false);
  assert.equal(getFunctionAccessLevel("telemetry-ingest"), "service");
  assert.equal(getFunctionAccessLevel("sarekon-location-worker"), "cron_or_admin");
});
