import { describe, it, expect } from "vitest";

// Replicate the pure credential resolution and URL cleaning logic from traccar-client
function cleanBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (url.endsWith("/api")) {
    url = url.slice(0, -4).replace(/\/+$/, "");
  }
  return url;
}

interface CredsConfig {
  overrides?: Record<string, string>;
  env?: Record<string, string>;
}

function resolveTraccarCreds(config: CredsConfig) {
  const overrides = config.overrides ?? {};
  const env = config.env ?? {};

  const rawBase =
    overrides.base_url ||
    overrides.api_url ||
    env.TRACCAR_BASE_URL ||
    env.TRACCAR_API_URL ||
    "";
  const base = cleanBaseUrl(rawBase);

  const token = (
    overrides.token ||
    overrides.api_token ||
    overrides.api_key ||
    env.TRACCAR_API_TOKEN ||
    env.TRACCAR_API_KEY ||
    env.TRACCAR_TOKEN ||
    ""
  ).trim();

  const email = (overrides.email || env.TRACCAR_EMAIL || "").trim();
  const password = (overrides.password || env.TRACCAR_PASSWORD || "").trim();
  const vapidKey = (overrides.vapid_key || env.TRACCAR_VAPID_KEY || "").trim();

  const missing: string[] = [];
  if (!base) missing.push("base_url");
  if (!token) {
    if (!email) missing.push("email");
    if (!password) missing.push("password");
  }

  const isConfigured = Boolean(base && (token || (email && password)));
  const authMode: "token" | "basic" | "none" = !isConfigured
    ? "none"
    : token
    ? "token"
    : "basic";

  return {
    base,
    token,
    email,
    password,
    vapidKey,
    missing,
    isConfigured,
    authMode,
  };
}

describe("Traccar Credentials & URL Resolution", () => {
  it("cleans trailing slashes and redundant /api path from base URL", () => {
    expect(cleanBaseUrl("https://traccar.example.com")).toBe(
      "https://traccar.example.com"
    );
    expect(cleanBaseUrl("https://traccar.example.com/")).toBe(
      "https://traccar.example.com"
    );
    expect(cleanBaseUrl("https://traccar.example.com/api")).toBe(
      "https://traccar.example.com"
    );
    expect(cleanBaseUrl("https://traccar.example.com/api/")).toBe(
      "https://traccar.example.com"
    );
    expect(cleanBaseUrl("  https://gps.rentmaikar.com/api///  ")).toBe(
      "https://gps.rentmaikar.com"
    );
  });

  it("resolves credentials with TRACCAR_API_TOKEN and TRACCAR_BASE_URL", () => {
    const creds = resolveTraccarCreds({
      env: {
        TRACCAR_BASE_URL: "https://demo.traccar.org",
        TRACCAR_API_TOKEN: "mock-jwt-token-12345",
      },
    });

    expect(creds.isConfigured).toBe(true);
    expect(creds.base).toBe("https://demo.traccar.org");
    expect(creds.token).toBe("mock-jwt-token-12345");
    expect(creds.authMode).toBe("token");
    expect(creds.missing).toEqual([]);
  });

  it("supports TRACCAR_API_KEY alias for API token", () => {
    const creds = resolveTraccarCreds({
      env: {
        TRACCAR_API_URL: "https://server.traccar.org/api",
        TRACCAR_API_KEY: "secret-key-xyz",
      },
    });

    expect(creds.isConfigured).toBe(true);
    expect(creds.base).toBe("https://server.traccar.org");
    expect(creds.token).toBe("secret-key-xyz");
    expect(creds.authMode).toBe("token");
  });

  it("supports Basic Auth when only email and password are provided", () => {
    const creds = resolveTraccarCreds({
      env: {
        TRACCAR_BASE_URL: "https://demo3.traccar.org",
        TRACCAR_EMAIL: "fleet@rentmaikar.com",
        TRACCAR_PASSWORD: "secure-password-123",
      },
    });

    expect(creds.isConfigured).toBe(true);
    expect(creds.base).toBe("https://demo3.traccar.org");
    expect(creds.token).toBe("");
    expect(creds.email).toBe("fleet@rentmaikar.com");
    expect(creds.password).toBe("secure-password-123");
    expect(creds.authMode).toBe("basic");
    expect(creds.missing).toEqual([]);
  });

  it("supports vault/admin overrides with highest precedence", () => {
    const creds = resolveTraccarCreds({
      env: {
        TRACCAR_BASE_URL: "https://old.traccar.com",
        TRACCAR_API_TOKEN: "old-token",
      },
      overrides: {
        base_url: "https://new.traccar.com/api/",
        token: "rotated-vault-token-999",
        vapid_key: "vapid-public-key-abc",
      },
    });

    expect(creds.base).toBe("https://new.traccar.com");
    expect(creds.token).toBe("rotated-vault-token-999");
    expect(creds.vapidKey).toBe("vapid-public-key-abc");
    expect(creds.authMode).toBe("token");
  });

  it("correctly identifies missing credentials", () => {
    const emptyCreds = resolveTraccarCreds({ env: {} });
    expect(emptyCreds.isConfigured).toBe(false);
    expect(emptyCreds.missing).toContain("base_url");
    expect(emptyCreds.missing).toContain("email");
    expect(emptyCreds.missing).toContain("password");

    const partialCreds = resolveTraccarCreds({
      env: {
        TRACCAR_BASE_URL: "https://demo.traccar.org",
        TRACCAR_EMAIL: "admin@example.com",
      },
    });
    expect(partialCreds.isConfigured).toBe(false);
    expect(partialCreds.missing).toEqual(["password"]);
  });
});
