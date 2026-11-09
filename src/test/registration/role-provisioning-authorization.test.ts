import { describe, expect, it } from "vitest";
import { canProvisionUserAccount } from "../../../backend/src/services/roleProvisioningAuthorization";

describe("role provisioning authorization", () => {
  const staffRoles = [
    "admin", "admin_assistant", "legal_support", "iot_support",
    "vehicle_support", "insurance_support",
  ];

  it.each(staffRoles)("permits an administrator to provision %s", (role) => {
    expect(canProvisionUserAccount({ userId: "admin-1", roles: ["admin"] }, "user-2", role)).toBe(true);
  });

  it.each(staffRoles)("rejects an applicant attempting to self-provision %s", (role) => {
    expect(canProvisionUserAccount({ userId: "user-1", roles: ["driver"] }, "user-1", role)).toBe(false);
  });

  it.each(staffRoles.filter((role) => role !== "admin"))(
    "rejects %s attempting to upgrade another user",
    (role) => {
      expect(canProvisionUserAccount({ userId: "staff-1", roles: [role] }, "user-2", "admin")).toBe(false);
    },
  );

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

  it("rejects the nonexistent customer account role", () => {
    expect(canProvisionUserAccount({ userId: "admin-1", roles: ["admin"] }, "user-2", "customer")).toBe(false);
  });
});
