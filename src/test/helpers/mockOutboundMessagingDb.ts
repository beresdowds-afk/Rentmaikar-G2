import { getDbPool } from "../../../backend/src/services/dbPool";
import { vi } from "vitest";

type OutboxRow = {
  id: string;
  idempotency_key: string;
  status: string;
  attempt_count: number;
  provider: string;
  provider_message_id?: string;
  last_error?: string;
};

export function mockOutboundMessagingDb() {
  const outbox = new Map<string, OutboxRow>();
  const pool = getDbPool();

  return vi.spyOn(pool, "query").mockImplementation(async (query, params) => {
    const sql = query;
    const values = Array.isArray(params) ? params : [];

    if (sql.includes("INSERT INTO public.outbound_message_outbox")) {
      const key = String(values[0]);
      if (outbox.has(key)) return { rows: [], rowCount: 0 };

      const row: OutboxRow = {
        id: `outbox-${key}`,
        idempotency_key: key,
        status: "queued",
        attempt_count: 0,
        provider: String(values[2] || "sent"),
      };
      outbox.set(key, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.includes("SET status = 'dispatching'")) {
      const row = outbox.get(String(values[0]));
      if (!row || row.status !== "queued") return { rows: [], rowCount: 0 };
      row.status = "dispatching";
      row.attempt_count += 1;
      return { rows: [row], rowCount: 1 };
    }

    if (sql.includes("SELECT id, idempotency_key")) {
      const row = outbox.get(String(values[0]));
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.includes("UPDATE public.outbound_message_outbox")) {
      const row = outbox.get(String(values[0]));
      if (row) {
        row.status = String(values[1] || row.status);
        row.provider = String(values[2] || row.provider);
        row.provider_message_id = String(values[3] || row.provider_message_id || "");
        row.last_error = String(values[4] || "");
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    if (sql.includes("is_messaging_opted_out")) {
      return { rows: [{ opted_out: false }], rowCount: 1 };
    }

    if (sql.includes("get_allowed_regions")) {
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 1 };
  });
}
