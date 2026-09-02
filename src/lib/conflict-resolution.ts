import { supabase } from "@/integrations/supabase/client";

/**
 * Conflict resolution for simultaneous website / PWA / native-shell edits.
 *
 * The same account is routinely signed in on the website and on an installed
 * app at the same time. Both clients hold their own copy of a record, so a
 * plain `update()` silently overwrites whatever the other client saved in the
 * meantime ("last writer wins", with no way to notice the loss).
 *
 * The rules implemented here:
 *   1. Every guarded write carries the `updated_at` value the editor loaded.
 *      If the row moved on, the write is refused instead of clobbering.
 *   2. Disjoint edits auto-merge — if the other client touched *different*
 *      fields, both sets of changes are kept and the write is retried.
 *   3. Same-field edits are a real conflict and surface to the user, who picks
 *      "keep mine" or "use theirs" per field.
 *   4. Identical values are never a conflict (both clients typed the same
 *      thing), so no dialog is shown for a no-op difference.
 */

export type FieldChoice = "local" | "remote";

export interface FieldConflict<T = unknown> {
  field: string;
  /** The value this client started from. */
  base: T;
  /** The value this client is trying to save. */
  local: T;
  /** The value another client already saved. */
  remote: T;
}

export interface ConflictOutcome<TRow> {
  status: "saved" | "conflict" | "error";
  /** Fields that both clients changed differently — requires a user decision. */
  conflicts: FieldConflict[];
  /** Fields the other client changed that were merged in automatically. */
  autoMerged: string[];
  row: TRow | null;
  error: Error | null;
}

const equal = (a: unknown, b: unknown) => {
  if (a === b) return true;
  // Treat null / undefined / "" as the same "empty" so a cleared optional
  // field on one client is not reported as a conflict against an unset one.
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return true;
  if (typeof a === "object" && typeof b === "object" && a && b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

/**
 * Compares the three versions of a record and splits the remote changes into
 * auto-mergeable ones and true conflicts.
 */
export function detectConflicts(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): { conflicts: FieldConflict[]; autoMerged: string[] } {
  const conflicts: FieldConflict[] = [];
  const autoMerged: string[] = [];

  // Fields the other client changed since we loaded the record.
  for (const field of Object.keys(remote)) {
    if (equal(remote[field], base[field])) continue;
    const localChanged = field in local && !equal(local[field], base[field]);
    if (!localChanged) {
      autoMerged.push(field);
      continue;
    }
    if (equal(local[field], remote[field])) continue; // same edit on both sides
    conflicts.push({ field, base: base[field], local: local[field], remote: remote[field] });
  }

  return { conflicts, autoMerged };
}

/** Builds the final payload from the user's per-field decisions. */
export function applyResolutions(
  local: Record<string, unknown>,
  conflicts: FieldConflict[],
  choices: Record<string, FieldChoice>,
): Record<string, unknown> {
  const out = { ...local };
  for (const c of conflicts) {
    out[c.field] = (choices[c.field] ?? "local") === "remote" ? c.remote : c.local;
  }
  return out;
}

export interface GuardedUpdateOptions<TRow extends Record<string, unknown>> {
  table: string;
  /** Column/value pair identifying the row (e.g. `{ column: "user_id", value }`). */
  match: { column: string; value: string };
  /** Values this client wants to save. */
  updates: Record<string, unknown>;
  /** The record as it was loaded into the editor (the merge base). */
  base: Record<string, unknown>;
  /** `updated_at` of the loaded record — the optimistic-concurrency token. */
  baseUpdatedAt: string | null | undefined;
  /** Column holding the concurrency token. */
  versionColumn?: string;
  /** Extra fields to fetch when reconciling (defaults to the updated keys). */
  compareFields?: string[];
}

/**
 * Performs an update that refuses to overwrite a newer version of the row.
 *
 * Returns `status: "conflict"` with the conflicting fields when another client
 * changed the same fields; disjoint remote changes are merged and the write is
 * retried automatically.
 */
export async function guardedUpdate<TRow extends Record<string, unknown>>(
  opts: GuardedUpdateOptions<TRow>,
): Promise<ConflictOutcome<TRow>> {
  const {
    table,
    match,
    updates,
    base,
    baseUpdatedAt,
    versionColumn = "updated_at",
    compareFields,
  } = opts;

  const fields = compareFields ?? Object.keys(updates);
  const selection = Array.from(new Set([...fields, versionColumn])).join(", ");

  const client = supabase as unknown as {
    from: (t: string) => any;
  };

  const attempt = async (payload: Record<string, unknown>) => {
    let q = client.from(table).update(payload).eq(match.column, match.value);
    // The precondition: only write if nobody else has since.
    q = baseUpdatedAt ? q.eq(versionColumn, baseUpdatedAt) : q.is(versionColumn, null);
    return q.select(selection).maybeSingle();
  };

  try {
    const first = await attempt(updates);
    if (first.error) throw first.error;
    if (first.data) {
      return { status: "saved", conflicts: [], autoMerged: [], row: first.data as TRow, error: null };
    }

    // No row matched the precondition — either the row moved on, or the caller
    // passed a stale token. Fetch the current server state and reconcile.
    const { data: current, error: fetchError } = await client
      .from(table)
      .select(selection)
      .eq(match.column, match.value)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!current) {
      return {
        status: "error",
        conflicts: [],
        autoMerged: [],
        row: null,
        error: new Error("This record no longer exists. It may have been deleted on another device."),
      };
    }

    const { conflicts, autoMerged } = detectConflicts(
      base,
      updates,
      current as Record<string, unknown>,
    );

    if (conflicts.length > 0) {
      return { status: "conflict", conflicts, autoMerged, row: current as TRow, error: null };
    }

    // Rule 2: only disjoint fields changed remotely — merge and retry once
    // against the new version token.
    const merged: Record<string, unknown> = { ...updates };
    const retry = await client
      .from(table)
      .update(merged)
      .eq(match.column, match.value)
      .eq(versionColumn, (current as Record<string, unknown>)[versionColumn] as string)
      .select(selection)
      .maybeSingle();
    if (retry.error) throw retry.error;
    if (!retry.data) {
      return {
        status: "error",
        conflicts: [],
        autoMerged,
        row: null,
        error: new Error("Another device saved changes while this one was saving. Please try again."),
      };
    }
    return { status: "saved", conflicts: [], autoMerged, row: retry.data as TRow, error: null };
  } catch (err) {
    return {
      status: "error",
      conflicts: [],
      autoMerged: [],
      row: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/** Human labels for conflicting fields, used by the resolution dialog. */
export const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  phone: "Phone number",
  street_address: "Home address",
  email: "Email",
  city: "City",
  avatar_url: "Profile photo",
  notification_email: "Email notifications",
  notification_sms: "SMS notifications",
  notification_whatsapp: "WhatsApp notifications",
};

export const fieldLabel = (field: string) =>
  FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "— empty —";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
