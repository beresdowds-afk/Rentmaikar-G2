import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const ENV_KEYS = [
  "NODE_ENV",
  "PORTAL_ADMIN_EMAIL",
  "PORTAL_ADMIN_PASSWORD",
  "PORTAL_MASTER_KEY",
  "PORTAL_SECRET_KEY",
  "PORTAL_DATA_DIR",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const ADMIN_EMAIL = "portal-admin@example.test";
const ADMIN_PASSWORD = "test-admin-password-A1";
const MASTER_KEY = "test-master-key-B2";
const SECRET_KEY = "test-portal-secret-C3";

let saved: Record<string, string | undefined>;
let dataDir: string;

async function loadService(env: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.PORTAL_DATA_DIR = dataDir;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }
  vi.resetModules();
  const mod = await import("../../../backend/src/services/portalAuth");
  return mod.portalAuthService;
}

describe("backend portal auth credentials", () => {
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-auth-"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const fullEnv = {
    PORTAL_ADMIN_EMAIL: ADMIN_EMAIL,
    PORTAL_ADMIN_PASSWORD: ADMIN_PASSWORD,
    PORTAL_MASTER_KEY: MASTER_KEY,
    PORTAL_SECRET_KEY: SECRET_KEY,
  };

  it("accepts the env-provided admin password", async () => {
    const svc = await loadService(fullEnv);
    const res = svc.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(res.success).toBe(true);
    expect(res.user?.role).toBe("admin");
    expect(svc.login(ADMIN_EMAIL, "wrong-password").success).toBe(false);
  });

  it("accepts the env-provided master key", async () => {
    const svc = await loadService(fullEnv);
    expect(svc.login(MASTER_KEY).success).toBe(true);
    expect(svc.login("someone", MASTER_KEY).success).toBe(true);
    expect(svc.login("not-the-key").success).toBe(false);
  });

  it("rejects defaults and empty values when env vars are unset", async () => {
    const svc = await loadService({ PORTAL_SECRET_KEY: SECRET_KEY });
    const guesses = ["", "admin", "password", "admin@rentmaikar.com", "master"];
    for (const g of guesses) {
      expect(svc.login(g, g).success).toBe(false);
      expect(svc.login(g).success).toBe(false);
      expect(svc.login("admin@rentmaikar.com", g).success).toBe(false);
    }
  });

  it("does not seed a password hash when PORTAL_ADMIN_PASSWORD is unset", async () => {
    const svc = await loadService({ PORTAL_SECRET_KEY: SECRET_KEY });
    expect(svc.login("admin@rentmaikar.com", "").success).toBe(false);
    const stored = svc.listUsers();
    expect(stored.every((u) => !("passwordHash" in u))).toBe(true);
  });

  it("fails startup in production without PORTAL_SECRET_KEY", async () => {
    await expect(
      loadService({ ...fullEnv, NODE_ENV: "production", PORTAL_SECRET_KEY: undefined })
    ).rejects.toThrow(/PORTAL_SECRET_KEY/);
  });

  it("starts in production with PORTAL_SECRET_KEY set", async () => {
    const svc = await loadService({ ...fullEnv, NODE_ENV: "production" });
    expect(svc.login(MASTER_KEY).success).toBe(true);
  });

  it("never uses the Supabase service role key as signing secret", async () => {
    const serviceKey = "service-role-key-should-not-sign";
    await expect(
      loadService({ NODE_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: serviceKey })
    ).rejects.toThrow(/PORTAL_SECRET_KEY/);

    const svc = await loadService({ ...fullEnv, PORTAL_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: serviceKey });
    const token = svc.createSessionToken({ userId: "u", email: "a@b.c", name: "n", role: "admin" });
    const [prefix, encoded, signature] = token.split(".");
    const forged = (await import("crypto")).createHmac("sha256", serviceKey).update(encoded).digest("base64url");
    expect(prefix).toBe("rm_portal");
    expect(signature).not.toBe(forged);
  });
});
