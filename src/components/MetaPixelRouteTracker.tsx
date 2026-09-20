import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/meta-pixel";
import { marketingEngine } from "@/services/marketingEngine";

/** Fires a Meta Pixel PageView and Marketing Engine canonical event & touchpoint capture on every route change. Safe no-op when consent is not granted or offline. */
export default function MetaPixelRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    // 1. Existing Meta Pixel PageView
    trackPageView();

    // 2. Marketing Engine UTM touchpoint capture & canonical PAGE_VIEW / LANDING_PAGE_VIEW
    const touch = marketingEngine.captureTouchpoint();
    const isLanding = location.pathname === "/" || location.pathname === "/rent-to-own" || location.pathname === "/invest";
    
    void marketingEngine.track(
      isLanding ? "LANDING_PAGE_VIEW" : "PAGE_VIEW",
      {
        path: location.pathname,
        search: location.search,
        utm_source: touch.utm_source,
        utm_campaign: touch.utm_campaign,
      }
    );
  }, [location.pathname, location.search]);
  return null;
}
