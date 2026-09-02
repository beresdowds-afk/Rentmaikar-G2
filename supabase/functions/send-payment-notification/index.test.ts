// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveRecipients } from "./recipients.ts";

/**
 * In-memory Supabase client stub. Only implements the query surface used
 * by resolveRecipients: from(table).select(...).eq(...).maybeSingle() and
 * from(table).select(...).eq(...) and .in(...).
 */
function makeStubClient(fixtures: {
  rentals: Array<{ id: string; driver_id: string | null }>;
  user_roles: Array<{ user_id: string; role: string }>;
}) {
  const build = (table: "rentals" | "user_roles") => {
    const state: any = { table, filters: {} as Record<string, any>, inFilter: null as null | { col: string; values: any[] } };
    const api: any = {
      select: (_cols: string) => api,
      eq: (col: string, val: any) => { state.filters[col] = val; return api; },
      in: (col: string, vals: any[]) => { state.inFilter = { col, values: vals }; return api; },
      maybeSingle: async () => {
        const rows = (fixtures[table] as any[]).filter((r) =>
          Object.entries(state.filters).every(([k, v]) => r[k] === v)
        );
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve: any) => {
        // Awaiting the chain without .maybeSingle() returns filtered rows.
        let rows = fixtures[table] as any[];
        rows = rows.filter((r) => Object.entries(state.filters).every(([k, v]) => r[k] === v));
        if (state.inFilter) {
          const { col, values } = state.inFilter;
          rows = rows.filter((r) => values.includes(r[col]));
        }
        resolve({ data: rows, error: null });
      },
    };
    return api;
  };
  return { from: (table: string) => build(table as any) } as any;
}

Deno.test("resolveRecipients: includes driver + admins, excludes owners", async () => {
  const client = makeStubClient({
    rentals: [{ id: "rental-1", driver_id: "driver-1" }],
    user_roles: [
      { user_id: "driver-1", role: "driver" },
      { user_id: "admin-1", role: "admin" },
      { user_id: "admin-2", role: "admin" },
      { user_id: "owner-1", role: "owner" },
    ],
  });
  const recipients = await resolveRecipients(client, "rental-1");
  assertEquals(recipients.sort(), ["admin-1", "admin-2", "driver-1"].sort());
  assert(!recipients.includes("owner-1"), "owner-1 must be excluded");
});

Deno.test("resolveRecipients: excludes admin who is also owner", async () => {
  const client = makeStubClient({
    rentals: [{ id: "rental-2", driver_id: "driver-2" }],
    user_roles: [
      { user_id: "driver-2", role: "driver" },
      { user_id: "admin-owner", role: "admin" },
      { user_id: "admin-owner", role: "owner" },
      { user_id: "admin-clean", role: "admin" },
    ],
  });
  const recipients = await resolveRecipients(client, "rental-2");
  assert(!recipients.includes("admin-owner"), "user holding owner role must be excluded even if also admin");
  assert(recipients.includes("admin-clean"));
  assert(recipients.includes("driver-2"));
});

Deno.test("resolveRecipients: excludes driver who is also owner", async () => {
  const client = makeStubClient({
    rentals: [{ id: "rental-3", driver_id: "driver-owner" }],
    user_roles: [
      { user_id: "driver-owner", role: "driver" },
      { user_id: "driver-owner", role: "owner" },
      { user_id: "admin-3", role: "admin" },
    ],
  });
  const recipients = await resolveRecipients(client, "rental-3");
  assert(!recipients.includes("driver-owner"), "driver holding owner role must be excluded");
  assertEquals(recipients, ["admin-3"]);
});

Deno.test("resolveRecipients: ignores driver_id without driver role", async () => {
  const client = makeStubClient({
    rentals: [{ id: "rental-4", driver_id: "not-a-driver" }],
    user_roles: [
      { user_id: "not-a-driver", role: "owner" }, // pure owner, not driver
      { user_id: "admin-4", role: "admin" },
    ],
  });
  const recipients = await resolveRecipients(client, "rental-4");
  assertEquals(recipients, ["admin-4"]);
});

Deno.test("resolveRecipients: no rental id returns admins only, still excludes owners", async () => {
  const client = makeStubClient({
    rentals: [],
    user_roles: [
      { user_id: "admin-a", role: "admin" },
      { user_id: "admin-b", role: "admin" },
      { user_id: "admin-b", role: "owner" }, // dual role should be excluded
      { user_id: "owner-x", role: "owner" },
    ],
  });
  const recipients = await resolveRecipients(client, undefined);
  assertEquals(recipients, ["admin-a"]);
});
