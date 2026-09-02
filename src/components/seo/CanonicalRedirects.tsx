import { useEffect } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

/**
 * Normalises the URL crawlers and users land on so a single page is never
 * reachable at several distinct paths (a classic duplicate-indexing source):
 *
 *  - trailing slashes are stripped ("/faq/" -> "/faq")
 *  - duplicate slashes are collapsed ("//faq" -> "/faq")
 *  - upper-case path segments are lower-cased ("/FAQ" -> "/faq")
 *  - marketing/tracking query params are dropped from the address bar once
 *    the app has read them, so shared links stay canonical
 *
 * Query string and hash are otherwise preserved, and the rewrite always
 * replaces history so the back button is unaffected.
 */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
];

/**
 * Public marketing routes that are safe to lower-case. Case is preserved
 * everywhere else because some paths carry case-sensitive tokens/ids.
 */
const LOWERCASEABLE = [
  "/",
  "/how-it-works",
  "/faq",
  "/terms",
  "/privacy",
  "/guides/renting-vs-owning-for-rideshare",
  "/catalogue",
  "/driver/register",
  "/owner/register",
];

export function normalisePath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  const trimmed =
    collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
  const path = trimmed || "/";
  const lower = path.toLowerCase();
  const lowercaseable = LOWERCASEABLE.some(
    (route) => lower === route || lower.startsWith(`${route}/`),
  );
  return lowercaseable ? lower : path;
}

export default function CanonicalRedirects() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const nextPath = normalisePath(location.pathname);

    const params = new URLSearchParams(location.search);
    let strippedParam = false;
    for (const key of TRACKING_PARAMS) {
      if (params.has(key)) {
        params.delete(key);
        strippedParam = true;
      }
    }
    const query = params.toString();
    const nextSearch = query ? `?${query}` : "";

    if (nextPath === location.pathname && !strippedParam) return;

    navigate(`${nextPath}${nextSearch}${location.hash}`, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}

/**
 * Legacy/alias path "/vehicles/:id" permanently resolves to the canonical
 * "/vehicle/:id" detail route.
 */
export function VehicleAliasRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/vehicle/${id}` : "/catalogue/budget"} replace />;
}
