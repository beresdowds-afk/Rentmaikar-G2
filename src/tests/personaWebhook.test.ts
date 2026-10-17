import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const query = vi.fn();
vi.mock("../../backend/src/services/dbPool", () => ({ getDbPool: () => ({ query }) }));
vi.mock("../../backend/src/services/supabaseService", () => ({ supabaseBackendService: {} }));

import { personaWebhookService } from "../../backend/src/services/personaWebhookService";

const SECRET = "whsec_test";
const USER = "11111111-1111-4111-8111-111111111111";

function evt(status = "completed", ref: string | null = USER, id = "evt_1") {
  return {
    data: {
      id,
      attributes: {
        name: "inquiry.completed",
        payload: { data: { id: "inq_1", attributes: { status, "reference-id": ref } } },
      },
    },
  };
}
function sign(raw: string) {
  const t = "1700000000";
  return `t=${t},v1=${crypto.createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex")}`;
}
const send = (body: unknown, header?: string) => {
  const raw = JSON.stringify(body);
  return personaWebhookService.handle({
    headers: header === undefined ? { "persona-signature": sign(raw) } : header ? { "persona-signature": header } : {},
    body,
    rawBody: raw,
  });
};
const wrote = (frag: string) => query.mock.calls.some((c) => String(c[0]).includes(frag));

beforeEach(() => {
  query.mockReset();
  process.env.PERSONA_WEBHOOK_SECRET = SECRET;
});

describe("persona webhook", () => {
  it("fails closed (503) when the secret is not configured, with no state change", async () => {
    delete process.env.PERSONA_WEBHOOK_SECRET;
    const r = await send(evt());
    expect(r.status).toBe(503);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects missing and forged signatures without touching state", async () => {
    expect((await send(evt(), "")).status).toBe(401);
    expect((await send(evt(), "t=1,v1=" + "0".repeat(64))).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("ignores events for unknown inquiries", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const r = await send(evt());
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBe("unknown_inquiry");
    expect(wrote("UPDATE public.profiles")).toBe(false);
  });

  it("rejects wrong-account inquiries (reference mismatch) with no update", async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: "22222222-2222-4222-8222-222222222222" }] });
    const r = await send(evt());
    expect(r.status).toBe(409);
    expect(wrote("UPDATE")).toBe(false);
  });

  it("deduplicates a replayed event id", async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: USER }] });
    query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING -> no row
    const r = await send(evt());
    expect(r.body.duplicate).toBe(true);
    expect(wrote("UPDATE")).toBe(false);
  });

  it("applies a verified approved event once", async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: USER }] });
    query.mockResolvedValueOnce({ rows: [{ id: "row1" }] });
    query.mockResolvedValueOnce({ rows: [{ user_id: USER, id: "i1" }] });
    query.mockResolvedValue({ rows: [] });
    const r = await send(evt());
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("approved");
    expect(wrote("UPDATE public.profiles")).toBe(true);
  });

  it("does not let a delayed non-approved event downgrade (guard in UPDATE)", async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: USER }] });
    query.mockResolvedValueOnce({ rows: [{ id: "row1" }] });
    query.mockResolvedValueOnce({ rows: [] }); // guarded update matched nothing
    const r = await send(evt("declined"));
    expect(r.status).toBe(200);
    expect(query.mock.calls[2][0]).toContain("status <> 'approved'");
    expect(wrote("UPDATE public.profiles")).toBe(false);
  });

  it("removes the dedupe row on a processing failure so the provider can retry, without leaking details", async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: USER }] });
    query.mockResolvedValueOnce({ rows: [{ id: "row1" }] });
    query.mockRejectedValueOnce(new Error("secret db detail"));
    query.mockResolvedValue({ rows: [] });
    const r = await send(evt());
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret db detail");
    expect(wrote("DELETE FROM public.payment_webhook_events")).toBe(true);
  });
});
