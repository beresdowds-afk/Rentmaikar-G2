import { describe, expect, it } from "vitest";
import {
  findMissingPortalVars,
  findPortalNames,
  findSensitiveNames,
  findSensitiveViteNames,
  runChecks,
} from "../../scripts/check-env-surfaces";

describe("check-env-surfaces detection", () => {
  it("flags sensitive variable names", () => {
    expect(findSensitiveNames("ENV PORTAL_MASTER_KEY=x\nSUPABASE_SERVICE_ROLE_KEY")).toEqual([
      "PORTAL_MASTER_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    expect(findSensitiveNames("PAYSTACK_SECRET_KEY VAPID_PRIVATE_KEY")).toHaveLength(2);
  });

  it("allows publishable variable names", () => {
    expect(findSensitiveNames("VITE_SUPABASE_PUBLISHABLE_KEY BACKEND_URL")).toEqual([]);
  });

  it("flags sensitive VITE_ names only", () => {
    expect(findSensitiveViteNames("import.meta.env.VITE_ADMIN_SECRET")).toEqual(["VITE_ADMIN_SECRET"]);
    expect(findSensitiveViteNames("import.meta.env.VITE_API_BASE_URL")).toEqual([]);
  });

  it("detects PORTAL_ names and missing admin vars", () => {
    expect(findPortalNames("PORTAL_SECRET_KEY=")).toEqual(["PORTAL_SECRET_KEY"]);
    expect(findMissingPortalVars("PORTAL_SECRET_KEY=\nPORTAL_MASTER_KEY=")).toEqual([
      "PORTAL_ADMIN_EMAIL",
      "PORTAL_ADMIN_PASSWORD",
    ]);
  });

  it("passes on the repository", () => {
    expect(runChecks(process.cwd())).toEqual([]);
  });
});
