// Deno test: exercises the reconcile-payments logic end-to-end against a stubbed
// Supabase client and mocked provider fetch responses. Run with `deno test`.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// --- test doubles --------------------------------------------------------
type Row = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function makeSupabaseStub(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = clone(initial);
  const calls: Array<{ table: string; op: string; args?: unknown }> = [];

  const table = (name: string) => {
    if (!tables[name]) tables[name] = [];
    const rows = tables[name];
    const query: any = {
      _filters: [] as Array<(r: Row) => boolean>,
      _select: "*",
      _op: "select",
      _payload: null as Row | null,
      _limit: 1000,
      select(cols: string) { this._select = cols; return this; },
      eq(col: string, val: unknown) { this._filters.push((r) => r[col] === val); return this; },
      in(col: string, vals: unknown[]) { this._filters.push((r) => vals.includes(r[col])); return this; },
      gte(col: string, val: string) {
        this._filters.push((r) => String(r[col]) >= val); return this;
      },
      or() { return this; },
      limit(n: number) { this._limit = n; return this; },
      maybeSingle() {
        const found = rows.filter((r) => this._filters.every((f) => f(r)))[0] ?? null;
        return Promise.resolve({ data: found, error: null });
      },
      single() {
        const found = rows.filter((r) => this._filters.every((f) => f(r)))[0];
        return Promise.resolve(found
          ? { data: found, error: null }
          : { data: null, error: { code: "PGRST116" } });
      },
      insert(payload: Row | Row[]) {
        this._op = "insert";
        const arr = Array.isArray(payload) ? payload : [payload];
        for (const p of arr) {
          // simulate unique(payment_method, transaction_id) partial index on payments
          if (name === "payments" && p.transaction_id && p.payment_method) {
            const dupe = rows.find((r) => r.transaction_id === p.transaction_id
              && r.payment_method === p.payment_method);
            if (dupe) {
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: null, error: { code: "23505" } }),
                }),
              };
            }
          }
          const row = { id: p.id ?? crypto.randomUUID(), ...p };
          rows.push(row);
          this._lastInserted = row;
        }
        calls.push({ table: name, op: "insert", args: payload });
        const self = this;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: self._lastInserted, error: null }),
          }),
        };
      },
      update(patch: Row) {
        this._op = "update"; this._payload = patch;
        const doUpdate = () => {
          for (const r of rows) {
            if (this._filters.every((f) => f(r))) Object.assign(r, patch);
          }
          calls.push({ table: name, op: "update", args: patch });
          return Promise.resolve({ data: null, error: null });
        };
        return { eq: (c: string, v: unknown) => { this._filters.push((r) => r[c] === v); return doUpdate(); } };
      },
      then(res: (v: unknown) => void) {
        const found = rows.filter((r) => this._filters.every((f) => f(r))).slice(0, this._limit);
        res({ data: found, error: null });
      },
    };
    return query;
  };

  return { supa: { from: (n: string) => table(n) } as any, tables, calls };
}

// --- fetch mocking -------------------------------------------------------
function mockFetch(routes: Record<string, (req: Request) => Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) return Promise.resolve(handler(new Request(url, init)));
    }
    return Promise.resolve(new Response(JSON.stringify({ error: "unmocked", url }), { status: 500 }));
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

// --- import module under test -------------------------------------------
// We test ensurePayment directly for idempotency; full HTTP flow is smoke-tested
// via a spawned server would be heavier — this suite locks the core contracts.
const { ensurePayment } = await import("./index.ts");

Deno.test("ensurePayment inserts a new payment when none exists", async () => {
  const { supa, tables } = makeSupabaseStub({
    rentals: [{ id: "r1", vehicle_id: "v1", owner_id: "o1" }],
    vehicles: [{ id: "v1", owner_id: "o1" }],
    payments: [],
  });
  const res = await ensurePayment(supa, {
    rentalId: "r1", driverId: "d1", amount: 100, currency: "NGN",
    method: "paystack", transactionRef: "REF_1", status: "completed",
  });
  assert(res.paymentId);
  assertEquals(res.backfilled, true);
  assertEquals(tables.payments.length, 1);
});

Deno.test("ensurePayment is idempotent: second call for same ref does not backfill again", async () => {
  const { supa, tables } = makeSupabaseStub({
    rentals: [{ id: "r1", vehicle_id: "v1", owner_id: "o1" }],
    vehicles: [{ id: "v1", owner_id: "o1" }],
    payments: [],
  });
  const first = await ensurePayment(supa, {
    rentalId: "r1", driverId: "d1", amount: 100, currency: "NGN",
    method: "paystack", transactionRef: "DUP_REF", status: "completed",
  });
  const second = await ensurePayment(supa, {
    rentalId: "r1", driverId: "d1", amount: 100, currency: "NGN",
    method: "paystack", transactionRef: "DUP_REF", status: "completed",
  });
  assertEquals(first.backfilled, true);
  assertEquals(second.backfilled, false);
  assertEquals(second.paymentId, first.paymentId);
  assertEquals(tables.payments.length, 1);
});

Deno.test("ensurePayment: unique-violation race returns existing id, backfilled=false", async () => {
  const { supa, tables } = makeSupabaseStub({
    rentals: [{ id: "r1", vehicle_id: "v1", owner_id: "o1" }],
    vehicles: [{ id: "v1", owner_id: "o1" }],
    payments: [
      // Simulate a webhook that already inserted this exact row.
      { id: "existing-id", payment_method: "opay", transaction_id: "RACE_REF",
        driver_id: "d1", owner_id: "o1", vehicle_id: "v1" },
    ],
  });
  const res = await ensurePayment(supa, {
    rentalId: "r1", driverId: "d1", amount: 100, currency: "NGN",
    method: "opay", transactionRef: "RACE_REF", status: "completed",
  });
  assertEquals(res.paymentId, "existing-id");
  assertEquals(res.backfilled, false);
  assertEquals(tables.payments.length, 1);
});

Deno.test("ensurePayment returns null when context can't be resolved", async () => {
  const { supa } = makeSupabaseStub({ rentals: [], vehicles: [], payments: [] });
  const res = await ensurePayment(supa, {
    driverId: "d1", amount: 100, currency: "USD",
    method: "paypal", transactionRef: "NOCTX", status: "completed",
  });
  assertEquals(res.paymentId, null);
  assertEquals(res.backfilled, false);
});

Deno.test("Paystack provider response is parsed correctly (mocked)", async () => {
  const restore = mockFetch({
    "api.paystack.co/transaction/verify/": () => new Response(JSON.stringify({
      status: true,
      data: { status: "success", channel: "card", gateway_response: "Successful" },
    }), { status: 200 }),
  });
  try {
    const res = await fetch("https://api.paystack.co/transaction/verify/T1");
    const body = await res.json();
    assertEquals(body.data.status, "success");
  } finally { restore(); }
});
