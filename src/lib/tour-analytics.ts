// Lightweight analytics for onboarding tours.
// Emits three event types (`tour_start`, `tour_step_view`, `tour_complete`)
// tagged with the currently selected region so we can troubleshoot and
// iterate on region-specific step content.
//
// Sinks:
//   1. console.info (always) — visible in browser + captured by remote log
//      collectors that scrape console output.
//   2. Meta Pixel `trackEvent` — mirrored via CAPI when consent is granted.
//   3. window CustomEvent `rentmaikar:tour` — used by tests and any
//      future in-app listeners.

import { trackEvent } from "@/lib/meta-pixel";
import { supabase } from "@/integrations/supabase/client";
import type { Country } from "@/contexts/RegionContext";

export type TourEventType = "tour_start" | "tour_step_view" | "tour_complete";

export interface TourEventPayload {
  tour: string;               // e.g. "landing", "admin", "iot-support"
  country: Country | string;  // "USA" | "Nigeria" | (string & {}) | fallback string
  stepId?: string;
  stepIndex?: number;
  totalSteps?: number;
  extra?: Record<string, unknown>;
}

const EVENT_NAME_MAP: Record<TourEventType, string> = {
  tour_start: "TourStart",
  tour_step_view: "TourStepView",
  tour_complete: "TourComplete",
};

export function trackTourEvent(
  event: TourEventType,
  payload: TourEventPayload,
): void {
  const full = { event, ...payload, ts: Date.now() };

  try {
    // eslint-disable-next-line no-console
    console.info("[tour-analytics]", full);
  } catch {
    /* ignore */
  }

  try {
    trackEvent(EVENT_NAME_MAP[event], {
      tour: payload.tour,
      country: payload.country,
      step_id: payload.stepId,
      step_index: payload.stepIndex,
      total_steps: payload.totalSteps,
      ...(payload.extra ?? {}),
    });
  } catch {
    /* analytics must never throw */
  }

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("rentmaikar:tour", { detail: full }),
      );
    }
  } catch {
    /* ignore */
  }

  // Persist to DB (fire-and-forget) for signed-in users only.
  // Anonymous inserts are rejected server-side to prevent event spoofing.
  try {
    void supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      void supabase.from("tour_analytics_events").insert({
        event_type: event,
        tour_name: payload.tour,
        country: String(payload.country),
        step_id: payload.stepId ?? null,
        step_index: payload.stepIndex ?? null,
        total_steps: payload.totalSteps ?? null,
        user_id: userId,
        extra: (payload.extra ?? {}) as never,
      });
    });
  } catch {
    /* ignore */
  }
}
