import React, { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useRegion } from "@/contexts/RegionContext";
import { usePublicVehicle } from "@/hooks/usePublicVehicles";

export const SITE_URL = "https://rentmaikar.com";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const DEFAULT_TWITTER_HANDLE = "@Rentmaikar";

export interface DynamicMetaOptions {
  title: string;
  description: string;
  canonicalPath: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogType?: "website" | "article" | "product";
  twitterCard?: "summary" | "summary_large_image";
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  keywords?: string[];
}

/**
 * Direct DOM Synchronization:
 * Updates document.title and standard meta elements in <head> directly in real-time,
 * ensuring immediate availability for bots, scrapers, and dynamic page transitions.
 */
function syncHeadMeta(meta: DynamicMetaOptions) {
  if (typeof document === "undefined") return;

  const fullUrl = `${SITE_URL}${meta.canonicalPath === "/" ? "/" : meta.canonicalPath}`;
  const image = meta.ogImage || DEFAULT_OG_IMAGE;
  const imageAlt = meta.ogImageAlt || "Rentmaikar — Rideshare vehicle rentals in USA & Nigeria";

  // Update Title
  document.title = meta.title;

  const updateMetaTag = (selector: string, attr: string, value: string, createIfMissing: { name?: string; property?: string }) => {
    let el = document.querySelector<HTMLMetaElement>(selector);
    if (!el) {
      el = document.createElement("meta");
      if (createIfMissing.name) el.setAttribute("name", createIfMissing.name);
      if (createIfMissing.property) el.setAttribute("property", createIfMissing.property);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };

  const updateLinkTag = (rel: string, href: string) => {
    let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  };

  // Standard Meta
  updateMetaTag('meta[name="description"]', "content", meta.description, { name: "description" });
  updateLinkTag("canonical", fullUrl);

  // Robots Meta
  const robotsDirective = meta.noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large";
  updateMetaTag('meta[name="robots"]', "content", robotsDirective, { name: "robots" });
  updateMetaTag('meta[name="googlebot"]', "content", robotsDirective, { name: "googlebot" });

  // OpenGraph Tags
  updateMetaTag('meta[property="og:title"]', "content", meta.title, { property: "og:title" });
  updateMetaTag('meta[property="og:description"]', "content", meta.description, { property: "og:description" });
  updateMetaTag('meta[property="og:url"]', "content", fullUrl, { property: "og:url" });
  updateMetaTag('meta[property="og:type"]', "content", meta.ogType || "website", { property: "og:type" });
  updateMetaTag('meta[property="og:image"]', "content", image, { property: "og:image" });
  updateMetaTag('meta[property="og:image:secure_url"]', "content", image, { property: "og:image:secure_url" });
  updateMetaTag('meta[property="og:image:alt"]', "content", imageAlt, { property: "og:image:alt" });
  updateMetaTag('meta[property="og:site_name"]', "content", "RentMaikar", { property: "og:site_name" });

  // Twitter Card Tags
  updateMetaTag('meta[name="twitter:card"]', "content", meta.twitterCard || "summary_large_image", { name: "twitter:card" });
  updateMetaTag('meta[name="twitter:site"]', "content", DEFAULT_TWITTER_HANDLE, { name: "twitter:site" });
  updateMetaTag('meta[name="twitter:creator"]', "content", DEFAULT_TWITTER_HANDLE, { name: "twitter:creator" });
  updateMetaTag('meta[name="twitter:title"]', "content", meta.title, { name: "twitter:title" });
  updateMetaTag('meta[name="twitter:description"]', "content", meta.description, { name: "twitter:description" });
  updateMetaTag('meta[name="twitter:image"]', "content", image, { name: "twitter:image" });
  updateMetaTag('meta[name="twitter:image:alt"]', "content", imageAlt, { name: "twitter:image:alt" });
}

/**
 * Route metadata mapping and vehicle-aware generator.
 */
export function getRouteMetadata(pathname: string, vehicleData?: ReturnType<typeof usePublicVehicle>["data"], region?: string): DynamicMetaOptions {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  // 1. DYNAMIC VEHICLE ROUTE: /vehicle/:id or /vehicles/:id
  const vehicleMatch = pathname.match(/^\/(?:vehicle|vehicles)\/([^/]+)/);
  if (vehicleMatch) {
    const vehicleId = vehicleMatch[1];
    if (vehicleData) {
      const year = vehicleData.year ?? "";
      const make = vehicleData.make ?? "";
      const model = vehicleData.model ?? "";
      const vehicleName = `${year} ${make} ${model}`.trim() || "Verified Vehicle";
      const city = vehicleData.pickup_city || "USA / Nigeria";
      const color = vehicleData.color ? ` in ${vehicleData.color}` : "";
      const photos = (vehicleData.photo_urls ?? []).filter((p) => Boolean(p?.trim()));
      const primaryPhoto = photos[0] || DEFAULT_OG_IMAGE;

      const title = `${vehicleName} Rental — Rentmaikar Rideshare Fleet`;
      const description = `Rent this verified ${vehicleName}${color} in ${city} for Uber, Lyft, Bolt or personal driving. Inspection verified with weekly rental terms.`;

      return {
        title,
        description,
        canonicalPath: `/vehicle/${vehicleId}`,
        ogImage: primaryPhoto,
        ogImageAlt: `${vehicleName} available on Rentmaikar`,
        ogType: "product",
        twitterCard: "summary_large_image",
        noindex: false,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Car",
          name: vehicleName,
          brand: {
            "@type": "Brand",
            name: make,
          },
          model: model,
          vehicleModelDate: year ? String(year) : undefined,
          color: vehicleData.color || undefined,
          image: primaryPhoto,
          url: `${SITE_URL}/vehicle/${vehicleId}`,
          offers: {
            "@type": "Offer",
            availability: vehicleData.status === "available" ? "https://schema.org/InStock" : "https://schema.org/LimitedAvailability",
            priceCurrency: region === "Nigeria" ? "NGN" : "USD",
            url: `${SITE_URL}/vehicle/${vehicleId}`,
          },
        },
      };
    }

    // Vehicle loading or fallback
    return {
      title: "Vehicle Details — Rentmaikar Rideshare Rentals",
      description: "View verified vehicle details, inspection specs, photos, and pickup location for rideshare rental on Rentmaikar.",
      canonicalPath: `/vehicle/${vehicleId}`,
      ogImage: DEFAULT_OG_IMAGE,
      ogType: "product",
      noindex: false,
    };
  }

  // 2. DYNAMIC CATALOGUE ROUTE: /catalogue/:category
  const catalogueMatch = pathname.match(/^\/catalogue\/(budget|standard|premium)/i);
  if (catalogueMatch) {
    const cat = catalogueMatch[1].toLowerCase();
    const isNG = region === "Nigeria";
    const catNames: Record<string, { title: string; years: string; price: string }> = {
      budget: {
        title: "Budget Friendly",
        years: "2015 - 2016",
        price: isNG ? "₦48,000 - ₦60,000/week" : "$200 - $250/week",
      },
      standard: {
        title: "Standard Selection",
        years: "2017 - 2020",
        price: isNG ? "₦61,000 - ₦73,000/week" : "$251 - $300/week",
      },
      premium: {
        title: "Premium Fleet",
        years: "2021 - 2025",
        price: isNG ? "₦74,000 - ₦93,000/week" : "$301 - $350/week",
      },
    };

    const info = catNames[cat] || catNames.budget;
    const title = `${info.title} Rideshare Vehicles (${info.years}) — Rentmaikar Catalogue`;
    const description = `Browse verified ${info.title} rideshare rental vehicles (${info.years}) from ${info.price}. Fully inspected, approved for Uber & Lyft with maintenance included.`;

    return {
      title,
      description,
      canonicalPath: `/catalogue/${cat}`,
      ogImage: DEFAULT_OG_IMAGE,
      ogType: "website",
      twitterCard: "summary_large_image",
      noindex: false,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: title,
        description,
        url: `${SITE_URL}/catalogue/${cat}`,
      },
    };
  }

  // 3. STATIC / PUBLIC PAGES
  switch (normalized) {
    case "/":
      return {
        title: "RentMaikar — Rideshare Vehicle Rentals & Fleet Telematics",
        description: "Rent verified, rideshare-ready cars for Uber, Lyft, and Bolt in the USA and Nigeria. Low weekly rates, maintenance included, and fast onboarding.",
        canonicalPath: "/",
        ogImage: DEFAULT_OG_IMAGE,
        ogType: "website",
        noindex: false,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "RentMaikar",
          url: SITE_URL,
          logo: `${SITE_URL}/favicon.png`,
          sameAs: ["https://twitter.com/Rentmaikar"],
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "support@rentmaikar.com",
          },
        },
      };

    case "/how-it-works":
      return {
        title: "How Rentmaikar Works | Rideshare Driver & Car Owner Leasing",
        description: "Learn how Rentmaikar connects verified rideshare drivers with inspected fleet vehicles. 4-step onboarding, simple weekly billing, and full telematics support.",
        canonicalPath: "/how-it-works",
        ogImage: DEFAULT_OG_IMAGE,
        noindex: false,
      };

    case "/faq":
      return {
        title: "Frequently Asked Questions (FAQ) — Rentmaikar",
        description: "Find answers about rideshare vehicle rentals, deposit requirements, weekly payments, maintenance coverage, and owner fleet management.",
        canonicalPath: "/faq",
        ogImage: DEFAULT_OG_IMAGE,
        noindex: false,
      };

    case "/driver/register":
    case "/driver/signup":
      return {
        title: "Driver Registration — Apply to Rent a Rideshare Car | Rentmaikar",
        description: "Apply to rent a rideshare-ready vehicle on Rentmaikar. Fast background checks, verified vehicle match, and transparent weekly rentals.",
        canonicalPath: "/driver/register",
        ogImage: DEFAULT_OG_IMAGE,
        noindex: false,
      };

    case "/owner/register":
    case "/owner/signup":
      return {
        title: "List Your Vehicle — Earn Weekly Rental Income | Rentmaikar",
        description: "List your vehicle on Rentmaikar to earn passive weekly revenue from vetted, background-checked rideshare drivers. Real-time GPS telematics included.",
        canonicalPath: "/owner/register",
        ogImage: DEFAULT_OG_IMAGE,
        noindex: false,
      };

    case "/guides/renting-vs-owning-for-rideshare":
      return {
        title: "Renting vs Owning for Rideshare: Complete Comparison Guide | Rentmaikar",
        description: "Calculate whether renting or buying a vehicle makes more financial sense for full-time and part-time rideshare driving on Uber and Lyft.",
        canonicalPath: "/guides/renting-vs-owning-for-rideshare",
        ogImage: DEFAULT_OG_IMAGE,
        ogType: "article",
        noindex: false,
      };

    case "/terms":
      return {
        title: "Terms of Service — Rentmaikar Platform Agreement",
        description: "Review the Rentmaikar terms of service, platform rules, payment agreements, and vehicle rental conditions.",
        canonicalPath: "/terms",
        noindex: false,
      };

    case "/privacy":
      return {
        title: "Privacy Policy — Rentmaikar Data Security & Telematics",
        description: "Read how Rentmaikar protects your personal data, identity documents, and telematics telemetry in compliance with privacy regulations.",
        canonicalPath: "/privacy",
        noindex: false,
      };

    case "/sms-opt-in":
      return {
        title: "SMS & Automated Alerts Opt-In — Rentmaikar",
        description: "Opt-in to SMS updates for rental status, vehicle assignment, weekly statements, and return reminders.",
        canonicalPath: "/sms-opt-in",
        noindex: false,
      };

    case "/auth":
      return {
        title: "Sign In & Account Access — Rentmaikar",
        description: "Sign in to your Rentmaikar driver, owner, or fleet account to manage rentals, view telemetry, and track payments.",
        canonicalPath: "/auth",
        noindex: false,
      };

    case "/owner/sign-in":
      return {
        title: "Owner Portal Sign In — Rentmaikar Fleet Management",
        description: "Sign in to the Rentmaikar Vehicle Owner portal to track your vehicles, earnings, and driver agreements.",
        canonicalPath: "/owner/sign-in",
        noindex: false,
      };

    case "/admin/sign-in":
      return {
        title: "Admin & Staff Sign In — Rentmaikar Operations",
        description: "Secure login portal for Rentmaikar administrative staff and fleet operations management.",
        canonicalPath: "/admin/sign-in",
        noindex: true,
      };

    // 4. PRIVATE / PROTECTED DASHBOARDS (NOINDEX, NOFOLLOW)
    default:
      if (
        normalized.startsWith("/admin") ||
        normalized.startsWith("/driver/") ||
        normalized.startsWith("/owner/") ||
        normalized.startsWith("/m/") ||
        normalized.startsWith("/profile") ||
        normalized.startsWith("/subscriptions") ||
        normalized.startsWith("/messages") ||
        normalized.startsWith("/onboarding") ||
        normalized.startsWith("/cancel-authorization")
      ) {
        const section = normalized.split("/")[1] || "Dashboard";
        const capitalized = section.charAt(0).toUpperCase() + section.slice(1);
        return {
          title: `${capitalized} Portal — Rentmaikar`,
          description: "Rentmaikar secure customer and administrative portal.",
          canonicalPath: normalized,
          noindex: true,
        };
      }

      return {
        title: "RentMaikar — Rideshare Vehicle Rentals & Telematics",
        description: "Peer-to-peer and fleet vehicle leasing platform with verified driver onboarding, owner management, and live IoT telemetry.",
        canonicalPath: normalized,
        noindex: false,
      };
  }
}

/**
 * DynamicMetaTagManager:
 * Listens to active route changes, queries active vehicle details when visiting a vehicle page,
 * and maintains synchronized OpenGraph, Twitter Cards, Canonical links, and Structured Data (JSON-LD).
 */
export default function DynamicMetaTagManager() {
  const location = useLocation();
  const { country } = useRegion();

  // Check if current route is a vehicle details page (/vehicle/:id or /vehicles/:id)
  const vehicleMatch = location.pathname.match(/^\/(?:vehicle|vehicles)\/([^/]+)/);
  const activeVehicleId = vehicleMatch ? vehicleMatch[1] : undefined;

  // Fetch active vehicle data when on a vehicle route
  const { data: vehicleData } = usePublicVehicle(activeVehicleId);

  // Compute active metadata
  const meta = useMemo(
    () => getRouteMetadata(location.pathname, vehicleData, country),
    [location.pathname, vehicleData, country]
  );

  // Synchronize document head immediately
  useEffect(() => {
    syncHeadMeta(meta);
  }, [meta]);

  const fullCanonicalUrl = `${SITE_URL}${meta.canonicalPath === "/" ? "/" : meta.canonicalPath}`;
  const image = meta.ogImage || DEFAULT_OG_IMAGE;
  const imageAlt = meta.ogImageAlt || "Rentmaikar vehicle rental platform";
  const jsonLdBlocks = meta.jsonLd ? (Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd]) : [];

  return (
    <Helmet>
      {/* Basic Meta */}
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={fullCanonicalUrl} />

      {/* Robots Directive */}
      {meta.noindex ? (
        <meta name="robots" content="noindex,nofollow" />
      ) : (
        <meta name="robots" content="index,follow,max-image-preview:large" />
      )}

      {/* OpenGraph Protocol */}
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={fullCanonicalUrl} />
      <meta property="og:type" content={meta.ogType || "website"} />
      <meta property="og:site_name" content="RentMaikar" />
      <meta property="og:locale" content={country === "Nigeria" ? "en_NG" : "en_US"} />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:alt" content={imageAlt} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content={meta.twitterCard || "summary_large_image"} />
      <meta name="twitter:site" content={DEFAULT_TWITTER_HANDLE} />
      <meta name="twitter:creator" content={DEFAULT_TWITTER_HANDLE} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {/* JSON-LD Structured Data */}
      {jsonLdBlocks.map((block, i) => (
        <script type="application/ld+json" key={`jsonld-${i}`}>
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}
