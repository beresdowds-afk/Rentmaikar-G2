import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { functionsRouter } from "../../../backend/src/routes/functions";
import { createFunctionsTestServer } from "../../../backend/src/test-utils/createFunctionsTestServer";

const mocks = vi.hoisted(() => ({
  accountId: "3651f931-c180-4521-9b44-2e47815bbca9",
  otherAccountId: "a1ef5bfc-0d8c-4980-a76f-5a7972886f09",
  profile: {
    phone: "+18482035389",
    phone_verified: true,
    email_verified: true,
  } as { phone: string; phone_verified: boolean; email_verified: boolean },
  settings: {
    is_enabled: true,
    phone_number: "+18482035389",
    preferred_channel: "sms",
  } as { is_enabled: boolean; phone_number: string; preferred_channel: string },
  role: { role: "owner" } as { role: string },
  roles: ["owner"] as string[],
  eqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
  upsertCalls: [] as Array<{ table: string; value: Record<string, unknown> }>,
  authenticateCaller: vi.fn(),
  sendPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
}));

vi.mock("../../../backend/src/services/fileUploadService", () => ({
  authenticateCaller: mocks.authenticateCaller,
  handleFileUpload: vi.fn(),
  handleDeleteFile: vi.fn(),
  handleGetFileUrl: vi.fn(),
}));

vi.mock("../../../backend/src/services/phoneOtpService", () => ({
  normalizeE164: (phone: string) => {
    const value = (phone || "").trim().replace(/[^\d+]/g, "");
    if (value.startsWith("+")) return value;
    return value.length === 10 ? `+1${value}` : `+${value}`;
  },
  sendPhoneOtp: mocks.sendPhoneOtp,
  verifyPhoneOtp: mocks.verifyPhoneOtp,
}));

vi.mock("../../../backend/src/services/supabaseService", () => ({
  ALL_EDGE_FUNCTIONS: [],
  supabaseBackendService: {
    getAdminClient: () => ({
      from: (table: string) => {
        let query: any;
        query = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            mocks.eqCalls.push({ table, column, value });
            return query;
          }),
          maybeSingle: vi.fn(async () => ({
            data:
              table === "profiles"
                ? mocks.profile
                : table === "two_factor_settings"
                  ? mocks.settings
                  : mocks.role,
            error: null,
          })),
          then: (resolve: (result: unknown) => void) => resolve({
            data: mocks.roles.map((role) => ({ role })),
            error: null,
          }),
          upsert: vi.fn(async (value: Record<string, unknown>) => {
            mocks.upsertCalls.push({ table, value });
            return { error: null };
          }),
          insert: vi.fn(async () => ({ error: null })),
        };
        return query;
      },
    }),
  },
  EDGE_FUNCTIONS_SET: new Set<string>(),
}));

let server: ReturnType<typeof createFunctionsTestServer>;
let baseUrl = "";

function sessionToken() {
  const claims = {
    session_id: "3253df00-66ca-4ce8-84cf-2d33246ed6e0",
  };
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

async function postMfa(body: Record<string, unknown>, authorization = `Bearer ${sessionToken()}`) {
  return fetch(`${baseUrl}/send-2fa-code`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  mocks.authenticateCaller.mockImplementation(async (header?: string) => {
    if (!header) {
      const error = new Error("Authentication required") as Error & { statusCode: number };
      error.statusCode = 401;
      throw error;
    }
    return {
      userId: mocks.accountId,
      role: "owner",
      isAdmin: false,
    };
  });
  mocks.sendPhoneOtp.mockResolvedValue({
    success: true,
    challengeId: "c9d8b113-627d-4c79-930c-fde45cc2f660",
    expiresIn: 300,
  });
  mocks.verifyPhoneOtp.mockResolvedValue({
    success: true,
    user_id: mocks.accountId,
  });
  server = createFunctionsTestServer(functionsRouter);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/functions`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

afterEach(() => {
  mocks.eqCalls.length = 0;
  mocks.upsertCalls.length = 0;
  mocks.sendPhoneOtp.mockReset();
  mocks.verifyPhoneOtp.mockReset();
  mocks.profile.phone = "+18482035389";
  mocks.profile.phone_verified = true;
  mocks.profile.email_verified = true;
  mocks.settings.is_enabled = true;
  mocks.settings.phone_number = "+18482035389";
  mocks.settings.preferred_channel = "sms";
  mocks.role.role = "owner";
  mocks.roles = ["owner"];
  mocks.sendPhoneOtp.mockResolvedValue({
    success: true,
    challengeId: "c9d8b113-627d-4c79-930c-fde45cc2f660",
    expiresIn: 300,
  });
  mocks.verifyPhoneOtp.mockResolvedValue({
    success: true,
    user_id: mocks.accountId,
  });
});

describe("send-2fa-code authenticated route", () => {
  it("requires MFA when any assigned role requires it", async () => {
    mocks.settings.is_enabled = false;
    mocks.roles = ["driver", "admin_assistant", "owner"];
    const response = await postMfa({ action: "status" });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.requires_2fa).toBe(true);
    expect(data.is_mandatory).toBe(true);
  });

  it("returns status only for the authenticated account, ignoring forged user IDs", async () => {
    const response = await postMfa({
      action: "status",
      user_id: mocks.otherAccountId,
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.requires_2fa).toBe(true);
    expect(data.phone).toBe("+18482035389");
    expect(mocks.eqCalls.filter((call) => call.column === "user_id").every(
      (call) => call.value === mocks.accountId,
    )).toBe(true);
  });

  it("rejects setup using an alternative or unverified phone", async () => {
    const alternative = await postMfa({
      action: "setup",
      user_id: mocks.otherAccountId,
      phone: "+18482039999",
    });
    expect(alternative.status).toBe(400);
    expect(mocks.upsertCalls).toHaveLength(0);

    mocks.profile.phone_verified = false;
    const unverified = await postMfa({
      action: "setup",
      phone: "+18482035389",
    });
    expect(unverified.status).toBe(400);
    expect(mocks.upsertCalls).toHaveLength(0);
  });

  it("requires verified email before enabling optional MFA", async () => {
    mocks.roles = ["driver"];
    mocks.profile.email_verified = false;

    const response = await postMfa({
      action: "setup",
      phone: "+18482035389",
    });

    expect(response.status).toBe(403);
    expect(mocks.upsertCalls).toHaveLength(0);
  });

  it("allows optional MFA setup after email and phone verification", async () => {
    mocks.roles = ["driver"];
    mocks.profile.email_verified = true;

    const response = await postMfa({
      action: "setup",
      phone: "+18482035389",
    });

    expect(response.status).toBe(200);
    expect(mocks.upsertCalls).toHaveLength(1);
  });

  it("preserves mandatory MFA setup when email verification is still pending", async () => {
    mocks.roles = ["owner"];
    mocks.profile.email_verified = false;

    const response = await postMfa({
      action: "setup",
      phone: "+18482035389",
    });

    expect(response.status).toBe(200);
    expect(mocks.upsertCalls).toHaveLength(1);
  });

  it("sends only to the verified account phone and binds the challenge to its owner", async () => {
    const response = await postMfa({
      action: "send_code",
      user_id: mocks.otherAccountId,
      channel: "whatsapp",
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.challenge_id).toBe("c9d8b113-627d-4c79-930c-fde45cc2f660");
    expect(mocks.sendPhoneOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+18482035389",
        callerId: mocks.accountId,
        purpose: "mfa",
        expiresInSeconds: 300,
        metadata: { session_context: expect.stringMatching(/^[a-f0-9]{64}$/) },
      }),
    );
  });

  it("verifies with the authenticated account and supplied challenge ID, not body identity", async () => {
    const challengeId = "c9d8b113-627d-4c79-930c-fde45cc2f660";
    const response = await postMfa({
      action: "verify_code",
      user_id: mocks.otherAccountId,
      phone: "+18482039999",
      challenge_id: challengeId,
      code: "123456",
    });

    expect(response.status).toBe(400);
    expect(mocks.verifyPhoneOtp).not.toHaveBeenCalled();

    const legitimateResponse = await postMfa({
      action: "verify_code",
      user_id: mocks.otherAccountId,
      challenge_id: challengeId,
      code: "123456",
    });
    expect(legitimateResponse.status).toBe(200);
    expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+18482035389",
        callerId: mocks.accountId,
        challengeId,
        purpose: "mfa",
      }),
    );
  });

  it("requires authentication and refuses to send to a phone without verification", async () => {
    const unauthenticated = await postMfa({ action: "status" }, "");
    expect(unauthenticated.status).toBe(401);

    mocks.profile.phone_verified = false;
    const response = await postMfa({ action: "send_code" });
    expect(response.status).toBe(403);
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
  });
});
