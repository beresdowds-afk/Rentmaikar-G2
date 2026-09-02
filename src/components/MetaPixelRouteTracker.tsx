import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/meta-pixel";

/** Fires a Meta Pixel PageView on every route change. Safe no-op when
 * the pixel is not configured or the user has not granted consent. */
export default function MetaPixelRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView();
  }, [location.pathname, location.search]);
  return null;
}
