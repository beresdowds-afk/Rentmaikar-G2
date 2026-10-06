import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { resolveCallerId } from "../../../backend/src/services/voipService";
import { getDbPool } from "../../../backend/src/services/dbPool";

describe("Authoritative Outbound Caller-ID Regression Guard", () => {
  it("resolves configured outbound line from database when available", async () => {
    const callerId = await resolveCallerId(null, "USA");
    // Database has active seeded configured line in E.164 format
    expect(callerId).toBeDefined();
    expect(callerId).toMatch(/^\+\d{10,15}$/);
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
});
