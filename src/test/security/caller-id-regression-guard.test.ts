import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { resolveCallerId } from "../../../backend/src/services/voipService";
import { getDbPool } from "../../../backend/src/services/dbPool";

describe("Authoritative Outbound Caller-ID Regression Guard", () => {
  it("resolves configured outbound line from database when available", async () => {
    const pool = getDbPool();
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: any) => {
      const q = typeof sql === "string" ? sql : sql?.text || "";
      if (q.includes("voip_outbound_numbers")) {
        return { rows: [{ phone_number: "+13806003018" }] } as any;
      }
      return { rows: [] } as any;
    });

    try {
      const callerId = await resolveCallerId(null, "USA");
      expect(callerId).toBe("+13806003018");
      expect(callerId).toMatch(/^\+\d{10,15}$/);
    } finally {
      querySpy.mockRestore();
    }
  });

  it("resolves configured environment line when database yields no line", async () => {
    const pool = getDbPool();
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async () => ({ rows: [] } as any));
    const prevPhone = process.env.TWILIO_PHONE_NUMBER;

    try {
      process.env.TWILIO_PHONE_NUMBER = "+18482035389";
      const callerId = await resolveCallerId(null, "USA");
      expect(callerId).toBe("+18482035389");
    } finally {
      querySpy.mockRestore();
      if (prevPhone) process.env.TWILIO_PHONE_NUMBER = prevPhone;
      else delete process.env.TWILIO_PHONE_NUMBER;
    }
  });

  it("enforces controlled failure (null) when neither database nor environment has configured lines", async () => {
    const pool = getDbPool();
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async () => ({ rows: [] } as any));
    const prevPhone = process.env.TWILIO_PHONE_NUMBER;
    const prevVoice = process.env.TWILIO_VOICE_FROM;
    const prevOutbound = process.env.TWILIO_OUTBOUND_NUMBER;

    try {
      delete process.env.TWILIO_PHONE_NUMBER;
      delete process.env.TWILIO_VOICE_FROM;
      delete process.env.TWILIO_OUTBOUND_NUMBER;

      const callerIdUsa = await resolveCallerId(null, "USA");
      expect(callerIdUsa).toBeNull();

      const callerIdNg = await resolveCallerId(null, "Nigeria");
      expect(callerIdNg).toBeNull();
    } finally {
      querySpy.mockRestore();
      if (prevPhone) process.env.TWILIO_PHONE_NUMBER = prevPhone;
      if (prevVoice) process.env.TWILIO_VOICE_FROM = prevVoice;
      if (prevOutbound) process.env.TWILIO_OUTBOUND_NUMBER = prevOutbound;
    }
  });

  it("detects and rejects hard-coded production DIDs in voipService.ts", () => {
    const voipServicePath = path.resolve(process.cwd(), "backend/src/services/voipService.ts");
    const content = fs.readFileSync(voipServicePath, "utf-8");

    // Scan resolveCallerId function body
    const resolveFnMatch = content.match(/export async function resolveCallerId[\s\S]*?\n\}/);
    expect(resolveFnMatch).toBeTruthy();
    const resolveFnBody = resolveFnMatch![0];

    // Assert no fallback operator followed by a hard-coded E.164 phone string: || "+1..." or || "+234..."
    expect(resolveFnBody).not.toMatch(/\|\|\s*["']\+\d{10,15}["']/);

    // Assert no ternary country/region defaults returning hardcoded phone numbers: ? "+234..." : "+1..."
    expect(resolveFnBody).not.toMatch(/\?\s*["']\+\d{10,15}["']\s*:\s*["']\+\d{10,15}["']/);

    // Assert controlled failure return: returns null when unresolvable
    expect(resolveFnBody).toMatch(/return null;/);
  });

  it("ensures no catch block in voipService.ts falls back to a hard-coded DID", () => {
    const voipServicePath = path.resolve(process.cwd(), "backend/src/services/voipService.ts");
    const content = fs.readFileSync(voipServicePath, "utf-8");

    // Scan all catch blocks in voipService
    const catchBlocks = content.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\}/g) || [];
    for (const block of catchBlocks) {
      expect(block).not.toMatch(/return\s*["']\+\d{10,15}["']/);
    }
  });

  it("enforces immediate controlled rejection TwiML in handleVoiceTwimlDial when dialing PSTN without configured line", async () => {
    const { handleVoiceTwimlDial } = await import("../../../backend/src/services/voipService");
    const pool = getDbPool();
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: any) => {
      const q = typeof sql === "string" ? sql : sql?.text || "";
      if (q.includes("get_allowed_regions")) {
        return { rows: [{ value: "USA", phone_prefix: "+1" }, { value: "Nigeria", phone_prefix: "+234" }] } as any;
      }
      return { rows: [] } as any;
    });
    const prevPhone = process.env.TWILIO_PHONE_NUMBER;
    const prevVoice = process.env.TWILIO_VOICE_FROM;
    const prevOutbound = process.env.TWILIO_OUTBOUND_NUMBER;

    try {
      delete process.env.TWILIO_PHONE_NUMBER;
      delete process.env.TWILIO_VOICE_FROM;
      delete process.env.TWILIO_OUTBOUND_NUMBER;

      const twiml = await handleVoiceTwimlDial({
        To: "+15551234567",
        From: "client:agent_1",
        region: "USA",
        baseUrl: "https://staging.rentmaikar.com",
      });

      // Must be an immediate controlled rejection, NEVER an unauthenticated or missing-callerId <Dial>
      expect(twiml).not.toContain("<Dial");
      expect(twiml).toContain("<Say");
      expect(twiml).toContain("No eligible outbound line is configured for this call.");
      expect(twiml).toContain("<Hangup/>");
    } finally {
      querySpy.mockRestore();
      if (prevPhone) process.env.TWILIO_PHONE_NUMBER = prevPhone;
      if (prevVoice) process.env.TWILIO_VOICE_FROM = prevVoice;
      if (prevOutbound) process.env.TWILIO_OUTBOUND_NUMBER = prevOutbound;
    }
  });

  it("enforces controlled failure in handleInitiateVoipCall when no eligible outbound line is configured", async () => {
    const { handleInitiateVoipCall } = await import("../../../backend/src/services/voipService");
    const pool = getDbPool();
    const querySpy = vi.spyOn(pool, "query").mockImplementation(async (sql: any) => {
      const q = typeof sql === "string" ? sql : sql?.text || "";
      if (q.includes("get_allowed_regions")) {
        return { rows: [{ value: "USA", phone_prefix: "+1" }, { value: "Nigeria", phone_prefix: "+234" }] } as any;
      }
      if (q.includes("INSERT INTO public.voip_calls")) {
        return { rows: [{ id: "11111111-1111-1111-1111-111111111111" }] } as any;
      }
      return { rows: [] } as any;
    });
    const prevPhone = process.env.TWILIO_PHONE_NUMBER;
    const prevVoice = process.env.TWILIO_VOICE_FROM;
    const prevOutbound = process.env.TWILIO_OUTBOUND_NUMBER;

    try {
      delete process.env.TWILIO_PHONE_NUMBER;
      delete process.env.TWILIO_VOICE_FROM;
      delete process.env.TWILIO_OUTBOUND_NUMBER;

      const res = await handleInitiateVoipCall({
        callerUserId: null,
        region: "USA",
        recipients: [{ phoneNumber: "+15551234567" }],
        baseUrl: "https://staging.rentmaikar.com",
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain("Controlled failure");
    } finally {
      querySpy.mockRestore();
      if (prevPhone) process.env.TWILIO_PHONE_NUMBER = prevPhone;
      if (prevVoice) process.env.TWILIO_VOICE_FROM = prevVoice;
      if (prevOutbound) process.env.TWILIO_OUTBOUND_NUMBER = prevOutbound;
    }
  });
});
