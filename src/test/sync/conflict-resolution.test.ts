import { describe, it, expect } from "vitest";
import { applyResolutions, detectConflicts } from "@/lib/conflict-resolution";

describe("conflict resolution rules", () => {
  const base = { full_name: "Ada", phone: "+2348000000000", street_address: "1 Lagos Rd" };

  it("auto-merges edits that touch different fields", () => {
    const local = { ...base, full_name: "Ada Obi" };
    const remote = { ...base, phone: "+2348111111111" };
    const { conflicts, autoMerged } = detectConflicts(base, local, remote);
    expect(conflicts).toHaveLength(0);
    expect(autoMerged).toEqual(["phone"]);
  });

  it("flags the same field edited differently on both clients", () => {
    const local = { ...base, full_name: "Ada Obi" };
    const remote = { ...base, full_name: "Ada Lovelace" };
    const { conflicts } = detectConflicts(base, local, remote);
    expect(conflicts.map((c) => c.field)).toEqual(["full_name"]);
  });

  it("does not flag identical edits made on both clients", () => {
    const local = { ...base, full_name: "Ada Obi" };
    const remote = { ...base, full_name: "Ada Obi" };
    const { conflicts, autoMerged } = detectConflicts(base, local, remote);
    expect(conflicts).toHaveLength(0);
    expect(autoMerged).toHaveLength(0);
  });

  it("treats null, undefined and empty string as the same empty value", () => {
    const b = { street_address: null as string | null };
    const { conflicts, autoMerged } = detectConflicts(b, { street_address: "" }, { street_address: undefined });
    expect(conflicts).toHaveLength(0);
    expect(autoMerged).toHaveLength(0);
  });

  it("applies per-field user decisions", () => {
    const local = { full_name: "Ada Obi", phone: "+2348000000000" };
    const conflicts = [
      { field: "full_name", base: "Ada", local: "Ada Obi", remote: "Ada Lovelace" },
    ];
    expect(applyResolutions(local, conflicts, { full_name: "remote" }).full_name).toBe("Ada Lovelace");
    expect(applyResolutions(local, conflicts, { full_name: "local" }).full_name).toBe("Ada Obi");
    // Default keeps the local edit when no explicit choice was made.
    expect(applyResolutions(local, conflicts, {}).full_name).toBe("Ada Obi");
  });
});
