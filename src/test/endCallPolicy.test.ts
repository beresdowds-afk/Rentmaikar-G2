import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runEndCall, type EndCallDeps, type ProviderLookup } from "../../backend/src/services/endCallPolicy";

const SID = "CA123";
const ID = "call-1";

function makeDeps(opts: {
  record?: { id: string; callSid?: string | null; callType?: string | null } | null;
  gets?: ProviderLookup[];
  termination?: { ok: boolean; status: number };
  syncFails?: boolean;
}) {
  const gets = [...(opts.gets ?? [])];
  const deps = {
    loadRecord: vi.fn(async () => (opts.record === undefined ? { id: ID, callSid: SID } : opts.record)),
    getProviderCall: vi.fn(async () => gets.shift() as ProviderLookup),
    requestTermination: vi.fn(async () => opts.termination ?? { ok: true, status: 200 }),
    terminateConference: vi.fn(async () => {}),
    syncCall: vi.fn(async () => {
      if (opts.syncFails) throw new Error("db");
    }),
    syncParticipants: vi.fn(async () => {}),
    warn: vi.fn(),
  } satisfies EndCallDeps;
  return deps;
}
const ok = (providerStatus: string): ProviderLookup => ({ ok: true, status: 200, providerStatus });

describe("runEndCall", () => {
  it("fails when no SID can be resolved", async () => {
    const deps = makeDeps({ record: null });
    const r = await runEndCall({ callId: ID }, deps);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/No authoritative Twilio Call SID/);
    expect(deps.getProviderCall).not.toHaveBeenCalled();
  });

  it("treats Twilio 404 as reconciled success (failed)", async () => {
    const deps = makeDeps({ gets: [{ ok: false, status: 404 }] });
    const r = await runEndCall({ callId: ID }, deps);
    expect(r).toMatchObject({ success: true, callId: ID, status: "failed" });
    expect(deps.syncCall).toHaveBeenCalledWith({ callId: ID, callSid: SID, status: "failed" });
    expect(deps.requestTermination).not.toHaveBeenCalled();
  });

  it("syncs without terminating when provider is already terminal", async () => {
    const deps = makeDeps({ gets: [ok("no-answer")] });
    const r = await runEndCall({ callId: ID }, deps);
    expect(r.success).toBe(true);
    expect(deps.requestTermination).not.toHaveBeenCalled();
    expect(deps.syncCall).toHaveBeenCalledWith({ callId: ID, callSid: SID, status: "no-answer" });
    expect(deps.syncParticipants).toHaveBeenCalledWith(ID);
  });

  it("reconcileOnly never terminates a live call", async () => {
    const deps = makeDeps({ gets: [ok("in-progress")] });
    const r = await runEndCall({ callId: ID, reconcileOnly: true }, deps);
    expect(r).toMatchObject({ success: true, status: "in-progress" });
    expect(deps.requestTermination).not.toHaveBeenCalled();
    expect(deps.syncCall).not.toHaveBeenCalled();
  });

  it("does not mutate local state when Twilio rejects termination", async () => {
    const deps = makeDeps({ gets: [ok("ringing")], termination: { ok: false, status: 500 } });
    const r = await runEndCall({ callId: ID }, deps);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/rejected/);
    expect(deps.syncCall).not.toHaveBeenCalled();
  });

  it("fails without mutating when confirmation is non-terminal", async () => {
    const deps = makeDeps({ gets: [ok("in-progress"), ok("in-progress")] });
    const r = await runEndCall({ callId: ID }, deps);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/not confirmed/);
    expect(deps.syncCall).not.toHaveBeenCalled();
  });

  it("succeeds on confirmed termination, syncing call, participants and group conference", async () => {
    const deps = makeDeps({
      record: { id: ID, callSid: SID, callType: "group" },
      gets: [ok("in-progress"), ok("completed")],
    });
    const r = await runEndCall({ callId: ID }, deps);
    expect(r).toMatchObject({ success: true, status: "completed", callId: ID });
    expect(deps.requestTermination).toHaveBeenCalledWith(SID);
    expect(deps.terminateConference).toHaveBeenCalledWith(ID);
    expect(deps.syncCall).toHaveBeenCalledWith({ callId: ID, callSid: SID, status: "completed" });
    expect(deps.syncParticipants).toHaveBeenCalledWith(ID);
  });

  it("reports failure when local sync fails after confirmed termination", async () => {
    const deps = makeDeps({ gets: [ok("in-progress"), ok("completed")], syncFails: true });
    const r = await runEndCall({ callId: ID }, deps);
    expect(r.success).toBe(false);
  });
});

describe("end-call policy parity", () => {
  it("backend and edge copies are identical", () => {
    const a = readFileSync("backend/src/services/endCallPolicy.ts", "utf8");
    const b = readFileSync("supabase/functions/_shared/end-call-policy.ts", "utf8");
    expect(a).toBe(b);
  });
});
