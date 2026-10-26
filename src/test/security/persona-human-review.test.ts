import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../../../backend/src/services/dbPool", () => ({
  getDbPool: () => ({ query }),
}));

import { personaWebhookService } from "../../../backend/src/services/personaWebhookService";

describe("Persona human-review boundary", () => {
  const originalSecret = process.env.PERSONA_WEBHOOK_SECRET;
  let applicationStatus = "pending";

  beforeEach(() => {
    process.env.PERSONA_WEBHOOK_SECRET = "unit-test-persona-secret";
    applicationStatus = "pending";
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT user_id FROM public.persona_inquiries")) {
        return { rows: [{ user_id: "user-1" }] };
      }
      if (sql.includes("INSERT INTO public.payment_webhook_events")) {
        return { rows: [{ id: "event-1" }] };
      }
      if (sql.includes("UPDATE public.persona_inquiries")) {
        return { rows: [{ user_id: "user-1", subject_type: "driver", id: "inquiry-1" }] };
      }
      if (sql.includes("UPDATE public.applications")) {
        applicationStatus = "approved";
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    process.env.PERSONA_WEBHOOK_SECRET = originalSecret;
  });

  it("records Persona identity approval without approving the driver application", async () => {
    const event = {
      data: {
        id: "event-1",
        attributes: {
          payload: {
            data: {
              id: "inquiry-1",
              attributes: { status: "approved" },
            },
          },
        },
      },
    };
    const rawBody = JSON.stringify(event);
    const timestamp = "1730000000";
    const signature = crypto
      .createHmac("sha256", process.env.PERSONA_WEBHOOK_SECRET!)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const result = await personaWebhookService.handle({
      headers: { "persona-signature": `t=${timestamp},v1=${signature}` },
      body: event,
      rawBody,
    });

    expect(result.status).toBe(200);
    expect(result.body.status).toBe("approved");
    expect(applicationStatus).toBe("pending");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE public.applications"))).toBe(false);
  });
});
