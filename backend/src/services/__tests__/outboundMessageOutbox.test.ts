import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enqueueAndClaimOutboundMessage,
  retryDelayMs,
  updateOutboundMessage,
  type OutboundMessagePool,
} from "../outboundMessageOutbox";

function fakePool(
  onQuery: (sql: string, params: unknown[] | undefined) => Promise<Record<string, unknown>[]> | Record<string, unknown>[],
) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const pool: OutboundMessagePool = {
    async query(sql, params) {
      calls.push({ sql, params });
      const rows = await onQuery(sql, params);
      return { rows, rowCount: rows.length };
    },
  };
  return { pool, calls };
}

describe("durable outbound message outbox", () => {
  it("persists before claiming and atomically claims a single attempt", async () => {
    const { pool, calls } = fakePool(async (sql) => {
      if (sql.includes("INSERT INTO public.outbound_message_outbox")) {
        return [{
          id: "row-1",
          idempotency_key: "correlation-1",
          status: "queued",
          attempt_count: 0,
          provider: "sent",
        }];
      }
      if (sql.includes("SET status = 'dispatching'")) {
        return [{
          id: "row-1",
          idempotency_key: "correlation-1",
          status: "dispatching",
          attempt_count: 1,
          provider: "sent",
        }];
      }
      return [];
    });

    const result = await enqueueAndClaimOutboundMessage(pool, {
      idempotencyKey: "correlation-1",
      channel: "sms",
      provider: "sent",
      recipient: "+2348031234567",
      messageClass: "transactional",
      payload: { message: "Reminder" },
    });

    assert.equal(result.status, "dispatching");
    assert.equal(result.attemptCount, 1);
    assert.equal(result.claimed, true);
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /INSERT INTO public\.outbound_message_outbox/);
    assert.match(calls[1].sql, /attempt_count = attempt_count \+ 1/);
  });

  it("sets authentication OTPs to one attempt with a short expiry", async () => {
    const { pool, calls } = fakePool(async (sql) => {
      if (sql.includes("INSERT INTO public.outbound_message_outbox")) {
        return [{
          id: "row-auth",
          idempotency_key: "otp-challenge",
          status: "queued",
          attempt_count: 0,
        }];
      }
      return [{
        id: "row-auth",
        idempotency_key: "otp-challenge",
        status: "dispatching",
        attempt_count: 1,
      }];
    });

    await enqueueAndClaimOutboundMessage(pool, {
      idempotencyKey: "otp-challenge",
      channel: "sms",
      recipient: "+14155552671",
      messageClass: "authentication",
      payload: { message: "Code 123456" },
    });

    const params = calls[0].params!;
    assert.equal(params[5], "authentication");
    assert.equal(params[6], 1);
    assert.ok(Date.parse(String(params[7])) - Date.now() <= 5 * 60_000);
  });

  it("does not claim an already-dispatching idempotency key", async () => {
    const { pool } = fakePool(async (sql) => {
      if (sql.includes("SELECT id, idempotency_key")) {
        return [{
          id: "row-1",
          idempotency_key: "same-key",
          status: "dispatching",
          attempt_count: 1,
          provider: "twilio",
        }];
      }
      return [];
    });

    const result = await enqueueAndClaimOutboundMessage(pool, {
      idempotencyKey: "same-key",
      channel: "whatsapp",
      recipient: "whatsapp:+14155552671",
      messageClass: "transactional",
      payload: { message: "Hello" },
    });

    assert.equal(result.claimed, false);
    assert.equal(result.duplicate, true);
    assert.equal(result.status, "dispatching");
  });

  it("uses capped exponential retry delays and requires a durable state update", async () => {
    assert.equal(retryDelayMs(1, 1_000), 1_000);
    assert.equal(retryDelayMs(3, 1_000), 4_000);
    assert.equal(retryDelayMs(20, 1_000, 10_000), 10_000);

    const { pool } = fakePool(async () => []);
    await assert.rejects(
      updateOutboundMessage(pool, "missing-key", { status: "failed" }),
      /was not updated/,
    );
  });
});
