import { describe, expect, it } from "vitest";
import { buildBackendApiUrl, normalizeBackendApiBase } from "./backend-bridge";

describe("normalizeBackendApiBase", () => {
  it("uses the configured API base and removes trailing slashes", () => {
    expect(
      normalizeBackendApiBase(" https://staging.rentmaikar.com/api/// ", "https://gateway.example/api"),
    ).toBe("https://staging.rentmaikar.com/api");
  });

  it("uses the existing gateway when no API base is configured", () => {
    expect(normalizeBackendApiBase(undefined, "https://gateway.example/api")).toBe(
      "https://gateway.example/api",
    );
  });

  it("treats an empty API base as unconfigured", () => {
    expect(normalizeBackendApiBase("  ", "https://gateway.example/api")).toBe(
      "https://gateway.example/api",
    );
  });
});

describe("buildBackendApiUrl", () => {
  it("does not duplicate the /api prefix when callers include it", () => {
    expect(buildBackendApiUrl("https://staging.rentmaikar.com/api", "/api/portal/auth/login")).toBe(
      "https://staging.rentmaikar.com/api/portal/auth/login",
    );
  });

  it("adds a relative endpoint to a configured API base", () => {
    expect(buildBackendApiUrl("https://staging.rentmaikar.com/api/", "portal/auth/login")).toBe(
      "https://staging.rentmaikar.com/api/portal/auth/login",
    );
  });

  it("preserves an endpoint prefix when the base is only an origin", () => {
    expect(buildBackendApiUrl("https://backend.example", "/api/health")).toBe(
      "https://backend.example/api/health",
    );
  });
});
