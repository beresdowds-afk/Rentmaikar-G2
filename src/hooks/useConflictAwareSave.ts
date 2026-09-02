import { useCallback, useRef, useState } from "react";
import {
  applyResolutions,
  guardedUpdate,
  type ConflictOutcome,
  type FieldChoice,
  type FieldConflict,
  type GuardedUpdateOptions,
} from "@/lib/conflict-resolution";

type Args<TRow extends Record<string, unknown>> = Omit<GuardedUpdateOptions<TRow>, never>;

/**
 * Wraps `guardedUpdate` with the dialog state needed to let a user resolve
 * simultaneous website/PWA edits.
 */
export function useConflictAwareSave<TRow extends Record<string, unknown>>() {
  const [conflicts, setConflicts] = useState<FieldConflict[]>([]);
  const [autoMerged, setAutoMerged] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const pending = useRef<Args<TRow> | null>(null);
  const latestRemote = useRef<Record<string, unknown> | null>(null);

  const reset = useCallback(() => {
    pending.current = null;
    latestRemote.current = null;
    setConflicts([]);
    setAutoMerged([]);
  }, []);

  const save = useCallback(async (args: Args<TRow>): Promise<ConflictOutcome<TRow>> => {
    setSaving(true);
    try {
      const result = await guardedUpdate<TRow>(args);
      if (result.status === "conflict") {
        pending.current = args;
        latestRemote.current = (result.row ?? null) as Record<string, unknown> | null;
        setConflicts(result.conflicts);
        setAutoMerged(result.autoMerged);
      } else {
        reset();
      }
      return result;
    } finally {
      setSaving(false);
    }
  }, [reset]);

  /** Re-runs the save with the user's per-field decisions against the new version. */
  const resolve = useCallback(
    async (choices: Record<string, FieldChoice>): Promise<ConflictOutcome<TRow> | null> => {
      const args = pending.current;
      const remote = latestRemote.current;
      if (!args) return null;
      const merged = applyResolutions(args.updates, conflicts, choices);
      const versionColumn = args.versionColumn ?? "updated_at";
      return save({
        ...args,
        updates: merged,
        // Rebase onto what the other client saved so the retry passes the
        // optimistic-concurrency check.
        base: { ...args.base, ...(remote ?? {}) },
        baseUpdatedAt: (remote?.[versionColumn] as string | null) ?? args.baseUpdatedAt,
      });
    },
    [conflicts, save],
  );

  return { save, resolve, cancel: reset, conflicts, autoMerged, saving, hasConflict: conflicts.length > 0 };
}
