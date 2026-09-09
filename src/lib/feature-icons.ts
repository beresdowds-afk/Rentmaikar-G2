/**
 * Type-safe registry for landing-page feature icons.
 *
 * Any new key added to `FeatureIconKey` in `localized-content.ts` MUST also
 * be added to `FEATURE_ICON_KEYS` below AND `FEATURE_ICON_MAP`. If a key is
 * missing from either, TypeScript will fail the build via the compile-time
 * assertions at the bottom of this file, and the CI test at
 * `src/lib/feature-icons.test.ts` will fail at test time.
 *
 * This guarantees `<FeatureIcon />` can never render `undefined`.
 */
import {
  Shield,
  Clock,
  Radar,
  Headphones,
  CreditCard,
  FileCheck,
  LifeBuoy,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { FeatureIconKey } from "@/lib/localized-content";

export const FEATURE_ICON_KEYS = [
  "verification",
  "rideshare-approval",
  "flexible-terms",
  "tracking",
  "support",
  "payments",
  "insurance",
  "roadside",
] as const satisfies readonly FeatureIconKey[];

export const FEATURE_ICON_MAP = {
  verification: Shield,
  "rideshare-approval": UserCheck,
  "flexible-terms": Clock,
  tracking: Radar,
  support: Headphones,
  payments: CreditCard,
  insurance: FileCheck,
  roadside: LifeBuoy,
} as const satisfies Record<FeatureIconKey, LucideIcon>;

/**
 * Compile-time bidirectional check: every union member is in the array AND
 * every array member is in the union. Removing/renaming either without
 * updating both surfaces a `tsgo` error immediately.
 */
type _MapKeysCoverUnion = FeatureIconKey extends keyof typeof FEATURE_ICON_MAP
  ? true
  : never;
type _UnionCoversMapKeys = keyof typeof FEATURE_ICON_MAP extends FeatureIconKey
  ? true
  : never;
type _ArrayCoversUnion = FeatureIconKey extends (typeof FEATURE_ICON_KEYS)[number]
  ? true
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _featureIconExhaustiveness: [
  _MapKeysCoverUnion,
  _UnionCoversMapKeys,
  _ArrayCoversUnion,
] = [true, true, true];

/**
 * Runtime lookup that is guaranteed non-undefined at the type level. Prefer
 * this over indexing `FEATURE_ICON_MAP` directly so callers never need a
 * `?? Fallback` guard.
 */
export const getFeatureIcon = (key: FeatureIconKey): LucideIcon =>
  FEATURE_ICON_MAP[key];
