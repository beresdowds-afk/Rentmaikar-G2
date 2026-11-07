import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateOtpVerifier,
  OtpService,
} from "../../../backend/src/services/phoneOtpService";
import { messagingBridge } from "../../../backend/src/services/messagingBridge";
import {
  getMfaSessionContext,
  getVerifiedMfaPhone,
  isMfaChallengeId,
  isMfaPhoneBound,
} from "../../../backend/src/services/mfaSecurity";
import { FUNCTION_ACCESS } from "../../../backend/src/services/functionAccessPolicy";

const { getDbPoolMock } = vi.hoisted(() => ({
  getDbPoolMock: vi.fn(),
}));

vi.mock("../../../backend/src/services/dbPool", () => ({
  getDbPool: getDbPoolMock,
}));

interface ChallengeRow {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  purpose: string;
  user_id: string;
  status: string;
  metadata: Record<string, unknown>;
}

function installChallenge(row: ChallengeRow) {
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id, code_hash")) {
        const [identity, purpose, challengeId, userId] = values;
        const matches =
          identity === "+18482035389" &&
          purpose === row.purpose &&
          (!challengeId || challengeId === row.id) &&
          (!userId || userId === row.user_id);
        return { rows: matches ? [{ ...row }] : [], rowCount: matches ? 1 : 0 };
      }
      if (sql.includes("SET attempts =")) {
        row.attempts = Number(values[0]);
        row.status = String(values[1]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SET consumed_at = NOW(), status = 'consumed'")) {
        if (row.consumed_at) return { rows: [], rowCount: 0 };
        row.consumed_at = new Date();
        row.status = "consumed";
        return { rows: [{ id: row.id }], rowCount: 1 };
      }
      throw new Error(`Unexpected OTP test query: ${sql}`);
    }),
    release: vi.fn(),
  };
  getDbPoolMock.mockReturnValue({ connect: async () => client });
  return client;
}

function createMfaChallenge(overrides: Partial<ChallengeRow> = {}) {
  const id = "3253df00-66ca-4ce8-84cf-2d33246ed6e0";
  const userId = "3651f931-c180-4521-9b44-2e47815bbca9";
  const sessionContext = "b".repeat(64);
  const code = "123456";
  const row: ChallengeRow = {
    id,
    code_hash: calculateOtpVerifier({
      otp: code,
      identity: "+18482035389",
      purpose: "mfa",
      challengeId: id,
    }),
    attempts: 0,
    expires_at: new Date(Date.now() + 300_000),
    consumed_at: null,
    purpose: "mfa",
    user_id: userId,
    status: "delivered",
    metadata: { session_context: sessionContext },
    ...overrides,
  };
  return { row, id, userId, sessionContext, code };
}

afterEach(() => {
  vi.restoreAllMocks();
  getDbPoolMock.mockReset();
  vi.unstubAllEnvs();
});

describe("MFA account and verified-phone binding", () => {
  it("requires the authenticated access policy for every MFA operation", () => {
    expect(FUNCTION_ACCESS["send-2fa-code"]).toBe("authenticated");
  });

  it("accepts only the account's verified profile phone", () => {
    const profile = { phone: "+18482035389", phone_verified: true };
    expect(getVerifiedMfaPhone(profile)).toBe("+18482035389");
    expect(getVerifiedMfaPhone(profile, "+1 (848) 203-5389")).toBe("+18482035389");
    expect(getVerifiedMfaPhone(profile, "+18482039999")).toBeNull();
    expect(getVerifiedMfaPhone({ ...profile, phone_verified: false })).toBeNull();
    expect(getVerifiedMfaPhone(null)).toBeNull();
  });

  it("rejects MFA settings attached to a different verified phone", () => {
    expect(isMfaPhoneBound(
      { is_enabled: true, phone_number: "+18482039999" },
      "+18482035389",
    )).toBe(false);
    expect(isMfaPhoneBound(
      { is_enabled: true, phone_number: "+1 (848) 203-5389" },
      "+18482035389",
    )).toBe(true);
  });

  it("extracts a session binding only from a Supabase session claim", () => {
    const sessionId = "3253df00-66ca-4ce8-84cf-2d33246ed6e0";
    const token = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url")}.signature`;
    expect(getMfaSessionContext(`Bearer ${token}`)).toMatch(/^[a-f0-9]{64}$/);
    expect(getMfaSessionContext("Bearer malformed")).toBeNull();
    expect(getMfaSessionContext(`Bearer header.${Buffer.from("{}").toString("base64url")}.signature`)).toBeNull();
  });

  it("requires a matching challenge ID, account, and session before consuming an OTP", async () => {
    vi.stubEnv("OTP_AUTH_SECRET", "test-mfa-binding-secret");
    const { row, id, userId, sessionContext, code } = createMfaChallenge();
    installChallenge(row);
    const service = new OtpService();

    const wrongAccount = await service.consumeChallenge({
      identity: "+18482035389",
      code,
      purpose: "mfa",
      challengeId: id,
      userId: "a1ef5bfc-0d8c-4980-a76f-5a7972886f09",
      sessionContext,
    });
    expect(wrongAccount.success).toBe(false);

    const wrongSession = await service.consumeChallenge({
      identity: "+18482035389",
      code,
      purpose: "mfa",
      challengeId: id,
      userId,
      sessionContext: "c".repeat(64),
    });
    expect(wrongSession.success).toBe(false);

    const wrongChallenge = await service.consumeChallenge({
      identity: "+18482035389",
      code,
      purpose: "mfa",
      challengeId: "d25d4f8d-9721-45f4-93ec-59987c29875c",
      userId,
      sessionContext,
    });
    expect(wrongChallenge.success).toBe(false);
  });

  it("supports successful completion once, then rejects replay and expired challenges", async () => {
    vi.stubEnv("OTP_AUTH_SECRET", "test-mfa-binding-secret");
    const { row, id, userId, sessionContext, code } = createMfaChallenge();
    installChallenge(row);
    const service = new OtpService();
    const params = {
      identity: "+18482035389",
      code,
      purpose: "mfa" as const,
      challengeId: id,
      userId,
      sessionContext,
    };

    expect((await service.consumeChallenge(params)).success).toBe(true);
    expect((await service.consumeChallenge(params)).success).toBe(false);

    const expired = createMfaChallenge({
      id: "c9d8b113-627d-4c79-930c-fde45cc2f660",
      expires_at: new Date(Date.now() - 1),
    });
    expired.row.code_hash = calculateOtpVerifier({
      otp: expired.code,
      identity: "+18482035389",
      purpose: "mfa",
      challengeId: expired.id,
    });
    installChallenge(expired.row);
    const expiredResult = await service.consumeChallenge({
      identity: "+18482035389",
      code: expired.code,
      purpose: "mfa",
      challengeId: expired.row.id,
      userId: expired.userId,
      sessionContext: expired.sessionContext,
    });
    expect(expiredResult.success).toBe(false);
    expect(expiredResult.error).toContain("expired");
  });

  it("locks a challenge after five incorrect codes", async () => {
    vi.stubEnv("OTP_AUTH_SECRET", "test-mfa-binding-secret");
    const { row, id, userId, sessionContext, code } = createMfaChallenge();
    installChallenge(row);
    const service = new OtpService();
    const params = {
      identity: "+18482035389",
      code: "999999",
      purpose: "mfa" as const,
      challengeId: id,
      userId,
      sessionContext,
    };

    for (let attempt = 0; attempt < 5; attempt++) {
      await service.consumeChallenge(params);
    }
    expect(row.attempts).toBe(5);
    expect((await service.consumeChallenge({ ...params, code })).success).toBe(false);
  });

  it("does not report simulated delivery as a successful OTP send", async () => {
    const dispatch = vi.spyOn(messagingBridge, "sendMessage").mockResolvedValue({
      success: true,
      messageId: "sent_simulation",
      channel: "sms",
      provider: "sent",
      deliveryStatus: "simulation",
      region: "USA",
      simulation: true,
    });
    const service = new OtpService();
    const { challenge, rawCode } = service.generateChallenge({
      identity: "+18482035389",
      userId: "3651f931-c180-4521-9b44-2e47815bbca9",
      purpose: "mfa",
      metadata: { session_context: "b".repeat(64) },
    });

    const result = await service.dispatchChallenge({
      challenge,
      rawOtp: rawCode,
      sandbox: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("simulated");
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("validates challenge IDs before they are used as challenge selectors", () => {
    expect(isMfaChallengeId("3253df00-66ca-4ce8-84cf-2d33246ed6e0")).toBe(true);
    expect(isMfaChallengeId("not-a-challenge")).toBe(false);
  });
});
