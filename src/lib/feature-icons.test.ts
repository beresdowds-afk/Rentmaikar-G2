import { describe, it, expect } from "vitest";
import {
  FEATURE_ICON_KEYS,
  FEATURE_ICON_MAP,
  getFeatureIcon,
} from "./feature-icons";
import type { FeatureIconKey } from "./localized-content";

/**
 * CI guard: guarantees the landing FeaturesSection can never render an
 * undefined component. If a `FeatureIconKey` is added or removed and this
 * registry is not updated, these assertions fail.
 */
describe("feature-icons registry", () => {
  it("has an icon component for every FeatureIconKey", () => {
    for (const key of FEATURE_ICON_KEYS) {
      const Icon = FEATURE_ICON_MAP[key];
      expect(Icon, `Missing icon for FeatureIconKey "${key}"`).toBeDefined();
      // lucide-react icons are forwardRef objects, i.e. callable/renderable.
      const renderable =
        typeof Icon === "function" ||
        (typeof Icon === "object" && Icon !== null);
      expect(renderable, `Icon for "${key}" must be renderable`).toBe(true);
    }
  });

  it("has no map entries outside the declared key set", () => {
    const declared = new Set<string>(FEATURE_ICON_KEYS);
    for (const key of Object.keys(FEATURE_ICON_MAP)) {
      expect(declared.has(key), `Stray icon key "${key}" in FEATURE_ICON_MAP`).toBe(
        true,
      );
    }
  });

  it("getFeatureIcon returns a renderable component for each key", () => {
    for (const key of FEATURE_ICON_KEYS as readonly FeatureIconKey[]) {
      const Icon = getFeatureIcon(key);
      expect(Icon).toBeTruthy();
    }
  });
});
