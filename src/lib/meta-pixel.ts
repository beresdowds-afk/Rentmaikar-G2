// Meta Pixel + Conversions API helper.
// - Client-side Pixel fires via fbq (browser).
// - Server-side Conversions API mirrors every event with a shared event_id
//   so Meta deduplicates. Both paths are gated by the existing consent flag
//   (`rentmaikar_message_consent` / `rentmaikar_cookie_consent`).
// - PII (email, phone, name) is hashed server-side before hitting Meta.

const PIXEL_ID = (import.meta as any).env?.VITE_META_PIXEL_ID as string | undefined;
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const CONSENT_KEYS = ["rentmaikar_message_consent", "rentmaikar_cookie_consent"];

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return CONSENT_KEYS.some((k) => {
      const v = window.localStorage.getItem(k);
      return v === "accepted" || v === "true" || v === "1";
    });
  } catch {
    return false;
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

let loaded = false;
function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  if (!PIXEL_ID || !hasConsent()) return;
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq?.("init", PIXEL_ID);
  loaded = true;
}

// ─── Server-side Conversions API dispatch ───
export interface CapiUserData {
  email?: string;
  phone?: string;
  external_id?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  country?: string;
}

async function sendCapi(
  eventName: string,
  eventId: string,
  customData: Record<string, unknown>,
  userData: CapiUserData = {},
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return;
  if (!hasConsent()) return;

  const payload = {
    events: [{
      event_name: eventName,
      event_id: eventId,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: typeof window !== "undefined" ? window.location.href : undefined,
      action_source: "website" as const,
      user_data: {
        ...userData,
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
      },
      custom_data: customData,
    }],
  };

  try {
    // Fire-and-forget; keepalive lets it survive page unload for navigation events.
    await fetch(`${SUPABASE_URL}/functions/v1/send-meta-capi`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Never let analytics break the app.
    console.warn("Meta CAPI dispatch failed:", e);
  }
}

// ─── Public API ───
export function trackPageView(): void {
  ensureLoaded();
  const eventId = newEventId();
  if (loaded && window.fbq) window.fbq("track", "PageView", {}, { eventID: eventId });
  void sendCapi("PageView", eventId, {});
}

export function trackEvent(
  name: string,
  params: Record<string, unknown> = {},
  userData: CapiUserData = {},
): void {
  ensureLoaded();
  const eventId = newEventId();
  if (loaded && window.fbq) window.fbq("track", name, params, { eventID: eventId });
  void sendCapi(name, eventId, params, userData);
}

export const isMetaPixelConfigured = () => Boolean(PIXEL_ID);
