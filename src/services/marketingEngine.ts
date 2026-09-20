import {
  CanonicalMarketingEvent,
  CanonicalMarketingEventType,
  MarketingPlatform,
  UtmParameters,
  MultiTouchAttribution,
} from "@/types/marketing";
import { supabase } from "@/integrations/supabase/client";

// Storage keys for preserving touchpoints across unauthenticated & authenticated states
const STORAGE_KEY_SESSION = "rm_marketing_session_id";
const STORAGE_KEY_FIRST_TOUCH = "rm_marketing_first_touch";
const STORAGE_KEY_LAST_TOUCH = "rm_marketing_last_touch";

class MarketingEngineService {
  private sessionId: string;
  private firstTouch: UtmParameters | null = null;
  private lastTouch: UtmParameters | null = null;
  private initialized = false;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.loadPersistedTouches();
  }

  private getOrCreateSessionId(): string {
    if (typeof window === "undefined") return "server_session";
    try {
      let sid = window.localStorage.getItem(STORAGE_KEY_SESSION);
      if (!sid) {
        sid = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `rm_sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        window.localStorage.setItem(STORAGE_KEY_SESSION, sid);
      }
      return sid;
    } catch {
      return `rm_fallback_${Date.now()}`;
    }
  }

  private loadPersistedTouches(): void {
    if (typeof window === "undefined") return;
    try {
      const rawFirst = window.localStorage.getItem(STORAGE_KEY_FIRST_TOUCH);
      const rawLast = window.localStorage.getItem(STORAGE_KEY_LAST_TOUCH);
      if (rawFirst) this.firstTouch = JSON.parse(rawFirst);
      if (rawLast) this.lastTouch = JSON.parse(rawLast);
    } catch {
      // Ignore JSON parse exceptions
    }
  }

  /**
   * Captures UTM parameters, referrer, and cookies from current URL and document
   */
  public captureTouchpoint(): UtmParameters {
    if (typeof window === "undefined") return {};

    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get("utm_source") || undefined;
    const utmMedium = urlParams.get("utm_medium") || undefined;
    const utmCampaign = urlParams.get("utm_campaign") || undefined;
    const utmTerm = urlParams.get("utm_term") || undefined;
    const utmContent = urlParams.get("utm_content") || undefined;
    const gclid = urlParams.get("gclid") || undefined;
    const ttclid = urlParams.get("ttclid") || undefined;
    const fbc = urlParams.get("fbclid") || undefined;

    // Cookie extraction
    const readCookie = (name: string): string | undefined => {
      const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : undefined;
    };

    const touch: UtmParameters = {
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_term: utmTerm,
      utm_content: utmContent,
      referrer: document.referrer || undefined,
      landing_page: window.location.pathname,
      gclid,
      ttclid,
      fbc: fbc || readCookie("_fbc"),
      fbp: readCookie("_fbp"),
    };

    // If there is any campaign parameter or direct referrer, record last touch
    const hasAttributionSignal = Boolean(
      utmSource || utmCampaign || gclid || fbc || ttclid || (document.referrer && !document.referrer.includes(window.location.hostname))
    );

    if (!this.firstTouch && hasAttributionSignal) {
      this.firstTouch = touch;
      window.localStorage.setItem(STORAGE_KEY_FIRST_TOUCH, JSON.stringify(touch));
    }

    if (hasAttributionSignal) {
      this.lastTouch = touch;
      window.localStorage.setItem(STORAGE_KEY_LAST_TOUCH, JSON.stringify(touch));
    }

    // Persist session touchpoint asynchronously
    void this.syncSessionTouchpoint(touch);

    return touch;
  }

  private async syncSessionTouchpoint(touch: UtmParameters): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from("marketing_utm_sessions").insert({
        session_id: this.sessionId,
        user_id: session?.user?.id || null,
        utm_source: touch.utm_source,
        utm_medium: touch.utm_medium,
        utm_campaign: touch.utm_campaign,
        utm_term: touch.utm_term,
        utm_content: touch.utm_content,
        referrer: touch.referrer,
        landing_page: touch.landing_page,
        fbp: touch.fbp,
        fbc: touch.fbc,
        gclid: touch.gclid,
        ttclid: touch.ttclid,
      });
    } catch (err) {
      // Passive observability; never throw
      console.debug("[MarketingEngine] Session touchpoint sync:", err);
    }
  }

  /**
   * Dispatches a Canonical Marketing Event to local database and connected providers
   */
  public async track(
    eventName: CanonicalMarketingEventType,
    properties: Record<string, unknown> = {},
    userData: CanonicalMarketingEvent["user_data"] = {}
  ): Promise<string> {
    const eventId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || null;

      // 1. Record event in marketing_events table
      await supabase.from("marketing_events").insert({
        event_name: eventName,
        event_id: eventId,
        user_id: currentUserId,
        session_id: this.sessionId,
        properties,
        user_data: userData,
      });

      // 2. Multi-touch attribution check for conversion milestones
      const conversionEvents: CanonicalMarketingEventType[] = [
        "LEAD_CREATED",
        "ACCOUNT_CREATED",
        "VEHICLE_LISTED",
        "RENTAL_COMPLETED",
        "PAYMENT_COMPLETED",
      ];

      if (conversionEvents.includes(eventName) && (this.firstTouch || this.lastTouch)) {
        await this.recordAttribution(eventName, eventId, properties, currentUserId);
      }
    } catch (err) {
      console.debug("[MarketingEngine] Event tracking note:", err);
    }

    return eventId;
  }

  private async recordAttribution(
    conversionType: string,
    conversionEventId: string,
    properties: Record<string, unknown>,
    userId: string | null
  ): Promise<void> {
    try {
      const conversionValue = typeof properties.amount === "number"
        ? properties.amount
        : typeof properties.value === "number"
          ? properties.value
          : 0;

      const currency = typeof properties.currency === "string" ? properties.currency : "USD";

      await supabase.from("marketing_attribution").insert({
        user_id: userId,
        conversion_type: conversionType,
        conversion_value: conversionValue,
        currency,
        first_touch_campaign: this.firstTouch?.utm_campaign,
        first_touch_source: this.firstTouch?.utm_source,
        first_touch_medium: this.firstTouch?.utm_medium,
        last_touch_campaign: this.lastTouch?.utm_campaign,
        last_touch_source: this.lastTouch?.utm_source,
        last_touch_medium: this.lastTouch?.utm_medium,
      });
    } catch (err) {
      console.debug("[MarketingEngine] Attribution record note:", err);
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getTouches(): { first: UtmParameters | null; last: UtmParameters | null } {
    return { first: this.firstTouch, last: this.lastTouch };
  }
}

export const marketingEngine = new MarketingEngineService();
