import { describe, expect, it } from "vitest";
import { canProvisionUserAccount } from "../../../backend/src/services/roleProvisioningAuthorization";

describe("role provisioning authorization", () => {
  it.each(["driver", "owner"])("allows an authenticated user to self-provision %s", (role) => {
    expect(
      canProvisionUserAccount({ userId: "user-1", roles: [] }, "user-1", role),
    ).toBe(true);
  });

  it("does not allow an applicant to self-provision a staff role", () => {
    expect(
      canProvisionUserAccount({ userId: "user-1", roles: ["driver"] }, "user-1", "admin"),
    ).toBe(false);
  });

  it("does not treat an admin assistant as an unrestricted role administrator", () => {
    expect(
      canProvisionUserAccount(
        { userId: "assistant-1", roles: ["admin_assistant"] },
        "user-2",
        "admin",
      ),
    ).toBe(false);
  });

  it("allows an admin to provision a supported role for another account", () => {
    expect(
      canProvisionUserAccount({ userId: "admin-1", roles: ["admin"] }, "user-2", "owner"),
    ).toBe(true);
  });

  it("rejects unsupported roles even for an administrator", () => {
    expect(
      canProvisionUserAccount({ userId: "admin-1", roles: ["admin"] }, "user-2", "superuser"),
    ).toBe(false);
  });
});
