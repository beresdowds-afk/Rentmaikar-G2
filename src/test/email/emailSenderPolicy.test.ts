import { describe, expect, it } from "vitest";
import {
  getConfiguredBusinessSender as getBackendSender,
  resolveBusinessReplyTo as resolveBackendReplyTo,
  resolveBusinessEmailSender as resolveBackendSender,
  validateApprovedBusinessSender as validateBackendSender,
} from "../../../backend/src/services/emailSenderPolicy";
import {
  getConfiguredBusinessSender as getAppSender,
  resolveBusinessReplyTo as resolveAppReplyTo,
  resolveBusinessEmailSender as resolveAppSender,
  validateApprovedBusinessSender as validateAppSender,
} from "../../server/emailSenderPolicy";

const validEnvironment = {
  DEFAULT_BUSINESS_FROM: "Support@rentmaikar.com",
  APPROVED_BUSINESS_SENDERS: "support@rentmaikar.com,notifications@rentmaikar.com",
};

describe.each([
  ["Cloud Run", getBackendSender, resolveBackendSender, validateBackendSender],
  ["Node server", getAppSender, resolveAppSender, validateAppSender],
] as const)("%s sender policy", (_name, getSender, resolveSender, validateSender) => {
  it("accepts an allowlisted exact-domain sender and normalizes casing", () => {
    expect(getSender(validEnvironment)).toBe("RentMaikar <support@rentmaikar.com>");
    expect(validateSender("Support@RENTMAIKAR.COM", ["support@rentmaikar.com"]))
      .toBe("support@rentmaikar.com");
  });

  it("rejects unapproved local parts and non-exact domains", () => {
    for (const address of [
      "unapproved@rentmaikar.com",
      "support@notify.rentmaikar.com",
      "support@backend.rentmaikar.com",
      "support@staging.rentmaikar.com",
      "support@rentmaikar.com.attacker.example",
      "support@otherdomain.example",
    ]) {
      expect(() => validateSender(address, ["support@rentmaikar.com"])).toThrow();
    }
  });

  it("fails closed when configuration is missing, malformed, or not allowlisted", () => {
    expect(() => getSender({})).toThrow(/Outbound email is disabled/);
    expect(() => getSender({
      DEFAULT_BUSINESS_FROM: "support@notify.rentmaikar.com",
      APPROVED_BUSINESS_SENDERS: "support@notify.rentmaikar.com",
    })).toThrow(/exact rentmaikar\.com domain/);
    expect(() => getSender({
      DEFAULT_BUSINESS_FROM: "support@rentmaikar.com",
      APPROVED_BUSINESS_SENDERS: "other@rentmaikar.com",
    })).toThrow(/allowlist/);
  });

  it("does not allow a caller-supplied sender to override the configured identity", () => {
    expect(resolveSender("attacker@example.com", validEnvironment))
      .toBe("RentMaikar <support@rentmaikar.com>");
    expect(resolveSender("noreply@notify.rentmaikar.com", validEnvironment))
      .toBe("RentMaikar <support@rentmaikar.com>");
  });
});

describe.each([
  ["Cloud Run", resolveBackendReplyTo],
  ["Node server", resolveAppReplyTo],
] as const)("%s Reply-To policy", (_name, resolveReplyTo) => {
  it("accepts only explicitly allowlisted exact-domain Reply-To addresses", () => {
    expect(resolveReplyTo("notifications@rentmaikar.com", validEnvironment))
      .toBe("notifications@rentmaikar.com");
    expect(resolveReplyTo(undefined, validEnvironment)).toBeUndefined();
    expect(resolveReplyTo("person@example.com", validEnvironment)).toBe("support@rentmaikar.com");
    expect(resolveReplyTo("support@notify.rentmaikar.com", validEnvironment)).toBe("support@rentmaikar.com");
  });
});
