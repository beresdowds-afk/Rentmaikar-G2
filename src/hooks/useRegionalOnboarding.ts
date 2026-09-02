// Region-aware onboarding-tour completion storage.
// - Keys are namespaced per tour AND per country so switching regions shows
//   the tour again for the new region until the user completes it there.
// - A legacy (region-less) `true` value is honored on first read so
//   long-standing users don't get the tour re-shown when we ship this.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";

const AUTO_OPEN_DELAY_MS = 1000;

export interface OnboardingTourHook {
  isOpen: boolean;
  hasCompleted: boolean;
  startTour: () => void;
  completeTour: () => void;
  resetTour: () => void;
  storageKey: string;
}

export const useRegionalOnboarding = (
  baseKey: string,
  opts: { autoOpen?: boolean } = { autoOpen: true },
): OnboardingTourHook => {
  const { country } = useRegion();
  const storageKey = useMemo(() => `${baseKey}_${country}`, [baseKey, country]);

  const [isOpen, setIsOpen] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      // Honor legacy (region-less) completion on first read.
      const legacy = localStorage.getItem(baseKey);
      const scoped = localStorage.getItem(storageKey);
      const completed = scoped === "true" || legacy === "true";
      if (completed) {
        if (!cancelled) {
          setHasCompleted(true);
          setIsOpen(false);
        }
      } else if (opts.autoOpen !== false) {
        setHasCompleted(false);
        timer = setTimeout(() => {
          if (!cancelled) setIsOpen(true);
        }, AUTO_OPEN_DELAY_MS);
      } else {
        setHasCompleted(false);
      }
    } catch {
      /* localStorage unavailable */
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [storageKey, baseKey, opts.autoOpen]);

  const startTour = useCallback(() => setIsOpen(true), []);
  const completeTour = useCallback(() => {
    setIsOpen(false);
    setHasCompleted(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  const resetTour = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setHasCompleted(false);
    setIsOpen(true);
  }, [storageKey]);

  return { isOpen, hasCompleted, startTour, completeTour, resetTour, storageKey };
};
