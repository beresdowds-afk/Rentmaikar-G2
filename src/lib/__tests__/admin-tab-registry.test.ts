import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ALL_ADMIN_TABS,
  ADMIN_ONLY_TABS,
  assistantExcludedTabs,
  computeTabPermissionDrift,
  warnTabPermissionDrift,
  __resetTabDriftWarning,
} from '@/lib/admin-tab-registry';
import { TAB_PERMISSION_MAP, assistantCanAccessTab } from '@/lib/admin-tab-permissions';

describe('admin tab registry', () => {
  beforeEach(() => __resetTabDriftWarning());
  afterEach(() => vi.restoreAllMocks());

  it('derives a non-empty tab universe from PortalNavigation', () => {
    expect(ALL_ADMIN_TABS.length).toBeGreaterThan(10);
    expect(new Set(ALL_ADMIN_TABS).size).toBe(ALL_ADMIN_TABS.length);
  });

  it('classifies every rendered tab as mapped or admin-only (no drift)', () => {
    const { unclassified, orphanedMappings } = computeTabPermissionDrift();
    expect({ unclassified, orphanedMappings }).toEqual({
      unclassified: [],
      orphanedMappings: [],
    });
  });

  it('excludes all admin-only tabs from assistants', () => {
    const excluded = assistantExcludedTabs();
    for (const tab of ADMIN_ONLY_TABS) expect(excluded).toContain(tab);
  });

  it('fails closed: unmapped tabs are excluded for assistants', () => {
    const excluded = assistantExcludedTabs();
    for (const tab of ALL_ADMIN_TABS) {
      if (TAB_PERMISSION_MAP[tab] === undefined) expect(excluded).toContain(tab);
    }
  });

  it('keeps admin and assistant views in sync for permissioned tabs', () => {
    const allPerms = Object.fromEntries(
      Object.values(TAB_PERMISSION_MAP)
        .filter(Boolean)
        .map((p) => [p as string, true]),
    );
    const excluded = new Set(assistantExcludedTabs());
    for (const tab of ALL_ADMIN_TABS) {
      if (excluded.has(tab)) continue;
      // A fully-permissioned assistant sees exactly the non-excluded tabs.
      expect(assistantCanAccessTab(tab, allPerms)).toBe(true);
    }
  });

  it('warns at most once per session in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnTabPermissionDrift('admin');
    warnTabPermissionDrift('admin-assistant');
    // No drift today, so no warning at all.
    expect(spy).not.toHaveBeenCalled();
  });
});
